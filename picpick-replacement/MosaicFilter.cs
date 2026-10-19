using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace CaptureWorkbench;

public static class MosaicFilter
{
    public static void Apply(Bitmap bitmap, Rectangle region, int blockSize = 6) {
        region = Rectangle.Intersect(region, new Rectangle(Point.Empty, bitmap.Size));
        if (region.Width <= 0 || region.Height <= 0) return;
        if (blockSize < 1 || blockSize > 100) throw new ArgumentOutOfRangeException(nameof(blockSize));
        var data = bitmap.LockBits(region, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        try {
            int rowBytes = region.Width * 4; var buffer = new byte[rowBytes * Math.Min(blockSize, region.Height)];
            for (int y = 0; y < region.Height; y += blockSize) {
                int rows = Math.Min(blockSize, region.Height - y);
                for (int row = 0; row < rows; row++) Marshal.Copy(IntPtr.Add(data.Scan0, (y + row) * data.Stride), buffer, row * rowBytes, rowBytes);
                for (int x = 0; x < region.Width; x += blockSize) {
                    int cols = Math.Min(blockSize, region.Width - x), count = rows * cols; int blue = 0, green = 0, red = 0, alpha = 0;
                    for (int row = 0; row < rows; row++) for (int col = 0; col < cols; col++) { int i = row * rowBytes + (x + col) * 4; blue += buffer[i]; green += buffer[i + 1]; red += buffer[i + 2]; alpha += buffer[i + 3]; }
                    for (int row = 0; row < rows; row++) for (int col = 0; col < cols; col++) { int i = row * rowBytes + (x + col) * 4; buffer[i] = (byte)(blue / count); buffer[i + 1] = (byte)(green / count); buffer[i + 2] = (byte)(red / count); buffer[i + 3] = (byte)(alpha / count); }
                }
                for (int row = 0; row < rows; row++) Marshal.Copy(buffer, row * rowBytes, IntPtr.Add(data.Scan0, (y + row) * data.Stride), rowBytes);
            }
        } finally { bitmap.UnlockBits(data); }
    }
}
