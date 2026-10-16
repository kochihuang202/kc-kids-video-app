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
    public bool IsEditing => drawing && (resizingCanvas || dragging ? moved : Tool != EditTool.Select);
    public Color CanvasBackground => Color.FromArgb(Document.State.CanvasBackgroundArgb);
    public ImageMark? SelectedMark => Document.Marks.FirstOrDefault(m => m.Id == selectedId);
    public event Action<string>? Changed;
    public event Action? SelectionChanged;
    PointF start, current;
    bool drawing, dragging, moved, hoverInside, resizingCanvas;
    int canvasHandle = -1;
    Rectangle canvasStartBounds, canvasPreviewBounds;
    RectangleF workBounds;
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
        AccessibleName = "圖片編輯畫布"; TabStop = true; AllowDrop = true; RefreshDocument();
    }
    PointF SurfaceOrigin => new(AutoScrollPosition.X + 20 - workBounds.Left * Zoom, AutoScrollPosition.Y + 20 - workBounds.Top * Zoom);
    public void RefreshDocument() {
        if (SelectedMark == null) selectedId = null;
        var scroll = new Point(-AutoScrollPosition.X, -AutoScrollPosition.Y); var previous = new PointF(-workBounds.Left * Zoom, -workBounds.Top * Zoom);
        workBounds = new RectangleF(PointF.Empty, Document.Image.Size);
        foreach (var mark in Document.Marks) workBounds = RectangleF.Union(workBounds, mark.Bounds);
        workBounds = RectangleF.FromLTRB(MathF.Floor(workBounds.Left), MathF.Floor(workBounds.Top), MathF.Ceiling(workBounds.Right), MathF.Ceiling(workBounds.Bottom));
        int surfaceWidth = (int)Math.Ceiling(workBounds.Width * Zoom) + 64, surfaceHeight = (int)Math.Ceiling(workBounds.Height * Zoom) + 72;
        if (workBounds.Left < 0) surfaceWidth = Math.Max(surfaceWidth, ClientSize.Width + (int)Math.Ceiling(-workBounds.Left * Zoom));
        if (workBounds.Top < 0) surfaceHeight = Math.Max(surfaceHeight, ClientSize.Height + (int)Math.Ceiling(-workBounds.Top * Zoom));
        AutoScrollMinSize = new Size(surfaceWidth, surfaceHeight);
        AutoScrollPosition = new Point(Math.Max(0, scroll.X + (int)(-workBounds.Left * Zoom - previous.X)), Math.Max(0, scroll.Y + (int)(-workBounds.Top * Zoom - previous.Y)));
        Invalidate();
    }
    public void SetZoom(float zoom) { Document.State.Zoom = Math.Clamp(zoom, .05f, 4); RefreshDocument(); }
    public void SelectAll() { CancelDrawing(); selectedId = null; Selection = new Rectangle(Point.Empty, Document.Image.Size); Focus(); Invalidate(); Changed?.Invoke("已全選圖片 · Ctrl＋C 複製"); }
    PointF ImagePoint(Point p) => new((p.X - SurfaceOrigin.X) / Zoom, (p.Y - SurfaceOrigin.Y) / Zoom);
    public Point ImageToClient(PointF point) => new((int)Math.Round(SurfaceOrigin.X + point.X * Zoom), (int)Math.Round(SurfaceOrigin.Y + point.Y * Zoom));
    Rectangle Rect => Rectangle.Intersect(Rectangle.FromLTRB((int)Math.Min(start.X, current.X), (int)Math.Min(start.Y, current.Y), (int)Math.Max(start.X, current.X), (int)Math.Max(start.Y, current.Y)), new Rectangle(Point.Empty, Document.Image.Size));
    ImageMark NewMark() => new() { Kind = Tool, X1 = start.X, Y1 = start.Y, X2 = current.X, Y2 = current.Y, Argb = Ink.ToArgb(), Stroke = Stroke, FontSize = Math.Max(14, Stroke * 5), Points = points.ToList() };
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e); var g = e.Graphics;
        g.TranslateTransform(SurfaceOrigin.X, SurfaceOrigin.Y); g.ScaleTransform(Zoom, Zoom);
        g.InterpolationMode = Zoom == 1 ? InterpolationMode.NearestNeighbor : InterpolationMode.HighQualityBicubic;
        var output = resizingCanvas ? canvasPreviewBounds : new Rectangle(Point.Empty, Document.Image.Size);
        using (var tile = new Bitmap(16, 16)) { using (var checker = Graphics.FromImage(tile)) { checker.Clear(Color.White); checker.FillRectangle(Brushes.Gainsboro, 0, 0, 8, 8); checker.FillRectangle(Brushes.Gainsboro, 8, 8, 8, 8); } using var brush = new TextureBrush(tile); g.FillRectangle(brush, output); }
        g.DrawImage(Document.BaseImage, new Rectangle(Point.Empty, Document.BaseImage.Size));
        foreach (var mark in Document.Marks) AnnotationRenderer.Draw(g, dragging && preview?.Id == mark.Id ? preview : mark);
        if (drawing && !dragging && !resizingCanvas && Tool is not (EditTool.Select or EditTool.Crop or EditTool.Mosaic)) AnnotationRenderer.Draw(g, NewMark());
        using (var outside = new Region(RectangleF.Union(workBounds, output))) { outside.Exclude(output); using var dim = new SolidBrush(Color.FromArgb(120, BackColor)); g.FillRegion(dim, outside); }
        using (var border = new Pen(Color.FromArgb(42, 98, 145), 1 / Zoom)) {
            g.DrawRectangle(border, output);
            foreach (var point in CanvasHandles(output)) { var handle = new RectangleF(point.X - 4 / Zoom, point.Y - 4 / Zoom, 8 / Zoom, 8 / Zoom); g.FillRectangle(Brushes.White, handle); g.DrawRectangle(border, handle.X, handle.Y, handle.Width, handle.Height); }
            using var font = new Font("Microsoft JhengHei UI", 10 / Zoom, GraphicsUnit.Pixel); using var brush = new SolidBrush(border.Color);
            g.DrawString($"畫布 {output.Width} × {output.Height}", font, brush, output.Left, output.Bottom + 24 / Zoom);
        }
        using var selectionPen = new Pen(Color.DodgerBlue, 1 / Zoom) { DashStyle = DashStyle.Dash };
        if (!Selection.IsEmpty) g.DrawRectangle(selectionPen, Selection);
        if (drawing && !dragging && !resizingCanvas && Tool is EditTool.Select or EditTool.Crop or EditTool.Mosaic) g.DrawRectangle(selectionPen, Rect);
        var selected = preview ?? SelectedMark;
        if (selected != null) { var bounds = selected.Bounds; bounds.Inflate(4 / Zoom, 4 / Zoom); g.DrawRectangle(selectionPen, bounds.X, bounds.Y, bounds.Width, bounds.Height); foreach (var point in SelectionHandles(selected)) { var handle = new RectangleF(point.X - 4 / Zoom, point.Y - 4 / Zoom, 8 / Zoom, 8 / Zoom); g.FillRectangle(Brushes.White, handle); g.DrawRectangle(Pens.DodgerBlue, handle.X, handle.Y, handle.Width, handle.Height); } }
        if (!drawing && hoverInside && Tool == EditTool.Stamp && Hit(hover) == null) {
            var state = g.Save(); g.SetClip(new Rectangle(Point.Empty, Document.Image.Size), CombineMode.Intersect);
            AnnotationRenderer.Draw(g, StampAt(hover) with { Argb = Color.FromArgb(125, Color.FromArgb(Stamp.FillArgb ?? Ink.ToArgb())).ToArgb() }); g.Restore(state);
        }
    }
    static PointF[] Handles(RectangleF b) => [new(b.Left, b.Top), new(b.Left + b.Width / 2, b.Top), new(b.Right, b.Top), new(b.Right, b.Top + b.Height / 2), new(b.Right, b.Bottom), new(b.Left + b.Width / 2, b.Bottom), new(b.Left, b.Bottom), new(b.Left, b.Top + b.Height / 2)];
    PointF[] CanvasHandles(RectangleF bounds) { bounds.Inflate(12 / Zoom, 12 / Zoom); return Handles(bounds); }
    int HitCanvasHandle(PointF point) => Array.FindIndex(CanvasHandles(new RectangleF(PointF.Empty, Document.Image.Size)), p => Math.Abs(point.X - p.X) <= 6 / Zoom && Math.Abs(point.Y - p.Y) <= 6 / Zoom);
    static Cursor CanvasCursor(int handle) => handle switch { 0 or 4 => Cursors.SizeNWSE, 2 or 6 => Cursors.SizeNESW, 1 or 5 => Cursors.SizeNS, 3 or 7 => Cursors.SizeWE, _ => Cursors.Cross };
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
        canvasHandle = HitCanvasHandle(start);
        if (canvasHandle >= 0) { resizingCanvas = drawing = true; dragging = false; preview = null; canvasStartBounds = canvasPreviewBounds = new Rectangle(Point.Empty, Document.Image.Size); Capture = true; Invalidate(); return; }
        resizeHandle = -1;
        if (Tool is not (EditTool.Crop or EditTool.Mosaic) && (ModifierKeys & Keys.Control) == 0) {
            if (SelectedMark is { } selected) { var handles = SelectionHandles(selected); resizeHandle = Array.FindIndex(handles, p => Math.Abs(p.X - start.X) <= 7 / Zoom && Math.Abs(p.Y - start.Y) <= 7 / Zoom); }
            var hit = resizeHandle >= 0 ? SelectedMark : Hit(start);
            if (hit != null) { selectedId = hit.Id; preview = hit.Copy(); dragging = drawing = true; Capture = true; SelectionChanged?.Invoke(); Invalidate(); return; }
        }
        if (!new RectangleF(PointF.Empty, Document.Image.Size).Contains(start)) { selectedId = null; SelectionChanged?.Invoke(); Invalidate(); return; }
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
        base.OnMouseMove(e); bool previousHover = hoverInside; hover = ImagePoint(e.Location); hoverInside = new RectangleF(PointF.Empty, Document.Image.Size).Contains(hover);
        if (!drawing) { if ((hoverInside || previousHover) && Tool == EditTool.Stamp) Invalidate(); int handle = HitCanvasHandle(hover); Cursor = handle >= 0 ? CanvasCursor(handle) : Hit(hover) != null ? Cursors.SizeAll : Cursors.Cross; return; } current = ImagePoint(e.Location);
        bool firstMove = !moved; moved |= Math.Abs(current.X - start.X) + Math.Abs(current.Y - start.Y) > 1;
        if (resizingCanvas) {
            int dx = (int)Math.Round(current.X - start.X), dy = (int)Math.Round(current.Y - start.Y);
            int left = canvasStartBounds.Left, top = canvasStartBounds.Top, right = canvasStartBounds.Right, bottom = canvasStartBounds.Bottom;
            if (canvasHandle is 0 or 6 or 7) left = Math.Clamp(left + dx, right - 100000, right - 1);
            if (canvasHandle is 2 or 3 or 4) right = Math.Clamp(right + dx, left + 1, left + 100000);
            if (canvasHandle is 0 or 1 or 2) top = Math.Clamp(top + dy, bottom - 100000, bottom - 1);
            if (canvasHandle is 4 or 5 or 6) bottom = Math.Clamp(bottom + dy, top + 1, top + 100000);
            if ((long)(right - left) * (bottom - top) <= 100_000_000) canvasPreviewBounds = Rectangle.FromLTRB(left, top, right, bottom);
            Changed?.Invoke($"畫布預覽 {canvasPreviewBounds.Width} × {canvasPreviewBounds.Height} · 放開確認，Esc 取消"); Invalidate(); return;
        }
        if (dragging && SelectedMark is { } mark) {
            if (resizeHandle < 0) preview = mark.Kind == EditTool.Image ? mark.Move(MathF.Round(current.X - start.X), MathF.Round(current.Y - start.Y)) : mark.Move(current.X - start.X, current.Y - start.Y);
            else preview = ResizeMark(mark, current.X - start.X, current.Y - start.Y);
        }
        if (Tool == EditTool.Pen) points.Add(new(current.X, current.Y));
        if (firstMove && moved && IsEditing) Changed?.Invoke("修改中…"); Invalidate();
    }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e); if (!drawing || e.Button != MouseButtons.Left) return; current = ImagePoint(e.Location); drawing = false; Capture = false;
        if (resizingCanvas) { resizingCanvas = false; canvasHandle = -1; if (canvasPreviewBounds != canvasStartBounds) ResizeCanvasBounds(canvasPreviewBounds); else Invalidate(); return; }
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
    public void CancelDrawing() { drawing = dragging = resizingCanvas = false; resizeHandle = canvasHandle = -1; preview = null; Capture = false; Invalidate(); Changed?.Invoke("已取消修改"); }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); hoverInside = false; Invalidate(); }
    protected override void OnDragEnter(DragEventArgs e) { base.OnDragEnter(e); ImageFileDrop.SetEffect(e); }
    protected override void OnDragOver(DragEventArgs e) { base.OnDragOver(e); ImageFileDrop.SetEffect(e); }
    protected override void OnDragDrop(DragEventArgs e) {
        base.OnDragDrop(e); ImageFileDrop.SetEffect(e);
        if (e.Effect == DragDropEffects.Copy) { string result = ImageFileDrop.Import(ImageFileDrop.Files(e.Data), InsertDroppedImage); Changed?.Invoke(result); }
    }
    void InsertDroppedImage(Bitmap image) => InsertImage(image);
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
        float w = image.Width, h = image.Height;
        float visibleX = -AutoScrollPosition.X / Zoom, visibleY = -AutoScrollPosition.Y / Zoom;
        float viewW = Math.Min(Document.Image.Width - visibleX, Math.Max(1, (ClientSize.Width - 40) / Zoom)), viewH = Math.Min(Document.Image.Height - visibleY, Math.Max(1, (ClientSize.Height - 40) / Zoom));
        float x = w >= Document.Image.Width ? 0 : Math.Clamp(visibleX + (viewW - w) / 2, 0, Document.Image.Width - w), y = h >= Document.Image.Height ? 0 : Math.Clamp(visibleY + (viewH - h) / 2, 0, Document.Image.Height - h);
        x = MathF.Round(x); y = MathF.Round(y);
        var mark = definition.CreateMark(x, y, Ink) with { Kind = EditTool.Image, X2 = x + w, Y2 = y + h };
        CancelDrawing(); selectedId = mark.Id; Selection = Rectangle.Empty; Save(() => Document.CommitMarks(Document.Marks.Append(mark))); SelectionChanged?.Invoke();
        Focus();
    }
    public void ApplyEdit(Action<Bitmap> edit) { using var next = new Bitmap(Document.BaseImage); edit(next); Save(() => Document.CommitDocument(next, Document.Marks)); }
    public void Merge() {
        CancelDrawing(); if (Document.Marks.Count == 0) return;
        Save(() => Document.Commit(Document.Image));
        if (Document.Marks.Count == 0) { selectedId = null; Selection = Rectangle.Empty; SelectionChanged?.Invoke(); Changed?.Invoke("已合併到畫布，框外內容已捨棄 · Ctrl＋Z 可復原"); }
    }
    public void ResizeCanvas(int width, int height, Color? background = null) => ResizeCanvasBounds(new Rectangle(0, 0, width, height), background);
    void ResizeCanvasBounds(Rectangle bounds, Color? background = null) {
        var color = background ?? CanvasBackground;
        using var next = NewCanvasForm.CreateImage(bounds.Width, bounds.Height, color);
        using (var g = Graphics.FromImage(next)) { g.CompositingMode = CompositingMode.SourceCopy; g.DrawImageUnscaled(Document.BaseImage, -bounds.X, -bounds.Y); }
        if (Save(() => { Document.CommitDocument(next, Document.Marks.Select(m => m.Move(-bounds.X, -bounds.Y))); Document.State.CanvasBackgroundArgb = color.ToArgb(); })) {
            Selection = Rectangle.Empty; Changed?.Invoke($"畫布已調整為 {bounds.Width} × {bounds.Height}，圖片像素未縮放 · Ctrl＋S 保存");
        }
    }
    public void ResizeTo(int width, int height) {
        using var next = new Bitmap(width, height); using (var g = Graphics.FromImage(next)) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.DrawImage(Document.BaseImage, 0, 0, width, height); }
        float sx = width / (float)Document.BaseImage.Width, sy = height / (float)Document.BaseImage.Height;
        Save(() => Document.CommitDocument(next, Document.Marks.Select(m => m.Scale(sx, sy))));
    }
    public void Rotate90() { float height = Document.BaseImage.Height; using var next = new Bitmap(Document.BaseImage); next.RotateFlip(RotateFlipType.Rotate90FlipNone); Save(() => Document.CommitDocument(next, Document.Marks.Select(m => m.Rotate90(height)))); }
    bool Save(Action action) { try { action(); Changed?.Invoke("已修改，尚未保存 · Ctrl＋S 保存"); return true; } catch (Exception e) { Changed?.Invoke("修改未完成：" + e.Message); return false; } finally { RefreshDocument(); } }
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
