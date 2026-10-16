namespace CaptureWorkbench;

public static class ImageFileDrop
{
    static readonly HashSet<string> extensions = new(StringComparer.OrdinalIgnoreCase) { ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff", ".ico" };
    public static string[] Files(IDataObject? data) => data?.GetDataPresent(DataFormats.FileDrop) == true && data.GetData(DataFormats.FileDrop) is string[] files
        ? files.Where(path => extensions.Contains(Path.GetExtension(path)) && File.Exists(path)).ToArray() : [];
    public static void SetEffect(DragEventArgs e, bool enabled = true) => e.Effect = enabled && (e.AllowedEffect & DragDropEffects.Copy) != 0 && Files(e.Data).Length > 0 ? DragDropEffects.Copy : DragDropEffects.None;
    public static void Attach(Control control, Action<string[]> drop, Func<bool>? enabled = null) {
        control.AllowDrop = true;
        control.DragEnter += (_, e) => SetEffect(e, enabled?.Invoke() ?? true);
        control.DragOver += (_, e) => SetEffect(e, enabled?.Invoke() ?? true);
        control.DragDrop += (_, e) => { SetEffect(e, enabled?.Invoke() ?? true); if (e.Effect == DragDropEffects.Copy) drop(Files(e.Data)); };
    }
    public static string Import(IEnumerable<string> paths, Action<Bitmap> insert) {
        int count = 0; var errors = new List<string>();
        foreach (string path in paths) {
            try {
                using var image = new Bitmap(path);
                if ((long)image.Width * image.Height > 100_000_000) throw new InvalidOperationException("圖片超過一億像素");
                insert(image); count++;
            } catch (Exception error) { errors.Add(Path.GetFileName(path) + "：" + error.Message); }
        }
        return $"已拖入 {count} 張圖片" + (errors.Count > 0 ? " · 無法載入：" + string.Join("；", errors) : "");
    }
}
