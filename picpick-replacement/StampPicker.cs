using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace CaptureWorkbench;

public sealed record StampDefinition(string Name, string Symbol, string ImageData = "", int Width = 64, int Height = 64)
{
    public int? FillArgb { get; init; }
    public bool IsNumber => Symbol.StartsWith("number", StringComparison.Ordinal);
    public static IReadOnlyList<StampDefinition> NumberStyles { get; } = new[] { ("紅色", Color.FromArgb(218, 100, 73)), ("藍色", Color.FromArgb(77, 132, 176)), ("橙色", Color.FromArgb(235, 145, 65)), ("綠色", Color.FromArgb(116, 167, 152)), ("紫色", Color.FromArgb(147, 101, 168)), ("青色", Color.FromArgb(70, 168, 189)), ("灰色", Color.FromArgb(102, 102, 102)) }.Select(x => new StampDefinition(x.Item1, "number", Width: 36, Height: 36) { FillArgb = x.Item2.ToArgb() }).ToArray();
    public static IReadOnlyList<StampDefinition> BuiltIn { get; } = [new("勾選", "check"), new("叉號", "cross"), new("星星", "star"), new("圓圈", "circle"), new("編號", "number"), new("完成", "label", Width: 112, Height: 56)];
    public ImageMark CreateMark(float x, float y, Color color) => new() { Kind = EditTool.Stamp, X1 = x, Y1 = y, X2 = x + Width, Y2 = y + Height, Argb = FillArgb ?? color.ToArgb(), StampSymbol = Symbol, StampImageData = ImageData, Text = IsNumber ? "1" : Name };
    public static StampDefinition FromImage(Bitmap image, string name) {
        using var buffer = new MemoryStream(); image.Save(buffer, ImageFormat.Png);
        float scale = Math.Min(1, 128f / Math.Max(image.Width, image.Height));
        return new(name, "image", Convert.ToBase64String(buffer.ToArray()), Math.Max(1, (int)(image.Width * scale)), Math.Max(1, (int)(image.Height * scale)));
    }
    public static void Draw(Graphics g, ImageMark mark) {
        var rect = mark.Bounds; if (rect.Width <= 0 || rect.Height <= 0) return;
        var state = g.Save();
        try {
            g.TranslateTransform(rect.Left + rect.Width / 2, rect.Top + rect.Height / 2); g.RotateTransform(mark.Rotation);
            bool quarter = ((int)Math.Round(mark.Rotation / 90)) % 2 != 0;
            float w = quarter ? rect.Height : rect.Width, h = quarter ? rect.Width : rect.Height;
            g.TranslateTransform(-w / 2, -h / 2);
            if (mark.StampImageData.Length > 0) {
                g.SmoothingMode = SmoothingMode.None; g.PixelOffsetMode = PixelOffsetMode.Half;
                using var buffer = new MemoryStream(Convert.FromBase64String(mark.StampImageData)); using var image = new Bitmap(buffer);
                using var attributes = new ImageAttributes(); attributes.SetWrapMode(WrapMode.TileFlipXY);
                g.DrawImage(image, [new PointF(0, 0), new(w, 0), new(0, h)], new RectangleF(0, 0, image.Width, image.Height), GraphicsUnit.Pixel, attributes); return;
            }
            g.ScaleTransform(w / 100, h / 100); var color = Color.FromArgb(mark.Argb);
            using var pen = new Pen(color, 9) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
            using var brush = new SolidBrush(color);
            switch (mark.StampSymbol) {
                case "check": g.DrawLines(pen, [new PointF(15, 52), new(40, 78), new(86, 21)]); break;
                case "cross": g.DrawLine(pen, 22, 22, 78, 78); g.DrawLine(pen, 78, 22, 22, 78); break;
                case "star":
                    var points = Enumerable.Range(0, 10).Select(i => { double angle = -Math.PI / 2 + i * Math.PI / 5; float r = i % 2 == 0 ? 43 : 19; return new PointF(50 + r * (float)Math.Cos(angle), 50 + r * (float)Math.Sin(angle)); }).ToArray(); g.FillPolygon(brush, points); break;
                case "circle": g.DrawEllipse(pen, 10, 10, 80, 80); break;
                case "number": case "number-square":
                    bool square = mark.StampSymbol == "number-square";
                    using (var shadow = new SolidBrush(Color.FromArgb(55, Color.Black))) { if (square) g.FillRectangle(shadow, 7, 8, 90, 90); else g.FillEllipse(shadow, 7, 8, 90, 90); }
                    var light = Color.FromArgb(color.A, Math.Min(255, color.R + 12), Math.Min(255, color.G + 12), Math.Min(255, color.B + 12));
                    using (var fill = new LinearGradientBrush(new Rectangle(4, 3, 90, 90), light, color, LinearGradientMode.Vertical))
                    using (var outline = new Pen(Color.FromArgb(color.A, Color.White), 7)) { if (square) { g.FillRectangle(fill, 5, 4, 88, 88); g.DrawRectangle(outline, 5, 4, 88, 88); } else { g.FillEllipse(fill, 5, 4, 88, 88); g.DrawEllipse(outline, 5, 4, 88, 88); } }
                    using (var font = new Font("Segoe UI", mark.Text.Length > 2 ? 40 : 54, FontStyle.Bold, GraphicsUnit.Pixel)) using (var format = new StringFormat(StringFormat.GenericTypographic) { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center }) using (var textBrush = new SolidBrush(Color.FromArgb(color.A, Color.White))) g.DrawString(mark.Text, font, textBrush, new RectangleF(4, 1, 90, 90), format); break;
                case "cursor":
                    using (var path = new GraphicsPath()) { path.AddPolygon([new PointF(22, 5), new(22, 84), new(41, 65), new(55, 95), new(69, 88), new(55, 59), new(83, 59)]); g.FillPath(Brushes.White, path); using var edge = new Pen(Color.Black, 5); g.DrawPath(edge, path); } break;
                case "cursor-cross": using (var edge = new Pen(Color.White, 10)) { g.DrawLine(edge, 50, 8, 50, 92); g.DrawLine(edge, 8, 50, 92, 50); } using (var edge = new Pen(Color.Black, 4)) { g.DrawLine(edge, 50, 8, 50, 92); g.DrawLine(edge, 8, 50, 92, 50); } break;
                case "label":
                    g.DrawRectangle(pen, 6, 12, 88, 76); using (var font = new Font("Microsoft JhengHei UI", 36, FontStyle.Bold, GraphicsUnit.Pixel)) using (var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center }) g.DrawString(mark.Text, font, brush, new RectangleF(5, 5, 90, 90), format); break;
            }
        } finally { g.Restore(state); }
    }
}

internal sealed class StampPicker : Form
{
    public StampDefinition? SelectedStamp { get; private set; }
    public int NextNumber { get; private set; }
    public StampPicker(Color ink, StampDefinition? current = null, int nextNumber = 1) {
        NextNumber = nextNumber; current ??= StampDefinition.NumberStyles[0];
        Text = "圖章"; ClientSize = new Size(600, 410); Font = new Font("Microsoft JhengHei UI", 10);
        StartPosition = FormStartPosition.CenterParent; FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = MinimizeBox = false;
        var tabs = new TabControl { Left = 12, Top = 12, Width = 576, Height = 310 };
        var numbers = new TabPage("數字圖章"); var general = new TabPage("一般圖章"); var cursors = new TabPage("游標圖章"); tabs.TabPages.AddRange([numbers, general, cursors]);
        var shape = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Left = 60, Top = 20, Width = 96, AccessibleName = "數字圖章形狀" }; shape.Items.AddRange(["圓形", "矩形"]); shape.SelectedIndex = current.Symbol == "number-square" ? 1 : 0;
        var size = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Left = 218, Top = 20, Width = 96, AccessibleName = "數字圖章大小" }; size.Items.AddRange(["小 · 24", "中 · 36", "大 · 48"]); size.SelectedIndex = current.Width <= 24 ? 0 : current.Width >= 48 ? 2 : 1;
        var next = new NumericUpDown { Minimum = 1, Maximum = 999999, Value = Math.Clamp(nextNumber, 1, 999999), Left = 424, Top = 20, Width = 116, AccessibleName = "下一個圖章編號" };
        numbers.Controls.AddRange([new Label { Text = "形狀", Left = 16, Top = 24, AutoSize = true }, shape, new Label { Text = "大小", Left = 174, Top = 24, AutoSize = true }, size, new Label { Text = "下一個", Left = 358, Top = 24, AutoSize = true }, next]);
        var numberGrid = new FlowLayoutPanel { Left = 12, Top = 70, Width = 540, Height = 166 }; numbers.Controls.Add(numberGrid);
        void AddChoice(FlowLayoutPanel grid, StampDefinition stamp, bool number) {
            var preview = new Bitmap(48, 48); using (var g = Graphics.FromImage(preview)) { g.SmoothingMode = SmoothingMode.AntiAlias; StampDefinition.Draw(g, stamp.CreateMark(0, 0, ink) with { X2 = 48, Y2 = 48 }); }
            var button = new Button { Text = stamp.Name, Image = preview, Width = number ? 70 : 122, Height = number ? 104 : 96, TextImageRelation = TextImageRelation.ImageAboveText, FlatStyle = FlatStyle.Flat, BackColor = Color.White };
            button.FlatAppearance.BorderColor = Color.FromArgb(215, 222, 232);
            button.Click += (_, _) => { int pixels = size.SelectedIndex == 0 ? 24 : size.SelectedIndex == 2 ? 48 : 36; SelectedStamp = number ? stamp with { Symbol = shape.SelectedIndex == 0 ? "number" : "number-square", Width = pixels, Height = pixels } : stamp; NextNumber = (int)next.Value; DialogResult = DialogResult.OK; };
            button.Disposed += (_, _) => preview.Dispose(); grid.Controls.Add(button);
        }
        foreach (var stamp in StampDefinition.NumberStyles) AddChoice(numberGrid, stamp, true);
        numbers.Controls.Add(new Label { Text = "點一下置中放置並自動編號；圖章可立即拖曳，空白處繼續新增。", Left = 16, Top = 242, Width = 530, Height = 28 });
        var generalGrid = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoScroll = true, Padding = new Padding(10) }; general.Controls.Add(generalGrid);
        foreach (var stamp in StampDefinition.BuiltIn.Where(s => !s.IsNumber)) AddChoice(generalGrid, stamp, false);
        var cursorGrid = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(10) }; cursors.Controls.Add(cursorGrid);
        foreach (var stamp in new[] { new StampDefinition("箭頭游標", "cursor", Width: 48, Height: 48), new StampDefinition("十字游標", "cursor-cross", Width: 48, Height: 48) }) AddChoice(cursorGrid, stamp, false);
        var custom = new Button { Text = "從圖片載入圖章…", Left = 18, Top = 336, Width = 230, Height = 36 };
        custom.Click += (_, _) => {
            using var dialog = new OpenFileDialog { Title = "選擇圖章圖片（支援透明 PNG）", Filter = "圖片|*.png;*.jpg;*.jpeg;*.bmp;*.gif" };
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            try { using var image = new Bitmap(dialog.FileName); if ((long)image.Width * image.Height > 25_000_000) throw new InvalidOperationException("圖章圖片太大，請使用小於 2500 萬像素的圖片。"); SelectedStamp = StampDefinition.FromImage(image, Path.GetFileNameWithoutExtension(dialog.FileName)); DialogResult = DialogResult.OK; }
            catch (Exception error) { MessageBox.Show(this, error.Message, "無法載入圖章"); }
        };
        var cancel = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Left = 486, Top = 336, Width = 96, Height = 36 };
        Controls.AddRange([tabs, custom, cancel, new Label { Text = "放下後可直接選取、拖曳與縮放，不必切換工具。", Left = 18, Top = 382, AutoSize = true }]); CancelButton = cancel;
    }
}
