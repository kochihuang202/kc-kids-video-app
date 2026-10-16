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
}
