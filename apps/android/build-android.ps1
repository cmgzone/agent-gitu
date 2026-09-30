$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Test-Path -LiteralPath 'node_modules')) {
  & npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
& npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Mobile typecheck failed.' }
& npx.cmd expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) { throw 'Android project generation failed.' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$androidStudioJava = 'C:\Program Files\Android\Android Studio\jbr'
if (-not $env:JAVA_HOME -and (Test-Path -LiteralPath $androidStudioJava)) { $env:JAVA_HOME = $androidStudioJava }
$env:NODE_ENV = 'production'
$gituGradleOptions = @('assembleRelease', '-PreactNativeArchitectures=arm64-v8a,x86_64', '--no-daemon', '--max-workers=2')
$gituHashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
try { $gituPathHash = [BitConverter]::ToString($gituHashAlgorithm.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($PSScriptRoot))).Replace('-', '').Substring(0, 8) } finally { $gituHashAlgorithm.Dispose() }
$gituCxxDirectory = Join-Path $env:LOCALAPPDATA "GituCxx\$gituPathHash"
New-Item -ItemType Directory -Force -Path $gituCxxDirectory | Out-Null
$gituGradleOptions += "-Pgitu.cxxDirectory=$gituCxxDirectory"
$gituNdkRoot = Join-Path $env:ANDROID_HOME 'ndk'
if (-not (Test-Path -LiteralPath (Join-Path $gituNdkRoot '27.1.12297006'))) {
  $gituInstalledNdk = Get-ChildItem -LiteralPath $gituNdkRoot -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '27.*' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'source.properties')) } | Sort-Object Name -Descending | Select-Object -First 1
  if ($gituInstalledNdk) { $gituGradleOptions += "-Pgitu.ndkVersion=$($gituInstalledNdk.Name)" }
}
Push-Location -LiteralPath (Join-Path $PSScriptRoot 'android')
try {
  & .\gradlew.bat @gituGradleOptions
  if ($LASTEXITCODE -ne 0) { throw 'Android APK build failed.' }
} finally { Pop-Location }
$releaseDirectory = Join-Path $PSScriptRoot '..\..\release'
New-Item -ItemType Directory -Force -Path $releaseDirectory | Out-Null
$gituAppVersion = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
$gituApkName = "Agent-Gitu-Android-$gituAppVersion.apk"
Copy-Item -LiteralPath 'android\app\build\outputs\apk\release\app-release.apk' -Destination (Join-Path $releaseDirectory $gituApkName)
Write-Output "Android APK is ready in release/$gituApkName"
