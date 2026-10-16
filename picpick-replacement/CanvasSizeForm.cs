namespace CaptureWorkbench;

public sealed class CanvasSizeForm : Form
{
    readonly NumericUpDown canvasWidth = new() { Minimum = 1, Maximum = 100000, Left = 130, Top = 28, Width = 180, AccessibleName = "畫布寬度" };
    readonly NumericUpDown canvasHeight = new() { Minimum = 1, Maximum = 100000, Left = 130, Top = 75, Width = 180, AccessibleName = "畫布高度" };
    readonly ComboBox background = new() { DropDownStyle = ComboBoxStyle.DropDownList, Left = 130, Top = 122, Width = 180, AccessibleName = "新增畫布區域背景" };
    public Size CanvasSize => new((int)canvasWidth.Value, (int)canvasHeight.Value);
    public Color ExpansionBackground => background.SelectedIndex == 1 ? Color.Transparent : Color.White;
    public CanvasSizeForm(Size size, Color color) {
        Text = "畫布大小（不縮放圖片）"; ClientSize = new Size(460, 285); Font = new Font("Microsoft JhengHei UI", 10);
        FormBorderStyle = FormBorderStyle.FixedDialog; StartPosition = FormStartPosition.CenterParent; MinimizeBox = MaximizeBox = false;
        canvasWidth.Value = size.Width; canvasHeight.Value = size.Height; background.Items.AddRange(["白色", "透明"]); background.SelectedIndex = color.A == 0 ? 1 : 0;
        var ok = new Button { Text = "確定", Left = 232, Top = 232, Width = 96, Height = 34 };
        ok.Click += (_, _) => { if ((long)canvasWidth.Value * (long)canvasHeight.Value > 100_000_000) { MessageBox.Show(this, "畫布總像素不得超過一億。", "尺寸過大"); return; } DialogResult = DialogResult.OK; };
        var cancel = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Left = 342, Top = 232, Width = 96, Height = 34 };
        Controls.AddRange([new Label { Text = "寬度（像素）", Left = 24, Top = 31, AutoSize = true }, canvasWidth, new Label { Text = "高度（像素）", Left = 24, Top = 78, AutoSize = true }, canvasHeight, new Label { Text = "新增區域背景", Left = 24, Top = 125, AutoSize = true }, background, new Label { Text = "固定左上角；放大增加空間，縮小裁掉底圖框外部分。\n浮動物件保留原尺寸，按「合併」才固定到畫布。", Left = 24, Top = 174, Width = 410, Height = 44 }, ok, cancel]);
        AcceptButton = ok; CancelButton = cancel;
    }
}
