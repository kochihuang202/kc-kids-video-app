using System.Drawing.Drawing2D;

namespace CaptureWorkbench;

public sealed class DocumentTabs : TabControl
{
    TabPage? hoveredClose, pressedClose;
    public event Action<TabPage>? CloseRequested;

    public DocumentTabs() {
        Dock = DockStyle.Fill; DrawMode = TabDrawMode.OwnerDrawFixed;
        SizeMode = TabSizeMode.Fixed; ItemSize = new Size(158, 34); ShowToolTips = true;
        Padding = new Point(18, 7);
    }

    int Pixels(int logical) => LogicalToDeviceUnits(logical);
    Rectangle CloseBounds(Rectangle tab) {
        int size = Math.Min(Pixels(22), tab.Height - Pixels(4));
        return new Rectangle(tab.Right - Pixels(5) - size, tab.Top + (tab.Height - size) / 2, size, size);
    }
    TabPage? HitClose(Point location) {
        if (!ClientRectangle.Contains(location)) return null;
        for (int i = 0; i < TabCount; i++) if (CloseBounds(GetTabRect(i)).Contains(location)) return TabPages[i];
        return null;
    }
    protected override void OnDrawItem(DrawItemEventArgs e) {
        if (e.Index < 0 || e.Index >= TabCount) return;
        var page = TabPages[e.Index]; var canvas = page.Tag as ImageCanvas;
        bool dirty = canvas != null && (canvas.IsEditing || canvas.Document.Pending);
        using var background = new SolidBrush(e.Index == SelectedIndex ? Color.White : Color.FromArgb(240, 243, 247)); e.Graphics.FillRectangle(background, e.Bounds);
        using var dot = new SolidBrush(dirty ? Color.FromArgb(219, 67, 76) : Color.FromArgb(36, 158, 92));
        e.Graphics.FillEllipse(dot, e.Bounds.X + Pixels(9), e.Bounds.Y + (e.Bounds.Height - Pixels(10)) / 2, Pixels(10), Pixels(10));
        var close = CloseBounds(e.Bounds);
        var title = new Rectangle(e.Bounds.X + Pixels(26), e.Bounds.Y, Math.Max(0, close.Left - e.Bounds.X - Pixels(29)), e.Bounds.Height);
        TextRenderer.DrawText(e.Graphics, page.Text, Font, title, Color.FromArgb(30, 51, 78), TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
        if (hoveredClose == page || pressedClose == page) {
            using var hover = new SolidBrush(pressedClose == page ? Color.FromArgb(245, 202, 206) : Color.FromArgb(252, 225, 227));
            e.Graphics.FillRectangle(hover, close);
        }
        var state = e.Graphics.Save(); e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(hoveredClose == page ? Color.Firebrick : Color.FromArgb(86, 99, 116), Math.Max(1.5f, DeviceDpi / 64f));
        int inset = Pixels(7);
        e.Graphics.DrawLine(pen, close.Left + inset, close.Top + inset, close.Right - inset, close.Bottom - inset);
        e.Graphics.DrawLine(pen, close.Right - inset, close.Top + inset, close.Left + inset, close.Bottom - inset);
        e.Graphics.Restore(state);
        base.OnDrawItem(e);
    }
    protected override void OnMouseMove(MouseEventArgs e) {
        var page = HitClose(e.Location);
        if (page != hoveredClose) { hoveredClose = page; Cursor = page == null ? Cursors.Default : Cursors.Hand; Invalidate(); }
        base.OnMouseMove(e);
    }
    protected override void OnMouseLeave(EventArgs e) { hoveredClose = null; Cursor = Cursors.Default; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnMouseCaptureChanged(EventArgs e) { if (!Capture) { pressedClose = null; Invalidate(); } base.OnMouseCaptureChanged(e); }
    protected override void WndProc(ref Message m) {
        // Intercept before the native tab control selects an inactive tab under its X.
        var p = new Point(unchecked((short)(long)m.LParam), unchecked((short)((long)m.LParam >> 16)));
        if (m.Msg == 0x201 && HitClose(p) is { } page) { pressedClose = page; Capture = true; Invalidate(); return; }
        if (m.Msg == 0x202 && pressedClose is { } pressed) {
            bool close = HitClose(p) == pressed; pressedClose = null; Capture = false; Invalidate();
            if (close && TabPages.Contains(pressed)) CloseRequested?.Invoke(pressed);
            return;
        }
        // A rapid second press must not double-click and close the next tab underneath.
        if (m.Msg == 0x203 && HitClose(p) != null) return;
        base.WndProc(ref m);
    }
}
