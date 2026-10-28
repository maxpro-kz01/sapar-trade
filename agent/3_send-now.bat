@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Sapar Trade: отправка данных из 1С на сервер ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sapar-1c-agent.ps1" -Only "warehouses,products,clients,prices,stock,debts,sales,cost"
echo.
echo Готово. Откройте в приложении: Интеграция 1С.
pause
