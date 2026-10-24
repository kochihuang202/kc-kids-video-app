using Microsoft.Win32;

namespace CaptureWorkbench;

public static class StartupRegistration
{
    const string KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string Entry = "CaptureWorkbench";
    public static string CommandFor(string executable) => "\"" + executable + "\" --tray";
    public static string? Read() { using var key = Registry.CurrentUser.OpenSubKey(KeyPath); return key?.GetValue(Entry) as string; }
    public static void Write(string? command) {
        using var key = Registry.CurrentUser.CreateSubKey(KeyPath);
        if (command == null) key.DeleteValue(Entry, false); else key.SetValue(Entry, command, RegistryValueKind.String);
    }
    public static bool Reconcile(bool enabled, string executable, Func<string?> read, Action<string?> write) {
        string? expected = enabled ? CommandFor(executable) : null;
        string? previous = read();
        if (string.Equals(previous, expected, StringComparison.OrdinalIgnoreCase)) return false;
        try {
            write(expected);
            if (!string.Equals(read(), expected, StringComparison.OrdinalIgnoreCase)) throw new IOException("Windows 開機項目寫入後未通過核對，請重新套用設定。");
            return true;
        } catch {
            try { write(previous); } catch { /* Preserve the original registration error. */ }
            throw;
        }
    }
}
