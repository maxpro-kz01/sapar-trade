@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist config.json copy config.example.json config.json >nul
echo.
echo === Sapar Trade: проверка подключения к 1С ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sapar-1c-agent.ps1" -Test
if errorlevel 1 goto end
echo.
echo === Диагностика базы (1-3 минуты) ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sapar-1c-agent.ps1" -Probe
echo.
echo Отправьте разработчику файл probe-....txt из этой папки.
explorer "%~dp0"
:end
pause
