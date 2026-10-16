using System.Drawing.Imaging;
using System.Text.Json;

namespace CaptureWorkbench;

public sealed class DocumentState
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Title { get; set; } = "截圖";
    public DateTime Created { get; set; } = DateTime.Now;
    public string OutputFileName { get; set; } = "";
    public List<string> Versions { get; set; } = [];
    public int Index { get; set; }
    public bool Open { get; set; } = true;
    public float Zoom { get; set; } = 1;
}

public sealed class DocumentStore(string root)
{
    public string Root { get; } = Path.GetFullPath(root);
    public static string DefaultRoot => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "CaptureWorkbench");
    public ImageDocument Create(Bitmap image)
    {
        var state = new DocumentState { Title = DateTime.Now.ToString("HH:mm:ss 截圖") };
        var outputFolder = Path.Combine(Root, state.Created.ToString("yyyy-MM-dd"));
        Directory.CreateDirectory(outputFolder);
        for (int sequence = 0; ; sequence++) {
            var name = state.Created.ToString("yyyy-MM-dd HH-mm-ss") + (sequence == 0 ? "" : $" ({sequence + 1})") + ".png";
            try { using var reserved = new FileStream(Path.Combine(outputFolder, name), FileMode.CreateNew, FileAccess.Write, FileShare.None); state.OutputFileName = name; break; }
            catch (IOException) when (File.Exists(Path.Combine(outputFolder, name))) { }
        }
        var document = new ImageDocument(this, state, new Bitmap(image));
        try { Directory.CreateDirectory(document.DirectoryPath); AtomicPng(image, Path.Combine(document.DirectoryPath, "original.png")); document.Commit(image); return document; }
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
        using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { bitmap.Save(stream, ImageFormat.Png); stream.Flush(true); }
        File.Move(temp, path, true);
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
    public DocumentState State { get; }
    public string Id => State.Id;
    public Bitmap Image { get; private set; }
    public string DirectoryPath => Path.Combine(store.Root, ".documents", Id);
    public string OutputPath => Path.Combine(store.Root, State.Created.ToString("yyyy-MM-dd"), State.OutputFileName.Length > 0 ? State.OutputFileName : State.Created.ToString("HH-mm-ss-fff") + "-" + Id[..8] + ".png");
    public bool Pending { get; private set; }
    public bool CanUndo => State.Index > 0;
    public bool CanRedo => State.Index + 1 < State.Versions.Count;
    public ImageDocument(DocumentStore owner, DocumentState state, Bitmap image) { store = owner; State = state; Image = image; }
    public void Commit(Bitmap image)
    {
        var copy = new Bitmap(image); Image.Dispose(); Image = copy; Pending = true;
        SavePending();
    }
    public void SavePending()
    {
        if (Pending) {
            var name = Guid.NewGuid().ToString("N") + ".png";
            DocumentStore.AtomicPng(Image, Path.Combine(DirectoryPath, name));
            if (State.Index + 1 < State.Versions.Count) State.Versions.RemoveRange(State.Index + 1, State.Versions.Count - State.Index - 1);
            State.Versions.Add(name); State.Index = State.Versions.Count - 1;
            if (State.Versions.Count > 40) { State.Versions.RemoveAt(0); State.Index--; }
        }
        Persist(); Pending = false;
    }
    public void Persist()
    {
        DocumentStore.AtomicPng(Image, OutputPath);
        DocumentStore.AtomicText(JsonSerializer.Serialize(State, new JsonSerializerOptions { WriteIndented = true }), Path.Combine(DirectoryPath, "document.json"));
    }
    public void Undo() { if (CanUndo) MoveHistory(State.Index - 1); }
    public void Redo() { if (CanRedo) MoveHistory(State.Index + 1); }
    void MoveHistory(int index)
    {
        using var source = new Bitmap(Path.Combine(DirectoryPath, State.Versions[index]));
        var next = new Bitmap(source); Image.Dispose(); Image = next; State.Index = index; Pending = true;
        Persist(); Pending = false;
    }
    public void Dispose() => Image.Dispose();
}
