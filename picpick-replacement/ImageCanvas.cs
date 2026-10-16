using System.Drawing.Drawing2D;
using System.ComponentModel;

namespace CaptureWorkbench;

public enum EditTool { Select, Arrow, Text, Rectangle, Ellipse, Line, Pen, Highlight, Mosaic, Crop, Stamp, Image }

public sealed class ImageCanvas : ScrollableControl
{
    public ImageDocument Document { get; }
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)] public EditTool Tool { get; set; } = EditTool.Arrow;
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)] public Color Ink { get; set; } = Color.FromArgb(230, 52, 68);
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)] public float Stroke { get; set; } = 3;
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)] public StampDefinition Stamp { get; set; } = StampDefinition.NumberStyles[0];
    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)] public int NextStampNumber { get => Document.State.NextStampNumber; set => Document.State.NextStampNumber = Math.Clamp(value, 1, 999999); }
    public float Zoom => Document.State.Zoom;
    public bool IsEditing => drawing && (dragging ? moved : Tool != EditTool.Select);
    public ImageMark? SelectedMark => Document.Marks.FirstOrDefault(m => m.Id == selectedId);
    public event Action<string>? Changed;
    public event Action? SelectionChanged;
    PointF start, current;
    bool drawing, dragging, moved, hoverInside;
    int resizeHandle = -1;
    PointF hover;
    string? selectedId;
    ImageMark? preview;
    readonly List<MarkPoint> points = [];
    public Rectangle Selection { get; private set; }
    public ImageCanvas(ImageDocument document)
    {
        Document = document; Dock = DockStyle.Fill; AutoScroll = true; DoubleBuffered = true;
        BackColor = Color.FromArgb(222, 228, 236); Cursor = Cursors.Cross;
        AccessibleName = "圖片編輯畫布"; TabStop = true; RefreshDocument();
    }
    public void RefreshDocument() { if (SelectedMark == null) selectedId = null; AutoScrollMinSize = new Size((int)(Document.Image.Width * Zoom) + 40, (int)(Document.Image.Height * Zoom) + 40); Invalidate(); }
    public void SetZoom(float zoom) { Document.State.Zoom = Math.Clamp(zoom, .05f, 4); RefreshDocument(); }
    public void SelectAll() { CancelDrawing(); selectedId = null; Selection = new Rectangle(Point.Empty, Document.Image.Size); Focus(); Invalidate(); Changed?.Invoke("已全選圖片 · Ctrl＋C 複製"); }
    PointF ImagePoint(Point p) => new(Math.Clamp((p.X - AutoScrollPosition.X - 20) / Zoom, 0, Document.Image.Width - 1), Math.Clamp((p.Y - AutoScrollPosition.Y - 20) / Zoom, 0, Document.Image.Height - 1));
    Rectangle Rect => Rectangle.Intersect(Rectangle.FromLTRB((int)Math.Min(start.X, current.X), (int)Math.Min(start.Y, current.Y), (int)Math.Max(start.X, current.X), (int)Math.Max(start.Y, current.Y)), new Rectangle(Point.Empty, Document.Image.Size));
    ImageMark NewMark() => new() { Kind = Tool, X1 = start.X, Y1 = start.Y, X2 = current.X, Y2 = current.Y, Argb = Ink.ToArgb(), Stroke = Stroke, FontSize = Math.Max(14, Stroke * 5), Points = points.ToList() };
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e); var g = e.Graphics;
        g.TranslateTransform(AutoScrollPosition.X + 20, AutoScrollPosition.Y + 20); g.ScaleTransform(Zoom, Zoom);
        g.InterpolationMode = Zoom == 1 ? InterpolationMode.NearestNeighbor : InterpolationMode.HighQualityBicubic;
        g.DrawImage(Document.BaseImage, new Rectangle(Point.Empty, Document.BaseImage.Size));
        var clipping = g.Save(); g.SetClip(new Rectangle(Point.Empty, Document.BaseImage.Size), CombineMode.Intersect);
        foreach (var mark in Document.Marks) AnnotationRenderer.Draw(g, dragging && preview?.Id == mark.Id ? preview : mark);
        if (drawing && !dragging && Tool is not (EditTool.Select or EditTool.Crop or EditTool.Mosaic)) AnnotationRenderer.Draw(g, NewMark());
        g.Restore(clipping);
        using var selectionPen = new Pen(Color.DodgerBlue, 1 / Zoom) { DashStyle = DashStyle.Dash };
        if (!Selection.IsEmpty) g.DrawRectangle(selectionPen, Selection);
        if (drawing && !dragging && Tool is EditTool.Select or EditTool.Crop or EditTool.Mosaic) g.DrawRectangle(selectionPen, Rect);
        var selected = preview ?? SelectedMark;
        if (selected != null) { var bounds = selected.Bounds; bounds.Inflate(4 / Zoom, 4 / Zoom); g.DrawRectangle(selectionPen, bounds.X, bounds.Y, bounds.Width, bounds.Height); foreach (var point in SelectionHandles(selected)) { var handle = new RectangleF(point.X - 4 / Zoom, point.Y - 4 / Zoom, 8 / Zoom, 8 / Zoom); g.FillRectangle(Brushes.White, handle); g.DrawRectangle(Pens.DodgerBlue, handle.X, handle.Y, handle.Width, handle.Height); } }
        if (!drawing && hoverInside && Tool == EditTool.Stamp && Hit(hover) == null) {
            var state = g.Save(); g.SetClip(new Rectangle(Point.Empty, Document.Image.Size), CombineMode.Intersect);
            AnnotationRenderer.Draw(g, StampAt(hover) with { Argb = Color.FromArgb(125, Color.FromArgb(Stamp.FillArgb ?? Ink.ToArgb())).ToArgb() }); g.Restore(state);
        }
    }
    static PointF[] Handles(RectangleF b) => [new(b.Left, b.Top), new(b.Left + b.Width / 2, b.Top), new(b.Right, b.Top), new(b.Right, b.Top + b.Height / 2), new(b.Right, b.Bottom), new(b.Left + b.Width / 2, b.Bottom), new(b.Left, b.Bottom), new(b.Left, b.Top + b.Height / 2)];
    PointF[] SelectionHandles(ImageMark mark) { if (mark.Kind is EditTool.Line or EditTool.Arrow) return [new(mark.X1, mark.Y1), new(mark.X2, mark.Y2)]; var bounds = mark.Bounds; bounds.Inflate(4 / Zoom, 4 / Zoom); return Handles(bounds); }
    ImageMark StampAt(PointF point) => Stamp.CreateMark(point.X - Stamp.Width / 2f, point.Y - Stamp.Height / 2f, Ink) with { Text = Stamp.IsNumber ? NextStampNumber.ToString() : Stamp.Name };
    ImageMark? Hit(PointF point) => Document.Marks.Reverse().FirstOrDefault(m => {
        float tolerance = Math.Max(6 / Zoom, m.Stroke + 2); var b = m.Bounds; b.Inflate(tolerance, tolerance); if (!b.Contains(point)) return false;
        if (m.Kind is EditTool.Line or EditTool.Arrow) return Distance(point, new(m.X1, m.Y1), new(m.X2, m.Y2)) <= tolerance + (m.Kind == EditTool.Arrow ? m.Stroke * 4 : 0);
        if (m.Kind == EditTool.Pen) return m.Points.Zip(m.Points.Skip(1)).Any(p => Distance(point, new(p.First.X, p.First.Y), new(p.Second.X, p.Second.Y)) <= tolerance);
        if (m.Kind == EditTool.Ellipse) { var r = m.Bounds; double nx = (point.X - r.Left - r.Width / 2) / Math.Max(1, r.Width / 2), ny = (point.Y - r.Top - r.Height / 2) / Math.Max(1, r.Height / 2); return Math.Sqrt(nx * nx + ny * ny) < 1 + tolerance / Math.Max(1, Math.Min(r.Width, r.Height) / 2); }
        return true;
    });
    static float Distance(PointF p, PointF a, PointF b) { float dx = b.X - a.X, dy = b.Y - a.Y, t = Math.Clamp(((p.X - a.X) * dx + (p.Y - a.Y) * dy) / Math.Max(.01f, dx * dx + dy * dy), 0, 1); return MathF.Sqrt(MathF.Pow(p.X - a.X - t * dx, 2) + MathF.Pow(p.Y - a.Y - t * dy, 2)); }
    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e); if (e.Button != MouseButtons.Left) return; Focus();
        start = current = ImagePoint(e.Location); Selection = Rectangle.Empty; moved = false;
        resizeHandle = -1;
        if (Tool is not (EditTool.Crop or EditTool.Mosaic) && (ModifierKeys & Keys.Control) == 0) {
            if (SelectedMark is { } selected) { var handles = SelectionHandles(selected); resizeHandle = Array.FindIndex(handles, p => Math.Abs(p.X - start.X) <= 7 / Zoom && Math.Abs(p.Y - start.Y) <= 7 / Zoom); }
            var hit = resizeHandle >= 0 ? SelectedMark : Hit(start);
            if (hit != null) { selectedId = hit.Id; preview = hit.Copy(); dragging = drawing = true; Capture = true; SelectionChanged?.Invoke(); Invalidate(); return; }
        }
        if (Tool == EditTool.Stamp) {
            var mark = StampAt(start); selectedId = mark.Id; Save(() => { Document.CommitMarks(Document.Marks.Append(mark)); if (Stamp.IsNumber) NextStampNumber++; }); SelectionChanged?.Invoke(); return;
        }
        if (Tool == EditTool.Text) {
            var text = TextEntry.Ask(FindForm(), "新增文字", "輸入要放在圖片上的文字：");
            if (!string.IsNullOrWhiteSpace(text)) { var mark = NewMark() with { Text = text }; selectedId = mark.Id; Save(() => Document.CommitMarks(Document.Marks.Append(mark))); }
            return;
        }
        selectedId = null; preview = null; dragging = false; SelectionChanged?.Invoke();
        drawing = true; Capture = true; points.Clear(); points.Add(new(start.X, start.Y));
        Changed?.Invoke(IsEditing ? "修改中…" : "已選取"); Invalidate();
    }
    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e); hover = ImagePoint(e.Location); hoverInside = new Rectangle(20 + AutoScrollPosition.X, 20 + AutoScrollPosition.Y, (int)(Document.Image.Width * Zoom), (int)(Document.Image.Height * Zoom)).Contains(e.Location);
        if (!drawing) { if (hoverInside && Tool == EditTool.Stamp) Invalidate(); Cursor = Hit(hover) != null ? Cursors.SizeAll : Cursors.Cross; return; } current = ImagePoint(e.Location);
        bool firstMove = !moved; moved |= Math.Abs(current.X - start.X) + Math.Abs(current.Y - start.Y) > 1;
        if (dragging && SelectedMark is { } mark) {
            if (resizeHandle < 0) preview = mark.Move(current.X - start.X, current.Y - start.Y);
            else preview = ResizeMark(mark, current.X - start.X, current.Y - start.Y);
        }
        if (Tool == EditTool.Pen) points.Add(new(current.X, current.Y));
        if (firstMove && moved && IsEditing) Changed?.Invoke("修改中…"); Invalidate();
    }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e); if (!drawing || e.Button != MouseButtons.Left) return; current = ImagePoint(e.Location); drawing = false; Capture = false;
        if (dragging) { var mark = preview; preview = null; dragging = false; resizeHandle = -1; if (moved && mark != null) Save(() => Document.CommitMarks(Document.Marks.Select(m => m.Id == mark.Id ? mark : m))); else Changed?.Invoke("已選取標註"); Invalidate(); return; }
        if (Tool == EditTool.Select) { Selection = Rect; Invalidate(); return; }
        if (Rect.Width < 2 && Rect.Height < 2) { Changed?.Invoke("已取消修改"); Invalidate(); return; }
        if (Tool == EditTool.Crop) {
            if (Rect.Width < 2 || Rect.Height < 2) return;
            using var crop = Document.BaseImage.Clone(Rect, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
            var marks = Document.Marks.Where(m => m.Bounds.IntersectsWith(Rect)).Select(m => m.Move(-Rect.X, -Rect.Y)).ToList();
            Save(() => Document.CommitDocument(crop, marks)); return;
        }
        if (Tool == EditTool.Mosaic) {
            ApplyEdit(bitmap => { using var g = Graphics.FromImage(bitmap); var r = Rect; const int block = 12;
                for (int y = r.Top; y < r.Bottom; y += block) for (int x = r.Left; x < r.Right; x += block) { using var brush = new SolidBrush(Document.BaseImage.GetPixel(Math.Min(x + block / 2, r.Right - 1), Math.Min(y + block / 2, r.Bottom - 1))); g.FillRectangle(brush, x, y, Math.Min(block, r.Right - x), Math.Min(block, r.Bottom - y)); }
            }); return;
        }
        if (Tool == EditTool.Pen) points.Add(new(current.X, current.Y));
        var added = NewMark(); selectedId = added.Id; Save(() => Document.CommitMarks(Document.Marks.Append(added)));
    }
    protected override void OnMouseDoubleClick(MouseEventArgs e)
    {
        base.OnMouseDoubleClick(e); if (Hit(ImagePoint(e.Location)) is not { } mark || !(mark.Kind == EditTool.Text || mark.Kind == EditTool.Stamp && mark.StampSymbol.StartsWith("number"))) return;
        CancelDrawing(); selectedId = mark.Id;
        var text = TextEntry.Ask(FindForm(), "編輯文字", "修改文字內容：", mark.Text);
        if (text != null) Save(() => Document.CommitMarks(Document.Marks.Select(m => m.Id == mark.Id ? m with { Text = text } : m)));
    }
    public void SetSelectedStyle(Color color, float stroke) { if (SelectedMark is not { } mark || mark.Kind == EditTool.Image || mark.StampImageData.Length > 0) return; Save(() => Document.CommitMarks(Document.Marks.Select(m => m.Id == mark.Id ? m with { Argb = color.ToArgb(), Stroke = stroke } : m))); }
    public void DeleteSelected() { if (SelectedMark is not { } mark) return; selectedId = null; Save(() => Document.CommitMarks(Document.Marks.Where(m => m.Id != mark.Id))); }
    public void CancelDrawing() { drawing = dragging = false; resizeHandle = -1; preview = null; Capture = false; Invalidate(); Changed?.Invoke("已取消修改"); }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); hoverInside = false; Invalidate(); }
    ImageMark ResizeMark(ImageMark mark, float dx, float dy) {
        if (mark.Kind is EditTool.Line or EditTool.Arrow) return resizeHandle == 0 ? mark with { X1 = mark.X1 + dx, Y1 = mark.Y1 + dy } : mark with { X2 = mark.X2 + dx, Y2 = mark.Y2 + dy };
        var b = mark.Bounds; float l = b.Left, t = b.Top, r = b.Right, bottom = b.Bottom;
        if (resizeHandle is 0 or 6 or 7) l = Math.Min(r - 8, l + dx); if (resizeHandle is 2 or 3 or 4) r = Math.Max(l + 8, r + dx);
        if (resizeHandle is 0 or 1 or 2) t = Math.Min(bottom - 8, t + dy); if (resizeHandle is 4 or 5 or 6) bottom = Math.Max(t + 8, bottom + dy);
        float sx = (r - l) / Math.Max(1, b.Width), sy = (bottom - t) / Math.Max(1, b.Height);
        if (mark.Kind is EditTool.Stamp or EditTool.Image && resizeHandle % 2 == 0 && (ModifierKeys & Keys.Shift) == 0) { float scale = Math.Max(sx, sy); if (resizeHandle is 0 or 6) l = r - b.Width * scale; else r = l + b.Width * scale; if (resizeHandle is 0 or 2) t = bottom - b.Height * scale; else bottom = t + b.Height * scale; sx = sy = scale; }
        return mark.Move(-b.Left, -b.Top).Scale(sx, sy).Move(l, t) with { Stroke = mark.Stroke };
    }
    public void InsertImage(Bitmap image) {
        if ((long)image.Width * image.Height > 100_000_000) throw new InvalidOperationException("貼上的圖片太大。");
        var definition = StampDefinition.FromImage(image, "貼上的圖片");
        float scale = Math.Min(1, Math.Min(Document.Image.Width * .8f / image.Width, Document.Image.Height * .8f / image.Height));
        float w = image.Width * scale, h = image.Height * scale;
        float visibleX = -AutoScrollPosition.X / Zoom, visibleY = -AutoScrollPosition.Y / Zoom;
        float viewW = Math.Min(Document.Image.Width - visibleX, Math.Max(1, (ClientSize.Width - 40) / Zoom)), viewH = Math.Min(Document.Image.Height - visibleY, Math.Max(1, (ClientSize.Height - 40) / Zoom));
        float x = Math.Clamp(visibleX + (viewW - w) / 2, 0, Document.Image.Width - w), y = Math.Clamp(visibleY + (viewH - h) / 2, 0, Document.Image.Height - h);
        var mark = definition.CreateMark(x, y, Ink) with { Kind = EditTool.Image, X2 = x + w, Y2 = y + h };
        CancelDrawing(); selectedId = mark.Id; Selection = Rectangle.Empty; Save(() => Document.CommitMarks(Document.Marks.Append(mark))); SelectionChanged?.Invoke();
        Focus();
    }
    public void ApplyEdit(Action<Bitmap> edit) { using var next = new Bitmap(Document.BaseImage); edit(next); Save(() => Document.CommitDocument(next, Document.Marks)); }
    public void ResizeTo(int width, int height) {
        using var next = new Bitmap(width, height); using (var g = Graphics.FromImage(next)) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.DrawImage(Document.BaseImage, 0, 0, width, height); }
        float sx = width / (float)Document.BaseImage.Width, sy = height / (float)Document.BaseImage.Height;
        Save(() => Document.CommitDocument(next, Document.Marks.Select(m => m.Scale(sx, sy))));
    }
    public void Rotate90() { float height = Document.BaseImage.Height; using var next = new Bitmap(Document.BaseImage); next.RotateFlip(RotateFlipType.Rotate90FlipNone); Save(() => Document.CommitDocument(next, Document.Marks.Select(m => m.Rotate90(height)))); }
    void Save(Action action) { try { action(); Changed?.Invoke("已修改，尚未保存 · Ctrl＋S 保存"); } catch (Exception e) { Changed?.Invoke("修改未完成：" + e.Message); } RefreshDocument(); }
    protected override bool ProcessCmdKey(ref Message msg, Keys keyData) { if (keyData == Keys.Delete && SelectedMark != null) { DeleteSelected(); return true; } if (keyData == Keys.Escape) { CancelDrawing(); selectedId = null; Selection = Rectangle.Empty; Invalidate(); return true; } return base.ProcessCmdKey(ref msg, keyData); }
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
