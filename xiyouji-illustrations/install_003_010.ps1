param([Parameter(Mandatory)][string]$Stage)
$ErrorActionPreference = 'Stop'
$site = 'C:\Users\ji3cp\Documents\xiyouji-reader'
$engine = 'C:\Users\ji3cp\Documents\FXN-Antigravity'
$pages = @(3..10 | ForEach-Object { '{0:000}.html' -f $_ })
$files = @(Get-ChildItem -LiteralPath (Join-Path $Stage images) -Filter '*.jpg')
if ($files.Count -ne 56) { throw 'Expected 56 illustrations' }
foreach ($file in $files) {
    $target = Join-Path $site "images\$($file.Name)"
    if ((Test-Path -LiteralPath $target) -and
        (Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $file.FullName).Hash) {
        throw "Image already exists with different content: $target"
    }
}
foreach ($page in $pages) {
    $original = [IO.File]::ReadAllText((Join-Path $site "episodes\$page"))
    $updated = [IO.File]::ReadAllText((Join-Path $Stage "episodes\$page"))
    $pattern = '(?s)\n<figure class="story-picture" data-section-illustration="\d+">\n.*?</figure>\n'
    if ([regex]::Matches($updated, $pattern).Count -ne 7 -or
        ($original -cne $updated -and $original -cne [regex]::Replace($updated, $pattern, ''))) {
        throw "Unexpected changes in $page"
    }
}
foreach ($file in $files) {
    Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $site images)
    Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $PSScriptRoot images)
}
foreach ($page in $pages) {
    $source = Join-Path $Stage "episodes\$page"
    Copy-Item -LiteralPath $source -Destination (Join-Path $site episodes)
    Copy-Item -LiteralPath $source -Destination (Join-Path $PSScriptRoot pages)
}
$manifest = Join-Path $Stage illustrations.json
Copy-Item -LiteralPath $manifest -Destination $engine
Copy-Item -LiteralPath $manifest -Destination $PSScriptRoot
