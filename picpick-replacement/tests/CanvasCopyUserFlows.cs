using System.Reflection;
using CaptureWorkbench;

static class CanvasCopyUserFlows
{
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    static object? Call(object target, string method, params object[] args) => target.GetType().GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(target, args);
    static void Key(WorkbenchForm form, Keys keys) { Message message = default; Call(form, "ProcessCmdKey", message, keys); }
    static void Drag(ImageCanvas canvas, PointF from, PointF to) {
        foreach (var (action, point) in new[] { ("Down", from), ("Move", to), ("Up", to) }) {
            var p = canvas.ImageToClient(point); Call(canvas, "OnMouse" + action, new MouseEventArgs(MouseButtons.Left, 1, p.X, p.Y, 0));
        }
    }
    sealed class Session : IDisposable
    {
        readonly DocumentStore store = new(Path.Combine(Path.GetTempPath(), "CaptureWorkbench-copy-" + Guid.NewGuid().ToString("N")));
        public readonly ImageDocument Document;
        public readonly WorkbenchForm Form;
        public readonly ImageCanvas Canvas;
        public Bitmap? Copied;
        public int Writes;
        public Session() {
            using var source = NewCanvasForm.CreateImage(1600, 800, Color.FromArgb(160, 30, 90, 150));
            source.SetPixel(0, 0, Color.FromArgb(80, 240, 20, 60)); source.SetPixel(1391, 509, Color.Gold);
            Document = store.Create(source);
            Action<Bitmap> writer = image => { Copied?.Dispose(); Copied = new Bitmap(image); Writes++; };
            Form = (WorkbenchForm)Activator.CreateInstance(typeof(WorkbenchForm), BindingFlags.Instance | BindingFlags.NonPublic, null,
                [Array.Empty<string>(), store, new AppSettings { OutputFolder = store.Root }, writer], null)!;
            Call(Form, "AddTab", Document);
            var tabs = (TabControl)typeof(WorkbenchForm).GetField("tabs", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(Form)!;
            Canvas = (ImageCanvas)tabs.SelectedTab!.Tag!; Canvas.Tool = EditTool.Select; Canvas.Size = new Size(1700, 900);
        }
        public void Copy() {
            int history = Document.State.Versions.Count; bool pending = Document.Pending;
            // Direct invocation exposes the original exception without opening Safe's modal error dialog.
            Call(Form, "Copy"); int writes = Writes;
            Key(Form, Keys.Control | Keys.C); Check(Writes == writes + 1, "Ctrl+C did not reach the same copy operation");
            Check(Document.State.Versions.Count == history && Document.Pending == pending, "Copy changed pixels, history or save state");
        }
        public void CheckWhole() {
            Check(Copied?.Size == Document.Image.Size, "An empty-area selection must copy the full image");
            foreach (var p in new[] { Point.Empty, new Point(Math.Min(13, Document.Image.Width - 1), Math.Min(17, Document.Image.Height - 1)), new Point(Document.Image.Width - 1, Document.Image.Height - 1) })
                Check(Copied!.GetPixel(p.X, p.Y).ToArgb() == Document.Image.GetPixel(p.X, p.Y).ToArgb(), "Full-image copy changed pixels or alpha");
        }
        public void Dispose() { Copied?.Dispose(); Form.Dispose(); Document.Dispose(); }
    }
    public static void EmptyArea() => CanvasUserFlows.RunSta(() => {
        using var s = new Session();
        foreach (float zoom in new[] { 1f, .5f }) {
            s.Canvas.SetZoom(zoom);
            foreach (var (from, to) in new[] { (new PointF(1391, 509), new PointF(1391, 509)), (new PointF(100, 100), new PointF(180, 100)), (new PointF(100, 100), new PointF(100, 180)) }) {
                Drag(s.Canvas, from, to); s.Copy(); s.CheckWhole();
                Check(s.Canvas.Selection == Rectangle.Empty, "A click or one-dimensional drag left an invalid selection");
            }
        }
    });
    public static void ValidAndClipped() => CanvasUserFlows.RunSta(() => {
        using var s = new Session();
        Drag(s.Canvas, new PointF(100, 80), new PointF(30, 25)); s.Copy();
        Check(s.Copied?.Size == new Size(70, 55), "Reverse rectangle selection copied the wrong area");
        Check(s.Copied!.GetPixel(0, 0).ToArgb() == s.Document.Image.GetPixel(30, 25).ToArgb(), "Rectangle copy lost its origin or alpha");
        Key(s.Form, Keys.Control | Keys.A); s.Copy(); s.CheckWhole();
        Drag(s.Canvas, new PointF(30, 25), new PointF(100, 80)); s.Canvas.ResizeTo(60, 40); s.Copy();
        Check(s.Copied?.Size == new Size(30, 15), "Selection was not clipped to the resized image bounds");
        Drag(s.Canvas, new PointF(30, 25), new PointF(50, 35)); s.Canvas.ResizeTo(20, 15); s.Copy(); s.CheckWhole();
    });
    public static void ObjectCopy() => CanvasUserFlows.RunSta(() => {
        using var s = new Session(); using var pasted = NewCanvasForm.CreateImage(40, 25, Color.CornflowerBlue);
        s.Canvas.InsertImage(pasted); var mark = s.Canvas.SelectedMark!; s.Copy();
        int padding = (int)Math.Ceiling(mark.Stroke * 6 + 2);
        Check(s.Copied?.Size == new Size(40 + padding * 2, 25 + padding * 2), "Selected image copy changed its original pixel bounds");
        Check(s.Copied!.GetPixel(padding + 15, padding + 10).ToArgb() == pasted.GetPixel(15, 10).ToArgb() && s.Copied.GetPixel(0, 0).A == 0, "Selected object copy lost its content or transparency");
        Key(s.Form, Keys.Control | Keys.A); s.Copy(); s.CheckWhole();
    });
}
