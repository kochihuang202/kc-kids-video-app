namespace CaptureWorkbench;

// Keep enough local evidence to distinguish Windows not launching us from an initialization failure.
internal static class StartupLog
{
    internal static void Record(string message) {
        try {
            string path = Path.Combine(DocumentStore.DefaultRoot, "startup.log");
            Directory.CreateDirectory(DocumentStore.DefaultRoot);
            if (File.Exists(path) && new FileInfo(path).Length > 65536) File.WriteAllText(path, "");
            File.AppendAllText(path, $"{DateTimeOffset.Now:O} [PID {Environment.ProcessId}] {message}{Environment.NewLine}");
        } catch { /* A diagnostic log must never prevent capture or login startup. */ }
    }
}
