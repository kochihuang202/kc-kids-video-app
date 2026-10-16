// A deterministic native scrolling surface for desktop capture verification.
using System.Drawing;
using System.Windows.Forms;

ApplicationConfiguration.Initialize();
using var fixture = new Form { Text = "Capture Workbench · Scroll fixture", StartPosition = FormStartPosition.Manual, Bounds = new Rectangle(90, 70, 760, 740) };
var panel = new Panel { Dock = DockStyle.Fill, AutoScroll = true, AutoScrollMinSize = new Size(680, 2500), BackColor = Color.White };
panel.Paint += (_, e) => {
    e.Graphics.TranslateTransform(panel.AutoScrollPosition.X, panel.AutoScrollPosition.Y);
    using var font = new Font("Segoe UI", 20, FontStyle.Bold);
    for (int row = 0; row < 25; row++) {
        using var brush = new SolidBrush(Color.FromArgb(235 - row % 3 * 14, 235 + row % 2 * 10, 250 - row % 4 * 12));
        e.Graphics.FillRectangle(brush, 0, row * 100, 700, 100);
        e.Graphics.DrawString($"SCROLL ROW {row + 1:00}", font, Brushes.Navy, 30, row * 100 + 25);
        e.Graphics.DrawRectangle(Pens.SlateGray, 12 + row % 6 * 19, row * 100 + 8, 620 - row % 7 * 13, 82);
    }
};
fixture.Controls.Add(panel); Application.Run(fixture);
