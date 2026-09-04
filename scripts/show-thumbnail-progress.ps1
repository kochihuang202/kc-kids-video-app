param(
    [string]$ProgressPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'artifacts\r2-thumbnails\keleduo\progress.json'),
    [int]$WorkerProcessId = 0,
    [int]$RefreshSeconds = 2
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = '小小選片－縮圖處理進度'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(540, 285)
$form.MinimumSize = New-Object System.Drawing.Size(540, 285)
$form.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 11)
$form.TopMost = $true

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Location = New-Object System.Drawing.Point(24, 20)
$titleLabel.Size = New-Object System.Drawing.Size(470, 32)
$titleLabel.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 16, [System.Drawing.FontStyle]::Bold)
$titleLabel.Text = '正在讀取進度…'
$form.Controls.Add($titleLabel)

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Location = New-Object System.Drawing.Point(28, 66)
$progressBar.Size = New-Object System.Drawing.Size(470, 30)
$progressBar.Minimum = 0
$progressBar.Maximum = 100
$form.Controls.Add($progressBar)

$detailLabel = New-Object System.Windows.Forms.Label
$detailLabel.Location = New-Object System.Drawing.Point(28, 108)
$detailLabel.Size = New-Object System.Drawing.Size(470, 64)
$detailLabel.Text = '等待進度檔…'
$form.Controls.Add($detailLabel)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(28, 174)
$statusLabel.Size = New-Object System.Drawing.Size(365, 40)
$statusLabel.Font = New-Object System.Drawing.Font('Microsoft JhengHei UI', 11, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($statusLabel)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Location = New-Object System.Drawing.Point(408, 174)
$closeButton.Size = New-Object System.Drawing.Size(90, 38)
$closeButton.Text = '關閉'
$closeButton.Add_Click({ $form.Close() })
$form.Controls.Add($closeButton)

$script:lastTerminalStatus = ''

function Update-ProgressWindow {
    try {
        if (-not (Test-Path -LiteralPath $ProgressPath)) {
            $titleLabel.Text = '等待縮圖工作開始'
            $statusLabel.Text = '尚未找到 progress.json'
            $statusLabel.ForeColor = [System.Drawing.Color]::DarkOrange
            return
        }

        $progress = Get-Content -Raw -LiteralPath $ProgressPath | ConvertFrom-Json
        $completed = [int]$progress.completedCount
        $total = [Math]::Max([int]$progress.totalCount, 1)
        $percent = [Math]::Min(100, [Math]::Max(0, [Math]::Floor(($completed * 100.0) / $total)))

        $progressBar.Value = $percent
        $titleLabel.Text = "縮圖進度：$completed / $total（$percent%）"
        $updatedAt = [DateTimeOffset]::Parse([string]$progress.updatedAt).ToLocalTime().ToString('yyyy/MM/dd HH:mm:ss')
        $detailLabel.Text = "最後完成：$($progress.lastCompletedId)`r`n最後更新：$updatedAt"

        switch ([string]$progress.status) {
            'completed' {
                $statusLabel.Text = '✓ 已全部完成，可以告訴 Codex 了'
                $statusLabel.ForeColor = [System.Drawing.Color]::ForestGreen
                $form.BackColor = [System.Drawing.Color]::Honeydew
                if ($script:lastTerminalStatus -ne 'completed') {
                    [System.Media.SystemSounds]::Asterisk.Play()
                    $form.Activate()
                }
                $script:lastTerminalStatus = 'completed'
            }
            'failed' {
                $statusLabel.Text = "✕ 發生問題：$($progress.error)"
                $statusLabel.ForeColor = [System.Drawing.Color]::Firebrick
                $form.BackColor = [System.Drawing.Color]::MistyRose
                if ($script:lastTerminalStatus -ne 'failed') {
                    [System.Media.SystemSounds]::Hand.Play()
                    $form.Activate()
                }
                $script:lastTerminalStatus = 'failed'
            }
            default {
                if ($WorkerProcessId -gt 0 -and -not (Get-Process -Id $WorkerProcessId -ErrorAction SilentlyContinue)) {
                    $statusLabel.Text = '⚠ 背景工作已停止，請告訴 Codex'
                    $statusLabel.ForeColor = [System.Drawing.Color]::Firebrick
                    $form.BackColor = [System.Drawing.Color]::MistyRose
                    if ($script:lastTerminalStatus -ne 'stopped') {
                        [System.Media.SystemSounds]::Exclamation.Play()
                        $form.Activate()
                    }
                    $script:lastTerminalStatus = 'stopped'
                } else {
                    $statusLabel.Text = '處理中；這個視窗不會消耗 Codex 用量'
                    $statusLabel.ForeColor = [System.Drawing.Color]::DarkSlateGray
                    $form.BackColor = [System.Drawing.SystemColors]::Control
                    $script:lastTerminalStatus = ''
                }
            }
        }
    } catch {
        $statusLabel.Text = "讀取進度失敗：$($_.Exception.Message)"
        $statusLabel.ForeColor = [System.Drawing.Color]::Firebrick
        $form.BackColor = [System.Drawing.Color]::MistyRose
    }
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = [Math]::Max(1, $RefreshSeconds) * 1000
$timer.Add_Tick({ Update-ProgressWindow })
$form.Add_Shown({
    Update-ProgressWindow
    $timer.Start()
})
$form.Add_FormClosed({ $timer.Stop() })

[void]$form.ShowDialog()
