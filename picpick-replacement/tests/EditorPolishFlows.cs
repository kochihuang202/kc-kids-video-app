using System.Reflection;
using CaptureWorkbench;

static class EditorPolishFlows
{
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    static void Mouse(ImageCanvas canvas, string action, int x, int y) { var p = canvas.ImageToClient(new PointF(x, y)); typeof(ImageCanvas).GetMethod("OnMouse" + action, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(canvas, [new MouseEventArgs(MouseButtons.Left, 1, p.X, p.Y, 0)]); }
    static void Drag(ImageCanvas canvas, int x, int y, int dx, int dy) { Mouse(canvas, "Down", x, y); Mouse(canvas, "Move", x + dx, y + dy); Mouse(canvas, "Up", x + dx, y + dy); }
    static T Field<T>(WorkbenchForm form, string name) => (T)typeof(WorkbenchForm).GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(form)!;
    static object? Call(WorkbenchForm form, string method, params object[] args) => typeof(WorkbenchForm).GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(form, args);
    static WorkbenchForm CreateWorkbench(DocumentStore store) {
        var constructor = typeof(WorkbenchForm).GetConstructor(BindingFlags.Instance | BindingFlags.NonPublic, null, [typeof(string[]), typeof(DocumentStore), typeof(AppSettings)], null);
        return constructor == null ? new WorkbenchForm([]) : (WorkbenchForm)constructor.Invoke([Array.Empty<string>(), store, new AppSettings { OutputFolder = store.Root }]);
    }
    public static void TrayLifecycle() => CanvasUserFlows.RunSta(() => {
        var store = new DocumentStore(Path.Combine(Path.GetTempPath(), "CaptureWorkbench-tray-" + Guid.NewGuid().ToString("N")));
        using var blank = NewCanvasForm.CreateImage(80, 60, Color.White); using var doc = store.Create(blank); using var edit = new Bitmap(blank); edit.SetPixel(0, 0, Color.Red); doc.Commit(edit);
        using var form = CreateWorkbench(store); var tray = Field<NotifyIcon>(form, "tray");
        try {
            Call(form, "AddTab", doc); _ = form.Handle; form.Close();
            Check(!form.IsDisposed && !form.Visible && doc.State.Open && doc.Pending && Field<TabControl>(form, "tabs").TabCount == 1, "Window X must hide to the tray and retain open unsaved tabs");
            using (var old = new Bitmap(doc.OutputPath)) Check(old.GetPixel(0, 0).ToArgb() == Color.White.ToArgb(), "Hiding to tray unexpectedly saved editing changes");
            form.WindowState = FormWindowState.Minimized; Check(!form.IsDisposed && !form.Visible && doc.Pending, "Minimize must preserve the same unsaved document");
            Call(form, "RequestExit"); Check(form.IsDisposed && !doc.State.Open && !doc.Pending, "Tray exit must really close and save the final document");
            using var saved = new Bitmap(doc.OutputPath); Check(saved.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb() && store.Restore().Count == 0, "Explicit exit did not save final pixels and forget closed tabs");
        } finally { tray.Dispose(); }
    });
    public static void ManualWidth() => CanvasUserFlows.RunSta(() => {
        var store = new DocumentStore(Path.Combine(Path.GetTempPath(), "CaptureWorkbench-width-" + Guid.NewGuid().ToString("N")));
        using var blank = NewCanvasForm.CreateImage(320, 240, Color.White); using var doc = store.Create(blank); using var form = CreateWorkbench(store); var tray = Field<NotifyIcon>(form, "tray");
        try {
            Call(form, "AddTab", doc); var canvas = (ImageCanvas)Field<TabControl>(form, "tabs").SelectedTab!.Tag!;
            canvas.Tool = EditTool.Rectangle; Drag(canvas, 40, 40, 160, 100); var width = Field<ToolStripComboBox>(form, "width");
            Check(width.DropDownStyle == ComboBoxStyle.DropDown, "Line width must allow direct text input");
            width.Text = "7.5"; width.GetType().GetMethod("OnKeyDown", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(width, [new KeyEventArgs(Keys.Enter)]);
            Check(canvas.Stroke == 7.5f && doc.Marks.Single().Stroke == 7.5f, "Typed line width did not update the selected object and future drawing style");
            int versions = doc.State.Versions.Count;
            foreach (string invalid in new[] { "0", "-1", "NaN", "999", "abc", "" }) { width.Text = invalid; Call(form, "ApplyStrokeWidth"); Check(canvas.Stroke == 7.5f && doc.State.Versions.Count == versions, "Invalid line width changed the image or history"); }
            width.SelectedItem = "5"; typeof(ComboBox).GetMethod("OnSelectionChangeCommitted", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(width.ComboBox, [EventArgs.Empty]); Check(doc.Marks.Single().Stroke == 5, "Line width dropdown preset stopped working");
        } finally { tray.Dispose(); }
    });
    public static void RoundedFrames() => CanvasUserFlows.RunSta(() => {
        Check(Enum.TryParse<EditTool>("RoundedRectangle", out var rounded), "Rounded frame tool is missing");
        Check((int)EditTool.Rectangle == 3 && (int)EditTool.Image == 11, "New tool changed persisted enum values");
        var store = new DocumentStore(Path.Combine(Path.GetTempPath(), "CaptureWorkbench-rounded-" + Guid.NewGuid().ToString("N")));
        using var blank = NewCanvasForm.CreateImage(320, 240, Color.White); using var doc = store.Create(blank); using var canvas = new ImageCanvas(doc) { Tool = rounded, Stroke = 3, Ink = Color.Red };
        Drag(canvas, 40, 40, 160, 100); Check(doc.Marks.Single().Kind == rounded && canvas.SelectedMark != null, "Rounded frame was not created as an editable selected object");
        Check(doc.Image.GetPixel(40, 40).ToArgb() == Color.White.ToArgb() && doc.Image.GetPixel(100, 40).R > 240 && doc.Image.GetPixel(100, 40).G < 30, "Frame corners are not rounded or straight edges are missing");
        Drag(canvas, 100, 40, 20, 15); Check(doc.Marks.Single().X1 == 60 && doc.Marks[0].Y1 == 55, "Rounded frame cannot be moved directly while its drawing tool remains selected");
        canvas.SetSelectedStyle(Color.Blue, 7.5f); Check(doc.Marks.Single().Stroke == 7.5f, "Rounded frame cannot retain custom line width");
        doc.SavePending(); doc.CloseAndSave();
        using var saved = new Bitmap(doc.OutputPath); Check(saved.Size == blank.Size && saved.GetPixel(60, 55).ToArgb() == Color.White.ToArgb(), "Saving lost rounded frame geometry");
    });
    public static void FineMosaic() => CanvasUserFlows.RunSta(() => {
        var store = new DocumentStore(Path.Combine(Path.GetTempPath(), "CaptureWorkbench-mosaic-" + Guid.NewGuid().ToString("N")));
        using var source = new Bitmap(96, 48); for (int y = 0; y < 48; y++) for (int x = 0; x < 96; x++) source.SetPixel(x, y, Color.FromArgb(255, x * 2, y * 3, 0));
        using var doc = store.Create(source); using var canvas = new ImageCanvas(doc) { Tool = EditTool.Mosaic };
        Drag(canvas, 10, 10, 49, 25);
        Check(doc.Image.GetPixel(10, 10).ToArgb() == Color.FromArgb(255, 25, 37, 0).ToArgb(), "Mosaic must average a finer 6x6 pixel cell rather than sampling one large cell");
        Check(doc.Image.GetPixel(15, 15).ToArgb() == doc.Image.GetPixel(10, 10).ToArgb() && doc.Image.GetPixel(16, 10).ToArgb() != doc.Image.GetPixel(10, 10).ToArgb(), "Mosaic cells are too large or not uniform");
        Check(doc.Image.GetPixel(9, 10).ToArgb() == source.GetPixel(9, 10).ToArgb() && doc.Image.GetPixel(58, 34).ToArgb() == source.GetPixel(58, 34).ToArgb(), "Mosaic changed outside pixels or mishandled a partial edge cell");
        doc.Undo(); canvas.RefreshDocument(); Check(doc.Image.GetPixel(10, 10).ToArgb() == source.GetPixel(10, 10).ToArgb(), "Mosaic undo lost original pixels");
        MosaicFilter.Apply(source, new Rectangle(10, 10, 0, 20)); Check(source.GetPixel(10, 10).ToArgb() == Color.FromArgb(255, 20, 30, 0).ToArgb(), "A zero-width mosaic stroke must leave pixels unchanged");
    });
}
