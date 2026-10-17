using System.Reflection;
using CaptureWorkbench;

static class OverlayUserFlows
{
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    static void Mouse(Form overlay, string action, int x, int y) => overlay.GetType().GetMethod("OnMouse" + action, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(overlay, [new MouseEventArgs(MouseButtons.Left, 1, x, y, 0)]);
    public static void HoverMagnifier() => CanvasUserFlows.RunSta(() => {
        using var background = NewCanvasForm.CreateImage(480, 360, Color.Blue);
        var type = typeof(AppSettings).Assembly.GetType("CaptureWorkbench.CaptureOverlay")!;
        using var overlay = (Form)Activator.CreateInstance(type, [background, false])!;
        overlay.Bounds = new Rectangle(0, 0, 480, 360);
        Mouse(overlay, "Move", 220, 180);
        using var preview = new Bitmap(480, 360); using (var graphics = Graphics.FromImage(preview)) type.GetMethod("OnPaint", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(overlay, [new PaintEventArgs(graphics, new Rectangle(0, 0, 480, 360))]);
        int brightPixels = 0; for (int y = 0; y < 360; y += 2) for (int x = 0; x < 480; x += 2) if (preview.GetPixel(x, y).ToArgb() == Color.Blue.ToArgb()) brightPixels++;
        Check(brightPixels > 100, "Hovering before selection does not show an undimmed pixel magnifier");
        Check(background.GetPixel(220, 180).ToArgb() == Color.Blue.ToArgb(), "Magnifier drawing modified the captured screen");
    });
    public static void PixelsAndEdges() => CanvasUserFlows.RunSta(() => {
        using var source = new Bitmap(65, 49);
        for (int y = 0; y < source.Height; y++) for (int x = 0; x < source.Width; x++) source.SetPixel(x, y, Color.FromArgb(255, x * 3, y * 5, (x + y) * 2));
        foreach (var cursor in new[] { Point.Empty, new Point(32, 24), new Point(64, 48), new Point(-20, -10), new Point(80, 70) }) {
            using var preview = new Bitmap(CaptureMagnifier.WindowSize.Width, CaptureMagnifier.WindowSize.Height);
            using (var graphics = Graphics.FromImage(preview)) CaptureMagnifier.Draw(graphics, source, cursor, new Point(-1920, -1080), new Rectangle(Point.Empty, preview.Size), new Size(640, 480));
            var sample = CaptureMagnifier.SamplePoint(source, cursor); var area = CaptureMagnifier.SourceBounds(sample);
            for (int y = 0; y < CaptureMagnifier.SourcePixels; y++) for (int x = 0; x < CaptureMagnifier.SourcePixels; x++) {
                if ((x == 8 || y == 8) && (x != 8 || y != 8)) continue;
                var expected = new Point(area.Left + x, area.Top + y);
                var color = source.GetPixel(Math.Clamp(expected.X, 0, 64), Math.Clamp(expected.Y, 0, 48));
                if (!new Rectangle(Point.Empty, source.Size).Contains(expected)) color = Color.Black;
                Check(preview.GetPixel(12 + x * 8 + 4, 10 + y * 8 + 4).ToArgb() == color.ToArgb(), $"Magnifier pixel is resampled or offset at {cursor}, cell {x},{y}");
            }
        }
        foreach (var monitor in new[] { new Rectangle(0, 0, 1920, 1080), new Rectangle(-1920, -1080, 1920, 1080) }) {
            var toolbar = new Rectangle(monitor.Left + 600, monitor.Top + 14, 500, 52);
            foreach (var cursor in new[] { monitor.Location, new Point(monitor.Right - 1, monitor.Top), new Point(monitor.Left, monitor.Bottom - 1), new Point(monitor.Right - 1, monitor.Bottom - 1), new Point(monitor.Left + 800, monitor.Top + 80) }) {
                var lens = CaptureMagnifier.Place(cursor, monitor, toolbar);
                Check(monitor.Contains(lens) && !lens.Contains(cursor) && !lens.IntersectsWith(toolbar), "Magnifier must stay on the cursor's monitor without covering the cursor or toolbar");
            }
        }
    });
    public static void SelectAndCancel() => CanvasUserFlows.RunSta(() => {
        var type = typeof(AppSettings).Assembly.GetType("CaptureWorkbench.CaptureOverlay")!;
        foreach (bool scrolling in new[] { false, true }) {
            using var background = NewCanvasForm.CreateImage(480, 360, Color.Blue);
            using var overlay = (Form)Activator.CreateInstance(type, [background, scrolling])!;
            overlay.Bounds = new Rectangle(-480, -120, 480, 360);
            Mouse(overlay, "Move", 400, 300); Mouse(overlay, "Down", 400, 300); Mouse(overlay, "Move", 100, 100);
            Check((bool)type.GetField("showMagnifier", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(overlay)!, "Magnifier disappeared during dragging");
            Mouse(overlay, "Up", 120, 80);
            var selected = (Rectangle)type.GetProperty("SelectedRegion")!.GetValue(overlay)!;
            Check(overlay.DialogResult == DialogResult.OK && selected.Size == new Size(280, 220) && selected.Location == new Point(overlay.Left + 120, overlay.Top + 80), "Magnifier changed capture bounds, reverse dragging or release position");
            Check((bool)type.GetProperty("IsScrolling")!.GetValue(overlay)! == scrolling && background.GetPixel(200, 150).ToArgb() == Color.Blue.ToArgb(), "Magnifier changed capture mode or source pixels");
        }
        using var blank = NewCanvasForm.CreateImage(480, 360, Color.White); using var cancelled = (Form)Activator.CreateInstance(type, [blank, true])!;
        cancelled.Bounds = new Rectangle(0, 0, 480, 360); Mouse(cancelled, "Down", 20, 20); Mouse(cancelled, "Move", 80, 100); Mouse(cancelled, "Up", 80, 100);
        Check(cancelled.DialogResult != DialogResult.OK, "Small scrolling capture incorrectly completed");
        type.GetMethod("OnKeyDown", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(cancelled, [new KeyEventArgs(Keys.Escape)]);
        Check(cancelled.DialogResult == DialogResult.Cancel && ((Rectangle)type.GetProperty("SelectedRegion")!.GetValue(cancelled)!).IsEmpty, "Esc must cancel capture without returning an image");
    });
}
