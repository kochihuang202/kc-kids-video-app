using System.Reflection;
using CaptureWorkbench;

static class TabClosingUserFlows
{
    static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
    static T Field<T>(WorkbenchForm form, string name) => (T)typeof(WorkbenchForm).GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(form)!;
    static object? Call(WorkbenchForm form, string method, params object[] args) => typeof(WorkbenchForm).GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(form, args);
    static WorkbenchForm Create(DocumentStore store) => (WorkbenchForm)Activator.CreateInstance(typeof(WorkbenchForm), BindingFlags.Instance | BindingFlags.NonPublic, null,
        [Array.Empty<string>(), store, new AppSettings { OutputFolder = store.Root }], null)!;
    static DocumentStore Store() => new(Path.Combine(Path.GetTempPath(), "CaptureWorkbench-close-tabs-" + Guid.NewGuid().ToString("N")));
    static ImageDocument Add(WorkbenchForm form, DocumentStore store, Color color) {
        using var blank = NewCanvasForm.CreateImage(80, 60, Color.White); var doc = store.Create(blank);
        using var edited = new Bitmap(blank); edited.SetPixel(0, 0, color); doc.Commit(edited); Call(form, "AddTab", doc); return doc;
    }
    static ToolStripButton? CloseAllButton(WorkbenchForm form) => form.Controls.OfType<ToolStrip>().SelectMany(strip => strip.Items.OfType<ToolStripButton>()).SingleOrDefault(button => button.Text == "關閉全部分頁");
    static void Mouse(TabControl tabs, int message, Point p) {
        var native = Message.Create(tabs.Handle, message, message == 0x201 ? 1 : 0, (IntPtr)((p.Y << 16) | (p.X & 0xffff)));
        tabs.GetType().GetMethod("WndProc", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(tabs, [native]);
    }
    static Point ClosePoint(TabControl tabs, int index) { var bounds = tabs.GetTabRect(index); return new Point(bounds.Right - 14, bounds.Top + bounds.Height / 2); }
    static void ClickX(TabControl tabs, int index) { var p = ClosePoint(tabs, index); Mouse(tabs, 0x201, p); Mouse(tabs, 0x202, p); }
    static void Saved(ImageDocument doc, Color color) {
        Check(!doc.State.Open && !doc.Pending, "Closing did not save and forget the document");
        using var png = new Bitmap(doc.OutputPath); Check(png.GetPixel(0, 0).ToArgb() == color.ToArgb(), "Closing lost the final edited pixels");
    }
    public static void RenderPreview(string path) => CanvasUserFlows.RunSta(() => {
        var store = Store(); using var form = Create(store);
        Add(form, store, Color.Red).SavePending(); Add(form, store, Color.Blue); Add(form, store, Color.Green);
        // Show the actual controls in a fixture host so no app hotkeys, pipe or startup settings are registered.
        using var host = new PreviewHost { Text = "分頁控制項驗證", ClientSize = form.ClientSize, Font = form.Font, BackColor = form.BackColor, Icon = form.Icon };
        foreach (Control control in form.Controls.Cast<Control>().ToArray()) host.Controls.Add(control);
        host.Show(); host.Update();
        using var bitmap = new Bitmap(host.Width, host.Height);
        host.DrawToBitmap(bitmap, new Rectangle(Point.Empty, bitmap.Size));
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!); bitmap.Save(path);
    });
    sealed class PreviewHost : Form { protected override bool ShowWithoutActivation => true; }

    public static void CloseAll() => CanvasUserFlows.RunSta(() => {
        var store = Store(); using var form = Create(store);
        var button = CloseAllButton(form); Check(button != null, "Close-all-tabs toolbar button is missing"); Check(!button!.Enabled, "Close all should be disabled with no documents");
        var a = Add(form, store, Color.Red); var b = Add(form, store, Color.Blue); var c = Add(form, store, Color.Green);
        var tabs = Field<TabControl>(form, "tabs"); Check(button.Enabled, "Close all did not enable after opening documents");
        button.PerformClick(); Check(tabs.TabCount == 0 && !button.Enabled && !form.IsDisposed, "Close all must clear tabs while leaving the editor usable");
        Saved(a, Color.Red); Saved(b, Color.Blue); Saved(c, Color.Green); Check(store.Restore().Count == 0, "Closed tabs remain in the open-document list");
        var next = Add(form, store, Color.Purple); Check(tabs.TabCount == 1 && button.Enabled, "The editor cannot open another document after closing all");
        Message msg = default; typeof(WorkbenchForm).GetMethod("ProcessCmdKey", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(form, [msg, Keys.Control | Keys.W]);
        Saved(next, Color.Purple); Check(tabs.TabCount == 0 && !button.Enabled, "Ctrl+W stopped closing and updating the close-all button");
    });

    public static void HeaderX() => CanvasUserFlows.RunSta(() => {
        var store = Store(); using var form = Create(store);
        var a = Add(form, store, Color.Red); var b = Add(form, store, Color.Blue); var c = Add(form, store, Color.Green);
        var tabs = Field<TabControl>(form, "tabs"); _ = form.Handle; _ = tabs.Handle;
        var active = tabs.SelectedTab; ClickX(tabs, 0);
        Check(tabs.TabCount == 2 && !a.State.Open, "The rightmost X did not close its own inactive tab");
        Check(tabs.SelectedTab == active && b.State.Open && b.Pending && c.State.Open && c.Pending, "Closing an inactive tab changed or saved unrelated documents"); Saved(a, Color.Red);
        var repeated = ClosePoint(tabs, 0); Mouse(tabs, 0x203, repeated); Mouse(tabs, 0x202, repeated);
        Check(tabs.TabCount == 2, "A rapid double-click closed the next tab underneath the first X");
        var p = ClosePoint(tabs, 0); Mouse(tabs, 0x201, p); Mouse(tabs, 0x202, new Point(p.X - 40, p.Y));
        Check(tabs.TabCount == 2, "Dragging off X still closed the tab");
        Mouse(tabs, 0x207, p); Mouse(tabs, 0x208, p); Check(tabs.TabCount == 2, "A middle mouse click triggered the left-button X action");
        ClickX(tabs, 1); Saved(c, Color.Green); Check(tabs.TabCount == 1 && b.State.Open, "Closing the active tab did not leave the other tab available");
        ClickX(tabs, 0); Saved(b, Color.Blue); Check(tabs.TabCount == 0 && store.Restore().Count == 0, "Closing the last tab failed");
    });

    public static void FailureAndRetry() => CanvasUserFlows.RunSta(() => {
        var store = Store(); using var form = Create(store);
        var a = Add(form, store, Color.Red); var b = Add(form, store, Color.Blue); var c = Add(form, store, Color.Green);
        var tabs = Field<TabControl>(form, "tabs");
        var closeAll = typeof(WorkbenchForm).GetMethod("CloseAllTabs", BindingFlags.Instance | BindingFlags.NonPublic); Check(closeAll != null, "Close-all save-and-close flow is missing");
        using (var locked = new FileStream(b.OutputPath, FileMode.Open, FileAccess.Read, FileShare.None)) {
            bool failed = false; try { closeAll!.Invoke(form, null); } catch (TargetInvocationException error) when (error.InnerException is IOException or UnauthorizedAccessException) { failed = true; }
            Check(failed, "A save failure was silently treated as successful close"); Saved(a, Color.Red);
            Check(tabs.TabCount == 2 && ((ImageCanvas)tabs.SelectedTab!.Tag!).Document == b && b.State.Open && b.Pending && c.State.Open && c.Pending, "Failed close discarded pending content or did not select the failed tab");
        }
        CloseAllButton(form)!.PerformClick(); Saved(b, Color.Blue); Saved(c, Color.Green); Check(tabs.TabCount == 0, "Close all could not retry after saving became available");
    });
    public static void PendingStyle() => CanvasUserFlows.RunSta(() => {
        var store = Store(); using var form = Create(store); var doc = Add(form, store, Color.Red);
        var tabs = Field<TabControl>(form, "tabs"); var canvas = (ImageCanvas)tabs.SelectedTab!.Tag!; canvas.Tool = EditTool.Rectangle;
        foreach (var (action, point) in new[] { ("Down", new PointF(10, 10)), ("Move", new PointF(60, 40)), ("Up", new PointF(60, 40)) }) {
            var p = canvas.ImageToClient(point);
            typeof(ImageCanvas).GetMethod("OnMouse" + action, BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(canvas, [new MouseEventArgs(MouseButtons.Left, 1, p.X, p.Y, 0)]);
        }
        Field<ToolStripComboBox>(form, "width").Text = "7.5";
        _ = form.Handle; _ = tabs.Handle; ClickX(tabs, 0);
        Saved(doc, Color.Red); Check(doc.Marks.Single().Stroke == 7.5f, "The tab X discarded a pending typed line-width edit");
    });
}
