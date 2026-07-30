param(
    [string]$EnvironmentId = "activity-book-web-d7djhe7bb1e834",
    [string]$ServiceName = "plutonoc-studio"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stageRoot = Join-Path $projectRoot "work\cloudbase-admin"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$strictUtf8 = New-Object System.Text.UTF8Encoding($false, $true)

New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null

$adminSource = Join-Path $projectRoot "admin.html"
Copy-Item -LiteralPath $adminSource -Destination (Join-Path $stageRoot "index.html") -Force
Copy-Item -LiteralPath $adminSource -Destination (Join-Path $stageRoot "admin.html") -Force

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

function Test-AdminHtml {
    param([Parameter(Mandatory = $true)][string]$Path)

    $html = [System.IO.File]::ReadAllText($Path, $strictUtf8)
    foreach ($marker in @("摄影作品", "动态影像", "新增作品", "保存并发布")) {
        if (-not $html.Contains($marker)) {
            throw "Admin UTF-8 verification failed for $Path (missing: $marker)"
        }
    }
    if ($html -match "锟斤拷|鎽勫奖|鍔ㄦ|姝ｅ湪|鏂板|绔欏") {
        throw "Admin mojibake detected in $Path"
    }
    if ($html -match "(?<!<)/(button|small|figcaption)>") {
        throw "Admin closing-tag text leakage detected in $Path"
    }
}

function Assert-SameFile {
    param(
        [Parameter(Mandatory = $true)][string]$Expected,
        [Parameter(Mandatory = $true)][string]$Actual
    )

    $expectedHash = (Get-FileHash -LiteralPath $Expected -Algorithm SHA256).Hash
    $actualHash = (Get-FileHash -LiteralPath $Actual -Algorithm SHA256).Hash
    if ($expectedHash -ne $actualHash) {
        throw "Admin file changed during staging: $Actual"
    }
}

Test-AdminHtml -Path $adminSource
Test-AdminHtml -Path (Join-Path $stageRoot "index.html")
Assert-SameFile -Expected $adminSource -Actual (Join-Path $stageRoot "index.html")
Assert-SameFile -Expected $adminSource -Actual (Join-Path $stageRoot "admin.html")

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
Test-AdminHtml -Path (Join-Path $distRoot "index.html")
Assert-SameFile -Expected $adminSource -Actual (Join-Path $distRoot "index.html")
Assert-SameFile -Expected $adminSource -Actual (Join-Path $distRoot "admin.html")

npx --yes --package "@cloudbase/cli@3.6.3" tcb hosting deploy $distRoot "/" `
    -e $EnvironmentId `
    --concurrency 5 `
    --retry-count 5 `
    --retry-interval 2000
if ($LASTEXITCODE -ne 0) {
    throw "CloudBase admin upload failed with exit code $LASTEXITCODE"
}
