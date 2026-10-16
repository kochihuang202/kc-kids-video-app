namespace CaptureWorkbench;

public sealed record ScrollResult(Bitmap Image, string Message, bool NeedsReview, string RecoveryPath);

public sealed class ScrollEndDetector
{
    public int Unchanged { get; private set; }
    public bool Observe(Alignment alignment) { Unchanged = alignment.Offset == 0 && alignment.Confidence >= .9 ? Unchanged + 1 : 0; return Unchanged >= 4; }
}

public static class ScrollCapture
{
    public static async Task<ScrollResult> RunAsync(Rectangle region, string root, CancellationToken cancellation, Action<string> progress)
    {
        var recovery = Path.Combine(root, ".recovery", DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(recovery);
        await Task.Delay(250);
        using var first = Native.Capture(region);
        Bitmap previous = new(first), result = new(first);
        int footer = 0, preferred = 0, steps = 0;
        var endDetector = new ScrollEndDetector();
        bool initialized = false, review = false; string message = "已到達底部，自動完成";
        DocumentStore.AtomicPng(result, Path.Combine(recovery, "partial.png"));
        var center = new Point(region.Left + region.Width / 2, region.Top + region.Height / 2);
        var window = Native.WindowFromPoint(center); var parent = Native.GetAncestor(window, 2);
        if (parent != 0) Native.SetForegroundWindow(parent);
        try {
            for (int iteration = 0; iteration < 600; iteration++) {
                if (cancellation.IsCancellationRequested || Native.EscapeDown) { message = "已按 Esc 結束，長圖已保存"; break; }
                Native.SetCursorPos(center.X, center.Y); Native.Wheel(-120);
                await Task.Delay(260);
                if (Native.EscapeDown || cancellation.IsCancellationRequested) { message = "已按 Esc 結束，長圖已保存"; break; }
                Bitmap next = Native.Capture(region);
                // Let animation/rendering settle. This never scrolls ahead of an unaccepted frame.
                for (int settle = 0; settle < 5; settle++) {
                    await Task.Delay(100);
                    var later = Native.Capture(region);
                    bool stable = Stitching.FindOffset(next, later, preferred).Offset == 0;
                    next.Dispose(); next = later;
                    if (stable || Native.EscapeDown) break;
                }
                using (next) {
                    if (Native.EscapeDown || cancellation.IsCancellationRequested) { message = "已按 Esc 結束，長圖已保存"; break; }
                    var alignment = Stitching.FindOffset(previous, next, preferred);
                    if (alignment.Offset == 0 && alignment.Confidence >= .9) {
                        bool atBottom = endDetector.Observe(alignment); progress($"確認是否到底… {endDetector.Unchanged}/4 · Esc 可立即結束");
                        if (atBottom) break;
                        await Task.Delay(350 + endDetector.Unchanged * 150); continue;
                    }
                    endDetector.Observe(alignment);
                    if (alignment.Confidence < .90) {
                        await Task.Delay(600);
                        using var retry = Native.Capture(region);
                        alignment = Stitching.FindOffset(previous, retry, preferred);
                        if (alignment.Offset > 0 && alignment.Confidence >= .90) { next.Dispose(); /* retry is copied below */ using var retryCopy = new Bitmap(retry); Accept(retryCopy, alignment); }
                        else { DocumentStore.AtomicPng(retry, Path.Combine(recovery, "unaligned-frame.png")); review = true; message = "無法可靠銜接，已保存目前長圖與待檢查畫面"; break; }
                    } else Accept(next, alignment);
                }
                if (iteration == 599) { review = true; message = "已達本次捲動次數上限，已保存目前長圖"; }
            }
            if (initialized && footer > 0) {
                using var tail = previous.Clone(new Rectangle(0, previous.Height - footer, previous.Width, footer), System.Drawing.Imaging.PixelFormat.Format32bppArgb);
                var complete = new Bitmap(result.Width, result.Height + footer);
                using (var g = Graphics.FromImage(complete)) { g.DrawImageUnscaled(result, 0, 0); g.DrawImageUnscaled(tail, 0, result.Height); }
                result.Dispose(); result = complete;
            }
            DocumentStore.AtomicPng(result, Path.Combine(recovery, "partial.png"));
            return new(result, message, review, recovery);
        } catch (Exception error) {
            // Manual finish and recoverable errors retain what has already been assembled.
            review = true; message = "擷取已停止並保留目前結果：" + error.Message;
            try { DocumentStore.AtomicPng(result, Path.Combine(recovery, "partial.png")); } catch { }
            return new(result, message, review, recovery);
        } finally { previous.Dispose(); }

        void Accept(Bitmap next, Alignment alignment)
        {
            if (!initialized) {
                footer = Stitching.FixedFooter(previous, next);
                using var cropped = Stitching.Append(null, previous, 0, footer);
                result.Dispose(); result = new Bitmap(cropped); initialized = true;
            }
            var joined = Stitching.Append(result, next, alignment.Offset, footer);
            result.Dispose(); result = joined; previous.Dispose(); previous = new Bitmap(next);
            preferred = alignment.Offset; steps++;
            DocumentStore.AtomicPng(result, Path.Combine(recovery, "partial.png"));
            progress($"已接合 {steps} 次 · {result.Width} × {result.Height} · Esc 結束");
        }
    }
}
