namespace CaptureWorkbench;

public sealed class NewCanvasForm : Form
{
    readonly NumericUpDown imageWidth = new() { Minimum = 1, Maximum = 20000, Value = 1280, Left = 110, Top = 25, Width = 160 };
    readonly NumericUpDown imageHeight = new() { Minimum = 1, Maximum = 20000, Value = 720, Left = 110, Top = 73, Width = 160 };
    readonly ComboBox background = new() { DropDownStyle = ComboBoxStyle.DropDownList, Left = 110, Top = 121, Width = 160 };
    public Size ImageSize => new((int)imageWidth.Value, (int)imageHeight.Value);
    public Color BackgroundColor => background.SelectedIndex == 1 ? Color.Transparent : Color.White;
    public NewCanvasForm() {
        Text = "新增空白圖片"; ClientSize = new Size(380, 250); Font = new Font("Microsoft JhengHei UI", 10);
        StartPosition = FormStartPosition.CenterParent; FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = MinimizeBox = false;
        background.Items.AddRange(["白色", "透明"]); background.SelectedIndex = 0;
        imageWidth.AccessibleName = "圖片寬度"; imageHeight.AccessibleName = "圖片高度"; background.AccessibleName = "圖片背景";
        var create = new Button { Text = "建立", Left = 160, Top = 190, Width = 92, Height = 34 };
        create.Click += (_, _) => { if ((long)imageWidth.Value * (long)imageHeight.Value > 100_000_000) { MessageBox.Show(this, "圖片總像素不得超過一億。", "尺寸過大"); return; } DialogResult = DialogResult.OK; };
        var cancel = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Left = 266, Top = 190, Width = 92, Height = 34 };
        Controls.AddRange([new Label { Text = "寬度", Left = 24, Top = 28, AutoSize = true }, new Label { Text = "高度", Left = 24, Top = 76, AutoSize = true }, new Label { Text = "背景", Left = 24, Top = 124, AutoSize = true }, imageWidth, imageHeight, background, create, cancel]);
        AcceptButton = create; CancelButton = cancel; Shown += (_, _) => { imageWidth.Focus(); imageWidth.Select(0, imageWidth.Text.Length); };
    }
    public static Bitmap CreateImage(int width, int height, Color background) {
        if (width < 1 || height < 1 || (long)width * height > 100_000_000) throw new ArgumentOutOfRangeException(nameof(width));
        var image = new Bitmap(width, height, System.Drawing.Imaging.PixelFormat.Format32bppArgb); using var g = Graphics.FromImage(image); g.Clear(background); return image;
    }
}
