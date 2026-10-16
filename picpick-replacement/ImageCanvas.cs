using System.Drawing.Drawing2D;
using System.ComponentModel;

namespace CaptureWorkbench;

public enum EditTool { Select, Arrow, Text, Rectangle, Ellipse, Line, Pen, Highlight, Mosaic, Crop }

public sealed class ImageCanvas : ScrollableControl
{
    public ImageDocument Document { get; }
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)] public EditTool Tool { get; set; } = EditTool.Arrow;
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)] public Color Ink { get; set; } = Color.FromArgb(230, 52, 68);
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)] public float Stroke { get; set; } = 3;
    public float Zoom => Document.State.Zoom;
    public event Action<string>? Changed;
    PointF start, current;
    bool drawing;
    readonly List<PointF> points = [];
    public Rectangle Selection { get; private set; }
    public ImageCanvas(ImageDocument document)
    {
        Document = document; Dock = DockStyle.Fill; AutoScroll = true; DoubleBuffered = true;
        BackColor = Color.FromArgb(222, 228, 236); Cursor = Cursors.Cross;
        AccessibleName = "圖片編輯畫布"; TabStop = true; RefreshDocument();
    }
    public void RefreshDocument() { AutoScrollMinSize = new Size((int)(Document.Image.Width * Zoom) + 40, (int)(Document.Image.Height * Zoom) + 40); Invalidate(); }
    public void SetZoom(float zoom) { Document.State.Zoom = Math.Clamp(zoom, .05f, 4); RefreshDocument(); }
    PointF ImagePoint(Point p) => new(Math.Clamp((p.X - AutoScrollPosition.X - 20) / Zoom, 0, Document.Image.Width - 1), Math.Clamp((p.Y - AutoScrollPosition.Y - 20) / Zoom, 0, Document.Image.Height - 1));
    Rectangle Rect => Rectangle.Intersect(Rectangle.FromLTRB((int)Math.Min(start.X, current.X), (int)Math.Min(start.Y, current.Y), (int)Math.Max(start.X, current.X), (int)Math.Max(start.Y, current.Y)), new Rectangle(Point.Empty, Document.Image.Size));
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e); var g = e.Graphics;
        g.TranslateTransform(AutoScrollPosition.X + 20, AutoScrollPosition.Y + 20); g.ScaleTransform(Zoom, Zoom);
        g.InterpolationMode = Zoom == 1 ? InterpolationMode.NearestNeighbor : InterpolationMode.HighQualityBicubic;
        g.DrawImage(Document.Image, new Rectangle(Point.Empty, Document.Image.Size));
        if (!Selection.IsEmpty) { using var pen = new Pen(Color.DodgerBlue, 1 / Zoom) { DashStyle = DashStyle.Dash }; g.DrawRectangle(pen, Selection); }
        if (drawing) { if (Tool is EditTool.Select or EditTool.Crop or EditTool.Mosaic) { using var pen = new Pen(Color.DodgerBlue, 1 / Zoom) { DashStyle = DashStyle.Dash }; g.DrawRectangle(pen, Rect); } else DrawMark(g); }
    }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e); if (e.Button != MouseButtons.Left) return; Focus();
        start = current = ImagePoint(e.Location); Selection = Rectangle.Empty;
        if (Tool == EditTool.Text) {
            var text = TextEntry.Ask(FindForm(), "新增文字", "輸入要放在圖片上的文字：");
            if (string.IsNullOrWhiteSpace(text)) return;
            ApplyEdit(bitmap => { using var g = Graphics.FromImage(bitmap); using var font = new Font("Microsoft JhengHei UI", Math.Max(14, Stroke * 5), FontStyle.Bold, GraphicsUnit.Pixel); using var brush = new SolidBrush(Ink); g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit; g.DrawString(text, font, brush, start); }); return;
        }
        drawing = true; Capture = true; points.Clear(); points.Add(start); Invalidate();
    }
    protected override void OnMouseMove(MouseEventArgs e) { base.OnMouseMove(e); if (!drawing) return; current = ImagePoint(e.Location); if (Tool == EditTool.Pen) points.Add(current); Invalidate(); }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e); if (!drawing) return; current = ImagePoint(e.Location); drawing = false; Capture = false;
        if (Tool == EditTool.Select) { Selection = Rect; Invalidate(); return; }
        if (Tool == EditTool.Crop) {
            if (Rect.Width < 2 || Rect.Height < 2) return;
            using var crop = Document.Image.Clone(Rect, System.Drawing.Imaging.PixelFormat.Format32bppArgb); Commit(crop); return;
        }
        ApplyEdit(bitmap => {
            using var g = Graphics.FromImage(bitmap);
            if (Tool == EditTool.Mosaic) {
                var r = Rect; const int block = 12;
                for (int y = r.Top; y < r.Bottom; y += block) for (int x = r.Left; x < r.Right; x += block) {
                    using var brush = new SolidBrush(Document.Image.GetPixel(Math.Min(x + block / 2, r.Right - 1), Math.Min(y + block / 2, r.Bottom - 1)));
                    g.FillRectangle(brush, x, y, Math.Min(block, r.Right - x), Math.Min(block, r.Bottom - y));
                }
            } else DrawMark(g);
        });
    }
    void DrawMark(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(Ink, Stroke) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        switch (Tool) {
            case EditTool.Arrow: using (var cap = new AdjustableArrowCap(5, 6, true)) { pen.CustomEndCap = cap; g.DrawLine(pen, start, current); } break;
            case EditTool.Line: g.DrawLine(pen, start, current); break;
            case EditTool.Rectangle: if (Rect.Width > 0 && Rect.Height > 0) g.DrawRectangle(pen, Rect); break;
            case EditTool.Ellipse: if (Rect.Width > 0 && Rect.Height > 0) g.DrawEllipse(pen, Rect); break;
            case EditTool.Highlight: using (var brush = new SolidBrush(Color.FromArgb(80, Ink))) g.FillRectangle(brush, Rect); break;
            case EditTool.Pen: if (points.Count > 1) g.DrawLines(pen, points.ToArray()); break;
        }
    }
    public void ApplyEdit(Action<Bitmap> edit) { using var next = new Bitmap(Document.Image); edit(next); Commit(next); }
    void Commit(Bitmap next)
    {
        try { Document.Commit(next); Changed?.Invoke("已自動保存"); }
        catch (Exception e) { Changed?.Invoke("保存失敗，編輯仍保留在此分頁；請按「重試保存」：" + e.Message); }
        RefreshDocument();
    }
    protected override void OnMouseWheel(MouseEventArgs e) { if ((ModifierKeys & Keys.Control) != 0) SetZoom(Zoom * (e.Delta > 0 ? 1.15f : 1 / 1.15f)); else base.OnMouseWheel(e); }
}

internal static class TextEntry
{
    public static string? Ask(IWin32Window? owner, string title, string prompt, string initial = "")
    {
        using var form = new Form { Text = title, ClientSize = new Size(440, 175), FormBorderStyle = FormBorderStyle.FixedDialog, StartPosition = FormStartPosition.CenterParent, MinimizeBox = false, MaximizeBox = false, Font = new Font("Microsoft JhengHei UI", 10) };
        var label = new Label { Text = prompt, Location = new Point(18, 18), AutoSize = true };
        var input = new TextBox { Text = initial, Location = new Point(18, 48), Width = 402, Multiline = true, Height = 58 };
        var ok = new Button { Text = "確定", DialogResult = DialogResult.OK, Location = new Point(240, 125), Width = 84 };
        var cancel = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Location = new Point(336, 125), Width = 84 };
        form.Controls.AddRange([label, input, ok, cancel]); form.AcceptButton = ok; form.CancelButton = cancel;
        form.Shown += (_, _) => { input.Focus(); input.SelectAll(); };
        return form.ShowDialog(owner) == DialogResult.OK ? input.Text : null;
    }
}
