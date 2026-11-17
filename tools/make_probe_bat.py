"""Собирает самораспаковывающийся bat для диагностики 1С: кладёт выбранные запросы agent/queries/probe/<маска>
в папку queries\\probe агента (старые диагностические запросы убирает) и запускает 2_check-1c.bat.
Запуск: python3 tools/make_probe_bat.py "5*.1c" /tmp/out/7_debt-check.bat
"""
import base64, fnmatch, io, os, sys, textwrap, zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "agent", "queries", "probe")
mask, out = sys.argv[1], sys.argv[2]
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    names = sorted(f for f in os.listdir(ROOT) if fnmatch.fnmatch(f, mask))
    assert names, "нет файлов по маске " + mask
    for f in names:
        z.write(os.path.join(ROOT, f), f)
payload = "\r\n".join(textwrap.wrap(base64.b64encode(buf.getvalue()).decode(), 76))
ps = ("$ErrorActionPreference='Stop'; $t=[IO.File]::ReadAllText('%~f0'); $i=$t.LastIndexOf('::DATA::'); "
      "$b=[Convert]::FromBase64String(($t.Substring($i+8) -replace '\\s','')); "
      "$d=Join-Path '%~dp0' 'queries\\probe'; New-Item -ItemType Directory -Force $d | Out-Null; "
      "Get-ChildItem $d -Recurse -Filter *.1c | Remove-Item -Force; "
      "$z=Join-Path ([IO.Path]::GetTempPath()) 'st-probe.zip'; [IO.File]::WriteAllBytes($z,$b); "
      "Add-Type -AssemblyName System.IO.Compression.FileSystem; $a=[IO.Compression.ZipFile]::OpenRead($z); "
      "foreach($e in $a.Entries){ if($e.Name){ [IO.Compression.ZipFileExtensions]::ExtractToFile($e,(Join-Path $d $e.Name),$true) } }; "
      "$a.Dispose(); Remove-Item $z; Get-ChildItem $d | ForEach-Object { Write-Host '  ' $_.Name }")
bat = "\r\n".join([
    "@echo off", "chcp 65001 >nul",
    "rem Sapar Trade: диагностика 1С (только чтение). Положите в папку агента рядом с sapar-1c-agent.ps1 и запустите.",
    "cd /d \"%~dp0\"",
    "if not exist \"%~dp0sapar-1c-agent.ps1\" (", "  echo Этот файл нужно положить в папку агента, рядом с sapar-1c-agent.ps1", "  pause", "  exit /b 1", ")",
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "' + ps + '"',
    "if errorlevel 1 (", "  echo Не получилось положить запросы. Сфотографируйте экран и отправьте разработчику.", "  pause", "  exit /b 1", ")",
    "echo.", "call \"%~dp02_check-1c.bat\"", "exit /b", "::DATA::", payload, ""])
open(out, "w", encoding="utf-8", newline="").write(bat)
print(out, names)
