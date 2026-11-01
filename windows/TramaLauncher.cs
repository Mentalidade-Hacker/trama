// Stable Windows host. Application updates live beside app/, never in runtime/.
// Build as WinExe for .NET Framework 4 with Windows.Forms, Drawing, Web.Extensions.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace TramaDesktop
{
    public sealed class LauncherOptions
    {
        public int Port = 8765;
        public string SetupScript;
        public readonly List<string> Arguments = new List<string>();

        public static LauncherOptions Parse(string[] args)
        {
            LauncherOptions result = new LauncherOptions();
            bool desktop = false, noBrowser = false;
            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i];
                if (arg == null || arg.IndexOf('\0') >= 0 || arg.IndexOf('\r') >= 0 || arg.IndexOf('\n') >= 0)
                    throw new ArgumentException("Um argumento contém caracteres inválidos.");
                if (arg == "--setup-writing" || arg == "--setup-translation")
                {
                    if (i != 0 || result.SetupScript != null)
                        throw new ArgumentException("Abra apenas um assistente de instalação por vez.");
                    result.SetupScript = arg == "--setup-writing" ? "setup_proofreader.py" : "setup_translation.py";
                    continue;
                }
                if (result.SetupScript == null && (arg == "--port" || arg.StartsWith("--port=", StringComparison.Ordinal)))
                {
                    string value = arg == "--port" ? (i + 1 < args.Length ? args[i + 1] : "") : arg.Substring(7);
                    int port;
                    if (!Int32.TryParse(value, out port) || port < 1 || port > 65535)
                        throw new ArgumentException("A porta precisa estar entre 1 e 65535.");
                    result.Port = port;
                }
                desktop |= arg == "--desktop";
                noBrowser |= arg == "--no-browser";
                result.Arguments.Add(arg);
            }
            if (result.SetupScript == null && !desktop && !noBrowser)
                result.Arguments.Add("--desktop");
            return result;
        }
    }

    public static class LauncherCore
    {
        public const string InstallingMutex = "Local\\Trama.Program.Installing";
        private const string SetupRunner =
            "import runpy,sys\n" +
            "sys.argv=sys.argv[1:]\n" +
            "result=0\n" +
            "try:\n runpy.run_path(sys.argv[0],run_name='__main__')\n" +
            "except SystemExit as e:\n result=e.code if isinstance(e.code,int) else (0 if e.code is None else 1)\n" +
            "except Exception as e:\n print('Nao foi possivel concluir: '+str(e),file=sys.stderr)\n result=1\n" +
            "try:\n input('Pressione Enter para fechar esta janela...')\n" +
            "except (EOFError,KeyboardInterrupt):\n pass\n" +
            "sys.exit(result)\n";

        public static string CanonicalRoot(string root)
        {
            if (String.IsNullOrWhiteSpace(root)) throw new ArgumentException("Pasta de instalação inválida.");
            string full = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            if (full.Length < 3) throw new ArgumentException("Escolha uma pasta para o Trama, fora da raiz do disco.");
            return full;
        }

        public static string InstallationKey(string root)
        {
            byte[] input = Encoding.UTF8.GetBytes(CanonicalRoot(root).ToUpperInvariant());
            using (SHA256 sha = SHA256.Create())
            {
                string hex = BitConverter.ToString(sha.ComputeHash(input)).Replace("-", "").ToLowerInvariant();
                return "Local\\TramaDesktop-" + hex.Substring(0, 24);
            }
        }

        // Windows CommandLineToArgvW/CRT quoting; no cmd.exe or PowerShell shell.
        public static string QuoteArgument(string argument)
        {
            if (argument == null || argument.IndexOf('\0') >= 0) throw new ArgumentException("Argumento inválido.");
            StringBuilder result = new StringBuilder("\"");
            int slashes = 0;
            foreach (char ch in argument)
            {
                if (ch == '\\') { slashes++; continue; }
                if (ch == '"')
                {
                    result.Append('\\', slashes * 2 + 1);
                    result.Append('"');
                }
                else
                {
                    result.Append('\\', slashes);
                    result.Append(ch);
                }
                slashes = 0;
            }
            result.Append('\\', slashes * 2);
            result.Append('"');
            return result.ToString();
        }

        public static string JoinArguments(IEnumerable<string> args)
        {
            List<string> quoted = new List<string>();
            foreach (string arg in args) quoted.Add(QuoteArgument(arg));
            return String.Join(" ", quoted.ToArray());
        }

        public static string AppUrl(int port, bool close)
        {
            if (port < 1 || port > 65535) throw new ArgumentException("Porta inválida.");
            return "http://127.0.0.1:" + port.ToString(System.Globalization.CultureInfo.InvariantCulture) + "/" + (close ? "?trama-action=close" : "");
        }

        public static bool NamedMutexExists(string name)
        {
            try { using (Mutex value = Mutex.OpenExisting(name)) { return true; } }
            catch (WaitHandleCannotBeOpenedException) { return false; }
        }

        private static bool MutexBusy(string name)
        {
            Mutex value;
            try { value = Mutex.OpenExisting(name); }
            catch (WaitHandleCannotBeOpenedException) { return false; }
            using (value)
            {
                bool acquired = false;
                try
                {
                    try { acquired = value.WaitOne(0); }
                    catch (AbandonedMutexException) { acquired = true; }
                    return !acquired;
                }
                finally { if (acquired) value.ReleaseMutex(); }
            }
        }

        public static bool PythonBusy(string root)
        {
            string path = Path.Combine(CanonicalRoot(root), ".app-updates", "running.lock");
            if (!File.Exists(path)) return false;
            using (FileStream file = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite))
            {
                try { file.Lock(0, 1); }
                catch (IOException) { return true; }
                file.Unlock(0, 1);
            }
            return false;
        }

        // Used by the installer before it changes app/ or runtime/. No UI and
        // no files are created. 0 = free, 1 = running, 2 = cannot verify safely.
        public static int CheckInstallation(string root)
        {
            try
            {
                string key = InstallationKey(root);
                if (MutexBusy(key) || MutexBusy(key + "-setup") || PythonBusy(root)) return 1;
                return 0;
            }
            catch (Exception) { return 2; }
        }

        public static void RequirePlainProgramFile(string root, string path)
        {
            string canonical = CanonicalRoot(root);
            string file = Path.GetFullPath(path);
            if (!file.StartsWith(canonical + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(file))
                throw new FileNotFoundException("O aplicativo está incompleto. Execute novamente o instalador do Trama.");
            string cursor = file;
            while (cursor != null && cursor.Length >= canonical.Length)
            {
                if ((File.GetAttributes(cursor) & FileAttributes.ReparsePoint) != 0)
                    throw new IOException("A instalação contém um link de arquivo ou pasta. Reinstale o Trama em uma pasta normal.");
                if (String.Equals(cursor, canonical, StringComparison.OrdinalIgnoreCase)) break;
                cursor = Path.GetDirectoryName(cursor);
            }
        }

        public static ProcessStartInfo BuildStartInfo(string root, LauncherOptions options)
        {
            root = CanonicalRoot(root);
            string python = Path.Combine(root, "runtime", "python.exe");
            string app = Path.Combine(root, "app");
            string script = Path.Combine(app, options.SetupScript ?? "launch_trama.py");
            RequirePlainProgramFile(root, python);
            RequirePlainProgramFile(root, script);
            List<string> args = new List<string>(new string[] { "-E", "-s", "-B", "-X", "utf8" });
            if (options.SetupScript != null)
            {
                args.Add("-u"); args.Add("-c"); args.Add(SetupRunner);
            }
            args.Add(script);
            args.AddRange(options.Arguments);
            ProcessStartInfo info = new ProcessStartInfo(python, JoinArguments(args));
            info.WorkingDirectory = app;
            info.UseShellExecute = false;
            info.CreateNoWindow = options.SetupScript == null;
            info.RedirectStandardOutput = options.SetupScript == null;
            info.RedirectStandardError = options.SetupScript == null;
            info.EnvironmentVariables.Remove("PYTHONHOME");
            info.EnvironmentVariables.Remove("PYTHONPATH");
            info.EnvironmentVariables["PYTHONNOUSERSITE"] = "1";
            info.EnvironmentVariables["PYTHONUTF8"] = "1";
            info.EnvironmentVariables["TRAMA_NATIVE_LAUNCHER"] = "1";
            return info;
        }

        public static bool IsTrama(int port)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(AppUrl(port, false) + "api/update/status");
                request.Timeout = 1500; request.ReadWriteTimeout = 1500;
                request.Proxy = null; request.AllowAutoRedirect = false;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                {
                    char[] buffer = new char[16385];
                    int count = reader.ReadBlock(buffer, 0, buffer.Length);
                    if (count >= buffer.Length || response.StatusCode != HttpStatusCode.OK) return false;
                    JavaScriptSerializer serializer = new JavaScriptSerializer();
                    serializer.MaxJsonLength = 16384; serializer.RecursionLimit = 20;
                    Dictionary<string, object> value = serializer.Deserialize<Dictionary<string, object>>(new string(buffer, 0, count));
                    return value != null && value.ContainsKey("currentVersion") && value["currentVersion"] is string
                        && value.ContainsKey("state") && value["state"] is string
                        && value.ContainsKey("canClose") && value["canClose"] is bool;
                }
            }
            catch (Exception) { return false; }
        }

        public static void OpenWindow(int port, bool close)
        {
            string url = AppUrl(port, close);
            string[] bases = { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) };
            string[] browsers = { @"Microsoft\Edge\Application\msedge.exe", @"Google\Chrome\Application\chrome.exe" };
            foreach (string folder in bases)
            {
                if (String.IsNullOrEmpty(folder)) continue;
                foreach (string browser in browsers)
                {
                    string path = Path.Combine(folder, browser);
                    if (!File.Exists(path)) continue;
                    try
                    {
                        ProcessStartInfo info = new ProcessStartInfo(path, JoinArguments(new string[] { "--app=" + url }));
                        info.UseShellExecute = false;
                        Process.Start(info);
                        return;
                    }
                    catch (System.ComponentModel.Win32Exception) { }
                }
            }
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
    }

    internal sealed class LocalLog : IDisposable
    {
        private readonly object gate = new object();
        private readonly string path;
        public LocalLog(string key)
        {
            try
            {
                string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                if (String.IsNullOrEmpty(local)) return;
                string folder = Path.Combine(local, "Trama", "data", "launcher-logs");
                Directory.CreateDirectory(folder);
                path = Path.Combine(folder, "launcher-" + key.Substring(key.LastIndexOf('-') + 1) + ".log");
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        public void Write(string line)
        {
            if (path == null || String.IsNullOrEmpty(line)) return;
            lock (gate)
            {
                try
                {
                    if (File.Exists(path) && new FileInfo(path).Length > 1024 * 1024)
                    {
                        string previous = path + ".previous";
                        if (File.Exists(previous)) File.Delete(previous);
                        File.Move(path, previous);
                    }
                    string bounded = line.Length > 4000 ? line.Substring(0, 4000) : line;
                    File.AppendAllText(path, DateTime.UtcNow.ToString("o") + " " + bounded + Environment.NewLine, Encoding.UTF8);
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }
        public void Dispose() { }
    }

    internal sealed class TrayContext : ApplicationContext
    {
        private readonly Control dispatcher = new Control();
        private readonly NotifyIcon tray;
        private readonly LocalLog log;
        private readonly LauncherOptions options;
        private readonly EventWaitHandle openEvent;
        private readonly RegisteredWaitHandle waiter;
        private readonly System.Windows.Forms.Timer timer;
        private Process backend;
        private int polling;
        private bool available, disposed;
        public int ExitCode { get; private set; }

        public TrayContext(string root, string key, LauncherOptions parsed)
        {
            options = parsed;
            IntPtr handle = dispatcher.Handle;
            log = new LocalLog(key);
            tray = new NotifyIcon();
            tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
            tray.Text = "Trama — iniciando";
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Abrir Trama", null, delegate { Open(false); });
            menu.Items.Add("Salvar e encerrar…", null, delegate { Open(true); });
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { Open(false); };
            tray.Visible = true;
            openEvent = new EventWaitHandle(false, EventResetMode.AutoReset, key + "-open");
            waiter = ThreadPool.RegisterWaitForSingleObject(openEvent, delegate(object state, bool timedOut) { Post(delegate { Open(false); }); }, null, Timeout.Infinite, false);
            timer = new System.Windows.Forms.Timer();
            timer.Interval = 1500;
            timer.Tick += delegate { Probe(); };
            try
            {
                backend = new Process();
                backend.StartInfo = LauncherCore.BuildStartInfo(root, options);
                backend.EnableRaisingEvents = true;
                backend.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { log.Write(e.Data); };
                backend.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { log.Write(e.Data); };
                backend.Exited += delegate { Post(BackendExited); };
                backend.Start();
                backend.BeginOutputReadLine();
                backend.BeginErrorReadLine();
                timer.Start();
                Probe();
            }
            catch
            {
                Dispose();
                throw;
            }
        }

        private void Post(Action action)
        {
            if (disposed) return;
            try { dispatcher.BeginInvoke(action); }
            catch (InvalidOperationException) { }
        }

        private void Probe()
        {
            if (Interlocked.Exchange(ref polling, 1) != 0) return;
            ThreadPool.QueueUserWorkItem(delegate
            {
                bool live = LauncherCore.IsTrama(options.Port);
                Post(delegate
                {
                    available = live;
                    tray.Text = live ? "Trama — em execução" : "Trama — iniciando";
                    Interlocked.Exchange(ref polling, 0);
                });
            });
        }

        private void Open(bool close)
        {
            if (!available)
            {
                tray.ShowBalloonTip(2500, "Trama", "O aplicativo está iniciando. Aguarde um momento.", ToolTipIcon.Info);
                Probe();
                return;
            }
            try { LauncherCore.OpenWindow(options.Port, close); }
            catch (Exception)
            {
                MessageBox.Show("Não foi possível abrir a janela. Abra " + LauncherCore.AppUrl(options.Port, close) + " no seu navegador.", "Trama", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private void BackendExited()
        {
            if (disposed) return;
            int code;
            try { backend.WaitForExit(); code = backend.ExitCode; }
            catch (InvalidOperationException) { code = 1; }
            ExitCode = code;
            if (code != 0)
            {
                if (LauncherCore.IsTrama(options.Port))
                {
                    if (MessageBox.Show("Já existe um Trama aberto nesta porta. Deseja abrir essa janela?", "Trama", MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                        LauncherCore.OpenWindow(options.Port, false);
                }
                else MessageBox.Show("Não foi possível iniciar o Trama. Outra instância pode estar aberta, ou a instalação pode estar incompleta. Feche a outra instância e tente novamente. Se persistir, execute novamente o instalador. Suas notas não foram apagadas.", "Trama", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            ExitThread();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing && !disposed)
            {
                disposed = true;
                if (timer != null) timer.Dispose();
                if (waiter != null) waiter.Unregister(null);
                if (openEvent != null) openEvent.Dispose();
                if (tray != null) { tray.Visible = false; tray.Dispose(); }
                // Disposing the process handle never kills the server. The UI
                // owns saving and a deliberate /api/app/close request.
                if (backend != null) backend.Dispose();
                if (log != null) log.Dispose();
                dispatcher.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    public static class Program
    {
        [STAThread]
        public static int Main(string[] args)
        {
            if (args.Length > 0 && args[0] == "--check-install")
                return args.Length == 2 ? LauncherCore.CheckInstallation(args[1]) : 2;
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try
            {
                string root = LauncherCore.CanonicalRoot(AppDomain.CurrentDomain.BaseDirectory);
                LauncherOptions options = LauncherOptions.Parse(args);
                if (LauncherCore.NamedMutexExists(LauncherCore.InstallingMutex))
                {
                    MessageBox.Show("O Trama está sendo instalado ou atualizado. Aguarde a conclusão e abra o aplicativo novamente.", "Trama", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 3;
                }
                string key = LauncherCore.InstallationKey(root);
                bool setup = options.SetupScript != null;
                using (Mutex mutex = new Mutex(false, key + (setup ? "-setup" : "")))
                {
                    bool acquired;
                    try { acquired = mutex.WaitOne(0); }
                    catch (AbandonedMutexException) { acquired = true; }
                    if (!acquired)
                    {
                        if (!setup && options.Arguments.Contains("--no-browser")) return 0;
                        if (!setup && NotifyExisting(key)) return 0;
                        MessageBox.Show(setup ? "Um assistente de instalação já está aberto. Confira a janela existente." : "O Trama já está iniciando. Aguarde e abra novamente pelo atalho.", "Trama", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        return 0;
                    }
                    try
                    {
                        if (LauncherCore.NamedMutexExists(LauncherCore.InstallingMutex))
                        {
                            MessageBox.Show("Aguarde a conclusão do instalador antes de abrir o Trama.", "Trama", MessageBoxButtons.OK, MessageBoxIcon.Information);
                            return 3;
                        }
                        if (setup)
                        {
                            using (Process process = Process.Start(LauncherCore.BuildStartInfo(root, options)))
                            { process.WaitForExit(); return process.ExitCode; }
                        }
                        if (LauncherCore.PythonBusy(root))
                        {
                            if (options.Arguments.Contains("--no-browser")) return 0;
                            if (LauncherCore.IsTrama(options.Port)) LauncherCore.OpenWindow(options.Port, false);
                            else MessageBox.Show("O Trama já está aberto nesta instalação. Use a janela existente ou encerre-o antes de abrir novamente.", "Trama", MessageBoxButtons.OK, MessageBoxIcon.Information);
                            return 0;
                        }
                        using (TrayContext context = new TrayContext(root, key, options))
                        {
                            Application.Run(context);
                            return context.ExitCode;
                        }
                    }
                    finally { mutex.ReleaseMutex(); }
                }
            }
            catch (Exception)
            {
                MessageBox.Show("Não foi possível abrir o Trama. Confira se a instalação foi concluída e execute novamente o instalador se necessário. Suas notas ficam separadas dos arquivos do programa.", "Trama", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }

        private static bool NotifyExisting(string key)
        {
            for (int attempt = 0; attempt < 10; attempt++)
            {
                try { using (EventWaitHandle wake = EventWaitHandle.OpenExisting(key + "-open")) { wake.Set(); return true; } }
                catch (WaitHandleCannotBeOpenedException) { Thread.Sleep(100); }
            }
            return false;
        }
    }
}
