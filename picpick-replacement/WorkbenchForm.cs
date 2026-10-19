using System.Diagnostics;
using System.Drawing.Imaging;
using System.IO.Pipes;
using System.Text.Json;

namespace CaptureWorkbench;

public sealed class WorkbenchForm : Form
{
    readonly DocumentStore store;
    readonly TabControl tabs = new() { Dock = DockStyle.Fill, Padding = new Point(18, 7), DrawMode = TabDrawMode.OwnerDrawFixed, SizeMode = TabSizeMode.Fixed, ItemSize = new Size(132, 34), ShowToolTips = true };
    readonly ToolStripStatusLabel status = new() { Spring = true, TextAlign = ContentAlignment.MiddleLeft };
    readonly Label welcome = new() { Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.FromArgb(85, 101, 125), Text = "截圖工作台\n\n擷取的每張圖片，都有自己的分頁。\n\n按「開始擷取」或全域快捷鍵開始\n框選範圍 → 一般／捲動擷取 → 自動保存\n\n捲動中按 Esc 結束；到底後也會自動完成。" };
    readonly NotifyIcon tray;
    readonly ToolStripButton shortcutButton = new("快捷鍵：註冊中");
    readonly ToolStripButton colorButton = new("顏色");
    readonly ToolStripButton mergeButton = new("合併") { Enabled = false, ToolTipText = "合併浮動圖片與標註到畫布，只保留框內內容；Ctrl＋Enter，Ctrl＋Z 可復原" };
    readonly ToolStripComboBox width = new() { DropDownStyle = ComboBoxStyle.DropDown, Width = 68, AutoSize = false, AccessibleName = "線寬（像素）", ToolTipText = "可選擇或輸入 0.5～100 像素，按 Enter 套用" };
    readonly ToolStripTextBox nextNumber = new() { Width = 48, AutoSize = false, Visible = false, AccessibleName = "下一個圖章編號", Text = "1" };
    readonly ToolStripTextBox currentNumber = new() { Width = 48, AutoSize = false, Visible = false, Enabled = false, AccessibleName = "目前圖章編號" };
    readonly ToolStripLabel currentNumberLabel = new("圖章現用") { Visible = false }, nextNumberLabel = new("下一個") { Visible = false };
    bool syncingStyle;
    readonly string settingsPath;
    AppSettings settings;
    ShortcutBinding? activeShortcut;
    CancellationTokenSource? captureCancellation;
    readonly CancellationTokenSource lifetime = new();
    readonly Queue<string> pendingFiles = new();
    bool capturing, hotkeyRegistered, exitRequested;
    CaptureOverlay? activeSelection;
    EditTool tool = EditTool.Arrow;
    StampDefinition stamp = StampDefinition.NumberStyles[0];
    Color ink = Color.FromArgb(230, 52, 68);
    float stroke = 3;
    ImageCanvas? Canvas => tabs.SelectedTab?.Tag as ImageCanvas;
    public WorkbenchForm(string[] args) : this(args, null, null) { }
    internal WorkbenchForm(string[] args, DocumentStore? documentStore, AppSettings? initialSettings)
    {
        Text = "截圖工作台 · Capture Workbench"; Width = 1220; Height = 840; MinimumSize = new Size(850, 580);
        StartPosition = FormStartPosition.CenterScreen; BackColor = Color.FromArgb(242, 245, 250);
        Font = new Font("Microsoft JhengHei UI", 10); KeyPreview = true;
        Icon = new Icon(typeof(WorkbenchForm).Assembly.GetManifestResourceStream("CaptureWorkbench.App.ico")!);
        settingsPath = Path.Combine(documentStore?.Root ?? DocumentStore.DefaultRoot, "settings.json");
        string? settingsError = null;
        try { settings = initialSettings ?? AppSettings.Load(settingsPath); } catch (Exception error) { settings = new(); settingsError = error.Message; }
        store = documentStore ?? new DocumentStore(DocumentStore.DefaultRoot) { OutputRoot = settings.OutputFolder };
        var menu = new MenuStrip();
        var file = new ToolStripMenuItem("檔案");
        file.DropDownItems.Add("新增空白圖片…  Ctrl＋N", null, (_, _) => Safe(NewImage));
        file.DropDownItems.Add("開啟圖片…", null, (_, _) => OpenImages());
        file.DropDownItems.Add("從剪貼簿新增圖片  Ctrl＋Shift＋V", null, (_, _) => Safe(PasteNew));
        file.DropDownItems.Add("貼上到目前圖片  Ctrl＋V", null, (_, _) => Safe(Paste));
        file.DropDownItems.Add("從檔案貼上…", null, (_, _) => Safe(PasteFile));
        file.DropDownItems.Add("另存圖片…", null, (_, _) => Export());
        file.DropDownItems.Add("保存  Ctrl＋S", null, (_, _) => Safe(SaveCurrent));
        file.DropDownItems.Add("關閉目前分頁", null, (_, _) => CloseTab());
        file.DropDownItems.Add("縮到通知區", null, (_, _) => MinimizeToTray());
        menu.Items.Add(file);
        var options = new ToolStripMenuItem("選項"); options.DropDownItems.Add("程式設定（含開機自動執行）…", null, (_, _) => ShowSettings(false)); options.DropDownItems.Add("快捷鍵…", null, (_, _) => ShowSettings(true)); menu.Items.Add(options); MainMenuStrip = menu;
        var actions = new ToolStrip { GripStyle = ToolStripGripStyle.Hidden, Padding = new Padding(8, 6, 8, 6), BackColor = Color.White, AutoSize = true };
        void Action(string title, Action action) => actions.Items.Add(new ToolStripButton(title, null, (_, _) => Safe(action)));
        actions.Items.Add(new ToolStripButton("開始擷取", null, async (_, _) => await StartCapture(false)));
        actions.Items.Add(new ToolStripButton("捲動擷取", null, async (_, _) => await StartCapture(true)));
        actions.Items.Add(new ToolStripSeparator()); Action("新增", NewImage); Action("開啟", OpenImages); Action("貼上", Paste);
        mergeButton.Click += (_, _) => Safe(MergeObjects); actions.Items.Add(mergeButton);
        Action("複製", Copy); Action("保存", SaveCurrent); Action("另存", Export);
        Action("輸出資料夾…", () => ShowSettings(false));
        Action("開啟資料夾", () => { Directory.CreateDirectory(store.OutputRoot); Process.Start(new ProcessStartInfo(store.OutputRoot) { UseShellExecute = true }); });
        shortcutButton.Click += (_, _) => ShowSettings(true); actions.Items.Add(shortcutButton);
        Action("縮到通知區", MinimizeToTray);
        var tools = new ToolStrip { GripStyle = ToolStripGripStyle.Hidden, Padding = new Padding(8, 5, 8, 5), ImageScalingSize = new Size(24, 24), BackColor = Color.FromArgb(246, 248, 252) };
        var toolButtons = new List<ToolStripButton>();
        foreach (var (name, type) in new[] { ("選取", EditTool.Select), ("箭頭", EditTool.Arrow), ("文字", EditTool.Text), ("框線", EditTool.Rectangle), ("圓角框", EditTool.RoundedRectangle), ("橢圓", EditTool.Ellipse), ("直線", EditTool.Line), ("畫筆", EditTool.Pen), ("螢光標記", EditTool.Highlight), ("馬賽克", EditTool.Mosaic), ("裁切", EditTool.Crop), ("圖章", EditTool.Stamp) }) {
            var button = new ToolStripButton(name, ToolbarArtwork.Tool(type)) { CheckOnClick = false, Checked = type == tool, TextImageRelation = TextImageRelation.ImageAboveText, Padding = new Padding(4, 2, 4, 2), ToolTipText = name };
            button.Click += (_, _) => { if (type == EditTool.Stamp) { using var picker = new StampPicker(ink, stamp, Canvas?.NextStampNumber ?? 1); if (picker.ShowDialog(this) != DialogResult.OK || picker.SelectedStamp == null) return; stamp = picker.SelectedStamp; if (Canvas != null) Canvas.NextStampNumber = picker.NextNumber; } tool = type; foreach (var b in toolButtons) b.Checked = b == button; UpdateTools(); Canvas?.Focus(); }; toolButtons.Add(button); tools.Items.Add(button);
        }
        tools.Items.Add(new ToolStripSeparator());
        colorButton.Image = ToolbarArtwork.Swatch(ink); colorButton.TextImageRelation = TextImageRelation.ImageAboveText;
        void SetInk(Color color) { ink = color; if (stamp.IsNumber) stamp = stamp with { FillArgb = color.ToArgb() }; var oldImage = colorButton.Image; colorButton.Image = ToolbarArtwork.Swatch(ink); oldImage?.Dispose(); UpdateTools(); Canvas?.SetSelectedStyle(ink, stroke); }
        colorButton.Click += (_, _) => { using var dialog = new ColorDialog { Color = ink, FullOpen = true }; if (dialog.ShowDialog(this) == DialogResult.OK) SetInk(dialog.Color); }; tools.Items.Add(colorButton);
        foreach (var color in new[] { Color.Black, Color.White, Color.FromArgb(230, 52, 68), Color.Orange, Color.Gold, Color.ForestGreen, Color.DodgerBlue, Color.MediumPurple }) {
            var swatch = new ToolStripButton("使用 " + ColorTranslator.ToHtml(color), ToolbarArtwork.Swatch(color), (_, _) => SetInk(color)) { DisplayStyle = ToolStripItemDisplayStyle.Image, AutoToolTip = true }; tools.Items.Add(swatch);
        }
        tools.Items.Add(new ToolStripLabel("線寬"));
        width.Items.AddRange(["2", "3", "5", "8", "12"]); width.SelectedIndex = 1;
        width.ComboBox.SelectionChangeCommitted += (_, _) => ApplyStrokeWidth();
        width.KeyDown += (_, e) => { if (e.KeyCode != Keys.Enter) return; e.SuppressKeyPress = true; if (ApplyStrokeWidth()) Canvas?.Focus(); };
        width.Leave += (_, _) => ApplyStrokeWidth(); tools.Items.Add(width);
        var view = new ToolStrip { GripStyle = ToolStripGripStyle.Hidden, Padding = new Padding(8, 3, 8, 3) };
        void View(string title, Action action) => view.Items.Add(new ToolStripButton(title, null, (_, _) => Safe(action)));
        View("復原", () => { Canvas?.Document.Undo(); Canvas?.RefreshDocument(); SetStatus(SaveStatus("已復原")); });
        View("重做", () => { Canvas?.Document.Redo(); Canvas?.RefreshDocument(); SetStatus(SaveStatus("已重做")); });
        view.Items.Add(new ToolStripSeparator());
        View("縮小", () => Canvas?.SetZoom(Canvas.Zoom / 1.2f)); View("100%", () => Canvas?.SetZoom(1)); View("放大", () => Canvas?.SetZoom(Canvas.Zoom * 1.2f));
        View("符合視窗", Fit); View("旋轉 90°", () => Canvas?.Rotate90()); View("畫布大小", ResizeCanvasSize); View("縮放圖片", ResizeImage);
        View("關閉分頁", CloseTab);
        view.Items.Add(new ToolStripSeparator()); view.Items.Add(currentNumberLabel); view.Items.Add(currentNumber); view.Items.Add(nextNumberLabel); view.Items.Add(nextNumber);
        nextNumber.KeyDown += (_, e) => { if (e.KeyCode != Keys.Enter) return; e.SuppressKeyPress = true; ApplyNumberFields(); Canvas?.Focus(); };
        currentNumber.KeyDown += (_, e) => { if (e.KeyCode != Keys.Enter) return; e.SuppressKeyPress = true; Safe(ApplyNumberFields); Canvas?.Focus(); };
        nextNumber.Leave += (_, _) => ApplyNumberFields(); currentNumber.Leave += (_, _) => Safe(ApplyNumberFields);
        var footer = new StatusStrip(); footer.Items.Add(status); footer.Items.Add(new ToolStripStatusLabel("● 已保存") { ForeColor = Color.SeaGreen }); footer.Items.Add(new ToolStripStatusLabel("● 修改中／未保存") { ForeColor = Color.Firebrick });
        var workspace = new Panel { Dock = DockStyle.Fill };
        workspace.Controls.Add(tabs); workspace.Controls.Add(welcome); welcome.BringToFront();
        foreach (var target in new Control[] { this, workspace, tabs, welcome }) ImageFileDrop.Attach(target, DropImages, () => !capturing);
        tabs.SelectedIndexChanged += (_, _) => { UpdateTools(); SetStatus(SaveStatus()); };
        tabs.DrawItem += (_, e) => {
            if (e.Index < 0 || e.Index >= tabs.TabCount) return;
            var page = tabs.TabPages[e.Index]; var canvas = (ImageCanvas)page.Tag!; bool dirty = canvas.IsEditing || canvas.Document.Pending;
            using var background = new SolidBrush(e.Index == tabs.SelectedIndex ? Color.White : Color.FromArgb(240, 243, 247)); e.Graphics.FillRectangle(background, e.Bounds);
            using var dot = new SolidBrush(dirty ? Color.FromArgb(219, 67, 76) : Color.FromArgb(36, 158, 92)); e.Graphics.FillEllipse(dot, e.Bounds.X + 9, e.Bounds.Y + (e.Bounds.Height - 10) / 2, 10, 10);
            TextRenderer.DrawText(e.Graphics, page.Text, Font, new Rectangle(e.Bounds.X + 26, e.Bounds.Y, e.Bounds.Width - 29, e.Bounds.Height), Color.FromArgb(30, 51, 78), TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        };
        Controls.Add(workspace); Controls.Add(view); Controls.Add(tools); Controls.Add(actions); Controls.Add(menu); Controls.Add(footer);
        var trayMenu = new ContextMenuStrip(); trayMenu.Items.Add("開啟編輯器", null, (_, _) => RestoreFromTray());
        trayMenu.Items.Add("開始擷取", null, async (_, _) => await StartCapture(false));
        trayMenu.Items.Add("停止捲動並保存", null, (_, _) => captureCancellation?.Cancel());
        trayMenu.Items.Add("離開", null, (_, _) => RequestExit());
        tray = new NotifyIcon { Icon = Icon, Text = "截圖工作台", Visible = true, ContextMenuStrip = trayMenu };
        tray.DoubleClick += (_, _) => RestoreFromTray();
        Resize += (_, _) => { if (!capturing && WindowState == FormWindowState.Minimized) MinimizeToTray(); };
        Shown += (_, _) => {
            RegisterShortcut();
            foreach (var path in args.Where(File.Exists)) Safe(() => Import(path));
            _ = ListenForOpenRequests();
            if (settingsError != null) SetStatus("設定檔無法讀取，已使用預設值：" + settingsError);
            if (args.Contains("--tray")) MinimizeToTray();
        };
        FormClosing += (_, e) => {
            if (!exitRequested && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; MinimizeToTray(); return; }
            if (capturing) { captureCancellation?.Cancel(); e.Cancel = true; return; }
            ApplyStrokeWidth();
            try { ApplyNumberFields(); } catch (Exception error) { e.Cancel = true; exitRequested = false; MessageBox.Show(this, error.Message, "圖章修改未完成"); return; }
            foreach (TabPage page in tabs.TabPages) { var doc = ((ImageCanvas)page.Tag!).Document; try { doc.CloseAndSave(); } catch (Exception error) { e.Cancel = true; exitRequested = false; tabs.SelectedTab = page; RestoreFromTray(); MessageBox.Show(this, "尚未保存成功，文件仍保留在分頁中：\n" + error.Message, "保存失敗"); return; } }
        };
        FormClosed += (_, _) => { lifetime.Cancel(); if (hotkeyRegistered) Native.UnregisterHotKey(Handle, 42); tray.Dispose(); foreach (TabPage page in tabs.TabPages) ((ImageCanvas)page.Tag!).Document.Dispose(); };
    }
    protected override void Dispose(bool disposing) { if (disposing) { lifetime.Cancel(); tray?.Dispose(); } base.Dispose(disposing); }
    void SyncStrokeWidth() { bool previous = syncingStyle; syncingStyle = true; try { width.Text = stroke.ToString(System.Globalization.CultureInfo.InvariantCulture); } finally { syncingStyle = previous; } }
    bool ApplyStrokeWidth() {
        if (syncingStyle) return true;
        if ((!float.TryParse(width.Text, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.CurrentCulture, out float value) && !float.TryParse(width.Text, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out value)) || !float.IsFinite(value) || value < .5f || value > 100) { SyncStrokeWidth(); SetStatus("線寬請輸入 0.5～100 像素"); return false; }
        if (stroke == value) { SyncStrokeWidth(); return true; }
        stroke = value; SyncStrokeWidth(); UpdateTools(); Canvas?.SetSelectedStyle(ink, stroke); return true;
    }
    void RequestExit() {
        exitRequested = true;
        if (capturing) { captureCancellation?.Cancel(); if (activeSelection is { IsDisposed: false }) { activeSelection.DialogResult = DialogResult.Cancel; activeSelection.Close(); } return; }
        Close();
    }
    void RegisterShortcut()
    {
        if (hotkeyRegistered) Native.UnregisterHotKey(Handle, 42);
        activeShortcut = settings.Shortcut;
        hotkeyRegistered = Native.RegisterHotKey(Handle, 42, activeShortcut.Modifiers, (uint)activeShortcut.Key);
        if (!hotkeyRegistered && activeShortcut == new ShortcutBinding()) { activeShortcut = new() { Control = true }; hotkeyRegistered = Native.RegisterHotKey(Handle, 42, activeShortcut.Modifiers, (uint)activeShortcut.Key); }
        RefreshShortcutLabel();
    }
    void RefreshShortcutLabel() { shortcutButton.Text = hotkeyRegistered ? "快捷鍵 " + activeShortcut!.Display + "…" : "快捷鍵被占用…"; shortcutButton.ToolTipText = hotkeyRegistered && activeShortcut != settings.Shortcut ? "設定為 " + settings.Shortcut.Display + "，目前被其他程式占用，暫用 " + activeShortcut!.Display + "。按此修改。" : "按此修改擷取快捷鍵"; }
    void ShowSettings(bool shortcut) { using var dialog = new SettingsForm(settings, shortcutButton.ToolTipText ?? "", candidate => ApplySettings(candidate, shortcut), shortcut); dialog.ShowDialog(this); }
    string? ApplySettings(AppSettings candidate, bool retryShortcut) {
        var previous = activeShortcut; bool wasRegistered = hotkeyRegistered;
        string? previousStartup = null; bool startupChanged = false;
        bool changeShortcut = candidate.Shortcut != settings.Shortcut || retryShortcut || !hotkeyRegistered;
        try {
            if (!candidate.Shortcut.Valid) return "請設定包含 Ctrl 或 Alt 的快捷鍵。";
            Directory.CreateDirectory(candidate.OutputFolder);
            var probe = Path.Combine(candidate.OutputFolder, ".capture-write-check-" + Guid.NewGuid().ToString("N")); using (File.Create(probe)) { } File.Delete(probe);
            if (changeShortcut) {
                if (hotkeyRegistered) Native.UnregisterHotKey(Handle, 42);
                hotkeyRegistered = Native.RegisterHotKey(Handle, 42, candidate.Shortcut.Modifiers, (uint)candidate.Shortcut.Key);
                if (!hotkeyRegistered) { RestoreShortcut(); return candidate.Shortcut.Display + " 已被其他程式占用，請換一組按鍵。原設定仍保留。"; }
                activeShortcut = candidate.Shortcut;
            }
            if (candidate.StartWithWindows != settings.StartWithWindows) { previousStartup = StartupRegistration.Read(); StartupRegistration.Write(candidate.StartWithWindows ? StartupRegistration.CommandFor(Environment.ProcessPath!) : null); startupChanged = true; }
            candidate.Save(settingsPath); settings = candidate; store.OutputRoot = settings.OutputFolder; RefreshShortcutLabel(); SetStatus("設定已保存"); return null;
        } catch (Exception error) { if (startupChanged) StartupRegistration.Write(previousStartup); if (changeShortcut) { if (hotkeyRegistered) Native.UnregisterHotKey(Handle, 42); RestoreShortcut(); } return error.Message; }
        void RestoreShortcut() { activeShortcut = previous; hotkeyRegistered = wasRegistered && previous != null && Native.RegisterHotKey(Handle, 42, previous.Modifiers, (uint)previous.Key); RefreshShortcutLabel(); }
    }
    protected override void WndProc(ref Message m) { if (m.Msg == 0x312 && m.WParam == 42 && !capturing) { _ = StartCapture(false); return; } base.WndProc(ref m); }
    void SetStatus(string message) { status.Text = Canvas == null ? message : $"{message}   ·   {Canvas.Document.Image.Width} × {Canvas.Document.Image.Height}   ·   {Canvas.Document.OutputPath}"; tabs.Invalidate(); mergeButton.Enabled = Canvas?.Document.Marks.Count > 0; UpdateNumberFields(); }
    void UpdateNumberFields() { bool visible = Canvas != null && (tool == EditTool.Stamp || Canvas.SelectedMark is { Kind: EditTool.Stamp } selected && selected.StampSymbol.StartsWith("number")); currentNumber.Visible = nextNumber.Visible = currentNumberLabel.Visible = nextNumberLabel.Visible = visible; if (!nextNumber.Focused) nextNumber.Text = (Canvas?.NextStampNumber ?? 1).ToString(); currentNumber.Enabled = Canvas?.SelectedMark is { Kind: EditTool.Stamp } mark && mark.StampSymbol.StartsWith("number"); if (!currentNumber.Focused) currentNumber.Text = currentNumber.Enabled ? Canvas!.SelectedMark!.Text : ""; }
    void ApplyNumberFields() {
        if (Canvas == null) return;
        if (int.TryParse(nextNumber.Text, out int next)) Canvas.NextStampNumber = next;
        if (Canvas.SelectedMark is { Kind: EditTool.Stamp } selected && selected.StampSymbol.StartsWith("number") && int.TryParse(currentNumber.Text, out int value)) {
            string text = Math.Clamp(value, 0, 999999).ToString(); if (text != selected.Text) { Canvas.Document.CommitMarks(Canvas.Document.Marks.Select(m => m.Id == selected.Id ? m with { Text = text } : m)); Canvas.RefreshDocument(); SetStatus(SaveStatus("圖章編號已修改")); }
        }
        UpdateNumberFields();
    }
    string SaveStatus(string prefix = "") => (prefix.Length > 0 ? prefix + " · " : "") + (Canvas?.Document.Pending == true ? "尚未保存 · Ctrl＋S 保存" : "已保存");
    void SaveCurrent() { if (Canvas == null || !ApplyStrokeWidth()) return; ApplyNumberFields(); Canvas.Document.SavePending(); SetStatus("已保存"); }
    void MergeObjects() { ApplyNumberFields(); Canvas?.Merge(); }
    // Hide already removes the taskbar button. Toggling ShowInTaskbar here
    // recreates HWND and silently loses its registered global hotkey.
    void MinimizeToTray() { if (capturing) return; Hide(); }
    void RestoreFromTray() { if (capturing) return; Show(); WindowState = FormWindowState.Normal; Activate(); }
    void UpdateTools() { if (Canvas != null) { Canvas.Tool = tool; Canvas.Ink = ink; Canvas.Stroke = stroke; Canvas.Stamp = stamp; } UpdateNumberFields(); }
    void AddTab(ImageDocument doc)
    {
        welcome.Visible = false;
        var canvas = new ImageCanvas(doc); canvas.Changed += SetStatus;
        canvas.SelectionChanged += () => {
            UpdateNumberFields();
            if (canvas.SelectedMark is not { } mark) return;
            ink = Color.FromArgb(mark.Argb); stroke = mark.Stroke;
            var old = colorButton.Image; colorButton.Image = ToolbarArtwork.Swatch(ink); old?.Dispose();
            SyncStrokeWidth();
            UpdateTools();
        };
        var page = new TabPage(doc.State.Created.ToString("HH:mm:ss")) { Tag = canvas, ToolTipText = doc.OutputPath, AccessibleName = doc.State.Created.ToString("HH:mm:ss") + (doc.Pending ? " 未保存" : " 已保存") };
        doc.SaveStateChanged += () => { page.AccessibleName = page.Text + (doc.Pending ? " 未保存" : " 已保存"); tabs.Invalidate(); tabs.Update(); };
        page.Controls.Add(canvas); tabs.TabPages.Add(page); tabs.SelectedTab = page; UpdateTools(); SetStatus(SaveStatus());
    }
    async Task StartCapture(bool scroll)
    {
        if (capturing) return; capturing = true; Hide();
        try {
            await Task.Delay(220);
            using var background = Native.Capture(SystemInformation.VirtualScreen);
            using var overlay = new CaptureOverlay(background, scroll);
            activeSelection = overlay;
            if (overlay.ShowDialog() != DialogResult.OK) return;
            activeSelection = null;
            if (!overlay.IsScrolling) {
                var v = SystemInformation.VirtualScreen; var r = overlay.SelectedRegion;
                using var image = background.Clone(new Rectangle(r.Left - v.Left, r.Top - v.Top, r.Width, r.Height), PixelFormat.Format32bppArgb);
                SetStatus(CaptureCompletion.Complete(image, store, settings, AddTab, ClipboardImages.Write));
            } else {
                captureCancellation = new CancellationTokenSource(); tray.Text = "正在捲動擷取 · Esc 結束";
                ScrollResult result;
                using (var frame = new ScrollCaptureFrame(overlay.SelectedRegion)) { frame.Show(); result = await ScrollCapture.RunAsync(overlay.SelectedRegion, store.Root, captureCancellation.Token, text => tray.Text = text.Length > 60 ? text[..60] : text, new DesktopScrollSurface(overlay.TargetWindow)); }
                string completion;
                using (result.Image) completion = CaptureCompletion.Complete(result.Image, store, settings, AddTab, ClipboardImages.Write);
                File.WriteAllText(Path.Combine(result.RecoveryPath, "completed"), result.Message);
                SetStatus(result.Message + " · " + completion);
                if (result.NeedsReview) MessageBox.Show(result.Message + "\n\n恢復資料：" + result.RecoveryPath, "請檢查擷取結果", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        } catch (Exception error) { MessageBox.Show(error.Message, "擷取未完成", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        finally { activeSelection = null; captureCancellation?.Dispose(); captureCancellation = null; tray.Text = "截圖工作台"; capturing = false; if (exitRequested) Close(); else { DrainOpenRequests(); RestoreFromTray(); } }
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
                if (!capturing) { DrainOpenRequests(); RestoreFromTray(); }
            } catch (OperationCanceledException) { break; }
            catch (Exception error) { if (!lifetime.IsCancellationRequested) { SetStatus("開檔請求未完成：" + error.Message); await Task.Delay(500); } }
        }
    }
    void DrainOpenRequests() { while (pendingFiles.TryDequeue(out var file)) Safe(() => Import(file)); }
    void OpenImages() { using var dialog = new OpenFileDialog { Filter = "圖片|*.png;*.jpg;*.jpeg;*.bmp;*.gif|所有檔案|*.*", Multiselect = true }; if (dialog.ShowDialog(this) == DialogResult.OK) foreach (var file in dialog.FileNames) Safe(() => Import(file)); }
    void Import(string path) { using var source = new Bitmap(path); AddTab(store.Create(source)); }
    void DropImages(string[] paths) {
        if (capturing) return; var destination = Canvas;
        string result = ImageFileDrop.Import(paths, image => { if (destination != null) destination.InsertImage(image); else { AddTab(store.Create(image)); Fit(); } });
        SetStatus(result);
    }
    void PasteNew() { using var image = ClipboardImages.Read(); if (image != null) { AddTab(store.Create(image)); Fit(); SetStatus("已從剪貼簿新增同尺寸圖片"); } }
    void Paste() { if (Canvas == null) { PasteNew(); return; } using var image = ClipboardImages.Read(); if (image != null) Canvas.InsertImage(image); else SetStatus("剪貼簿中沒有圖片"); }
    void PasteFile() { if (Canvas == null) { OpenImages(); return; } using var dialog = new OpenFileDialog { Title = "貼上到目前圖片", Filter = "圖片|*.png;*.jpg;*.jpeg;*.bmp;*.gif" }; if (dialog.ShowDialog(this) == DialogResult.OK) { using var image = new Bitmap(dialog.FileName); Canvas.InsertImage(image); } }
    void NewImage() {
        using var clipboard = ClipboardImages.Read(); using var dialog = new NewCanvasForm(clipboard?.Size);
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        if (dialog.UseClipboardContent && clipboard != null) { AddTab(store.Create(clipboard)); Fit(); SetStatus("已從剪貼簿新增同尺寸圖片"); }
        else { using var image = NewCanvasForm.CreateImage(dialog.ImageSize.Width, dialog.ImageSize.Height, dialog.BackgroundColor); AddTab(store.Create(image, saveImmediately: false)); Fit(); SetStatus("已建立空白圖片 · Ctrl＋S 保存"); }
    }
    void Copy() { if (Canvas == null) return; if (!Canvas.Selection.IsEmpty) { using var part = Canvas.Document.Image.Clone(Canvas.Selection, PixelFormat.Format32bppArgb); ClipboardImages.Write(part); } else if (Canvas.SelectedMark is { } mark) { var bounds = Rectangle.Ceiling(mark.Bounds); bounds.Inflate((int)Math.Ceiling(mark.Stroke * 6 + 2), (int)Math.Ceiling(mark.Stroke * 6 + 2)); using var image = new Bitmap(Math.Max(1, bounds.Width), Math.Max(1, bounds.Height), PixelFormat.Format32bppArgb); using (var g = Graphics.FromImage(image)) { g.TranslateTransform(-bounds.Left, -bounds.Top); AnnotationRenderer.Draw(g, mark); } ClipboardImages.Write(image); } else ClipboardImages.Write(Canvas.Document.Image); SetStatus("已複製到剪貼簿"); }
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
        canvas.Document.CloseAndSave(); tabs.TabPages.Remove(page); page.Dispose(); canvas.Document.Dispose();
        welcome.Visible = tabs.TabCount == 0; SetStatus("已關閉分頁，圖片仍保存在輸出資料夾");
    }
    void Fit() { if (Canvas == null) return; Canvas.SetZoom(Math.Min(1, Math.Min((Canvas.ClientSize.Width - 64f) / Canvas.Document.Image.Width, (Canvas.ClientSize.Height - 72f) / Canvas.Document.Image.Height))); }
    void ResizeImage()
    {
        if (Canvas == null) return;
        var input = TextEntry.Ask(this, "調整圖片尺寸", "輸入寬 × 高（像素），例如 1280 x 720：", $"{Canvas.Document.Image.Width} x {Canvas.Document.Image.Height}"); if (input == null) return;
        var parts = input.ToLowerInvariant().Replace('×', 'x').Split('x', StringSplitOptions.TrimEntries);
        if (parts.Length != 2 || !int.TryParse(parts[0], out int w) || !int.TryParse(parts[1], out int h) || w < 1 || h < 1 || (long)w * h > 100_000_000) throw new InvalidOperationException("請輸入有效尺寸，總像素不得超過一億。");
        Canvas.ResizeTo(w, h); SetStatus(SaveStatus("尺寸已調整"));
    }
    void ResizeCanvasSize() { if (Canvas == null) return; using var dialog = new CanvasSizeForm(Canvas.Document.Image.Size, Canvas.CanvasBackground); if (dialog.ShowDialog(this) != DialogResult.OK) return; Canvas.ResizeCanvas(dialog.CanvasSize.Width, dialog.CanvasSize.Height, dialog.ExpansionBackground); }
    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if ((currentNumber.Focused || nextNumber.Focused || width.ComboBox.ContainsFocus) && keyData is (Keys.Control | Keys.A) or (Keys.Control | Keys.C) or (Keys.Control | Keys.V) or (Keys.Control | Keys.Z) or (Keys.Control | Keys.Y)) return base.ProcessCmdKey(ref msg, keyData);
        switch (keyData) {
            case Keys.Control | Keys.A: Canvas?.SelectAll(); return true;
            case Keys.Control | Keys.Enter: Safe(MergeObjects); return true;
            case Keys.Control | Keys.N: Safe(NewImage); return true;
            case Keys.Control | Keys.O: Safe(OpenImages); return true;
            case Keys.Control | Keys.V: Safe(Paste); return true;
            case Keys.Control | Keys.Shift | Keys.V: Safe(PasteNew); return true;
            case Keys.Control | Keys.C: Safe(Copy); return true;
            case Keys.Control | Keys.S: Safe(SaveCurrent); return true;
            case Keys.Control | Keys.Z: Safe(() => { Canvas?.Document.Undo(); Canvas?.RefreshDocument(); SetStatus(SaveStatus("已復原")); }); return true;
            case Keys.Control | Keys.Y: Safe(() => { Canvas?.Document.Redo(); Canvas?.RefreshDocument(); SetStatus(SaveStatus("已重做")); }); return true;
            case Keys.Control | Keys.W: Safe(CloseTab); return true;
        }
        return base.ProcessCmdKey(ref msg, keyData);
    }
}
