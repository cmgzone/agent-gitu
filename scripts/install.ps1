$ErrorActionPreference='Stop'
$taskRepo=if($env:AGENT_GITU_RELEASE_REPO){$env:AGENT_GITU_RELEASE_REPO}else{'cmgzone/agent-gitu'}
$taskVersion=$env:AGENT_GITU_VERSION
if(-not $taskVersion){$taskVersion=(Invoke-RestMethod "https://api.github.com/repos/$taskRepo/releases/latest").tag_name.TrimStart('v')}
if($taskVersion -notmatch '^\d+\.\d+\.\d+(?:-[\w.]+)?$'){throw 'Invalid release version.'}
if([Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64'){throw 'The Windows CLI package supports x64.'}
$taskInstall=if($env:AGENT_GITU_INSTALL_DIR){[IO.Path]::GetFullPath($env:AGENT_GITU_INSTALL_DIR)}else{Join-Path $env:LOCALAPPDATA 'AgentGitu\CLI'}
$taskLabel="agent-gitu-$taskVersion-win32-x64"
$taskTemp=Join-Path ([IO.Path]::GetTempPath()) ('gitu-install-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $taskTemp | Out-Null
try {
 $taskArchive=Join-Path $taskTemp ($taskLabel+'.tar.gz')
 $taskBase="https://github.com/$taskRepo/releases/download/v$taskVersion"
 Invoke-WebRequest "$taskBase/$taskLabel.tar.gz" -OutFile $taskArchive
 $taskExpected=(Invoke-WebRequest "$taskBase/$taskLabel.tar.gz.sha256").Content.Split(' ')[0].Trim()
 if((Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskExpected){throw 'Release checksum mismatch.'}
 & tar -xzf $taskArchive -C $taskTemp
 if($LASTEXITCODE -ne 0){throw 'Release extraction failed.'}
 New-Item -ItemType Directory -Path $taskInstall -Force | Out-Null
 $taskDestination=Join-Path $taskInstall $taskLabel
 if(-not(Test-Path -LiteralPath $taskDestination)){Move-Item -LiteralPath (Join-Path $taskTemp $taskLabel) -Destination $taskDestination}
 $taskLauncher=Join-Path $taskInstall 'gitu.cmd'
 [IO.File]::WriteAllText($taskLauncher,"@echo off`r`ncall `"$taskDestination\gitu.cmd`" %*`r`n")
 Write-Output "Installed Agent Gitu $taskVersion. Add $taskInstall to PATH, then run gitu serve. Existing data was preserved."
} finally {
 $taskResolved=[IO.Path]::GetFullPath($taskTemp)
 if($taskResolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($taskResolved).StartsWith('gitu-install-')){Remove-Item -LiteralPath $taskResolved -Recurse -Force}
}
