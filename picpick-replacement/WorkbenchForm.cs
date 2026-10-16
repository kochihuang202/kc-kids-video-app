using System.Diagnostics;
using System.Drawing.Imaging;
using System.IO.Pipes;
using System.Text.Json;

namespace CaptureWorkbench;

public sealed class WorkbenchForm : Form
{
    readonly DocumentStore store;
    readonly TabControl tabs = new() { Dock = DockStyle.Fill, Padding = new Point(18, 7) };
    readonly ToolStripStatusLabel status = new() { Spring = true, TextAlign = ContentAlignment.MiddleLeft };
    readonly Label welcome = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.FromArgb(85, 101, 125), Text = "截圖工作台\n\n擷取的每張圖片，都有自己的分頁。\n\n按「開始擷取」或全域快捷鍵開始\n框選範圍 → 一般／捲動擷取 → 自動保存\n\n捲動中按 Esc 結束；到底後也會自動完成。" };
    readonly NotifyIcon tray;
    readonly ToolStripButton shortcutButton = new("快捷鍵：註冊中");
    CancellationTokenSource? captureCancellation;
    readonly CancellationTokenSource lifetime = new();
    readonly Queue<string> pendingFiles = new();
    bool capturing, hotkeyRegistered;
    EditTool tool = EditTool.Arrow;
    Color ink = Color.FromArgb(230, 52, 68);
    float stroke = 3;
    ImageCanvas? Canvas => tabs.SelectedTab?.Tag as ImageCanvas;
    public WorkbenchForm(string[] args)
    {
        Text = "截圖工作台 · Capture Workbench"; Width = 1220; Height = 840; MinimumSize = new Size(850, 580);
        StartPosition = FormStartPosition.CenterScreen; BackColor = Color.FromArgb(242, 245, 250);
        Font = new Font("Microsoft JhengHei UI", 10); KeyPreview = true;
        store = new DocumentStore(DocumentStore.DefaultRoot);
        var menu = new MenuStrip();
        var file = new ToolStripMenuItem("檔案");
        file.DropDownItems.Add("開啟圖片…", null, (_, _) => OpenImages());
        file.DropDownItems.Add("貼上成新分頁", null, (_, _) => PasteNew());
        file.DropDownItems.Add("另存圖片…", null, (_, _) => Export());
        file.DropDownItems.Add("關閉目前分頁", null, (_, _) => CloseTab());
        file.DropDownItems.Add("離開", null, (_, _) => Close());
        menu.Items.Add(file); MainMenuStrip = menu;
        var actions = new ToolStrip { GripStyle = ToolStripGripStyle.Hidden, Padding = new Padding(8, 6, 8, 6), BackColor = Color.White, AutoSize = true };
        void Action(string title, Action action) => actions.Items.Add(new ToolStripButton(title, null, (_, _) => Safe(action)));
        actions.Items.Add(new ToolStripButton("開始擷取", null, async (_, _) => await StartCapture(false)));
        actions.Items.Add(new ToolStripButton("捲動擷取", null, async (_, _) => await StartCapture(true)));
        actions.Items.Add(new ToolStripSeparator()); Action("開啟", OpenImages); Action("複製", Copy); Action("另存", Export);
        Action("重試保存", () => { if (Canvas != null) { Canvas.Document.SavePending(); SetStatus("已自動保存"); } });
        Action("輸出資料夾", () => Process.Start(new ProcessStartInfo(store.Root) { UseShellExecute = true }));
        shortcutButton.Click += (_, _) => RegisterShortcut(); actions.Items.Add(shortcutButton);
        var tools = new ToolStrip { GripStyle = ToolStripGripStyle.Hidden, Padding = new Padding(8, 4, 8, 6), BackColor = Color.FromArgb(246, 248, 252) };
        var toolButtons = new List<ToolStripButton>();
        foreach (var (name, type) in new[] { ("選取", EditTool.Select), ("箭頭", EditTool.Arrow), ("文字", EditTool.Text), ("框線", EditTool.Rectangle), ("橢圓", EditTool.Ellipse), ("直線", EditTool.Line), ("畫筆", EditTool.Pen), ("螢光標記", EditTool.Highlight), ("馬賽克", EditTool.Mosaic), ("裁切", EditTool.Crop) }) {
            var button = new ToolStripButton(name) { CheckOnClick = false, Checked = type == tool };
            button.Click += (_, _) => { tool = type; foreach (var b in toolButtons) b.Checked = b == button; UpdateTools(); }; toolButtons.Add(button); tools.Items.Add(button);
        }
        tools.Items.Add(new ToolStripSeparator());
        tools.Items.Add(new ToolStripButton("顏色", null, (_, _) => { using var dialog = new ColorDialog { Color = ink }; if (dialog.ShowDialog(this) == DialogResult.OK) { ink = dialog.Color; UpdateTools(); } }));
        var width = new ToolStripComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 45, AutoSize = false };
        width.Items.AddRange(["2", "3", "5", "8", "12"]); width.SelectedIndex = 1; width.SelectedIndexChanged += (_, _) => { stroke = float.Parse(width.Text); UpdateTools(); }; tools.Items.Add(width);
        var view = new ToolStrip { GripStyle = ToolStripGripStyle.Hidden, Padding = new Padding(8, 3, 8, 3) };
        void View(string title, Action action) => view.Items.Add(new ToolStripButton(title, null, (_, _) => Safe(action)));
        View("復原", () => { Canvas?.Document.Undo(); Canvas?.RefreshDocument(); SetStatus("已復原並自動保存"); });
        View("重做", () => { Canvas?.Document.Redo(); Canvas?.RefreshDocument(); SetStatus("已重做並自動保存"); });
        view.Items.Add(new ToolStripSeparator());
        View("縮小", () => Canvas?.SetZoom(Canvas.Zoom / 1.2f)); View("100%", () => Canvas?.SetZoom(1)); View("放大", () => Canvas?.SetZoom(Canvas.Zoom * 1.2f));
        View("符合視窗", Fit); View("旋轉 90°", () => Canvas?.ApplyEdit(b => b.RotateFlip(RotateFlipType.Rotate90FlipNone))); View("調整尺寸", ResizeImage);
        View("關閉分頁", CloseTab);
        var footer = new StatusStrip(); footer.Items.Add(status);
        var workspace = new Panel { Dock = DockStyle.Fill };
        workspace.Controls.Add(tabs); workspace.Controls.Add(welcome); welcome.BringToFront();
        tabs.SelectedIndexChanged += (_, _) => { UpdateTools(); SetStatus("已自動保存"); };
        Controls.Add(workspace); Controls.Add(view); Controls.Add(tools); Controls.Add(actions); Controls.Add(menu); Controls.Add(footer);
        var trayMenu = new ContextMenuStrip(); trayMenu.Items.Add("開啟編輯器", null, (_, _) => { Show(); WindowState = FormWindowState.Normal; Activate(); });
        trayMenu.Items.Add("停止捲動並保存", null, (_, _) => captureCancellation?.Cancel());
        trayMenu.Items.Add("離開", null, (_, _) => { if (capturing) captureCancellation?.Cancel(); else Close(); });
        tray = new NotifyIcon { Icon = SystemIcons.Application, Text = "截圖工作台", Visible = true, ContextMenuStrip = trayMenu };
        tray.DoubleClick += (_, _) => { if (!capturing) { Show(); Activate(); } };
        Shown += (_, _) => {
            RegisterShortcut();
            foreach (var doc in store.Restore()) AddTab(doc);
            if (store.RecoveryErrors.Count > 0) SetStatus("部分文件無法恢復：" + string.Join("；", store.RecoveryErrors));
            var recovery = Path.Combine(store.Root, ".recovery");
            if (Directory.Exists(recovery)) foreach (var dir in Directory.EnumerateDirectories(recovery)) {
                var partial = Path.Combine(dir, "partial.png");
                if (File.Exists(partial) && !File.Exists(Path.Combine(dir, "completed"))) Safe(() => { using var image = new Bitmap(partial); AddTab(store.Create(image)); File.WriteAllText(Path.Combine(dir, "completed"), "recovered"); SetStatus("已恢復上次中斷的捲動擷取"); });
            }
            foreach (var path in args.Where(File.Exists)) Safe(() => Import(path));
            _ = ListenForOpenRequests();
        };
        FormClosing += (_, e) => {
            if (capturing) { captureCancellation?.Cancel(); e.Cancel = true; return; }
            foreach (TabPage page in tabs.TabPages) { var doc = ((ImageCanvas)page.Tag!).Document; try { if (doc.Pending) doc.SavePending(); else doc.Persist(); } catch (Exception error) { e.Cancel = true; MessageBox.Show(this, "尚未保存成功，文件仍保留在分頁中：\n" + error.Message, "保存失敗"); return; } }
        };
        FormClosed += (_, _) => { lifetime.Cancel(); if (hotkeyRegistered) Native.UnregisterHotKey(Handle, 42); tray.Dispose(); foreach (TabPage page in tabs.TabPages) ((ImageCanvas)page.Tag!).Document.Dispose(); };
    }
    void RegisterShortcut()
    {
        if (hotkeyRegistered) Native.UnregisterHotKey(Handle, 42);
        hotkeyRegistered = Native.RegisterHotKey(Handle, 42, 0x4001, 0x32);
        if (hotkeyRegistered) shortcutButton.Text = "快捷鍵 Alt＋2 ✓";
        else { hotkeyRegistered = Native.RegisterHotKey(Handle, 42, 0x4003, 0x32); shortcutButton.Text = hotkeyRegistered ? "Alt＋2 被占用 · 暫用 Ctrl＋Alt＋2" : "快捷鍵被占用 · 按此重試"; }
    }
    protected override void WndProc(ref Message m) { if (m.Msg == 0x312 && m.WParam == 42 && !capturing) { _ = StartCapture(false); return; } base.WndProc(ref m); }
    void SetStatus(string message) { status.Text = Canvas == null ? message : $"{message}   ·   {Canvas.Document.Image.Width} × {Canvas.Document.Image.Height}   ·   {Canvas.Document.OutputPath}"; }
    void UpdateTools() { if (Canvas != null) { Canvas.Tool = tool; Canvas.Ink = ink; Canvas.Stroke = stroke; } }
    void AddTab(ImageDocument doc)
    {
        welcome.Visible = false;
        var canvas = new ImageCanvas(doc); canvas.Changed += SetStatus;
        var page = new TabPage(doc.State.Title) { Tag = canvas, ToolTipText = doc.OutputPath };
        page.Controls.Add(canvas); tabs.TabPages.Add(page); tabs.SelectedTab = page; UpdateTools(); SetStatus("已自動保存");
    }
    async Task StartCapture(bool scroll)
    {
        if (capturing) return; capturing = true; Hide();
        try {
            await Task.Delay(220);
            using var background = Native.Capture(SystemInformation.VirtualScreen);
            using var overlay = new CaptureOverlay(background, scroll);
            if (overlay.ShowDialog() != DialogResult.OK) return;
            if (!overlay.IsScrolling) {
                var v = SystemInformation.VirtualScreen; var r = overlay.SelectedRegion;
                using var image = background.Clone(new Rectangle(r.Left - v.Left, r.Top - v.Top, r.Width, r.Height), PixelFormat.Format32bppArgb);
                AddTab(store.Create(image));
            } else {
                captureCancellation = new CancellationTokenSource(); tray.Text = "正在捲動擷取 · Esc 結束";
                var result = await ScrollCapture.RunAsync(overlay.SelectedRegion, store.Root, captureCancellation.Token, text => tray.Text = text.Length > 60 ? text[..60] : text);
                using (result.Image) AddTab(store.Create(result.Image));
                File.WriteAllText(Path.Combine(result.RecoveryPath, "completed"), result.Message);
                SetStatus(result.Message);
                if (result.NeedsReview) MessageBox.Show(result.Message + "\n\n恢復資料：" + result.RecoveryPath, "請檢查擷取結果", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        } catch (Exception error) { MessageBox.Show(error.Message, "擷取未完成", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { captureCancellation?.Dispose(); captureCancellation = null; tray.Text = "截圖工作台"; capturing = false; DrainOpenRequests(); Show(); WindowState = FormWindowState.Normal; Activate(); }
    }
    void Safe(Action action) { try { action(); } catch (Exception error) { Canvas?.RefreshDocument(); SetStatus("操作未完成：" + error.Message); MessageBox.Show(this, error.Message, "操作未完成", MessageBoxButtons.OK, MessageBoxIcon.Warning); } }
    async Task ListenForOpenRequests()
    {
        while (!lifetime.IsCancellationRequested) {
            try {
                using var pipe = new NamedPipeServerStream("CaptureWorkbench-open", PipeDirection.In, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
                await pipe.WaitForConnectionAsync(lifetime.Token);
                using var reader = new StreamReader(pipe); var line = await reader.ReadLineAsync(lifetime.Token);
                if (line == null || line.Length > 65536) continue;
                var files = JsonSerializer.Deserialize<string[]>(line) ?? [];
                foreach (var file in files.Take(100).Where(File.Exists)) pendingFiles.Enqueue(file);
                if (!capturing) { DrainOpenRequests(); Show(); WindowState = FormWindowState.Normal; Activate(); }
            } catch (OperationCanceledException) { break; }
            catch (Exception error) { if (!lifetime.IsCancellationRequested) { SetStatus("開檔請求未完成：" + error.Message); await Task.Delay(500); } }
        }
    }
    void DrainOpenRequests() { while (pendingFiles.TryDequeue(out var file)) Safe(() => Import(file)); }
    void OpenImages() { using var dialog = new OpenFileDialog { Filter = "圖片|*.png;*.jpg;*.jpeg;*.bmp;*.gif|所有檔案|*.*", Multiselect = true }; if (dialog.ShowDialog(this) == DialogResult.OK) foreach (var file in dialog.FileNames) Safe(() => Import(file)); }
    void Import(string path) { using var source = new Bitmap(path); AddTab(store.Create(source)); }
    void PasteNew() { if (!Clipboard.ContainsImage()) return; using var source = Clipboard.GetImage(); if (source != null) { using var bitmap = new Bitmap(source); AddTab(store.Create(bitmap)); } }
    void Copy() { if (Canvas == null) return; if (!Canvas.Selection.IsEmpty) { using var part = Canvas.Document.Image.Clone(Canvas.Selection, PixelFormat.Format32bppArgb); Clipboard.SetImage(part); } else Clipboard.SetImage(Canvas.Document.Image); SetStatus("已複製到剪貼簿"); }
    void Export()
    {
        if (Canvas == null) return;
        using var dialog = new SaveFileDialog { Filter = "PNG 圖片|*.png|JPEG 圖片|*.jpg|BMP 圖片|*.bmp", FileName = Path.GetFileName(Canvas.Document.OutputPath) };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        if (dialog.FilterIndex == 1) DocumentStore.AtomicPng(Canvas.Document.Image, dialog.FileName);
        else Canvas.Document.Image.Save(dialog.FileName, dialog.FilterIndex == 2 ? ImageFormat.Jpeg : ImageFormat.Bmp);
        SetStatus("已另存圖片");
    }
    void CloseTab()
    {
        if (Canvas == null) return; var canvas = Canvas; var page = tabs.SelectedTab!;
        if (canvas.Document.Pending) canvas.Document.SavePending();
        canvas.Document.State.Open = false; canvas.Document.Persist(); tabs.TabPages.Remove(page); page.Dispose(); canvas.Document.Dispose();
        welcome.Visible = tabs.TabCount == 0; SetStatus("已關閉分頁，圖片仍保存在輸出資料夾");
    }
    void Fit() { if (Canvas == null) return; Canvas.SetZoom(Math.Min(1, Math.Min((Canvas.ClientSize.Width - 40f) / Canvas.Document.Image.Width, (Canvas.ClientSize.Height - 40f) / Canvas.Document.Image.Height))); }
    void ResizeImage()
    {
        if (Canvas == null) return;
        var input = TextEntry.Ask(this, "調整圖片尺寸", "輸入寬 × 高（像素），例如 1280 x 720：", $"{Canvas.Document.Image.Width} x {Canvas.Document.Image.Height}"); if (input == null) return;
        var parts = input.ToLowerInvariant().Replace('×', 'x').Split('x', StringSplitOptions.TrimEntries);
        if (parts.Length != 2 || !int.TryParse(parts[0], out int w) || !int.TryParse(parts[1], out int h) || w < 1 || h < 1 || (long)w * h > 100_000_000) throw new InvalidOperationException("請輸入有效尺寸，總像素不得超過一億。");
        using var resized = new Bitmap(w, h); using (var g = Graphics.FromImage(resized)) { g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic; g.DrawImage(Canvas.Document.Image, 0, 0, w, h); }
        Canvas.Document.Commit(resized); Canvas.RefreshDocument(); SetStatus("尺寸已調整並自動保存");
    }
    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        switch (keyData) {
            case Keys.Control | Keys.O: Safe(OpenImages); return true;
            case Keys.Control | Keys.V: Safe(PasteNew); return true;
            case Keys.Control | Keys.C: Safe(Copy); return true;
            case Keys.Control | Keys.S: Safe(() => { Canvas?.Document.SavePending(); SetStatus("已保存"); }); return true;
            case Keys.Control | Keys.Z: Safe(() => { Canvas?.Document.Undo(); Canvas?.RefreshDocument(); SetStatus("已復原並保存"); }); return true;
            case Keys.Control | Keys.Y: Safe(() => { Canvas?.Document.Redo(); Canvas?.RefreshDocument(); SetStatus("已重做並保存"); }); return true;
            case Keys.Control | Keys.W: Safe(CloseTab); return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }
}
