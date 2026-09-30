param([int]$Port = 8421)
$ErrorActionPreference = 'Stop'
Write-Output 'Close the Agent Gitu desktop app before starting this server to avoid running scheduled jobs twice.'
$repository = Split-Path -Parent $PSScriptRoot
$compiledCli = Join-Path $repository 'dist\cli.js'
Write-Output 'Building the current mobile server...'
Push-Location -LiteralPath $repository
try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Server build failed.' } } finally { Pop-Location }
$mobileDirectory = Join-Path $env:LOCALAPPDATA 'AgentGitu'
New-Item -ItemType Directory -Force -Path $mobileDirectory | Out-Null
$accessKeyFile = Join-Path $mobileDirectory 'mobile-access.key'
if (-not (Test-Path -LiteralPath $accessKeyFile)) {
  $random = New-Object byte[] 32
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($random) } finally { $generator.Dispose() }
  $newAccessKey = [BitConverter]::ToString($random).Replace('-', '').ToLowerInvariant()
  [System.IO.File]::WriteAllText($accessKeyFile, $newAccessKey)
}
$env:AGENT_GITU_ACCESS_KEY = (Get-Content -LiteralPath $accessKeyFile -Raw).Trim()
Write-Output "Mobile access key: $accessKeyFile"
Write-Output 'Open that file and enter its value in the phone app.'
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { Write-Output "Phone server address: http://$($_.IPAddress):$Port" }
Write-Output 'Keep this terminal open while using the phone app.'
Push-Location -LiteralPath $repository
try { & node $compiledCli serve --host 0.0.0.0 --port $Port } finally { Pop-Location }
