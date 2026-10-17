using System.Drawing.Drawing2D;

namespace CaptureWorkbench;

public static class CaptureMagnifier
{
    public const int SourcePixels = 17, Scale = 8, PreviewPixels = SourcePixels * Scale;
    public static Size WindowSize => new(160, 198);
    public static Point SamplePoint(Bitmap screen, Point cursor) => new(Math.Clamp(cursor.X, 0, screen.Width - 1), Math.Clamp(cursor.Y, 0, screen.Height - 1));
    public static Rectangle SourceBounds(Point cursor) => new(cursor.X - SourcePixels / 2, cursor.Y - SourcePixels / 2, SourcePixels, SourcePixels);
    public static Rectangle Place(Point cursor, Rectangle monitor, Rectangle avoid) {
        int w = Math.Min(WindowSize.Width, monitor.Width), h = Math.Min(WindowSize.Height, monitor.Height);
        Rectangle best = Rectangle.Empty; long score = long.MaxValue;
        foreach (var point in new[] { new Point(cursor.X + 24, cursor.Y + 24), new Point(cursor.X - w - 24, cursor.Y + 24), new Point(cursor.X + 24, cursor.Y - h - 24), new Point(cursor.X - w - 24, cursor.Y - h - 24) }) {
            var candidate = new Rectangle(Math.Clamp(point.X, monitor.Left, monitor.Right - w), Math.Clamp(point.Y, monitor.Top, monitor.Bottom - h), w, h);
            var overlap = Rectangle.Intersect(candidate, avoid);
            long cost = (long)overlap.Width * overlap.Height + (candidate.Contains(cursor) ? 1_000_000 : 0);
            if (cost < score) { best = candidate; score = cost; if (cost == 0) break; }
        }
        return best;
    }
    public static void Draw(Graphics graphics, Bitmap screen, Point cursor, Point desktopOrigin, Rectangle bounds, Size selection) {
        var state = graphics.Save();
        try {
            graphics.SetClip(bounds, CombineMode.Intersect); graphics.TranslateTransform(bounds.Left, bounds.Top);
            using var panel = new SolidBrush(Color.FromArgb(22, 32, 47)); graphics.FillRectangle(panel, 0, 0, bounds.Width, bounds.Height);
            var preview = new Rectangle(12, 10, PreviewPixels, PreviewPixels); graphics.FillRectangle(Brushes.Black, preview);
            cursor = SamplePoint(screen, cursor); var source = SourceBounds(cursor); var visible = Rectangle.Intersect(source, new Rectangle(Point.Empty, screen.Size));
            var destination = new Rectangle(preview.X + (visible.X - source.X) * Scale, preview.Y + (visible.Y - source.Y) * Scale, visible.Width * Scale, visible.Height * Scale);
            graphics.InterpolationMode = InterpolationMode.NearestNeighbor; graphics.PixelOffsetMode = PixelOffsetMode.Half;
            graphics.DrawImage(screen, destination, visible, GraphicsUnit.Pixel);
            graphics.PixelOffsetMode = PixelOffsetMode.Default; graphics.SmoothingMode = SmoothingMode.None;
            int x = preview.Left + SourcePixels / 2 * Scale, y = preview.Top + SourcePixels / 2 * Scale;
            using var cross = new Pen(Color.FromArgb(255, 90, 90));
            graphics.DrawRectangle(cross, x - 1, y - 1, Scale + 1, Scale + 1);
            graphics.DrawLine(cross, preview.Left, y + Scale / 2, x - 3, y + Scale / 2); graphics.DrawLine(cross, x + Scale + 3, y + Scale / 2, preview.Right - 1, y + Scale / 2);
            graphics.DrawLine(cross, x + Scale / 2, preview.Top, x + Scale / 2, y - 3); graphics.DrawLine(cross, x + Scale / 2, y + Scale + 3, x + Scale / 2, preview.Bottom - 1);
            using var border = new Pen(Color.FromArgb(116, 194, 255)); graphics.DrawRectangle(border, 0, 0, bounds.Width - 1, bounds.Height - 1);
            using var font = new Font("Microsoft JhengHei UI", 11, GraphicsUnit.Pixel);
            graphics.DrawString($"X: {cursor.X + desktopOrigin.X}  Y: {cursor.Y + desktopOrigin.Y}", font, Brushes.White, 10, 153);
            graphics.DrawString(selection.IsEmpty ? "8× 像素放大 · Esc 取消" : $"{selection.Width} × {selection.Height} px", font, Brushes.White, 10, 175);
        } finally { graphics.Restore(state); }
    }
}
