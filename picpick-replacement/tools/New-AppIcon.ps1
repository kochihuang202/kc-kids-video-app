Add-Type -AssemblyName System.Drawing
$assetFolder = Join-Path $PSScriptRoot '..\Assets'
New-Item -ItemType Directory -Path $assetFolder -Force | Out-Null
$frames = @()
foreach ($iconSize in @(16, 20, 24, 32, 48, 64, 128, 256)) {
    $bitmap = [System.Drawing.Bitmap]::new($iconSize, $iconSize)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform($iconSize / 64.0, $iconSize / 64.0)
    $tile = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $tile.AddArc(2, 2, 20, 20, 180, 90); $tile.AddArc(42, 2, 20, 20, 270, 90)
    $tile.AddArc(42, 42, 20, 20, 0, 90); $tile.AddArc(2, 42, 20, 20, 90, 90); $tile.CloseFigure()
    $fill = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Rectangle]::new(2, 2, 60, 60), [System.Drawing.Color]::FromArgb(35, 139, 216), [System.Drawing.Color]::FromArgb(19, 83, 157), 90.0)
    $graphics.FillPath($fill, $tile)
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 4)
    foreach ($lines in @(@(14, 27, 14, 15, 27, 15), @(37, 15, 50, 15, 50, 27), @(50, 37, 50, 49, 37, 49), @(27, 49, 14, 49, 14, 37))) {
        $graphics.DrawLine($pen, $lines[0], $lines[1], $lines[2], $lines[3]); $graphics.DrawLine($pen, $lines[2], $lines[3], $lines[4], $lines[5])
    }
    $dot = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(91, 231, 184)); $graphics.FillEllipse($dot, 26, 26, 12, 12)
    $buffer = [System.IO.MemoryStream]::new(); $bitmap.Save($buffer, [System.Drawing.Imaging.ImageFormat]::Png)
    $frames += @{ Size = $iconSize; Data = $buffer.ToArray() }
    $buffer.Dispose(); $dot.Dispose(); $pen.Dispose(); $fill.Dispose(); $tile.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$file = [System.IO.File]::Create((Join-Path $assetFolder 'App.ico'))
$writer = [System.IO.BinaryWriter]::new($file)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    foreach ($frame in $frames) {
        $side = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
        $writer.Write([byte]$side); $writer.Write([byte]$side); $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$frame.Data.Length); $writer.Write([uint32]$offset)
        $offset += $frame.Data.Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Data) }
} finally { $writer.Dispose(); $file.Dispose() }
