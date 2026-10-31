"""Optional background reconciliation of immutable snapshots; no implicit login.

Network operations run outside SyncStore.lock. Browser edit leases inhibit
receiving; optimistic revisions and the shared store lock protect saved edits.
"""
from __future__ import annotations

import re
import threading
import time

from sync_store import SyncError, stamp


class AutoSync:
    def __init__(self, store, transport_factory=None, *, folder_interval=3.0,
                 proton_interval=10.0, debounce=1.0, lease_seconds=8.0):
        self.store, self.sync = store, store.sync
        self.transport_factory = transport_factory
        self.folder_interval = max(0.02, float(folder_interval))
        self.proton_interval = max(0.02, float(proton_interval))
        self.debounce = max(0.0, float(debounce))
        self.lease_seconds = max(0.02, float(lease_seconds))
        self._lock = threading.RLock()
        self._activity_lock = threading.RLock()
        self._leases = {}
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread = None
        self._transport = None
        self._connection_key = None
        self._next_download = self._next_upload = 0.0
        self._transport_error = None
        self._remote_ok = False
        self._seen_fingerprint = None
        self._changed_at = 0.0
        self._state = {"state": "disabled", "message": "Sincronização automática desativada.",
                       "busy": False, "lastSuccess": None, "lastAttempt": None}
        self.sync.worker = self

    @staticmethod
    def _connection(config):
        return tuple(config.get(key) for key in ("folder", "transport", "remoteFolder", "cliPath"))

    def _update(self, **changes):
        with self._lock:
            self._state.update(changes)

    def _clients_busy(self):
        now = time.monotonic()
        with self._activity_lock:
            self._leases = {client: expiry for client, expiry in self._leases.items() if expiry > now}
            return len(self._leases)

    def status(self):
        with self._lock:
            state = dict(self._state)
        state["clientsBusy"] = self._clients_busy()
        state["running"] = bool(self._thread and self._thread.is_alive() and not self._stop.is_set())
        return state

    def activity(self, payload):
        if not isinstance(payload, dict) or not isinstance(payload.get("client"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", payload["client"]) or type(payload.get("busy")) is not bool:
            raise SyncError("Informe o identificador da janela e seu estado de edição.")
        self._clients_busy()
        with self._activity_lock:
            if payload["busy"]:
                if payload["client"] not in self._leases and len(self._leases) >= 256:
                    raise SyncError("Há muitas janelas registradas para sincronização.")
                self._leases[payload["client"]] = time.monotonic() + self.lease_seconds
            else:
                self._leases.pop(payload["client"], None)
        self.wake()
        return {"ok": True, "clientsBusy": self._clients_busy(), "leaseSeconds": self.lease_seconds}

    def start(self):
        with self._lock:
            if self._thread and self._thread.is_alive():
                return self
            self._stop.clear()
            self._wake.set()
            self._thread = threading.Thread(target=self._run, name="trama-auto-sync", daemon=True)
            self._thread.start()
        return self

    def wake(self):
        self._wake.set()

    def _close_transport(self):
        transport, self._transport = self._transport, None
        if transport is not None:
            close = getattr(transport, "close", None)
            if callable(close):
                try:
                    close()
                except Exception:
                    pass

    def stop(self):
        self._stop.set()
        self._wake.set()
        self._close_transport()
        thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=2.0)
        self._update(state="stopped", message="Sincronização automática encerrada.", busy=False)

    def _active(self, config):
        return (not self._stop.is_set() and self.sync.config.get("automatic")
                and self._connection(self.sync.config) == self._connection(config))

    def _stable(self, fingerprint):
        now = time.monotonic()
        if fingerprint != self._seen_fingerprint:
            self._seen_fingerprint, self._changed_at = fingerprint, now
        return now - self._changed_at >= self.debounce

    def _get_transport(self, config):
        if self._transport is None:
            if self.transport_factory is not None:
                transport = self.transport_factory(dict(config))
            else:
                from proton_transfer import ProtonTransport
                transport = ProtonTransport(dict(config))
            # A shutdown may have happened while the factory prepared its client.
            if not self._active(config):
                close = getattr(transport, "close", None)
                if callable(close):
                    close()
                return None
            self._transport = transport
        return self._transport

    def _cycle(self, config):
        key = self._connection(config)
        if key != self._connection_key:
            self._close_transport()
            self._connection_key = key
            self._next_download = self._next_upload = 0.0
            self._remote_ok = config.get("transport") == "folder"
            self._transport_error = None
            self._seen_fingerprint = None
        self._update(state="checking", message="Verificando novas versões.", busy=True, lastAttempt=stamp())
        proton = config.get("transport") == "proton"
        transport = None
        network_tick = proton and time.monotonic() >= self._next_download
        if proton:
            try:
                transport = self._get_transport(config)
                if transport is not None and network_tick:
                    self._update(message="Verificando cópias no Proton Drive.")
                    transport.download(config["folder"], dict(config))
                    self._remote_ok, self._transport_error = True, None
            except Exception as error:
                self._remote_ok, self._transport_error = False, str(error)
            finally:
                if network_tick:
                    self._next_download = time.monotonic() + self.proton_interval
        if not self._active(config):
            return
        can_receive = lambda: self._active(config) and self._remote_ok and self._clients_busy() == 0
        result = self.sync.reconcile_auto(can_receive=can_receive, can_publish=self._stable, active=lambda: self._active(config))
        if not self._active(config):
            return
        # Local branches are uploaded even when reconciliation reports conflict.
        # This makes offline edits recoverable without selecting a remote winner.
        may_upload = result["state"] != "choice_required" and (self.sync.config.get("base") is not None or result.get("published"))
        if proton and transport is not None and may_upload and (result.get("published") or network_tick or time.monotonic() >= self._next_upload):
            try:
                self._update(state="publishing", message="Enviando cópias preservadas para o Proton Drive.")
                transport.upload(config["folder"], dict(config))
            except Exception as error:
                self._transport_error = str(error)
            finally:
                self._next_upload = time.monotonic() + self.proton_interval
        if not self._active(config):
            return
        changes = {"state": result["state"], "message": result["message"], "busy": False}
        if self._transport_error:
            changes.update(state="error", message=f"Não foi possível completar a transferência. As notas e cópias locais estão preservadas. Nova tentativa automática: {self._transport_error}")
        elif result["state"] == "idle" or result.get("published") or result.get("received"):
            changes["lastSuccess"] = stamp()
        self._update(**changes)

    def _run(self):
        while not self._stop.is_set():
            self._wake.clear()
            delay = self.folder_interval
            try:
                config = self.sync.configuration()
                if not config.get("automatic") or not config.get("folder"):
                    self._close_transport()
                    self._connection_key = None
                    self._update(state="disabled", message="Sincronização automática desativada.", busy=False)
                else:
                    delay = self.proton_interval if config.get("transport") == "proton" else self.folder_interval
                    self._cycle(config)
                    # A just-saved graph should not wait for the next network poll.
                    remaining = self.debounce - (time.monotonic() - self._changed_at)
                    if self._seen_fingerprint is not None and remaining > 0:
                        delay = min(delay, max(0.02, remaining))
                    if self._clients_busy():
                        delay = min(delay, self.lease_seconds / 2)
            except Exception as error:
                if not self._stop.is_set():
                    state = "waiting" if isinstance(error, SyncError) and error.code in ("sync_changed", "sync_editing") else "error"
                    self._update(state=state, message=f"As notas locais foram preservadas. A sincronização tentará novamente: {error}", busy=False)
            if not self._stop.is_set():
                self._wake.wait(timeout=delay)
        self._update(state="stopped", message="Sincronização automática encerrada.", busy=False)
