using System.Reflection;
using CaptureWorkbench;

static class StartupUserFlows
{
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    static object? Call(WorkbenchForm form, string method, params object[] args) => typeof(WorkbenchForm).GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(form, args);
    static WorkbenchForm Create(string root, AppSettings settings, Func<string?> read, Action<string?> write) => (WorkbenchForm)Activator.CreateInstance(typeof(WorkbenchForm), BindingFlags.Instance | BindingFlags.NonPublic, null,
        [Array.Empty<string>(), new DocumentStore(root), settings, read, write, @"C:\Apps With Spaces\release\CaptureWorkbench.exe"], null)!;

    public static void ReapplyEnabled() => CanvasUserFlows.RunSta(() => {
        string root = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-startup-" + Guid.NewGuid().ToString("N"));
        var settings = new AppSettings { StartWithWindows = true, OutputFolder = root };
        string expected = StartupRegistration.CommandFor(@"C:\Apps With Spaces\release\CaptureWorkbench.exe");
        foreach (string? original in new[] { null, StartupRegistration.CommandFor(@"C:\Old Build\CaptureWorkbench.exe"), expected }) {
            string? registered = original; int writes = 0;
            using var form = Create(root, settings, () => registered, value => { registered = value; writes++; });
            // Avoid hotkey registration in this isolated settings flow.
            typeof(WorkbenchForm).GetField("hotkeyRegistered", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(form, true);
            typeof(WorkbenchForm).GetField("activeShortcut", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(form, settings.Shortcut);
            var error = Call(form, "ApplySettings", settings, false);
            Check(error == null, "Reapplying checked startup failed: " + error);
            Check(registered == expected, "Checked startup stayed missing or pointed at an old executable after saving settings");
            Check(writes == (original == expected ? 0 : 1), "Already-correct startup should not be rewritten");
            Check(AppSettings.Load(Path.Combine(root, "settings.json")).StartWithWindows, "Startup preference was lost");
            var disabled = settings with { StartWithWindows = false };
            Check(Call(form, "ApplySettings", disabled, false) == null && registered == null, "Unchecking startup did not remove registration");
        }
    });

    public static void StartupRepair() => CanvasUserFlows.RunSta(() => {
        string root = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-startup-launch-" + Guid.NewGuid().ToString("N"));
        var settings = new AppSettings { StartWithWindows = true, OutputFolder = root };
        string? registered = StartupRegistration.CommandFor(@"C:\Old Build\CaptureWorkbench.exe");
        using var form = Create(root, settings, () => registered, value => registered = value);
        var repair = typeof(WorkbenchForm).GetMethod("ReconcileStartup", BindingFlags.Instance | BindingFlags.NonPublic);
        Check(repair != null, "Launching a checked app has no startup registration repair");
        repair!.Invoke(form, null);
        Check(registered == StartupRegistration.CommandFor(@"C:\Apps With Spaces\release\CaptureWorkbench.exe"), "Launching the moved app did not repair its startup path");
        registered = null;
        using var disabled = Create(root, settings with { StartWithWindows = false }, () => registered, value => registered = value);
        Check(Call(disabled, "ReconcileStartup") == null && registered == null, "Disabled startup was unexpectedly enabled on launch");
    });

    public static void FailedRegistration() => CanvasUserFlows.RunSta(() => {
        string root = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-startup-failure-" + Guid.NewGuid().ToString("N"));
        var settings = new AppSettings { OutputFolder = root };
        string? registered = null;
        using var form = Create(root, settings, () => registered, value => { registered = value; if (value != null) throw new IOException("simulated registry failure"); });
        typeof(WorkbenchForm).GetField("hotkeyRegistered", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(form, true);
        typeof(WorkbenchForm).GetField("activeShortcut", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(form, settings.Shortcut);
        Check(Call(form, "ApplySettings", settings with { StartWithWindows = true }, false) is string error && error.Contains("simulated registry failure"), "Failed registration was reported as success");
        Check(registered == null && !File.Exists(Path.Combine(root, "settings.json")), "A failed registration left a checked preference or partial Run entry");
        bool rejected = false;
        try { StartupRegistration.Reconcile(true, @"C:\App\CaptureWorkbench.exe", () => null, _ => { }); } catch (IOException) { rejected = true; }
        Check(rejected, "A silently ignored Windows write was accepted as successful startup registration");
        using var failedLaunch = Create(root, settings with { StartWithWindows = true }, () => null, _ => throw new IOException("startup denied"));
        Check(Call(failedLaunch, "ReconcileStartup") is string warning && warning.Contains("startup denied"), "A startup repair failure was silently swallowed");
        Directory.CreateDirectory(Path.Combine(root, "settings.json"));
        registered = StartupRegistration.CommandFor(@"C:\Old Build\CaptureWorkbench.exe"); string? original = registered;
        using var saveFailure = Create(root, settings, () => registered, value => registered = value);
        typeof(WorkbenchForm).GetField("hotkeyRegistered", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(saveFailure, true);
        typeof(WorkbenchForm).GetField("activeShortcut", BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(saveFailure, settings.Shortcut);
        Check(Call(saveFailure, "ApplySettings", settings with { StartWithWindows = true }, false) is string && registered == original, "A settings save failure did not roll back the Run command");
    });
}
