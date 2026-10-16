using System.Drawing.Imaging;
using System.Text.Json;

namespace CaptureWorkbench;

public sealed class DocumentState
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Title { get; set; } = "截圖";
    public DateTime Created { get; set; } = DateTime.Now;
    public string OutputFileName { get; set; } = "";
    public string OutputDirectory { get; set; } = "";
    public List<string> Versions { get; set; } = [];
    public Dictionary<string, List<ImageMark>> MarkHistory { get; set; } = [];
    public int Index { get; set; }
    public bool Open { get; set; } = true;
    public float Zoom { get; set; } = 1;
    public string SavedVersion { get; set; } = "";
    public int NextStampNumber { get; set; } = 1;
    public int CanvasBackgroundArgb { get; set; } = Color.White.ToArgb();
}

public sealed class DocumentStore(string root)
{
    public string Root { get; } = Path.GetFullPath(root);
    public string OutputRoot { get; set; } = Path.GetFullPath(root);
    public static string DefaultRoot => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "CaptureWorkbench");
    readonly HashSet<string> allocatedPaths = new(StringComparer.OrdinalIgnoreCase);
    public ImageDocument Create(Bitmap image, bool saveImmediately = true)
    {
        var state = new DocumentState { CanvasBackgroundArgb = image.GetPixel(0, 0).A == 0 ? Color.Transparent.ToArgb() : Color.White.ToArgb() }; state.Title = state.Created.ToString("HH:mm:ss");
        var outputFolder = Path.Combine(OutputRoot, state.Created.ToString("yyyy-MM-dd"));
        state.OutputDirectory = Path.GetFullPath(outputFolder);
        Directory.CreateDirectory(outputFolder);
        for (int sequence = 0; ; sequence++) {
            var name = state.Created.ToString("yyyy-MM-dd HH-mm-ss") + (sequence == 0 ? "" : $" ({sequence + 1})") + ".png";
            var path = Path.Combine(outputFolder, name);
            if (allocatedPaths.Contains(path) || File.Exists(path)) continue;
            try { if (saveImmediately) { using var reserved = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None); } allocatedPaths.Add(path); state.OutputFileName = name; break; }
            catch (IOException) when (File.Exists(Path.Combine(outputFolder, name))) { }
        }
        var document = new ImageDocument(this, state, new Bitmap(image));
        try { document.Commit(image); if (saveImmediately) document.SavePending(); return document; }
        catch { document.Dispose(); throw; }
    }
    public List<string> RecoveryErrors { get; } = [];
    public List<ImageDocument> Restore()
    {
        var docs = new List<ImageDocument>(); RecoveryErrors.Clear();
        var folder = Path.Combine(Root, ".documents"); if (!Directory.Exists(folder)) return docs;
        foreach (var path in Directory.EnumerateFiles(folder, "document.json", SearchOption.AllDirectories))
        {
            try {
                var state = JsonSerializer.Deserialize<DocumentState>(File.ReadAllText(path)) ?? throw new InvalidDataException("無效的文件資料");
                if (!Guid.TryParseExact(state.Id, "N", out _) || Path.GetFileName(Path.GetDirectoryName(path)) != state.Id) throw new InvalidDataException("文件識別碼不符");
                if (state.OutputFileName.Length > 0 && (Path.GetFileName(state.OutputFileName) != state.OutputFileName || state.OutputFileName.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)) throw new InvalidDataException("無效的輸出檔名");
                if (!state.Open) continue;
                if (state.Index < 0 || state.Index >= state.Versions.Count || state.Versions.Any(v => !Guid.TryParseExact(Path.GetFileNameWithoutExtension(v), "N", out _) || Path.GetFileName(v) != v || !v.EndsWith(".png"))) throw new InvalidDataException("無效的歷史版本");
                using var image = new Bitmap(Path.Combine(Path.GetDirectoryName(path)!, state.Versions[state.Index]));
                docs.Add(new(this, state, new Bitmap(image)));
            } catch (Exception e) { RecoveryErrors.Add(Path.GetFileName(Path.GetDirectoryName(path)) + "：" + e.Message); }
        }
        return docs.OrderBy(d => d.State.Created).ToList();
    }
    public static void AtomicPng(Bitmap bitmap, string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try { using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { bitmap.Save(stream, ImageFormat.Png); stream.Flush(true); } File.Move(temp, path, true); }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    public static void AtomicBytes(byte[] data, string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try { using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { stream.Write(data); stream.Flush(true); } File.Move(temp, path, true); }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    public static void AtomicText(string text, string path)
    {
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { using var writer = new StreamWriter(stream, leaveOpen: true); writer.Write(text); writer.Flush(); stream.Flush(true); }
        File.Move(temp, path, true);
    }
}

public sealed class ImageDocument : IDisposable
{
    readonly DocumentStore store;
    readonly Dictionary<string, byte[]> pendingVersions = [];
    DocumentState? savedState;
    byte[]? original;
    public DocumentState State { get; private set; }
    public string Id => State.Id;
    public Bitmap Image { get; private set; }
    public Bitmap BaseImage { get; private set; }
    public IReadOnlyList<ImageMark> Marks { get; private set; }
    public string DirectoryPath => Path.Combine(store.Root, ".documents", Id);
    public string OutputPath => Path.Combine(State.OutputDirectory.Length > 0 ? State.OutputDirectory : Path.Combine(store.Root, State.Created.ToString("yyyy-MM-dd")), State.OutputFileName.Length > 0 ? State.OutputFileName : State.Created.ToString("HH-mm-ss-fff") + "-" + Id[..8] + ".png");
    public bool Pending { get; private set; }
    public event Action? SaveStateChanged;
    public bool CanUndo => State.Index > 0;
    public bool CanRedo => State.Index + 1 < State.Versions.Count;
    public ImageDocument(DocumentStore owner, DocumentState state, Bitmap image) {
        store = owner; State = state; BaseImage = image;
        Marks = state.Versions.Count > 0 && state.Index >= 0 && state.Index < state.Versions.Count && state.MarkHistory.TryGetValue(state.Versions[state.Index], out var marks) ? marks.Select(m => m.Copy()).ToList() : [];
        Image = AnnotationRenderer.Render(BaseImage, Marks);
        if (state.Versions.Count > 0) { if (state.SavedVersion.Length == 0) state.SavedVersion = state.Versions[state.Index]; savedState = CloneState(state); }
    }
    public void Commit(Bitmap image)
    {
        CommitDocument(image, []);
    }
    public void CommitMarks(IEnumerable<ImageMark> marks) => CommitDocument(BaseImage, marks);
    public void CommitDocument(Bitmap background, IEnumerable<ImageMark> marks) {
        var nextBase = new Bitmap(background); var nextMarks = marks.Select(m => m.Copy()).ToList();
        Bitmap rendered; try { rendered = AnnotationRenderer.Render(nextBase, nextMarks); } catch { nextBase.Dispose(); throw; }
        byte[] encoded;
        try { using var buffer = new MemoryStream(); nextBase.Save(buffer, ImageFormat.Png); encoded = buffer.ToArray(); } catch { nextBase.Dispose(); rendered.Dispose(); throw; }
        BaseImage.Dispose(); Image.Dispose(); BaseImage = nextBase; Marks = nextMarks; Image = rendered;
        original ??= State.Versions.Count == 0 ? encoded : null;
        if (State.Index + 1 < State.Versions.Count) State.Versions.RemoveRange(State.Index + 1, State.Versions.Count - State.Index - 1);
        var name = Guid.NewGuid().ToString("N") + ".png";
        State.Versions.Add(name); State.Index = State.Versions.Count - 1;
        pendingVersions[name] = encoded; State.MarkHistory[name] = nextMarks;
        if (State.Versions.Count > 40) { State.Versions.RemoveAt(0); State.Index--; }
        foreach (var removed in pendingVersions.Keys.Where(v => !State.Versions.Contains(v)).ToArray()) pendingVersions.Remove(removed);
        foreach (var removed in State.MarkHistory.Keys.Where(v => !State.Versions.Contains(v)).ToArray()) State.MarkHistory.Remove(removed);
        Pending = true; SaveStateChanged?.Invoke();
    }
    public void SavePending()
    {
        if (!Pending) { Persist(); return; }
        Directory.CreateDirectory(DirectoryPath);
        if (original != null && !File.Exists(Path.Combine(DirectoryPath, "original.png"))) DocumentStore.AtomicBytes(original, Path.Combine(DirectoryPath, "original.png"));
        foreach (var version in pendingVersions) DocumentStore.AtomicBytes(version.Value, Path.Combine(DirectoryPath, version.Key));
        DocumentStore.AtomicPng(Image, OutputPath);
        var nextState = CloneState(State); nextState.SavedVersion = State.Versions[State.Index];
        WriteState(nextState); State.SavedVersion = nextState.SavedVersion; savedState = nextState;
        pendingVersions.Clear(); original = null; Pending = false; SaveStateChanged?.Invoke();
    }
    public void Persist()
    {
        // Persist only saved metadata. Unsaved pixels and undo history remain in memory.
        if (savedState == null) return;
        var state = CloneState(savedState); state.Open = State.Open; state.Zoom = State.Zoom;
        var path = Path.Combine(DirectoryPath, "document.json"); var json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
        if (!File.Exists(path) || File.ReadAllText(path) != json) DocumentStore.AtomicText(json, path);
    }
    public void Undo() { if (CanUndo) MoveHistory(State.Index - 1); }
    public void Redo() { if (CanRedo) MoveHistory(State.Index + 1); }
    void MoveHistory(int index)
    {
        var next = LoadVersion(State.Versions[index]);
        var marks = State.MarkHistory.TryGetValue(State.Versions[index], out var saved) ? saved.Select(m => m.Copy()).ToList() : [];
        var rendered = AnnotationRenderer.Render(next, marks);
        BaseImage.Dispose(); Image.Dispose(); BaseImage = next; Image = rendered; Marks = marks; State.Index = index;
        Pending = State.Versions[index] != State.SavedVersion; SaveStateChanged?.Invoke();
    }
    Bitmap LoadVersion(string name) {
        if (pendingVersions.TryGetValue(name, out var data)) { using var stream = new MemoryStream(data); using var image = new Bitmap(stream); return new Bitmap(image); }
        using var source = new Bitmap(Path.Combine(DirectoryPath, name)); return new Bitmap(source);
    }
    public void DiscardChanges() {
        if (savedState == null) return;
        bool open = State.Open; float zoom = State.Zoom; var state = CloneState(savedState);
        State = state; State.Open = open; State.Zoom = zoom;
        MoveHistory(state.Index); pendingVersions.Clear();
    }
    public void CloseAndSave() {
        SavePending(); bool open = State.Open; State.Open = false;
        try { Persist(); } catch { State.Open = open; throw; }
    }
    static DocumentState CloneState(DocumentState state) => JsonSerializer.Deserialize<DocumentState>(JsonSerializer.Serialize(state))!;
    void WriteState(DocumentState state) => DocumentStore.AtomicText(JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }), Path.Combine(DirectoryPath, "document.json"));
    public void Dispose() { Image.Dispose(); BaseImage.Dispose(); }
}
