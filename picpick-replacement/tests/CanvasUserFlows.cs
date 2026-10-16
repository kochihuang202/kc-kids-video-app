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
    public static void CanvasAllEdges() => RunSta(() => {
        foreach (float zoom in new[] { 1f, .5f }) foreach (bool grow in new[] { true, false }) foreach (int handle in Enumerable.Range(0, 8)) {
            var store = new DocumentStore(Path.Combine(Path.GetTempPath(), "CaptureWorkbench-edges-" + Guid.NewGuid().ToString("N")));
            using var background = NewCanvasForm.CreateImage(200, 150, Color.Blue);
            using (var g = Graphics.FromImage(background)) { g.FillRectangle(Brushes.Red, 40, 0, 1, 150); g.FillRectangle(Brushes.Lime, 0, 30, 200, 1); }
            using var doc = store.Create(background); using var canvas = new ImageCanvas(doc) { Size = new Size(900, 700) }; canvas.SetZoom(zoom);
            using var floating = NewCanvasForm.CreateImage(18, 12, Color.Gold); canvas.InsertImage(floating); var mark = doc.Marks.Single();
            int gap = (int)(12 / zoom); Point[] handles = [new(-gap, -gap), new(100, -gap), new(200 + gap, -gap), new(200 + gap, 75), new(200 + gap, 150 + gap), new(100, 150 + gap), new(-gap, 150 + gap), new(-gap, 75)];
            bool left = handle is 0 or 6 or 7, right = handle is 2 or 3 or 4, top = handle is 0 or 1 or 2, bottom = handle is 4 or 5 or 6;
            int direction = grow ? 1 : -1, dx = left ? -20 * direction : right ? 20 * direction : 0, dy = top ? -16 * direction : bottom ? 16 * direction : 0;
            int x = left ? dx : 0, y = top ? dy : 0, w = 200 + (right ? dx : -x), h = 150 + (bottom ? dy : -y);
            int versions = doc.State.Versions.Count; Drag(canvas, handles[handle].X, handles[handle].Y, dx, dy);
            Check(doc.Image.Size == new Size(w, h), $"Canvas handle {handle} does not resize from its own edge (zoom {zoom}, grow {grow}): {doc.Image.Size}");
            Check(doc.State.Versions.Count == versions + 1, "Canvas drag must create one undo step");
            Check(doc.Marks.Single().Bounds == mark.Move(-x, -y).Bounds, "Canvas origin change must translate floating objects without scaling");
            Check(doc.BaseImage.GetPixel(40 - x, 60 - y).ToArgb() == Color.Red.ToArgb() && doc.BaseImage.GetPixel(60 - x, 30 - y).ToArgb() == Color.Lime.ToArgb(), "Canvas edge resize resampled or misplaced original pixels");
            if (grow && left) Check(doc.BaseImage.GetPixel(0, h - 1).ToArgb() == Color.White.ToArgb(), "Left expansion did not add space on the left");
            if (grow && top) Check(doc.BaseImage.GetPixel(w - 1, 0).ToArgb() == Color.White.ToArgb(), "Top expansion did not add space at the top");
            doc.SavePending(); using (var saved = new Bitmap(doc.OutputPath)) Check(saved.Size == new Size(w, h), "Canvas dimensions were not saved");
            doc.Undo(); canvas.RefreshDocument(); Check(doc.Image.Size == background.Size && doc.Marks.Single().Bounds == mark.Bounds, "Undo must restore canvas and floating object positions together");
            versions = doc.State.Versions.Count; Mouse(canvas, "Down", handles[handle].X, handles[handle].Y); Mouse(canvas, "Move", handles[handle].X + dx, handles[handle].Y + dy); canvas.CancelDrawing(); Mouse(canvas, "Up", handles[handle].X + dx, handles[handle].Y + dy);
            Check(doc.Image.Size == background.Size && doc.State.Versions.Count == versions, "Cancelling canvas drag changed the document");
        }
    });
    public static void ExplorerImageDrop() => RunSta(() => {
        string root = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-drop-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        string first = Path.Combine(root, "大圖.png"), second = Path.Combine(root, "第二張.png"), text = Path.Combine(root, "readme.txt");
        using (var source = NewCanvasForm.CreateImage(800, 600, Color.Blue)) source.Save(first);
        using (var source = NewCanvasForm.CreateImage(40, 30, Color.Red)) source.Save(second);
        File.WriteAllText(text, "not an image");
        var store = new DocumentStore(root); using var blank = NewCanvasForm.CreateImage(200, 150, Color.White); using var doc = store.Create(blank); using var canvas = new ImageCanvas(doc);
        var data = new DataObject(DataFormats.FileDrop, new[] { first, text, second }); var drag = new DragEventArgs(data, 0, 0, 0, DragDropEffects.Copy, DragDropEffects.None);
        typeof(ImageCanvas).GetMethod("OnDragEnter", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(canvas, [drag]);
        Check(canvas.AllowDrop && drag.Effect == DragDropEffects.Copy, "Canvas must accept Explorer image files as copy drops");
        typeof(ImageCanvas).GetMethod("OnDragDrop", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(canvas, [drag]);
        Check(doc.Marks.Count == 2 && doc.Marks[0].Bounds.Size == new Size(800, 600) && doc.Marks[1].Bounds.Size == new Size(40, 30) && doc.Image.Size == blank.Size, "Explorer drop must insert original-size images into the existing canvas and ignore non-images");
        Check(canvas.SelectedMark?.Id == doc.Marks[1].Id && doc.Pending, "Dropped images must remain selected, editable and unsaved");
        var before = doc.Marks[1]; Drag(canvas, (int)before.X1 + 10, (int)before.Y1 + 10, 25, 20); Check(doc.Marks.Last().X1 == before.X1 + 25, "Dropped image cannot be dragged directly");
        var nonImage = new DragEventArgs(new DataObject(DataFormats.FileDrop, new[] { text }), 0, 0, 0, DragDropEffects.Copy, DragDropEffects.None);
        typeof(ImageCanvas).GetMethod("OnDragEnter", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(canvas, [nonImage]); Check(nonImage.Effect == DragDropEffects.None, "Non-image drops must be rejected");
        using var emptyWorkspace = new Panel(); var opened = new List<ImageDocument>();
        ImageFileDrop.Attach(emptyWorkspace, paths => ImageFileDrop.Import(paths, image => opened.Add(store.Create(image))));
        typeof(Control).GetMethod("OnDragEnter", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(emptyWorkspace, [drag]);
        typeof(Control).GetMethod("OnDragDrop", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(emptyWorkspace, [drag]);
        Check(opened.Count == 2 && opened[0].Image.Size == new Size(800, 600) && opened[1].Image.Size == new Size(40, 30) && opened.All(d => d.Marks.Count == 0), "Empty workspace must open each dropped image as a matching-size document");
        foreach (var openedDoc in opened) openedDoc.Dispose();
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
