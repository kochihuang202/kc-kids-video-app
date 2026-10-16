using CaptureWorkbench;

sealed class ReplayScrollSurface(Bitmap first, Bitmap next, int stopAfter = int.MaxValue) : IScrollSurface
{
    int captures, wheels;
    public Bitmap Capture(Rectangle region) => new(captures++ == 0 ? first : next);
    public void Prepare(Rectangle region) { }
    public void Scroll(Rectangle region) => wheels++;
    public bool StopRequested => wheels >= stopAfter;
    public Task Delay(int milliseconds) => Task.CompletedTask;
}
