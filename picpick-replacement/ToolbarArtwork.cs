using System.Drawing.Drawing2D;

namespace CaptureWorkbench;

internal static class ToolbarArtwork
{
    public static Bitmap Swatch(Color color, bool selected = false) {
        var bitmap = new Bitmap(24, 24); using var g = Graphics.FromImage(bitmap); g.SmoothingMode = SmoothingMode.AntiAlias;
        using var brush = new SolidBrush(color); g.FillRectangle(brush, 4, 4, 16, 16); using var border = new Pen(selected ? Color.DodgerBlue : Color.FromArgb(150, 160, 174), selected ? 3 : 1); g.DrawRectangle(border, 3, 3, 18, 18); return bitmap;
    }
    public static Bitmap Tool(EditTool kind) {
        var bitmap = new Bitmap(24, 24); using var g = Graphics.FromImage(bitmap); g.SmoothingMode = SmoothingMode.AntiAlias;
        using var blue = new Pen(Color.FromArgb(41, 112, 186), 2); using var red = new Pen(Color.FromArgb(220, 52, 65), 2);
        switch (kind) {
            case EditTool.Stamp: g.FillRectangle(Brushes.SteelBlue, 8, 2, 8, 10); g.DrawRectangle(blue, 4, 13, 16, 6); g.DrawLine(red, 3, 22, 21, 22); break;
            case EditTool.Select: g.FillPolygon(Brushes.SlateGray, [new Point(5, 3), new(5, 20), new(10, 15), new(15, 21), new(18, 18), new(12, 12), new(21, 12)]); break;
            case EditTool.Arrow: using (var cap = new AdjustableArrowCap(4, 5, true)) { red.CustomEndCap = cap; g.DrawLine(red, 4, 20, 19, 5); } break;
            case EditTool.Line: g.DrawLine(red, 4, 20, 20, 4); break;
            case EditTool.Rectangle: g.DrawRectangle(blue, 3, 5, 18, 14); break;
            case EditTool.RoundedRectangle: using (var path = AnnotationRenderer.RoundedRectanglePath(new RectangleF(3, 5, 18, 14))) g.DrawPath(blue, path); break;
            case EditTool.Ellipse: g.DrawEllipse(blue, 3, 4, 18, 16); break;
            case EditTool.Text: using (var font = new Font("Segoe UI", 18, FontStyle.Bold, GraphicsUnit.Pixel)) g.DrawString("A", font, Brushes.RoyalBlue, 3, 0); break;
            case EditTool.Pen: g.DrawCurve(blue, [new Point(3, 19), new(8, 8), new(12, 17), new(20, 4)]); break;
            case EditTool.Highlight: g.FillRectangle(Brushes.Gold, 3, 13, 18, 7); g.DrawLine(blue, 7, 16, 19, 4); break;
            case EditTool.Mosaic: for (int y = 0; y < 3; y++) for (int x = 0; x < 3; x++) { using var brush = new SolidBrush((x + y) % 2 == 0 ? Color.SteelBlue : Color.LightSteelBlue); g.FillRectangle(brush, 3 + x * 6, 3 + y * 6, 6, 6); } break;
            case EditTool.Crop: g.DrawLines(blue, [new Point(7, 2), new(7, 17), new(22, 17)]); g.DrawLines(blue, [new Point(2, 7), new(17, 7), new(17, 22)]); break;
        }
        return bitmap;
    }
}
