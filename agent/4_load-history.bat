@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Sapar Trade: загрузка истории продаж за 400 дней (5-20 минут) ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sapar-1c-agent.ps1" -Backfill 400
echo.
echo Готово.
pause
