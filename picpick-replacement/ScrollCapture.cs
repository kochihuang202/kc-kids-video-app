using System.Text.Json;

namespace CaptureWorkbench;

public sealed record ScrollResult(Bitmap Image, string Message, bool NeedsReview, string RecoveryPath);

public interface IScrollSurface
{
    Bitmap Capture(Rectangle region);
    void Prepare(Rectangle region);
    void Scroll(Rectangle region);
    bool StopRequested { get; }
    Task Delay(int milliseconds);
}

internal sealed class DesktopScrollSurface(nint targetWindow = 0) : IScrollSurface
{
    public Bitmap Capture(Rectangle region) => Native.Capture(region);
    public bool StopRequested => Native.EscapeDown;
    public Task Delay(int milliseconds) => Task.Delay(milliseconds);
    static Point Center(Rectangle region) => new(region.Left + region.Width / 2, region.Top + region.Height / 2);
    static void Park(Rectangle region) { var screen = SystemInformation.VirtualScreen; Native.SetCursorPos(Math.Max(screen.Left, region.Left - 12), Math.Max(screen.Top, region.Top - 12)); }
    public void Prepare(Rectangle region) { var window = targetWindow != 0 ? targetWindow : Native.GetAncestor(Native.WindowFromPoint(Center(region)), 2); if (window != 0) Native.SetForegroundWindow(window); Park(region); }
    // Recovered native path: standard scrollbar input first, mouse-wheel fallback.
    public void Scroll(Rectangle region) { var center = Center(region); Native.SetCursorPos(center.X, center.Y); if (!Native.TryScrollWindow(center)) Native.Wheel(-120); Park(region); }
}

public sealed class ScrollEndDetector
{
    public int Unchanged { get; private set; }
    public bool Observe(Alignment alignment) { Unchanged = alignment.Offset == 0 && alignment.Confidence >= .9 ? Unchanged + 1 : 0; return Unchanged >= 4; }
}

public static class ScrollCapture
{
    public static async Task<ScrollResult> RunAsync(Rectangle region, string root, CancellationToken cancellation, Action<string> progress, IScrollSurface? surface = null)
    {
        surface ??= new DesktopScrollSurface();
        var recovery = Path.Combine(root, ".recovery", DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(recovery);
        using var polling = new CancellationTokenSource();
        using var finish = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        var escapeMonitor = Task.Run(async () => {
            try { while (!polling.IsCancellationRequested) { if (surface.StopRequested) { finish.Cancel(); break; } await Task.Delay(25, polling.Token); } }
            catch (OperationCanceledException) { }
        });
        bool Stopped() => finish.IsCancellationRequested || surface.StopRequested;
        Bitmap? previous = null, result = null;
        int footer = 0, preferred = 0, steps = 0;
        var end = new ScrollEndDetector();
        bool initialized = false, review = false; string message = "已到達底部，自動完成";
        try {
            surface.Prepare(region); await surface.Delay(300);
            previous = surface.Capture(region); result = new Bitmap(previous);
            Checkpoint();
            for (int iteration = 0; iteration < 600; iteration++) {
                if (Stopped()) { message = "已按 Esc 結束，長圖已保存"; break; }
                surface.Scroll(region); await surface.Delay(300);
                if (Stopped()) { message = "已按 Esc 結束，長圖已保存"; break; }
                Bitmap next = surface.Capture(region);
                for (int settle = 0; settle < 5; settle++) {
                    await surface.Delay(100);
                    var later = surface.Capture(region);
                    var stable = Stitching.FindOffset(next, later, preferred);
                    next.Dispose(); next = later;
                    if ((stable.Offset == 0 && stable.Confidence >= .9) || Stopped()) break;
                }
                using (next) {
                    if (Stopped()) { message = "已按 Esc 結束，長圖已保存"; break; }
                    var alignment = Stitching.FindOffset(previous, next, preferred);
                    Bitmap accepted = next; Bitmap? retry = null;
                    try {
                        if (alignment.Confidence < .90) { await surface.Delay(600); retry = surface.Capture(region); alignment = Stitching.FindOffset(previous, retry, preferred); accepted = retry; }
                        if (Stopped()) { message = "已按 Esc 結束，長圖已保存"; break; }
                        if (alignment.Confidence < .90) {
                            DocumentStore.AtomicPng(previous, Path.Combine(recovery, "previous-frame.png"));
                            DocumentStore.AtomicPng(accepted, Path.Combine(recovery, "unaligned-frame.png"));
                            DocumentStore.AtomicText(JsonSerializer.Serialize(alignment), Path.Combine(recovery, "alignment.json"));
                            review = true; message = "無法可靠銜接，已保存目前長圖與待檢查畫面"; break;
                        }
                        if (alignment.Offset == 0) {
                            bool bottom = end.Observe(alignment); progress($"確認是否到底… {end.Unchanged}/4 · Esc 可立即結束");
                            if (bottom) break;
                            await surface.Delay(350 + end.Unchanged * 150); continue;
                        }
                        end.Observe(alignment);
                        if (!initialized) {
                            footer = Stitching.FixedFooter(previous, accepted);
                            using var cropped = Stitching.Append(null, previous, 0, footer);
                            result.Dispose(); result = new Bitmap(cropped); initialized = true;
                        }
                        var joined = Stitching.Append(result, accepted, alignment.Offset, footer);
                        result.Dispose(); result = joined;
                        previous.Dispose(); previous = new Bitmap(accepted);
                        preferred = alignment.Offset; steps++; Checkpoint();
                        progress($"已接合 {steps} 次 · {result.Width} × {result.Height} · Esc 結束");
                    } finally { retry?.Dispose(); }
                }
                if (iteration == 599) { review = true; message = "已達本次捲動次數上限，已保存目前長圖"; }
            }
            if (initialized && footer > 0) {
                var complete = new Bitmap(result.Width, result.Height + footer);
                using (var g = Graphics.FromImage(complete)) { g.DrawImageUnscaled(result, 0, 0); g.DrawImage(previous, new Rectangle(0, result.Height, previous.Width, footer), new Rectangle(0, previous.Height - footer, previous.Width, footer), GraphicsUnit.Pixel); }
                result.Dispose(); result = complete;
            }
            Checkpoint(); return new(result, message, review, recovery);
        } catch (Exception error) when (result != null) {
            try { Checkpoint(); } catch { }
            return new(result, "擷取已停止並保留目前結果：" + error.Message, true, recovery);
        } finally { polling.Cancel(); await escapeMonitor; previous?.Dispose(); }
        void Checkpoint() => DocumentStore.AtomicPng(result!, Path.Combine(recovery, "partial.png"));
    }
}
