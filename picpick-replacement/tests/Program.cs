using System.Drawing.Imaging;
using CaptureWorkbench;

var failures = new List<string>();
void Test(string name, Action action) { try { action(); Console.WriteLine("PASS " + name); } catch (Exception e) { failures.Add(name + ": " + e.Message); Console.WriteLine("FAIL " + name + ": " + e); } }
void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
Bitmap Pattern(int width, int height) {
    var b = new Bitmap(width, height, PixelFormat.Format32bppArgb);
    var random = new Random(2718);
    for (int y = 0; y < height; y++) for (int x = 0; x < width; x++)
        b.SetPixel(x, y, Color.FromArgb(255, random.Next(256), (y * 19 + x * 3) % 256, random.Next(256)));
    return b;
}
Test("scroll alignment uses measured displacement and ignores a fixed header", () => {
    using var source = Pattern(260, 1600);
    using var first = source.Clone(new Rectangle(0, 0, 260, 500), PixelFormat.Format32bppArgb);
    using var next = source.Clone(new Rectangle(0, 167, 260, 500), PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(first)) g.FillRectangle(Brushes.Navy, 0, 0, 260, 55);
    using (var g = Graphics.FromImage(next)) g.FillRectangle(Brushes.Navy, 0, 0, 260, 55);
    var result = Stitching.FindOffset(first, next, 0);
    Check(result.Offset == 167 && result.Confidence > .95, $"Expected 167, got {result}");
});
Test("manual Esc completion preserves accumulated pixels, including one-frame capture", () => {
    using var source = Pattern(180, 1200);
    using var a = source.Clone(new Rectangle(0, 0, 180, 400), PixelFormat.Format32bppArgb);
    using var b = source.Clone(new Rectangle(0, 123, 180, 400), PixelFormat.Format32bppArgb);
    using var stitched = Stitching.Append(a, b, 123, 0);
    Check(stitched.Height == 523, "Wrong completed height");
    for (int y = 0; y < stitched.Height; y += 7) Check(stitched.GetPixel(83, y) == source.GetPixel(83, y), "Lost or repeated content");
    using var single = Stitching.Append(null, a, 0, 0);
    Check(single.Height == 400, "Esc before first scroll lost first frame");
});
Test("unchanged images are no progress, not invented displacement", () => {
    using var a = Pattern(180, 400); using var b = new Bitmap(a);
    Check(Stitching.FindOffset(a, b, 0).Offset == 0, "Duplicate frame appended");
});
Test("unrelated frames reject stitching rather than silently producing a long image", () => {
    using var a = Pattern(180, 400); using var b = new Bitmap(180, 400);
    using (var g = Graphics.FromImage(b)) g.Clear(Color.Magenta);
    Check(Stitching.FindOffset(a, b, 0).Confidence < .85, "Unrelated content accepted");
});
Test("tab edits and undo are isolated, autosaved, and recover after restart", () => {
    var dir = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-test-" + Guid.NewGuid().ToString("N"));
    var store = new DocumentStore(dir); using var a = Pattern(80, 70);
    using var docA = store.Create(a); using var docB = store.Create(a);
    using var edited = new Bitmap(a); edited.SetPixel(0, 0, Color.Red);
    docA.Commit(edited);
    Check(docA.Image.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Edit missing");
    Check(docB.Image.GetPixel(0, 0) == a.GetPixel(0, 0), "Other tab changed");
    docA.Undo(); Check(docA.Image.GetPixel(0, 0) == a.GetPixel(0, 0), "Undo missing");
    docA.Redo(); Check(docA.Image.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Redo missing");
    var restored = store.Restore();
    try {
        using (var copy = new Bitmap(docA.OutputPath)) Check(copy.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Export not autosaved");
        var recovered = restored.Single(d => d.Id == docA.Id);
        Check(recovered.Image.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Recovery lost edit");
        recovered.Undo(); Check(recovered.Image.GetPixel(0, 0) == a.GetPixel(0, 0), "Recovery lost undo");
        Check(File.Exists(Path.Combine(docA.DirectoryPath, "original.png")), "Original missing");
        Check(docA.OutputPath != docB.OutputPath, "Consecutive captures overwrite each other");
        Check(System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(docA.OutputPath), @"^\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}( \(\d+\))?\.png$"), "Filename must be the capture date and time");
        Check(recovered.OutputPath == docA.OutputPath, "Restart changed the capture filename");
    } finally { foreach (var d in restored) d.Dispose(); }
    // Retain failed-test artifacts for diagnosis; this is a unique test-only directory.
});
Test("save failure keeps the edit available for retry and preserves the previous file", () => {
    var dir = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-test-" + Guid.NewGuid().ToString("N"));
    var store = new DocumentStore(dir); using var original = Pattern(80, 70); using var doc = store.Create(original);
    using var edited = new Bitmap(original); edited.SetPixel(0, 0, Color.Red);
    using (var locked = new FileStream(doc.OutputPath, FileMode.Open, FileAccess.Read, FileShare.None)) {
        bool failed = false; try { doc.Commit(edited); } catch (IOException) { failed = true; } catch (UnauthorizedAccessException) { failed = true; }
        Check(failed && doc.Pending, "Failed save falsely marked successful");
        Check(doc.Image.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Failed save lost current edit");
    }
    using (var old = new Bitmap(doc.OutputPath)) Check(old.GetPixel(0, 0) == original.GetPixel(0, 0), "Previous good output was overwritten");
    doc.SavePending(); Check(!doc.Pending, "Retry did not finish");
    using var saved = new Bitmap(doc.OutputPath); Check(saved.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Retry lost edit");
});
Test("bottom detection retries unchanged frames and resets after delayed progress", () => {
    var detector = new ScrollEndDetector();
    Check(!detector.Observe(new Alignment(0, 1, 0)), "First unchanged frame ended capture");
    Check(!detector.Observe(new Alignment(0, 1, 0)), "Transient delay ended capture");
    Check(!detector.Observe(new Alignment(80, 1, 0)), "Progress ended capture");
    for (int i = 0; i < 3; i++) Check(!detector.Observe(new Alignment(0, 1, 0)), "Stopped before confirmations");
    Check(detector.Observe(new Alignment(0, 1, 0)), "Never finished at bottom");
});
Console.WriteLine($"{7 - failures.Count}/7 checks passed");
return failures.Count == 0 ? 0 : 1;
