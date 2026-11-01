"""Read-only comparison of a validated sync snapshot and the local graph."""
from __future__ import annotations

from storage_features import counts
from sync_store import SyncError


def _index(data):
    pages, blocks, by_page = {}, {}, {}
    for page in data.get("pages", []):
        ident = page["id"]
        pages[ident] = {key: value for key, value in page.items()
                        if key not in ("blocks", "created", "updated")}
        by_page[ident] = {}
        pending = [(block, None, index) for index, block in enumerate(page.get("blocks", []))]
        while pending:
            block, parent, index = pending.pop()
            value = {"page": ident, "parent": parent, "index": index,
                     "value": {key: item for key, item in block.items() if key != "children"}}
            blocks[block["id"]] = by_page[ident][block["id"]] = value
            pending.extend((child, block["id"], child_index)
                           for child_index, child in enumerate(block.get("children", [])))
    return pages, blocks, by_page


def compare_graphs(local, incoming, *, limit=100):
    old_pages, old_blocks, old_page_blocks = _index(local)
    new_pages, new_blocks, new_page_blocks = _index(incoming)
    old_ids, new_ids = set(old_pages), set(new_pages)
    added, removed = new_ids - old_ids, old_ids - new_ids
    common = old_ids & new_ids
    changed = {ident for ident in common if old_pages[ident] != new_pages[ident]
               or old_page_blocks[ident] != new_page_blocks[ident]}
    added_blocks = new_blocks.keys() - old_blocks.keys()
    removed_blocks = old_blocks.keys() - new_blocks.keys()
    changed_blocks = {ident for ident in old_blocks.keys() & new_blocks.keys()
                      if old_blocks[ident] != new_blocks[ident]}
    details = []
    for kind, identifiers in (("removed", removed), ("changed", changed), ("added", added)):
        for ident in sorted(identifiers):
            if len(details) >= limit:
                break
            before, after = old_page_blocks.get(ident, {}), new_page_blocks.get(ident, {})
            page = new_pages.get(ident, old_pages.get(ident))
            details.append({"id": ident, "title": page["title"], "kind": kind,
                            "addedBlocks": len(after.keys() - before.keys()),
                            "removedBlocks": len(before.keys() - after.keys()),
                            "changedBlocks": sum(before[key] != after[key] for key in before.keys() & after.keys())})
    samples = []
    for kind, identifiers in (("removed", removed_blocks), ("changed", changed_blocks), ("added", added_blocks)):
        for ident in sorted(identifiers):
            if len(samples) >= 20:
                break
            before, after = old_blocks.get(ident), new_blocks.get(ident)
            page_id = (after or before)["page"]
            page = new_pages.get(page_id, old_pages.get(page_id))
            samples.append({"id": ident, "page": page["title"], "kind": kind,
                            "before": before["value"].get("text", "")[:300] if before else None,
                            "after": after["value"].get("text", "")[:300] if after else None})
    return {"changes": {"addedPages": len(added), "removedPages": len(removed),
                        "changedPages": len(changed), "unchangedPages": len(common - changed),
                        "addedBlocks": len(added_blocks), "removedBlocks": len(removed_blocks),
                        "changedBlocks": len(changed_blocks)},
            "pages": details, "truncated": len(added) + len(removed) + len(changed) > len(details),
            "blockChanges": samples,
            "blocksTruncated": len(added_blocks) + len(removed_blocks) + len(changed_blocks) > len(samples)}


def preview_snapshot(store, payload):
    if not isinstance(payload, dict):
        raise SyncError("Informe a versão que deseja comparar.")
    sync = store.sync
    with sync.lock:
        sync._revision(payload.get("revision"))
        metadata, archive = sync._read_snapshot(sync._folder(), payload.get("id"), content=True)
        incoming, _, entries = store.features._unpack(archive)
        fingerprint, revision, local = sync._fingerprint()
        status = sync.status(refresh=True)
        with store.connect() as db:
            local_files = dict(db.execute("SELECT id,digest FROM attachments").fetchall())
        incoming_files = {entry[0]: entry[4] for entry in entries}
        conflicts = sum(local_files[ident] != incoming_files[ident]
                        for ident in local_files.keys() & incoming_files.keys())
        local_pages, local_blocks = counts(local)
        incoming_pages, incoming_blocks = counts(incoming)
        return {"id": metadata["id"], "revision": revision,
                "snapshot": {"deviceName": metadata.get("deviceName", metadata["device"]),
                             "created": metadata["created"], "pages": incoming_pages, "blocks": incoming_blocks},
                "local": {"pages": local_pages, "blocks": local_blocks},
                "attachments": {"incoming": len(incoming_files), "local": len(local_files),
                                "added": len(incoming_files.keys() - local_files.keys()),
                                "changed": conflicts, "keptLocal": len(local_files.keys() - incoming_files.keys())},
                "safeToReceive": conflicts == 0,
                "preview": {"fingerprint": fingerprint, "heads": sorted(status["heads"]),
                            "snapshotHash": metadata["sha256"]},
                **compare_graphs(local, incoming)}
