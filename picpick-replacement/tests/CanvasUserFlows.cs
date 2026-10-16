using System.Reflection;
using CaptureWorkbench;

static class CanvasUserFlows
{
    public static void Run() {
        Exception? failure = null;
        var thread = new Thread(() => { try { RunOnStaThread(); } catch (Exception e) { failure = e; } });
        thread.SetApartmentState(ApartmentState.STA); thread.Start(); thread.Join();
        if (failure != null) throw failure;
    }
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    static void Mouse(ImageCanvas canvas, string action, int x, int y) => typeof(ImageCanvas).GetMethod("OnMouse" + action, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(canvas, [new MouseEventArgs(MouseButtons.Left, 1, x + 20, y + 20, 0)]);
    static void Click(ImageCanvas c, int x, int y) { Mouse(c, "Down", x, y); Mouse(c, "Up", x, y); }
    static void Drag(ImageCanvas c, int x, int y, int dx, int dy) { Mouse(c, "Down", x, y); Mouse(c, "Move", x + dx, y + dy); Mouse(c, "Up", x + dx, y + dy); }
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
