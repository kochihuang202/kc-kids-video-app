using System.Drawing.Imaging;
using CaptureWorkbench;

var failures = new List<string>(); int testCount = 0;
if (args.Length == 2 && args[0] == "--replay") {
    using var partial = new Bitmap(Path.Combine(args[1], "partial.png"));
    using var next = new Bitmap(Path.Combine(args[1], "unaligned-frame.png"));
    using var previous = partial.Clone(new Rectangle(0, partial.Height - next.Height, next.Width, next.Height), PixelFormat.Format32bppArgb);
    var alignment = Stitching.FindOffset(previous, next, 100);
    Console.WriteLine($"Recorded scroll alignment: {alignment}");
    var root = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-replay-" + Guid.NewGuid().ToString("N"));
    var result = ScrollCapture.RunAsync(new Rectangle(Point.Empty, previous.Size), root, CancellationToken.None, Console.WriteLine, new ReplayScrollSurface(previous, next)).GetAwaiter().GetResult();
    using (result.Image) { Console.WriteLine(result.Message); return alignment.Offset == 100 && alignment.Confidence >= .90 && !result.NeedsReview && result.Image.Height == previous.Height + 100 ? 0 : 1; }
}
void Test(string name, Action action) { testCount++; try { action(); Console.WriteLine("PASS " + name); } catch (Exception e) { failures.Add(name + ": " + e.Message); Console.WriteLine("FAIL " + name + ": " + e); } }
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
Test("PicPick fallback matches scrolling content despite a changing thumbnail", () => {
    using var source = Pattern(240, 1200);
    using var previous = source.Clone(new Rectangle(0, 0, 240, 720), PixelFormat.Format32bppArgb);
    using var next = source.Clone(new Rectangle(0, 100, 240, 720), PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(next)) g.FillRectangle(Brushes.Black, 60, 520, 120, 50);
    var result = Stitching.FindOffset(previous, next, 0);
    Check(result.Offset == 100 && result.Confidence >= .90, $"Changed thumbnail stopped capture: {result}");
    foreach (int stopAfter in new[] { 2, int.MaxValue }) {
        var root = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-scroll-" + Guid.NewGuid().ToString("N"));
        var scroll = ScrollCapture.RunAsync(new Rectangle(Point.Empty, previous.Size), root, CancellationToken.None, _ => { }, new ReplayScrollSurface(previous, next, stopAfter)).GetAwaiter().GetResult();
        using (scroll.Image) {
            Check(!scroll.NeedsReview && scroll.Image.Height == 820, "Scroll capture lost accumulated pixels");
            Check(scroll.Message.Contains(stopAfter == 2 ? "Esc" : "底部"), "Wrong completion path");
            using var saved = new Bitmap(Path.Combine(scroll.RecoveryPath, "partial.png")); Check(saved.Height == 820, "Completed result not saved");
        }
    }
});
Test("unrelated frames reject stitching rather than silently producing a long image", () => {
    using var a = Pattern(180, 400); using var b = new Bitmap(180, 400);
    using (var g = Graphics.FromImage(b)) g.Clear(Color.Magenta);
    Check(Stitching.FindOffset(a, b, 0).Confidence < .85, "Unrelated content accepted");
});
Test("captures autosave once; tab edits and undo stay unsaved until explicit save", () => {
    var dir = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-test-" + Guid.NewGuid().ToString("N"));
    var store = new DocumentStore(dir); using var a = Pattern(80, 70);
    using var docA = store.Create(a); using var docB = store.Create(a);
    using var edited = new Bitmap(a); edited.SetPixel(0, 0, Color.Red);
    docA.Commit(edited);
    Check(docA.Pending, "Editing must stay unsaved");
    using (var original = new Bitmap(docA.OutputPath)) Check(original.GetPixel(0, 0) == a.GetPixel(0, 0), "Edit silently overwrote the capture");
    Check(docA.Image.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Edit missing");
    Check(docB.Image.GetPixel(0, 0) == a.GetPixel(0, 0), "Other tab changed");
    docA.Undo(); Check(!docA.Pending && docA.Image.GetPixel(0, 0) == a.GetPixel(0, 0), "Undo to saved capture must be clean");
    docA.Redo(); Check(docA.Image.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Redo missing");
    Check(docA.Pending, "Redo must not save"); docA.SavePending(); Check(!docA.Pending, "Explicit save did not clear dirty indicator");
    var restored = store.Restore();
    try {
        using (var copy = new Bitmap(docA.OutputPath)) Check(copy.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Explicit save missing");
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
        doc.Commit(edited);
        bool failed = false; try { doc.SavePending(); } catch (IOException) { failed = true; } catch (UnauthorizedAccessException) { failed = true; }
        Check(failed && doc.Pending, "Failed save falsely marked successful");
        Check(doc.Image.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Failed save lost current edit");
    }
    using (var old = new Bitmap(doc.OutputPath)) Check(old.GetPixel(0, 0) == original.GetPixel(0, 0), "Previous good output was overwritten");
    doc.SavePending(); Check(!doc.Pending, "Retry did not finish");
    using var saved = new Bitmap(doc.OutputPath); Check(saved.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Retry lost edit");
});
Test("annotations remain separate objects across editing, undo and restart", () => {
    var root = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-objects-" + Guid.NewGuid().ToString("N"));
    var store = new DocumentStore(root); using var background = new Bitmap(240, 160);
    using (var g = Graphics.FromImage(background)) g.Clear(Color.White);
    using var a = store.Create(background); using var b = store.Create(background);
    var arrow = new ImageMark { Kind = EditTool.Arrow, X1 = 20, Y1 = 25, X2 = 120, Y2 = 25, Argb = Color.Red.ToArgb() };
    var text = new ImageMark { Kind = EditTool.Text, X1 = 20, Y1 = 100, Text = "Note" };
    a.CommitMarks([arrow, text]);
    Check(a.Marks.Count == 2 && a.BaseImage.GetPixel(50, 25).ToArgb() == Color.White.ToArgb(), "Annotation burned into the background");
    Check(a.Image.GetPixel(50, 25).R > 220 && a.Image.GetPixel(50, 25).G < 30, "Export omits annotation");
    a.CommitMarks([arrow.Move(0, 30), text with { Text = "Edited" }]);
    Check(a.Image.GetPixel(50, 25).ToArgb() == Color.White.ToArgb(), "Moving an object left old pixels behind");
    Check(b.Marks.Count == 0, "Other tab changed");
    a.SavePending();
    var restored = store.Restore();
    try {
        var recovered = restored.Single(d => d.Id == a.Id);
        Check(recovered.Marks[0].Y1 == 55 && recovered.Marks[1].Text == "Edited", "Restart flattened or lost objects");
        recovered.Undo(); Check(recovered.Marks[0].Y1 == 25 && recovered.Marks[1].Text == "Note", "Object undo lost properties");
        recovered.Redo(); Check(recovered.Marks[0].Y1 == 55, "Object redo lost position");
    } finally { foreach (var doc in restored) doc.Dispose(); }
});
Test("new output folder and save indicators preserve existing documents", () => {
    var root = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-paths-" + Guid.NewGuid().ToString("N"));
    var store = new DocumentStore(root); using var image = Pattern(80, 70); using var old = store.Create(image); var oldPath = old.OutputPath;
    store.OutputRoot = Path.Combine(root, "chosen-output"); using var current = store.Create(image);
    Check(current.OutputPath.StartsWith(store.OutputRoot) && old.OutputPath == oldPath, "Changing output folder moved an existing document");
    Check(!current.State.Title.Contains("截圖"), "Tab title includes redundant wording");
    var states = new List<bool>(); current.SaveStateChanged += () => states.Add(current.Pending);
    current.CommitMarks([new ImageMark { Kind = EditTool.Line, X1 = 5, Y1 = 5, X2 = 50, Y2 = 50 }]);
    Check(states.SequenceEqual(new[] { true }), "Editing unexpectedly returned the indicator to saved");
    current.SavePending(); Check(states.SequenceEqual(new[] { true, false }), "Explicit save did not turn indicator green");
    var restored = store.Restore(); try { Check(restored.Single(d => d.Id == current.Id).OutputPath == current.OutputPath, "Restart forgot chosen output folder"); } finally { foreach (var doc in restored) doc.Dispose(); }
});
Test("unsaved edits do not touch disk and discard returns to the last manual save", () => {
    var root = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-manual-save-" + Guid.NewGuid().ToString("N"));
    var store = new DocumentStore(root); using var image = Pattern(80, 70); using var doc = store.Create(image);
    var before = Directory.GetFiles(root, "*", SearchOption.AllDirectories).ToDictionary(p => p, File.ReadAllBytes);
    using var edit = new Bitmap(image); edit.SetPixel(0, 0, Color.Red); doc.Commit(edit);
    doc.Undo(); doc.Redo(); doc.Persist();
    Check(before.All(f => File.ReadAllBytes(f.Key).SequenceEqual(f.Value)), "Editing or metadata persist wrote an unsaved version");
    Check(Directory.GetFiles(root, "*", SearchOption.AllDirectories).Length == before.Count, "Editing created disk files");
    doc.DiscardChanges(); Check(!doc.Pending && doc.Image.GetPixel(0, 0) == image.GetPixel(0, 0), "Discard lost saved capture");
    doc.Commit(edit); doc.SavePending(); doc.Commit(image); doc.DiscardChanges();
    Check(doc.Image.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Discard ignored latest manual save");
});
Test("new blank canvas and image stamp remain editable and survive explicit save", () => {
    var root = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-stamp-" + Guid.NewGuid().ToString("N"));
    var store = new DocumentStore(root); using var blank = NewCanvasForm.CreateImage(240, 180, Color.White);
    using var doc = store.Create(blank, saveImmediately: false);
    Check(doc.Pending && !File.Exists(doc.OutputPath), "Blank canvas saved without asking");
    using var graphic = new Bitmap(16, 16); using (var g = Graphics.FromImage(graphic)) g.Clear(Color.Lime);
    var stamp = StampDefinition.FromImage(graphic, "test").CreateMark(40, 40, Color.Red);
    doc.CommitMarks([stamp]); Check(doc.BaseImage.GetPixel(40, 40).ToArgb() == Color.White.ToArgb(), "Stamp burned into background");
    Check(doc.Image.GetPixel(40, 40).ToArgb() == Color.Lime.ToArgb(), $"Custom stamp missing: corner {doc.Image.GetPixel(40, 40)}, center {doc.Image.GetPixel(48, 48)}");
    doc.CommitMarks([stamp.Move(100, 0)]); Check(doc.Image.GetPixel(40, 40).ToArgb() == Color.White.ToArgb(), "Stamp left pixels after moving");
    doc.Undo(); Check(doc.Marks[0].X1 == stamp.X1, "Stamp undo missing"); doc.Redo(); doc.SavePending();
    var restored = store.Restore(); try { var copy = restored.Single(); Check(copy.Marks[0].StampImageData == stamp.StampImageData && copy.Image.GetPixel(140, 40).ToArgb() == Color.Lime.ToArgb(), "Stamp did not restore"); } finally { foreach (var d in restored) d.Dispose(); }
});
Test("bottom detection retries unchanged frames and resets after delayed progress", () => {
    var detector = new ScrollEndDetector();
    Check(!detector.Observe(new Alignment(0, 1, 0)), "First unchanged frame ended capture");
    Check(!detector.Observe(new Alignment(0, 1, 0)), "Transient delay ended capture");
    Check(!detector.Observe(new Alignment(80, 1, 0)), "Progress ended capture");
    for (int i = 0; i < 3; i++) Check(!detector.Observe(new Alignment(0, 1, 0)), "Stopped before confirmations");
    Check(detector.Observe(new Alignment(0, 1, 0)), "Never finished at bottom");
});
Test("normal editor flow: centered numbers, direct dragging, paste, resize, select all and close", CanvasUserFlows.Run);
Test("closing saves edits and clears the open-document list", () => {
    var root = Path.Combine(Path.GetTempPath(), "CaptureWorkbench-close-" + Guid.NewGuid().ToString("N"));
    var store = new DocumentStore(root); using var blank = NewCanvasForm.CreateImage(80, 60, Color.White); using var doc = store.Create(blank);
    using var edited = new Bitmap(blank); edited.SetPixel(0, 0, Color.Red); doc.Commit(edited);
    using (var locked = new FileStream(doc.OutputPath, FileMode.Open, FileAccess.Read, FileShare.None)) {
        bool failed = false; try { doc.CloseAndSave(); } catch (IOException) { failed = true; } catch (UnauthorizedAccessException) { failed = true; }
        Check(failed && doc.State.Open && doc.Pending, "Failed close lost the open unsaved document");
    }
    doc.CloseAndSave(); Check(!doc.Pending && !doc.State.Open, "Close did not save and forget the document");
    using var saved = new Bitmap(doc.OutputPath); Check(saved.GetPixel(0, 0).ToArgb() == Color.Red.ToArgb(), "Close lost final edits");
    Check(store.Restore().Count == 0, "Closed documents were reopened");
});
Test("startup command quotes the executable and opens in the notification area", () => {
    Check(StartupRegistration.CommandFor(@"C:\Apps With Spaces\CaptureWorkbench.exe") == "\"C:\\Apps With Spaces\\CaptureWorkbench.exe\" --tray", "Startup command breaks paths containing spaces");
});
Console.WriteLine($"{testCount - failures.Count}/{testCount} checks passed");
return failures.Count == 0 ? 0 : 1;
