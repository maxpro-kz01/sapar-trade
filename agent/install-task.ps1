<#
.SYNOPSIS
  Создаёт задание Планировщика Windows «Sapar Trade — синхронизация 1С»: запуск агента каждые 5 минут.
  Запускать от администратора. Задание выполняется от имени указанного пользователя Windows
  (того же, под которым выполнено -SetSecrets), даже когда никто не вошёл в систему.
.EXAMPLE
  .\install-task.ps1 -User "SRV1C\sapar_agent"
#>
param(
  [Parameter(Mandatory)] [string]$User,
  [int]$EveryMinutes = 5,
  [string]$TaskName = 'Sapar Trade — синхронизация 1С'
)
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'sapar-1c-agent.ps1'
if (-not (Test-Path $script)) { throw "Не найден $script" }

$cred = Get-Credential -UserName $User -Message 'Пароль пользователя Windows, от имени которого будет работать агент'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`"" -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Limited -Force | Out-Null
Write-Host "Задание «$TaskName» создано: каждые $EveryMinutes мин от имени $User." -ForegroundColor Green
Write-Host "Проверить: Планировщик заданий → Библиотека → «$TaskName», журнал агента — папка logs\." 
