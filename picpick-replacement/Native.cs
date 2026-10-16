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
    [DllImport("user32.dll")] static extern nint GetWindow(nint handle, uint command);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(nint handle);
    [DllImport("user32.dll")] static extern bool GetWindowRect(nint handle, out RECT rect);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(nint handle, out uint processId);
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    public static nint WindowBelow(nint overlay, Point point) {
        // Resolve the target while the selection overlay still holds the
        // original z-order. Closing a modal can reactivate an unrelated app.
        for (var handle = GetWindow(overlay, 2); handle != 0; handle = GetWindow(handle, 2)) {
            if (!IsWindowVisible(handle) || !GetWindowRect(handle, out var rect)) continue;
            GetWindowThreadProcessId(handle, out uint pid); if (pid == Environment.ProcessId) continue;
            if (point.X >= rect.Left && point.X < rect.Right && point.Y >= rect.Top && point.Y < rect.Bottom) return handle;
        }
        return 0;
    }
    [DllImport("user32.dll")] static extern nint GetParent(nint handle);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(nint handle, System.Text.StringBuilder name, int count);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(nint handle, int index);
    [DllImport("user32.dll")] static extern bool GetScrollInfo(nint handle, int bar, ref SCROLLINFO info);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern nint SendMessageTimeout(nint handle, uint message, nuint wParam, nint lParam, uint flags, uint timeout, out nuint result);
    [StructLayout(LayoutKind.Sequential)] struct SCROLLINFO { public uint Size, Mask; public int Min, Max; public uint Page; public int Pos, TrackPos; }
    public static bool TryScrollWindow(Point point)
    {
        for (nint handle = WindowFromPoint(point), depth = 0; handle != 0 && depth < 12; handle = GetParent(handle), depth++) {
            var name = new System.Text.StringBuilder(128); GetClassName(handle, name, 128);
            bool control = name.ToString().Equals("ScrollBar", StringComparison.OrdinalIgnoreCase);
            if (!control && (GetWindowLong(handle, -16) & 0x200000) == 0) continue;
            int bar = control ? 2 : 1;
            var before = new SCROLLINFO { Size = (uint)Marshal.SizeOf<SCROLLINFO>(), Mask = 0x17 };
            if (!GetScrollInfo(handle, bar, ref before)) continue;
            nint target = control ? GetParent(handle) : handle;
            if (SendMessageTimeout(target, 0x115, 1, control ? handle : 0, 0x0002, 250, out _) == 0) continue;
            var after = new SCROLLINFO { Size = (uint)Marshal.SizeOf<SCROLLINFO>(), Mask = 0x17 };
            if (GetScrollInfo(handle, bar, ref after) && after.Pos != before.Pos) return true;
        }
        return false;
    }
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
