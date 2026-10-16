using System.Reflection;
using CaptureWorkbench;

static class CanvasUserFlows
{
    public static void Run() {
        RunSta(RunOnStaThread);
    }
    public static void RunSta(Action action) {
        Exception? failure = null;
        var thread = new Thread(() => { try { action(); } catch (Exception e) { failure = e; } });
        thread.SetApartmentState(ApartmentState.STA); thread.Start(); thread.Join();
        if (failure != null) throw failure;
    }
    public static void LargePasteKeepsPixels() => RunSta(() => {
        var store = new DocumentStore(Path.Combine(Path.GetTempPath(), "CaptureWorkbench-large-paste-" + Guid.NewGuid().ToString("N")));
        using var blank = NewCanvasForm.CreateImage(200, 150, Color.White); using var doc = store.Create(blank);
        using var canvas = new ImageCanvas(doc) { Size = new Size(900, 700) };
        using var source = NewCanvasForm.CreateImage(800, 600, Color.Blue);
        using (var g = Graphics.FromImage(source)) { g.FillRectangle(Brushes.Red, 1, 0, 1, 600); g.FillRectangle(Brushes.Lime, 200, 0, 100, 600); }
        canvas.InsertImage(source); var mark = doc.Marks.Single();
        using var buffer = new MemoryStream(Convert.FromBase64String(mark.StampImageData)); using var original = new Bitmap(buffer);
        Check(mark.Bounds.Size == source.Size, $"Pasted image was silently resized: source {original.Size}, object {mark.Bounds.Size}, canvas {doc.Image.Size}");
        Check(doc.Image.Size == blank.Size, "Paste automatically enlarged the existing canvas");
        Check(original.Size == source.Size, "Original paste pixels were discarded");
        Check(doc.Image.GetPixel(1, 20).ToArgb() == Color.Red.ToArgb(), "One-pixel detail was resampled before merging");
    });
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    static void Mouse(ImageCanvas canvas, string action, int x, int y) { var point = canvas.ImageToClient(new PointF(x, y)); typeof(ImageCanvas).GetMethod("OnMouse" + action, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(canvas, [new MouseEventArgs(MouseButtons.Left, 1, point.X, point.Y, 0)]); }
    static void Click(ImageCanvas c, int x, int y) { Mouse(c, "Down", x, y); Mouse(c, "Up", x, y); }
    static void Drag(ImageCanvas c, int x, int y, int dx, int dy) { Mouse(c, "Down", x, y); Mouse(c, "Move", x + dx, y + dy); Mouse(c, "Up", x + dx, y + dy); }
    public static void PasteMergeAndResizeCanvas() => RunSta(() => {
        var store = new DocumentStore(Path.Combine(Path.GetTempPath(), "CaptureWorkbench-merge-" + Guid.NewGuid().ToString("N")));
        using var blank = NewCanvasForm.CreateImage(200, 150, Color.White); using var doc = store.Create(blank);
        using var canvas = new ImageCanvas(doc) { Size = new Size(900, 700) };
        using var source = NewCanvasForm.CreateImage(800, 600, Color.Blue); using (var g = Graphics.FromImage(source)) { g.FillRectangle(Brushes.Lime, 200, 0, 100, 600); g.FillRectangle(Brushes.Red, 251, 0, 1, 600); }
        canvas.InsertImage(source); Drag(canvas, 40, 40, -250, -30);
        Check(doc.Marks.Count == 1 && doc.Marks[0].X1 == -250 && doc.Marks[0].Y1 == -30 && doc.Marks[0].Bounds.Size == source.Size, "Floating image cannot be moved outside the canvas without scaling");
        Check(doc.Image.GetPixel(0, 0).ToArgb() == Color.Lime.ToArgb(), "Moving original-size image did not select the expected source pixels");
        canvas.Merge(); Check(doc.Marks.Count == 0 && canvas.SelectedMark == null && doc.Image.Size == blank.Size, "Merge must fix objects into the existing canvas bounds");
        doc.SavePending(); using (var saved = new Bitmap(doc.OutputPath)) Check(saved.Size == blank.Size && saved.GetPixel(0, 20).ToArgb() == Color.Lime.ToArgb() && saved.GetPixel(1, 20).ToArgb() == Color.Red.ToArgb() && saved.GetPixel(2, 20).ToArgb() == Color.Lime.ToArgb(), "Saved merge has the wrong dimensions or resampled one-pixel detail");
        doc.Undo(); canvas.RefreshDocument(); Check(doc.Marks.Single().Bounds.Size == source.Size && doc.Marks[0].X1 == -250, "Undo merge did not restore the full movable image");
        doc.Redo(); canvas.RefreshDocument(); canvas.ResizeCanvas(300, 220, Color.Transparent);
        Check(doc.Image.Size == new Size(300, 220) && doc.Image.GetPixel(0, 0).ToArgb() == Color.Lime.ToArgb() && doc.Image.GetPixel(250, 180).A == 0, "Canvas resizing resampled pixels or recovered discarded outside content");
        int versions = doc.State.Versions.Count; Drag(canvas, 312, 232, 100, 80);
        Check(doc.Image.Size == new Size(400, 300) && doc.State.Versions.Count == versions + 1 && doc.Image.GetPixel(0, 0).ToArgb() == Color.Lime.ToArgb(), "Dragging the outer canvas handle must resize output once without scaling content");
        doc.Undo(); canvas.RefreshDocument(); Check(doc.Image.Size == new Size(300, 220), "Undo canvas drag failed");
        canvas.ResizeCanvas(100, 80, Color.White); Check(doc.Image.Size == new Size(100, 80) && doc.Image.GetPixel(0, 0).ToArgb() == Color.Lime.ToArgb(), "Shrinking canvas scaled the existing content");
    });
    public static void ClipboardCanvasSize() => RunSta(() => {
        using var dialog = new NewCanvasForm(new Size(800, 600));
        Check(dialog.ImageSize == new Size(800, 600) && !dialog.UseClipboardContent, "New blank canvas must default to clipboard dimensions without pasting pixels");
        using var blank = NewCanvasForm.CreateImage(dialog.ImageSize.Width, dialog.ImageSize.Height, dialog.BackgroundColor);
        Check(blank.Size == new Size(800, 600) && blank.GetPixel(400, 300).ToArgb() == Color.White.ToArgb(), "Clipboard-sized blank canvas has unexpected content");
    });
    static void RunOnStaThread() {
        var store = new DocumentStore(Path.Combine(Path.GetTempPath(), "CaptureWorkbench-canvas-" + Guid.NewGuid().ToString("N")));
        using var blank = NewCanvasForm.CreateImage(600, 400, Color.White); using var doc = store.Create(blank);
        using var canvas = new ImageCanvas(doc) { Tool = EditTool.Stamp, Stamp = StampDefinition.NumberStyles[0], Size = new Size(700, 500) };
        Click(canvas, 100, 100);
        var first = doc.Marks.Single();
        Check(first.Text == "1" && Math.Abs(first.Bounds.Left + first.Bounds.Width / 2 - 100) < .01 && Math.Abs(first.Bounds.Top + first.Bounds.Height / 2 - 100) < .01, "Number stamp is not centered on the cursor");
        Check(canvas.SelectedMark?.Id == first.Id && canvas.NextStampNumber == 2, "New number is not selected or next number did not advance");
        Drag(canvas, 100, 100, 40, 30);
        Check(doc.Marks.Count == 1 && doc.Marks[0].X1 == first.X1 + 40 && canvas.NextStampNumber == 2, "Dragging the active stamp added a new stamp or incremented its number");
        Click(canvas, 300, 100);
        Check(doc.Marks.Count == 2 && doc.Marks[1].Text == "2" && canvas.NextStampNumber == 3, "Clicking blank space must create the next number without changing tools");
        canvas.Tool = EditTool.Rectangle; Drag(canvas, 60, 220, 130, 80);
        var rectangle = doc.Marks.Last(); Drag(canvas, 60, 250, 30, 15);
        Check(doc.Marks.Count == 3 && doc.Marks.Last().X1 == rectangle.X1 + 30, "Rectangle tool cannot directly move an existing rectangle");
        using var graphic = NewCanvasForm.CreateImage(80, 40, Color.DodgerBlue); canvas.InsertImage(graphic);
        var pasted = doc.Marks.Last();
        Check(doc.Marks.Count == 4 && pasted.Kind == EditTool.Image && canvas.SelectedMark?.Id == pasted.Id, "Paste must create an immediately selected image object on the current canvas");
        Drag(canvas, (int)pasted.Bounds.Left + 10, (int)pasted.Bounds.Top + 10, 50, 20);
        Check(doc.Marks.Count == 4 && doc.Marks.Last().X1 == pasted.X1 + 50, "Pasted image is not directly draggable while another tool remains selected");
        var moved = doc.Marks.Last(); Drag(canvas, (int)moved.Bounds.Right + 4, (int)moved.Bounds.Bottom + 4, 40, 20);
        Check(doc.Marks.Count == 4 && doc.Marks.Last().Bounds.Width > moved.Bounds.Width && Math.Abs(doc.Marks.Last().Bounds.Width / doc.Marks.Last().Bounds.Height - 2) < .01, "Pasted image corner resize must keep its aspect ratio");
        canvas.Tool = EditTool.Arrow; Drag(canvas, 500, 260, 0, 100); var arrow = doc.Marks.Last(); Drag(canvas, 500, 260, 40, -10);
        Check(doc.Marks.Count == 5 && doc.Marks.Last().X1 == arrow.X1 + 40 && doc.Marks.Last().Y1 == arrow.Y1 - 10, "A vertical arrow endpoint must move freely rather than creating another arrow");
        canvas.SelectAll(); Check(canvas.Selection.Size == doc.Image.Size && canvas.SelectedMark == null, "Ctrl+A selection must cover the whole image");
        doc.SavePending(); doc.CloseAndSave(); Check(store.Restore().Count == 0, "Closed images must not reopen at startup");
    }
}
