namespace CaptureWorkbench;

public static class CaptureCompletion
{
    public static string Complete(Bitmap image, DocumentStore store, AppSettings settings, Action<ImageDocument> open, Action<Bitmap> copy) {
        var document = store.Create(image);
        try { open(document); } catch { document.Dispose(); throw; }
        if (!settings.CopyCaptureToClipboard) return "截圖已保存";
        try { copy(document.Image); return "截圖已保存並複製到剪貼簿"; }
        catch (Exception error) { return "截圖已保存，剪貼簿複製未完成：" + error.Message + " · 可按 Ctrl＋C 重試"; }
    }
}
