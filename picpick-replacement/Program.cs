using System.IO.Pipes;
using System.Text.Json;

namespace CaptureWorkbench;

internal static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        StartupLog.Record($"開始啟動 ({(args.Contains("--tray") ? "--tray" : "手動")})：{Environment.ProcessPath}");
        using var mutex = new Mutex(true, "Local\\CaptureWorkbench-Desktop", out bool first);
        if (!first) {
            StartupLog.Record("已有執行中的工作台，轉送開啟要求");
            try { using var pipe = new NamedPipeClientStream(".", "CaptureWorkbench-open", PipeDirection.Out, PipeOptions.CurrentUserOnly); pipe.Connect(2000); using var writer = new StreamWriter(pipe); writer.WriteLine(JsonSerializer.Serialize(args)); }
            catch { MessageBox.Show("截圖工作台正在啟動或忙碌中，請從工作列開啟。", "截圖工作台"); }
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.ThreadException += (_, e) => MessageBox.Show(e.Exception.Message, "操作未完成", MessageBoxButtons.OK, MessageBoxIcon.Error);
        try { Application.Run(new WorkbenchForm(args)); }
        catch (Exception error) { StartupLog.Record("啟動失敗：" + error); MessageBox.Show("截圖工作台啟動失敗：\n" + error.Message + "\n\n詳細資訊已記錄於 " + Path.Combine(DocumentStore.DefaultRoot, "startup.log"), "啟動失敗", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}
