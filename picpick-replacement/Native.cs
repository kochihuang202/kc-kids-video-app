using System.Runtime.InteropServices;

namespace CaptureWorkbench;

internal static class Native
{
    [DllImport("user32.dll", SetLastError = true)] public static extern bool RegisterHotKey(nint handle, int id, uint modifiers, uint key);
    [DllImport("user32.dll")] public static extern bool UnregisterHotKey(nint handle, int id);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern nint WindowFromPoint(Point point);
    [DllImport("user32.dll")] public static extern nint GetAncestor(nint handle, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(nint handle);
    [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint data, flags, time; public nuint extra; }
    [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mouse; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION union; }
    public static void Wheel(int delta)
    {
        var input = new INPUT { type = 0, union = new UNION { mouse = new MOUSEINPUT { data = unchecked((uint)delta), flags = 0x0800 } } };
        if (SendInput(1, [input], Marshal.SizeOf<INPUT>()) != 1) throw new InvalidOperationException("無法送出捲動操作。請確認目標程式沒有以系統管理員身分執行。");
    }
    public static bool EscapeDown => (GetAsyncKeyState(0x1b) & 0x8000) != 0;
    public static Bitmap Capture(Rectangle region)
    {
        var bitmap = new Bitmap(region.Width, region.Height, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        try { using var graphics = Graphics.FromImage(bitmap); graphics.CopyFromScreen(region.Location, Point.Empty, region.Size, CopyPixelOperation.SourceCopy); return bitmap; }
        catch { bitmap.Dispose(); throw; }
    }
}
