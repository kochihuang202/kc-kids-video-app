param([Parameter(Mandatory)][string]$Stage, [int]$First = 3, [int]$Last = 10)
$ErrorActionPreference = 'Stop'
$site = 'C:\Users\ji3cp\Documents\xiyouji-reader'
$engine = 'C:\Users\ji3cp\Documents\FXN-Antigravity'
$pages = @($First..$Last | ForEach-Object { '{0:000}.html' -f $_ })
$files = @(Get-ChildItem -LiteralPath (Join-Path $Stage images) -Filter '*.jpg')
if ($files.Count -ne 7 * $pages.Count) { throw 'Expected seven illustrations per episode' }
$compiler = Join-Path $engine 'compile_all_remaining_episodes.py'
$compilerText = [IO.File]::ReadAllText($compiler)
$renderLine = '    full_html = render_unified_page(ep_num, ep_title, heading_ruby, body_inner_html, compiled_glossary)'
$hook = '    full_html = apply_section_illustrations(ep_num, full_html)'
if ($Last -ge 11 -and !$compilerText.Contains($hook)) {
    $importLine = 'from episodes_headings_data import EPISODE_7_SECTIONS'
    foreach ($anchor in @($renderLine, $importLine)) {
        if ([regex]::Matches($compilerText, [regex]::Escape($anchor)).Count -ne 1) {
            throw "Unexpected compiler source at $anchor"
        }
    }
    $compilerText = $compilerText.Replace($importLine, "$importLine`nfrom section_illustrations import apply_section_illustrations")
    $compilerText = $compilerText.Replace($renderLine, "$renderLine`n$hook")
}
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
if ($Last -ge 11 -and $compilerText -cne [IO.File]::ReadAllText($compiler)) {
    [IO.File]::WriteAllText($compiler, $compilerText)
}
