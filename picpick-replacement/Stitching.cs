using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace CaptureWorkbench;

public readonly record struct Alignment(int Offset, double Confidence, double Error);

public static class Stitching
{
    static byte[] Pixels(Bitmap bitmap)
    {
        using var normalized = new Bitmap(bitmap.Width, bitmap.Height, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(normalized)) graphics.DrawImageUnscaled(bitmap, 0, 0);
        var data = normalized.LockBits(new Rectangle(0, 0, normalized.Width, normalized.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try { var result = new byte[normalized.Width * normalized.Height * 4]; for (int y = 0; y < normalized.Height; y++) Marshal.Copy(data.Scan0 + y * data.Stride, result, y * normalized.Width * 4, normalized.Width * 4); return result; }
        finally { normalized.UnlockBits(data); }
    }

    // Compare moving content inside the region, excluding most fixed top/bottom UI.
    // Search in physical pixels; never infer displacement from the wheel delta.
    public static Alignment FindOffset(Bitmap previous, Bitmap next, int preferredOffset)
    {
        if (previous.Size != next.Size) return new(0, 0, 255);
        var a = Pixels(previous); var b = Pixels(next); int w = previous.Width, h = previous.Height;
        double Difference(int shift, bool interior)
        {
            int start = interior ? Math.Max(12, h / 6) : 4;
            int end = Math.Min(h - shift - 5, interior ? h * 4 / 5 : h - 4);
            if (end - start < 24) return 255;
            double sum = 0; int samples = 0;
            for (int y = start; y < end; y += Math.Max(1, (end - start) / 32))
                for (int x = w / 5; x < w * 4 / 5; x += Math.Max(1, w / 25))
                { int p = ((y + shift) * w + x) * 4, q = (y * w + x) * 4; for (int c = 0; c < 3; c++) sum += Math.Abs(a[p + c] - b[q + c]); samples += 3; }
            return samples == 0 ? 255 : sum / samples;
        }
        if (Difference(0, false) < .8) return new(0, 1, 0);
        int limit = Math.Max(1, h * 2 / 3), best = 0; double error = double.MaxValue;
        // Every offset is examined so small and irregular wheel steps cannot be skipped.
        for (int shift = 1; shift <= limit; shift++)
        {
            double candidate = Difference(shift, true);
            if (candidate < error - .02 || (Math.Abs(candidate - error) < .02 && preferredOffset > 0 && Math.Abs(shift - preferredOffset) < Math.Abs(best - preferredOffset)))
            { error = candidate; best = shift; }
        }
        return new(best, Math.Clamp(1 - error / 80, 0, 1), error);
    }

    public static int FixedFooter(Bitmap a, Bitmap b)
    {
        if (a.Size != b.Size) return 0;
        var pa = Pixels(a); var pb = Pixels(b); int w = a.Width, band = 0;
        for (int y = a.Height - 1; y >= a.Height * 3 / 4; y--)
        {
            int different = 0;
            for (int x = w / 6; x < w * 5 / 6; x += Math.Max(1, w / 40))
            { int p = (y * w + x) * 4; if (Math.Abs(pa[p] - pb[p]) + Math.Abs(pa[p + 1] - pb[p + 1]) + Math.Abs(pa[p + 2] - pb[p + 2]) > 12) different++; }
            if (different > 2) break;
            band++;
        }
        return band >= 12 && band < a.Height / 4 ? band : 0;
    }

    public static Bitmap Append(Bitmap? accumulated, Bitmap next, int offset, int footer)
    {
        if (accumulated == null) return next.Clone(new Rectangle(0, 0, next.Width, next.Height - footer), PixelFormat.Format32bppArgb);
        if (offset <= 0 || offset > next.Height - footer) throw new ArgumentOutOfRangeException(nameof(offset));
        if ((long)next.Width * (accumulated.Height + offset) > 100_000_000) throw new InvalidOperationException("長圖已達安全尺寸，已保留目前結果。請分段擷取。");
        var result = new Bitmap(next.Width, accumulated.Height + offset, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(result);
        g.DrawImageUnscaled(accumulated, 0, 0);
        g.DrawImage(next, new Rectangle(0, accumulated.Height, next.Width, offset), new Rectangle(0, next.Height - footer - offset, next.Width, offset), GraphicsUnit.Pixel);
        return result;
    }
}
