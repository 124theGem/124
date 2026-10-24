param([ValidatePattern('^[A-Za-z0-9._-]+$')][string]$Distro = 'Ubuntu')
$ErrorActionPreference = 'Stop'
# ASCII-only source: Windows PowerShell 5.1 reads BOM-less files as ANSI.
# Run as the same Windows user who configured Ubuntu and paired the bot.
$wslPath = Join-Path $env:WINDIR 'System32\wsl.exe'
& $wslPath -d $Distro --exec /bin/bash -lc 'test -f ~/.local/share/home-codex/run.sh'
if ($LASTEXITCODE -ne 0) { throw 'Complete the Ubuntu installation and bot setup first.' }
$linuxCommand = 'exec ~/.local/share/home-codex/run.sh >> ~/.local/share/home-codex/bridge.log 2>&1'
$action = New-ScheduledTaskAction -Execute $wslPath -Argument "-d $Distro --exec /bin/bash -lc `"$linuxCommand`""
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'HomeCodexTelegram' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Private Telegram to Codex in WSL, current user only.' -Force | Out-Null
Start-ScheduledTask -TaskName 'HomeCodexTelegram'
Write-Host 'Startup task registered and launch requested for the current user.'
Write-Host 'Start now: Start-ScheduledTask -TaskName HomeCodexTelegram'
Write-Host 'Stop: Stop-ScheduledTask -TaskName HomeCodexTelegram'
Write-Host 'Remove: Unregister-ScheduledTask -TaskName HomeCodexTelegram'
