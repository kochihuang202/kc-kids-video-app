namespace CaptureWorkbench;

// A hollow, non-activating window. Its pixels and hit-test region are outside
// the image rectangle, so scrolling input and captured pixels pass through.
public sealed class ScrollCaptureFrame : Form
{
    const int Border = 3;
    protected override bool ShowWithoutActivation => true;
    protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= 0x08000000 | 0x20 | 0x80; return cp; } }
    public ScrollCaptureFrame(Rectangle capture) {
        AutoScaleMode = AutoScaleMode.None; FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual; ShowInTaskbar = false; TopMost = true;
        Bounds = Rectangle.Inflate(capture, Border, Border); BackColor = Color.FromArgb(16, 190, 115);
        Text = "捲動擷取範圍 · Esc 結束"; AccessibleName = Text;
        var visible = new Region(new Rectangle(Point.Empty, Size)); visible.Exclude(new Rectangle(Border, Border, capture.Width, capture.Height)); Region = visible;
    }
    protected override void WndProc(ref Message m) { if (m.Msg == 0x84) { m.Result = -1; return; } base.WndProc(ref m); }
}
