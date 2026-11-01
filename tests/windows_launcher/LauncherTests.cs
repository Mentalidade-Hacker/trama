using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;
using TramaDesktop;

public static class LauncherTests
{
    private static int count;
    private static void Check(bool condition, string description)
    {
        if (!condition) throw new Exception(description);
        count++;
    }
    private static int Helper(string executable, string root)
    {
        return Native(executable, new string[] { "--check-install", root });
    }
    private static int Native(string executable, string[] args)
    {
        ProcessStartInfo info = new ProcessStartInfo(executable, LauncherCore.JoinArguments(args));
        info.UseShellExecute = false; info.CreateNoWindow = true;
        using (Process process = Process.Start(info))
        {
            if (!process.WaitForExit(10000)) throw new Exception("Helper did not exit");
            return process.ExitCode;
        }
    }
    private static void AssertThrows(Action action, string description)
    {
        bool rejected = false;
        try { action(); }
        catch (ArgumentException) { rejected = true; }
        catch (FileNotFoundException) { rejected = true; }
        Check(rejected, description);
    }
    public static int Main(string[] args)
    {
        try
        {
            string root = Path.GetFullPath(args[0]);
            string native = Path.GetFullPath(args[1]);
            string recorder = Path.GetFullPath(args[2]);
            Directory.CreateDirectory(Path.Combine(root, "runtime"));
            Directory.CreateDirectory(Path.Combine(root, "app"));
            File.Copy(recorder, Path.Combine(root, "runtime", "python.exe"), true);
            foreach (string name in new string[] { "launch_trama.py", "setup_proofreader.py", "setup_translation.py" })
                File.WriteAllText(Path.Combine(root, "app", name), "# test fixture only\n");

            Check(LauncherOptions.Parse(new string[0]).Arguments.SequenceEqual(new string[] { "--desktop" }), "desktop default");
            LauncherOptions quiet = LauncherOptions.Parse(new string[] { "--no-browser", "--port", "8766", "--data-dir", "C:\\dados com espaço\\" });
            Check(quiet.Port == 8766 && !quiet.Arguments.Contains("--desktop"), "no-browser and port passthrough");
            Check(LauncherOptions.Parse(new string[] { "--port=12345" }).Port == 12345, "equals port syntax");
            AssertThrows(delegate { LauncherOptions.Parse(new string[] { "--port", "0" }); }, "zero port rejected");
            AssertThrows(delegate { LauncherOptions.Parse(new string[] { "--port=65536" }); }, "oversize port rejected");
            AssertThrows(delegate { LauncherOptions.Parse(new string[] { "--port" }); }, "missing port rejected");
            AssertThrows(delegate { LauncherOptions.Parse(new string[] { "--data-dir", "bad\nvalue" }); }, "control char rejected");
            Check(LauncherCore.AppUrl(8765, true) == "http://127.0.0.1:8765/?trama-action=close", "explicit close URL");
            Check(LauncherCore.InstallationKey(root) == LauncherCore.InstallationKey(root.ToUpperInvariant() + "\\"), "stable root key");
            Check(LauncherCore.CheckInstallation(root) == 0 && Helper(native, root) == 0, "free install helper");

            string key = LauncherCore.InstallationKey(root);
            using (Mutex active = new Mutex(true, key))
            {
                Check(Helper(native, root) == 1, "native mutex blocks installer");
                active.ReleaseMutex();
            }
            using (Mutex setup = new Mutex(true, key + "-setup"))
            {
                Check(Helper(native, root) == 1, "setup mutex blocks installer");
                setup.ReleaseMutex();
            }
            using (Mutex installing = new Mutex(false, LauncherCore.InstallingMutex))
            {
                Check(LauncherCore.NamedMutexExists(LauncherCore.InstallingMutex), "installer presence detected");
                Check(Helper(native, root) == 0, "helper ignores installer mutex");
            }
            string state = Path.Combine(root, ".app-updates");
            Directory.CreateDirectory(state);
            using (FileStream stream = new FileStream(Path.Combine(state, "running.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.ReadWrite))
            {
                stream.WriteByte(0); stream.Flush(); stream.Lock(0, 1);
                Check(Helper(native, root) == 1, "Python-compatible byte lock blocks installer");
                stream.Unlock(0, 1);
            }
            Check(Helper(native, root) == 0, "released locks do not stay busy");
            string nativeKey = LauncherCore.InstallationKey(Path.GetDirectoryName(native));
            using (Mutex existing = new Mutex(true, nativeKey))
            using (EventWaitHandle open = new EventWaitHandle(false, EventResetMode.AutoReset, nativeKey + "-open"))
            {
                Check(Native(native, new string[] { "--no-browser" }) == 0, "quiet duplicate exits without another backend");
                Check(!open.WaitOne(0), "quiet duplicate does not request browser opening");
                existing.ReleaseMutex();
            }

            string[] tricky = { "plain", "", "á 🙂 com espaço", "C:\\trailing slash\\", "with\"quote", "backslash\\\"quote", "& | > %PATH% ` $()" };
            LauncherOptions captureOptions = LauncherOptions.Parse(new string[] { "--no-browser" }.Concat(tricky).ToArray());
            string oldHome = Environment.GetEnvironmentVariable("PYTHONHOME");
            string oldPath = Environment.GetEnvironmentVariable("PYTHONPATH");
            Environment.SetEnvironmentVariable("PYTHONHOME", "external-home");
            Environment.SetEnvironmentVariable("PYTHONPATH", "external-path");
            ProcessStartInfo launch;
            try { launch = LauncherCore.BuildStartInfo(root, captureOptions); }
            finally { Environment.SetEnvironmentVariable("PYTHONHOME", oldHome); Environment.SetEnvironmentVariable("PYTHONPATH", oldPath); }
            Check(launch.CreateNoWindow && !launch.UseShellExecute && launch.RedirectStandardOutput, "normal app hides console without shell");
            Check(!launch.EnvironmentVariables.ContainsKey("PYTHONHOME") && !launch.EnvironmentVariables.ContainsKey("PYTHONPATH"), "external Python stripped");
            Check(launch.EnvironmentVariables["TRAMA_NATIVE_LAUNCHER"] == "1", "native child marker");
            string capture = Path.Combine(root, "captured.txt");
            launch.EnvironmentVariables["TRAMA_TEST_CAPTURE"] = capture;
            using (Process process = Process.Start(launch))
            {
                process.WaitForExit(); Check(process.ExitCode == 0, "private runtime executes");
            }
            string[] received = File.ReadAllLines(capture).Select(delegate(string line) { return Encoding.UTF8.GetString(Convert.FromBase64String(line)); }).ToArray();
            string[] expected = new string[] { "-E", "-s", "-B", "-X", "utf8", Path.Combine(root, "app", "launch_trama.py") }.Concat(captureOptions.Arguments).ToArray();
            Check(received.SequenceEqual(expected), "real Windows argv quote roundtrip");

            LauncherOptions writing = LauncherOptions.Parse(new string[] { "--setup-writing", "--check" });
            ProcessStartInfo setupInfo = LauncherCore.BuildStartInfo(root, writing);
            Check(writing.SetupScript == "setup_proofreader.py" && writing.Arguments.SequenceEqual(new string[] { "--check" }), "writing setup arguments");
            Check(!setupInfo.CreateNoWindow && !setupInfo.RedirectStandardOutput && !setupInfo.UseShellExecute, "requested assistant has visible console without shell");
            Check(setupInfo.Arguments.Contains("runpy.run_path") && setupInfo.Arguments.Contains("Pressione Enter"), "assistant preserves result until user closes");
            LauncherOptions translation = LauncherOptions.Parse(new string[] { "--setup-translation", "--check" });
            Check(translation.SetupScript == "setup_translation.py", "translation script selected");
            AssertThrows(delegate { LauncherCore.BuildStartInfo(Path.Combine(root, "missing"), quiet); }, "incomplete install fails clearly");
            AssertThrows(delegate { LauncherCore.RequirePlainProgramFile(root, native); }, "program outside installation rejected");
            Check(Helper(native, "C:\\") == 2, "invalid installation root returns error without UI");
            Console.WriteLine("PASS " + count + " native launcher checks; real csc compilation, process args, mutex and file locks.");
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
