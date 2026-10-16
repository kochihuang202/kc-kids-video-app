namespace CaptureWorkbench;

public sealed class NewCanvasForm : Form
{
    readonly NumericUpDown imageWidth = new() { Minimum = 1, Maximum = 100000, Value = 1280, Left = 110, Top = 25, Width = 160 };
    readonly NumericUpDown imageHeight = new() { Minimum = 1, Maximum = 100000, Value = 720, Left = 110, Top = 73, Width = 160 };
    readonly ComboBox background = new() { DropDownStyle = ComboBoxStyle.DropDownList, Left = 110, Top = 121, Width = 160 };
    public Size ImageSize => new((int)imageWidth.Value, (int)imageHeight.Value);
    public Color BackgroundColor => background.SelectedIndex == 1 ? Color.Transparent : Color.White;
    public bool UseClipboardContent { get; private set; }
    public NewCanvasForm(Size? clipboardSize = null) {
        Text = "新增圖片"; ClientSize = new Size(460, 345); Font = new Font("Microsoft JhengHei UI", 10);
        StartPosition = FormStartPosition.CenterParent; FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = MinimizeBox = false;
        background.Items.AddRange(["白色", "透明"]); background.SelectedIndex = 0;
        imageWidth.AccessibleName = "圖片寬度"; imageHeight.AccessibleName = "圖片高度"; background.AccessibleName = "圖片背景";
        bool clipboardValid = clipboardSize is { Width: > 0, Height: > 0 } s && s.Width <= 100000 && s.Height <= 100000 && (long)s.Width * s.Height <= 100_000_000;
        var clipboardInfo = new Label { Text = clipboardValid ? $"剪貼簿圖片：{clipboardSize!.Value.Width} × {clipboardSize.Value.Height}" : "剪貼簿目前沒有可用的圖片", Left = 24, Top = 172, Width = 410, Height = 25 };
        void UseClipboardSize() { if (!clipboardValid) return; imageWidth.Value = clipboardSize!.Value.Width; imageHeight.Value = clipboardSize.Value.Height; }
        UseClipboardSize();
        var dimensions = new Button { Text = "使用剪貼簿尺寸", Enabled = clipboardValid, Left = 24, Top = 204, Width = 180, Height = 34 };
        dimensions.Click += (_, _) => UseClipboardSize();
        var paste = new Button { Text = "貼上剪貼簿並新增", Enabled = clipboardValid, Left = 218, Top = 204, Width = 218, Height = 34 };
        paste.Click += (_, _) => { UseClipboardSize(); UseClipboardContent = true; DialogResult = DialogResult.OK; };
        var create = new Button { Text = "建立空白", Left = 222, Top = 286, Width = 100, Height = 34 };
        create.Click += (_, _) => { if ((long)imageWidth.Value * (long)imageHeight.Value > 100_000_000) { MessageBox.Show(this, "圖片總像素不得超過一億。", "尺寸過大"); return; } DialogResult = DialogResult.OK; };
        var cancel = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Left = 336, Top = 286, Width = 100, Height = 34 };
        Controls.AddRange([new Label { Text = "寬度", Left = 24, Top = 28, AutoSize = true }, new Label { Text = "高度", Left = 24, Top = 76, AutoSize = true }, new Label { Text = "背景", Left = 24, Top = 124, AutoSize = true }, imageWidth, imageHeight, background, clipboardInfo, dimensions, paste, create, cancel]);
        AcceptButton = create; CancelButton = cancel; Shown += (_, _) => { imageWidth.Focus(); imageWidth.Select(0, imageWidth.Text.Length); };
    }
    public static Bitmap CreateImage(int width, int height, Color background) {
        if (width < 1 || height < 1 || (long)width * height > 100_000_000) throw new ArgumentOutOfRangeException(nameof(width));
        var image = new Bitmap(width, height, System.Drawing.Imaging.PixelFormat.Format32bppArgb); using var g = Graphics.FromImage(image); g.Clear(background); return image;
    }
}
