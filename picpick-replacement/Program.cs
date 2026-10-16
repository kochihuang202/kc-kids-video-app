using System.IO.Pipes;
using System.Text.Json;

namespace CaptureWorkbench;

internal static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        using var mutex = new Mutex(true, "Local\\CaptureWorkbench-Desktop", out bool first);
        if (!first) {
            try { using var pipe = new NamedPipeClientStream(".", "CaptureWorkbench-open", PipeDirection.Out, PipeOptions.CurrentUserOnly); pipe.Connect(2000); using var writer = new StreamWriter(pipe); writer.WriteLine(JsonSerializer.Serialize(args)); }
            catch { MessageBox.Show("截圖工作台正在啟動或忙碌中，請從工作列開啟。", "截圖工作台"); }
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.ThreadException += (_, e) => MessageBox.Show(e.Exception.Message, "操作未完成", MessageBoxButtons.OK, MessageBoxIcon.Error);
        Application.Run(new WorkbenchForm(args));
    }
}
