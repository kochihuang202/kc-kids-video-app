$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function New-AppIcon([int]$Size, [string]$Path) {
  $bitmap = [Drawing.Bitmap]::new($Size, $Size)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([Drawing.ColorTranslator]::FromHtml("#f7f3e8"))
    $margin = [int]($Size * 0.15)
    $inner = $Size - (2 * $margin)
    $green = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml("#557664"))
    $paper = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml("#fffdf8"))
    $coral = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml("#e67c66"))
    try {
      $graphics.FillEllipse($green, $margin, $margin, $inner, $inner)
      $bookX = [int]($Size * 0.31)
      $bookY = [int]($Size * 0.30)
      $bookW = [int]($Size * 0.38)
      $bookH = [int]($Size * 0.40)
      $graphics.FillRectangle($paper, $bookX, $bookY, $bookW, $bookH)
      $points = [Drawing.Point[]]@(
        [Drawing.Point]::new([int]($Size * 0.45), [int]($Size * 0.40)),
        [Drawing.Point]::new([int]($Size * 0.64), [int]($Size * 0.50)),
        [Drawing.Point]::new([int]($Size * 0.45), [int]($Size * 0.60))
      )
      $graphics.FillPolygon($coral, $points)
    } finally {
      $green.Dispose(); $paper.Dispose(); $coral.Dispose()
    }
    $bitmap.Save($Path, [Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose(); $bitmap.Dispose()
  }
}

New-AppIcon 180 (Join-Path $PSScriptRoot "..\public\apple-touch-icon.png")
New-AppIcon 512 (Join-Path $PSScriptRoot "..\public\icon-512.png")
