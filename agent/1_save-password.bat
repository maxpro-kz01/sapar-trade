@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist config.json copy config.example.json config.json >nul
echo.
echo === Sapar Trade: сохранение пароля 1С ===
echo Запускайте под тем пользователем Windows, от имени которого будет работать агент.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sapar-1c-agent.ps1" -SetSecrets
echo.
pause
