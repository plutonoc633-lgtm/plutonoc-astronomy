param(
    [string]$EnvironmentId = "activity-book-web-d7djhe7bb1e834",
    [string]$ServiceName = "plutonoc-studio"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stageRoot = Join-Path $projectRoot "work\cloudbase-admin"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

$adminHtml = Get-Content -LiteralPath (Join-Path $projectRoot "admin.html") -Raw
[System.IO.File]::WriteAllText((Join-Path $stageRoot "index.html"), $adminHtml, $utf8NoBom)
[System.IO.File]::WriteAllText((Join-Path $stageRoot "admin.html"), $adminHtml, $utf8NoBom)

foreach ($asset in @("admin.css", "admin.js", "cloudbase-config.js")) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $asset) -Destination (Join-Path $stageRoot $asset) -Force
}

Push-Location $projectRoot
try {
    npx --yes --package "@cloudbase/cli@3.6.3" tcb app deploy $ServiceName `
        -e $EnvironmentId `
        --framework static `
        --cwd $stageRoot `
        --output-dir "./" `
        --deploy-path "/" `
        --force `
        --yes
}
finally {
    Pop-Location
}
