using System.Reflection;
using CaptureWorkbench;

static class OverlayUserFlows
{
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    static void Mouse(Form overlay, string action, int x, int y) => overlay.GetType().GetMethod("OnMouse" + action, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(overlay, [new MouseEventArgs(MouseButtons.Left, 1, x, y, 0)]);
    static bool Key(Form overlay, Keys key) {
        object[] args = [new Message(), key]; return (bool)overlay.GetType().GetMethod("ProcessCmdKey", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(overlay, args)!;
    }
    public static void ArrowKeys() => CanvasUserFlows.RunSta(() => {
        using var background = NewCanvasForm.CreateImage(480, 360, Color.Blue);
        var type = typeof(AppSettings).Assembly.GetType("CaptureWorkbench.CaptureOverlay")!;
        foreach (bool scrolling in new[] { false, true }) {
            Point cursor = Point.Empty; int moves = 0;
            using var overlay = (Form)Activator.CreateInstance(type, [background, scrolling, new Func<Point>(() => cursor), new Func<Point, bool>(point => { cursor = point; moves++; return true; })])!;
            overlay.Bounds = new Rectangle(-480, -120, 480, 360); cursor = new Point(overlay.Left + 200, overlay.Top + 160); Mouse(overlay, "Move", 200, 160);
            foreach (var (key, delta) in new[] { (Keys.Right, new Point(1, 0)), (Keys.Down, new Point(0, 1)), (Keys.Left, new Point(-1, 0)), (Keys.Up, new Point(0, -1)) }) {
                var before = cursor; Check(Key(overlay, key), "Capture overlay does not intercept arrow keys for one-pixel cursor movement");
                Check(cursor == new Point(before.X + delta.X, before.Y + delta.Y), "Arrow key did not move exactly one physical desktop pixel");
                Check((Point)type.GetField("pointer", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(overlay)! == new Point(cursor.X - overlay.Left, cursor.Y - overlay.Top), "Magnifier did not follow keyboard movement");
            }
            int beforeShortcut = moves; Key(overlay, Keys.Control | Keys.Left); Check(moves == beforeShortcut, "Modified shortcut was intercepted as a plain arrow");
            cursor = overlay.Location; Mouse(overlay, "Move", 0, 0); Key(overlay, Keys.Left); Key(overlay, Keys.Up); Check(cursor == overlay.Location, "Arrow keys left the top/left desktop boundary");
            cursor = new Point(overlay.Left + 479, overlay.Top + 359); Key(overlay, Keys.Right); Key(overlay, Keys.Down); Check(cursor == new Point(overlay.Left + 479, overlay.Top + 359), "Arrow keys left the bottom/right desktop boundary");
            Mouse(overlay, "Down", 50, 50); cursor = new Point(overlay.Left + 250, overlay.Top + 270); Mouse(overlay, "Move", 250, 270);
            Key(overlay, Keys.Right); Key(overlay, Keys.Up);
            Check((Rectangle)type.GetField("selection", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(overlay)! == new Rectangle(50, 50, 201, 219), "Arrow keys must adjust the drag endpoint while keeping the anchor fixed");
            Mouse(overlay, "Up", 251, 269);
            Check(overlay.DialogResult == DialogResult.OK && (Rectangle)type.GetProperty("SelectedRegion")!.GetValue(overlay)! == new Rectangle(overlay.Left + 50, overlay.Top + 50, 201, 219), "Mouse release lost the keyboard-adjusted selection");
        }
    });
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
