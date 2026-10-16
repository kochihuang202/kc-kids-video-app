using System.Drawing.Drawing2D;

namespace CaptureWorkbench;

internal sealed class CaptureOverlay : Form
{
    readonly Bitmap screen;
    readonly Panel toolbar;
    Point anchor;
    Rectangle selection;
    bool dragging;
    bool scrolling;
    public Rectangle SelectedRegion { get; private set; }
    public bool IsScrolling => scrolling;
    public CaptureOverlay(Bitmap background, bool scrollMode)
    {
        screen = background; scrolling = scrollMode;
        AutoScaleMode = AutoScaleMode.None; FormBorderStyle = FormBorderStyle.None;
        Bounds = SystemInformation.VirtualScreen; StartPosition = FormStartPosition.Manual;
        DoubleBuffered = true; TopMost = true; KeyPreview = true; Cursor = Cursors.Cross;
        ShowInTaskbar = false; AccessibleName = "截圖選取區域";
        toolbar = new FlowLayoutPanel { AutoSize = true, Height = 52, BackColor = Color.FromArgb(248, 250, 253), Padding = new Padding(8), FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
        var region = new Button { Text = "框選擷取", AutoSize = true, Height = 32, FlatStyle = FlatStyle.Flat };
        var scroll = new Button { Text = "捲動擷取", AutoSize = true, Height = 32, FlatStyle = FlatStyle.Flat };
        var close = new Button { Text = "取消 · Esc", AutoSize = true, Height = 32, FlatStyle = FlatStyle.Flat };
        void UpdateMode() { region.BackColor = scrolling ? Color.White : Color.LightSkyBlue; scroll.BackColor = scrolling ? Color.LightSkyBlue : Color.White; Text = scrolling ? "框選可捲動內容；擷取中按 Esc 結束，捲到底自動結束" : "拖曳選取範圍，放開滑鼠完成截圖"; Invalidate(); }
        region.Click += (_, _) => { scrolling = false; UpdateMode(); };
        scroll.Click += (_, _) => { scrolling = true; UpdateMode(); };
        close.Click += (_, _) => { DialogResult = DialogResult.Cancel; Close(); };
        toolbar.Controls.AddRange([region, scroll, close]); Controls.Add(toolbar);
        Shown += (_, _) => { var monitor = Screen.FromPoint(Cursor.Position).Bounds; toolbar.Location = new Point(monitor.Left - Left + (monitor.Width - toolbar.Width) / 2, monitor.Top - Top + 14); UpdateMode(); Activate(); };
        KeyDown += (_, e) => { if (e.KeyCode == Keys.Escape) { DialogResult = DialogResult.Cancel; Close(); } };
    }
    protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); if (e.Button == MouseButtons.Left) { anchor = e.Location; selection = Rectangle.Empty; dragging = true; Capture = true; } }
    protected override void OnMouseMove(MouseEventArgs e) { base.OnMouseMove(e); if (!dragging) return; selection = Rectangle.FromLTRB(Math.Min(anchor.X, e.X), Math.Min(anchor.Y, e.Y), Math.Max(anchor.X, e.X), Math.Max(anchor.Y, e.Y)); Invalidate(); }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e); if (!dragging) return; dragging = false; Capture = false;
        if (selection.Width < 32 || selection.Height < 32) { selection = Rectangle.Empty; Invalidate(); return; }
        if (scrolling && (selection.Width < 120 || selection.Height < 180)) { selection = Rectangle.Empty; Text = "捲動範圍至少需要 120 × 180 像素，請重新框選"; Invalidate(); return; }
        SelectedRegion = new Rectangle(selection.X + Left, selection.Y + Top, selection.Width, selection.Height);
        DialogResult = DialogResult.OK; Close();
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.DrawImageUnscaled(screen, 0, 0);
        using var dim = new SolidBrush(Color.FromArgb(105, 12, 22, 38)); e.Graphics.FillRectangle(dim, ClientRectangle);
        if (!selection.IsEmpty) { e.Graphics.DrawImage(screen, selection, selection, GraphicsUnit.Pixel); using var pen = new Pen(Color.FromArgb(61, 170, 255), 2); e.Graphics.DrawRectangle(pen, selection); }
        using var font = new Font("Microsoft JhengHei UI", 12); using var textBack = new SolidBrush(Color.FromArgb(230, 20, 34, 54));
        var text = Text + (selection.IsEmpty ? "" : $"   {selection.Width} × {selection.Height}");
        var location = new Point(toolbar.Left, toolbar.Bottom + 8); var size = e.Graphics.MeasureString(text, font);
        e.Graphics.FillRectangle(textBack, location.X - 6, location.Y - 4, size.Width + 12, size.Height + 8); e.Graphics.DrawString(text, font, Brushes.White, location);
    }
}
