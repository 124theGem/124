param([ValidatePattern('^[A-Za-z0-9._-]+$')][string]$Distro = 'Ubuntu')
$ErrorActionPreference = 'Stop'
# Run as your regular Windows user after Ubuntu setup and bot pairing.
& wsl.exe -d $Distro --exec /bin/bash -lc 'test -f ~/.local/share/home-codex/run.sh'
if ($LASTEXITCODE -ne 0) { throw 'Сначала выполни установку и настройку в Ubuntu.' }
$action = New-ScheduledTaskAction -Execute 'wsl.exe' -Argument "-d $Distro --exec /bin/bash -lc `"exec ~/.local/share/home-codex/run.sh`""
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'HomeCodexTelegram' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Личный Telegram → Codex в WSL, под текущим пользователем.' -Force | Out-Null
Write-Host 'Автозапуск создан для текущего пользователя Windows. Чтобы запустить сейчас:'
Write-Host 'Start-ScheduledTask -TaskName HomeCodexTelegram'
Write-Host 'Чтобы остановить: Stop-ScheduledTask -TaskName HomeCodexTelegram'
Write-Host 'Чтобы удалить автозапуск: Unregister-ScheduledTask -TaskName HomeCodexTelegram'
