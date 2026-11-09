"""Собирает самораспаковывающийся файл обновления агента 1С: agent-update.bat.

Файл кладут в папку агента на сервере 1С и запускают двойным щелчком. Он обновляет скрипт, запросы и ярлыки,
НЕ трогая config.json, secrets.dat, state.json и logs, затем сразу отправляет новые данные на сервер.
Запуск: python3 tools/make_agent_update.py [путь_к_bat]
"""
import base64, io, os, sys, textwrap, zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "agent")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), "agent-update.bat")
FILES = ["sapar-1c-agent.ps1", "install-task.ps1", "README.md", "config.example.json",
         "1_save-password.bat", "2_check-1c.bat", "3_send-now.bat", "4_load-history.bat", "5_check-orders.bat", "6_autostart.bat"]

buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    for f in FILES:
        z.write(os.path.join(ROOT, f), f)
    qdir = os.path.join(ROOT, "queries")
    for f in sorted(os.listdir(qdir)):
        if f.endswith(".1c"):
            z.write(os.path.join(qdir, f), "queries/" + f)
payload = "\r\n".join(textwrap.wrap(base64.b64encode(buf.getvalue()).decode(), 76))

ps = ("$ErrorActionPreference='Stop'; $t=[IO.File]::ReadAllText('%~f0'); $i=$t.LastIndexOf('::DATA::'); "
      "$b=[Convert]::FromBase64String(($t.Substring($i+8) -replace '\\s','')); $root='%~dp0'; "
      "$z=Join-Path ([IO.Path]::GetTempPath()) 'st-agent-update.zip'; [IO.File]::WriteAllBytes($z,$b); "
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; $a=[IO.Compression.ZipFile]::OpenRead($z); "
      "try { foreach($e in $a.Entries){ if($e.Name){ $dst=Join-Path $root ($e.FullName -replace '/','\\'); "
      "New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null; "
      "[IO.Compression.ZipFileExtensions]::ExtractToFile($e,$dst,$true); Write-Host '  обновлён' $e.FullName } } } "
      "finally { $a.Dispose(); Remove-Item $z }")
bat = "\r\n".join([
    "@echo off",
    "chcp 65001 >nul",
    "rem Sapar Trade: обновление агента 1С. Положите файл в папку агента (рядом с sapar-1c-agent.ps1) и запустите.",
    "rem config.json, secrets.dat, state.json и логи не меняются.",
    "cd /d \"%~dp0\"",
    "if not exist \"%~dp0sapar-1c-agent.ps1\" (",
    "  echo Этот файл нужно положить в папку агента, рядом с sapar-1c-agent.ps1",
    "  pause",
    "  exit /b 1",
    ")",
    "echo === Sapar Trade: обновление агента ===",
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "' + ps + '"',
    "if errorlevel 1 (",
    "  echo Обновить не получилось. Сфотографируйте экран и отправьте разработчику.",
    "  pause",
    "  exit /b 1",
    ")",
    "echo.",
    "echo === Отправка новых данных (ТП клиентов, деньги, долги) ===",
    'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sapar-1c-agent.ps1" -Only "clients,client_agents,debts,cash,cf_articles,cashflow"',
    "echo.",
    "echo Готово. Агент обновлён. Сообщите разработчику.",
    "pause",
    "exit /b",
    "::DATA::",
    payload, ""])
with open(OUT, "w", encoding="utf-8", newline="") as f:
    f.write(bat)
print(OUT, len(bat), "байт")
