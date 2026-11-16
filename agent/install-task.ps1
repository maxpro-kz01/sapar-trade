<#
.SYNOPSIS
  Создаёт задание Планировщика Windows «Sapar Trade — синхронизация 1С»: запуск агента каждые 5 минут.
  Если запущен без прав администратора — сам перезапускается от администратора в окне, которое не закрывается.
  Задание выполняется от имени пользователя Windows, который запустил скрипт (того же, под которым сохранён
  пароль 1С — 1_save-password.bat), даже когда никто не вошёл в систему. Спрашивается только пароль Windows.
.EXAMPLE
  .\install-task.ps1
  .\install-task.ps1 -User "SRV1C\sapar_agent"
#>
param(
  [string]$User = "$env:USERDOMAIN\$env:USERNAME",
  [int]$EveryMinutes = 5,
  [string]$TaskName = 'Sapar Trade — синхронизация 1С'
)
$ErrorActionPreference = 'Stop'

# Нет прав администратора — перезапуск от администратора. Пользователь берётся ДО перезапуска,
# иначе задание создастся от имени администратора, и агент не сможет прочитать сохранённый пароль 1С.
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host 'Нужны права администратора — подтвердите в появившемся окне Windows.' -ForegroundColor Yellow
  Start-Process powershell.exe -Verb RunAs -ArgumentList @(
    '-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-User', "`"$User`"")
  return
}
Write-Host "Пользователь Windows: $User — введите его пароль (пароль входа в Windows, не 1С)." -ForegroundColor Cyan
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
