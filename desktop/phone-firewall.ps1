param(
  [Parameter(Mandatory = $true)][string]$ProgramPath,
  [Parameter(Mandatory = $true)][ValidateRange(1, 65535)][int]$Port
)
$ErrorActionPreference = 'Stop'
try {
  $applicationPath = (Resolve-Path -LiteralPath $ProgramPath).Path
  if ([IO.Path]::GetExtension($applicationPath) -ne '.exe') { throw 'An application executable is required.' }
  $ruleName = 'AgentGitu-Phone-' + ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($applicationPath.ToLowerInvariant())) -replace '[^a-zA-Z0-9]', '')
  $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
  if ($existing) {
    Set-NetFirewallRule -Name $ruleName -Enabled True -Direction Inbound -Action Allow -Profile Any -Program $applicationPath -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet | Out-Null
  } else {
    New-NetFirewallRule -Name $ruleName -DisplayName 'Agent Gitu phone access (local subnet)' -Enabled True -Direction Inbound -Action Allow -Profile Any -Program $applicationPath -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet | Out-Null
  }
  exit 0
} catch { exit 1 }
