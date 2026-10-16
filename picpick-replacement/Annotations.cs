using System.Drawing.Drawing2D;
using System.Text.Json.Serialization;

namespace CaptureWorkbench;

public sealed record MarkPoint(float X, float Y);

public sealed record ImageMark
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public EditTool Kind { get; init; }
    public float X1 { get; init; }
    public float Y1 { get; init; }
    public float X2 { get; init; }
    public float Y2 { get; init; }
    public int Argb { get; init; } = Color.Crimson.ToArgb();
    public float Stroke { get; init; } = 3;
    public float FontSize { get; init; } = 18;
    public float Rotation { get; init; }
    public string Text { get; init; } = "";
    public string StampSymbol { get; init; } = "";
    public string StampImageData { get; init; } = "";
    public List<MarkPoint> Points { get; init; } = [];
    [JsonIgnore] public RectangleF Bounds {
        get {
            if (Kind == EditTool.Text) {
                using var bitmap = new Bitmap(1, 1); using var g = Graphics.FromImage(bitmap);
                using var font = new Font("Microsoft JhengHei UI", Math.Max(8, FontSize), FontStyle.Bold, GraphicsUnit.Pixel);
                var size = g.MeasureString(Text, font);
                using var matrix = new Matrix(); matrix.Rotate(Rotation);
                PointF[] corners = [new(0, 0), new(size.Width, 0), new(size.Width, size.Height), new(0, size.Height)]; matrix.TransformPoints(corners);
                return RectangleF.FromLTRB(X1 + corners.Min(p => p.X), Y1 + corners.Min(p => p.Y), X1 + corners.Max(p => p.X), Y1 + corners.Max(p => p.Y));
            }
            if (Kind == EditTool.Pen && Points.Count > 0) return RectangleF.FromLTRB(Points.Min(p => p.X), Points.Min(p => p.Y), Points.Max(p => p.X), Points.Max(p => p.Y));
            return RectangleF.FromLTRB(Math.Min(X1, X2), Math.Min(Y1, Y2), Math.Max(X1, X2), Math.Max(Y1, Y2));
        }
    }
    public ImageMark Copy() => this with { Points = Points.Select(p => new MarkPoint(p.X, p.Y)).ToList() };
    public ImageMark Move(float dx, float dy) => this with { X1 = X1 + dx, Y1 = Y1 + dy, X2 = X2 + dx, Y2 = Y2 + dy, Points = Points.Select(p => new MarkPoint(p.X + dx, p.Y + dy)).ToList() };
    public ImageMark Scale(float sx, float sy) => this with { X1 = X1 * sx, Y1 = Y1 * sy, X2 = X2 * sx, Y2 = Y2 * sy, Stroke = Stroke * Math.Min(sx, sy), FontSize = FontSize * Math.Min(sx, sy), Points = Points.Select(p => new MarkPoint(p.X * sx, p.Y * sy)).ToList() };
    public ImageMark Rotate90(float height) => this with { X1 = height - Y1, Y1 = X1, X2 = height - Y2, Y2 = X2, Rotation = Kind is EditTool.Text or EditTool.Stamp or EditTool.Image ? (Rotation + 90) % 360 : Rotation, Points = Points.Select(p => new MarkPoint(height - p.Y, p.X)).ToList() };
}

public static class AnnotationRenderer
{
    public static Bitmap Render(Bitmap background, IEnumerable<ImageMark> marks) { var result = new Bitmap(background); using var g = Graphics.FromImage(result); foreach (var mark in marks) Draw(g, mark); return result; }
    public static void Draw(Graphics g, ImageMark mark)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var color = Color.FromArgb(mark.Argb);
        using var pen = new Pen(color, Math.Max(.5f, mark.Stroke)) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        var start = new PointF(mark.X1, mark.Y1); var end = new PointF(mark.X2, mark.Y2);
        var rect = mark.Bounds;
        switch (mark.Kind) {
            case EditTool.Stamp: case EditTool.Image: StampDefinition.Draw(g, mark); break;
            case EditTool.Arrow: using (var cap = new AdjustableArrowCap(5, 6, true)) { pen.CustomEndCap = cap; g.DrawLine(pen, start, end); } break;
            case EditTool.Line: g.DrawLine(pen, start, end); break;
            case EditTool.Rectangle: if (rect.Width > 0 && rect.Height > 0) g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height); break;
            case EditTool.Ellipse: if (rect.Width > 0 && rect.Height > 0) g.DrawEllipse(pen, rect); break;
            case EditTool.Pen: if (mark.Points.Count > 1) g.DrawLines(pen, mark.Points.Select(p => new PointF(p.X, p.Y)).ToArray()); break;
            case EditTool.Highlight: using (var brush = new SolidBrush(Color.FromArgb(80, color))) g.FillRectangle(brush, rect); break;
            case EditTool.Text:
                using (var font = new Font("Microsoft JhengHei UI", Math.Max(8, mark.FontSize), FontStyle.Bold, GraphicsUnit.Pixel))
                using (var brush = new SolidBrush(color)) { var state = g.Save(); try { g.TranslateTransform(mark.X1, mark.Y1); g.RotateTransform(mark.Rotation); g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit; g.DrawString(mark.Text, font, brush, PointF.Empty); } finally { g.Restore(state); } }
                break;
        }
    }
}
