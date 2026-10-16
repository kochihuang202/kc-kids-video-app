using System.Drawing.Imaging;

namespace CaptureWorkbench;

internal static class ClipboardImages
{
    public static Bitmap? Read() {
        var data = Clipboard.GetDataObject();
        if (data?.GetData("PNG") is MemoryStream png) { using (png) using (var source = new Bitmap(png)) return new Bitmap(source); }
        if (Clipboard.ContainsImage()) { using var image = Clipboard.GetImage(); if (image != null) return new Bitmap(image); }
        if (Clipboard.ContainsFileDropList()) {
            var file = Clipboard.GetFileDropList().Cast<string>().FirstOrDefault(f => new[] { ".png", ".jpg", ".jpeg", ".gif", ".bmp" }.Contains(Path.GetExtension(f).ToLowerInvariant()));
            if (file != null) { using var source = new Bitmap(file); return new Bitmap(source); }
        }
        return null;
    }
    public static void Write(Bitmap image) {
        using var png = new MemoryStream(); image.Save(png, ImageFormat.Png);
        var data = new DataObject(); data.SetData(DataFormats.Bitmap, true, image); data.SetData("PNG", false, new MemoryStream(png.ToArray())); Clipboard.SetDataObject(data, true);
    }
}
