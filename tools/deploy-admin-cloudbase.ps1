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

$buildScript = @'
const fs = require("fs");
const path = require("path");
const output = path.join(process.cwd(), "dist");
fs.mkdirSync(output, { recursive: true });
for (const file of ["index.html", "admin.html", "admin.css", "admin.js", "cloudbase-config.js"]) {
  fs.copyFileSync(path.join(process.cwd(), file), path.join(output, file));
}
'@
[System.IO.File]::WriteAllText((Join-Path $stageRoot "build-static.cjs"), $buildScript, $utf8NoBom)
$packageJson = @'
{
  "name": "plutonoc-studio-static",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "node build-static.cjs"
  },
  "engines": {
    "node": ">=20"
  }
}
'@
[System.IO.File]::WriteAllText((Join-Path $stageRoot "package.json"), $packageJson, $utf8NoBom)

Push-Location $stageRoot
try {
    node build-static.cjs
    if ($LASTEXITCODE -ne 0) {
        throw "Admin static build failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

$distRoot = Join-Path $stageRoot "dist"
npx --yes --package "@cloudbase/cli@3.6.3" tcb hosting deploy $distRoot "/" `
    -e $EnvironmentId `
    --concurrency 5 `
    --retry-count 5 `
    --retry-interval 2000
if ($LASTEXITCODE -ne 0) {
    throw "CloudBase admin upload failed with exit code $LASTEXITCODE"
}
