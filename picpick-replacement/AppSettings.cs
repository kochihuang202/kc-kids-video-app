using System.Text.Json;
using System.Text.Json.Serialization;

namespace CaptureWorkbench;

public sealed record ShortcutBinding
{
    public Keys Key { get; init; } = Keys.D2;
    public bool Alt { get; init; } = true;
    public bool Control { get; init; }
    public bool Shift { get; init; }
    [JsonIgnore] public uint Modifiers => 0x4000u | (Alt ? 1u : 0) | (Control ? 2u : 0) | (Shift ? 4u : 0);
    [JsonIgnore] public bool Valid => (Alt || Control) && ((Key >= Keys.A && Key <= Keys.Z) || (Key >= Keys.D0 && Key <= Keys.D9) || (Key >= Keys.F1 && Key <= Keys.F12) || Key == Keys.PrintScreen);
    [JsonIgnore] public string Display => string.Join("＋", new[] { Control ? "Ctrl" : null, Alt ? "Alt" : null, Shift ? "Shift" : null, Key >= Keys.D0 && Key <= Keys.D9 ? ((int)Key - (int)Keys.D0).ToString() : Key.ToString() }.Where(s => s != null));
}

public sealed record AppSettings
{
    public string OutputFolder { get; init; } = DocumentStore.DefaultRoot;
    public ShortcutBinding Shortcut { get; init; } = new();
    public bool StartWithWindows { get; init; }
    public bool CopyCaptureToClipboard { get; init; } = true;
    public static AppSettings Load(string path) {
        if (!File.Exists(path)) return new();
        var settings = JsonSerializer.Deserialize<AppSettings>(File.ReadAllText(path)) ?? throw new InvalidDataException("設定檔無法讀取");
        if (settings.Shortcut == null || !settings.Shortcut.Valid || !Path.IsPathFullyQualified(settings.OutputFolder)) throw new InvalidDataException("設定檔包含無效的資料夾或快捷鍵");
        return settings;
    }
    public void Save(string path) { if (!Shortcut.Valid) throw new InvalidOperationException("快捷鍵需要包含 Ctrl 或 Alt。"); Directory.CreateDirectory(Path.GetDirectoryName(path)!); DocumentStore.AtomicText(JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }), path); }
}

internal sealed class SettingsForm : Form
{
    public SettingsForm(AppSettings current, string shortcutStatus, Func<AppSettings, string?> apply, bool focusShortcut)
    {
        Text = "程式選項"; ClientSize = new Size(610, 390); FormBorderStyle = FormBorderStyle.FixedDialog; StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = false; MinimizeBox = false; Font = new Font("Microsoft JhengHei UI", 10);
        var pages = new TabControl { Dock = DockStyle.Top, Height = 318, Padding = new Point(20, 8) };
        var outputPage = new TabPage("自動保存"); var shortcutPage = new TabPage("快捷鍵"); var generalPage = new TabPage("一般"); pages.TabPages.AddRange([outputPage, shortcutPage, generalPage]);
        var startup = new CheckBox { Text = "登入 Windows 時自動執行", Checked = current.StartWithWindows, Left = 22, Top = 30, Width = 420, AccessibleName = "開機自動執行" };
        var copyCapture = new CheckBox { Text = "截圖後自動複製到剪貼簿", Checked = current.CopyCaptureToClipboard, Left = 22, Top = 76, Width = 420, AccessibleName = "截圖後自動複製到剪貼簿" };
        generalPage.Controls.AddRange([startup, copyCapture, new Label { Text = "一般與捲動截圖完成後皆可直接貼上，編輯時不自動複製。\n\n自動啟動時收在右下角通知區，擷取快捷鍵仍可使用。\n\n關閉分頁或程式時自動保存；下次啟動不重開舊分頁。", Left = 22, Top = 122, Width = 540, Height = 144, ForeColor = Color.FromArgb(78, 92, 112) }]);
        var folderLabel = new Label { Text = "輸出資料夾", Left = 22, Top = 24, AutoSize = true };
        var folder = new TextBox { Text = current.OutputFolder, Left = 22, Top = 56, Width = 450, AccessibleName = "輸出資料夾路徑" };
        var browse = new Button { Text = "瀏覽…", Left = 480, Top = 54, Width = 92, Height = 32 };
        browse.Click += (_, _) => { using var dialog = new FolderBrowserDialog { SelectedPath = folder.Text, Description = "選擇截圖自動保存的位置", UseDescriptionForTitle = true }; if (dialog.ShowDialog(this) == DialogResult.OK) folder.Text = dialog.SelectedPath; };
        var description = new Label { Text = "截圖完成時自動保存為 PNG，檔名使用當下日期時間。\n編輯時可按 Ctrl＋S 保存，關閉時也會自動保存。\n\n新圖片使用這個資料夾；已開啟圖片維持原保存位置。", Left = 22, Top = 112, Width = 548, Height = 130, ForeColor = Color.FromArgb(78, 92, 112) };
        outputPage.Controls.AddRange([folderLabel, folder, browse, description]);
        var shortcut = current.Shortcut;
        var prompt = new Label { Text = "擷取工具列（可切換一般／捲動擷取）", Left = 22, Top = 24, AutoSize = true };
        var key = new TextBox { ReadOnly = true, Text = shortcut.Display, Left = 22, Top = 62, Width = 360, AccessibleName = "擷取快捷鍵" };
        key.KeyDown += (_, e) => { e.SuppressKeyPress = true; if (e.KeyCode is Keys.ControlKey or Keys.Menu or Keys.ShiftKey) return; var candidate = new ShortcutBinding { Key = e.KeyCode, Control = e.Control, Alt = e.Alt, Shift = e.Shift }; if (candidate.Valid) { shortcut = candidate; key.Text = candidate.Display; } };
        var reset = new Button { Text = "恢復 Alt＋2", Left = 400, Top = 60, Width = 150, Height = 32 };
        reset.Click += (_, _) => { shortcut = new(); key.Text = shortcut.Display; };
        var instruction = new Label { Text = "點選欄位後，直接按想使用的組合鍵。\n請包含 Ctrl 或 Alt，可搭配 Shift。\n\n目前狀態：" + shortcutStatus, Left = 22, Top = 116, Width = 550, Height = 130, ForeColor = Color.FromArgb(78, 92, 112) };
        shortcutPage.Controls.AddRange([prompt, key, reset, instruction]);
        var save = new Button { Text = "確定", Left = 388, Top = 336, Width = 96, Height = 34 };
        var cancel = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Left = 498, Top = 336, Width = 96, Height = 34 };
        save.Click += (_, _) => {
            try { var candidate = current with { OutputFolder = Path.GetFullPath(folder.Text.Trim()), Shortcut = shortcut, StartWithWindows = startup.Checked, CopyCaptureToClipboard = copyCapture.Checked }; var error = apply(candidate); if (error != null) { MessageBox.Show(this, error, "設定尚未套用", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; } DialogResult = DialogResult.OK; }
            catch (Exception error) { MessageBox.Show(this, error.Message, "設定尚未套用", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        };
        Controls.AddRange([pages, save, cancel]); AcceptButton = save; CancelButton = cancel;
        pages.SelectedIndex = focusShortcut ? 1 : 0;
        Shown += (_, _) => { if (focusShortcut) key.Focus(); else folder.Focus(); };
    }
}
