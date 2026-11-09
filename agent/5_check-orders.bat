@echo off
chcp 65001 >nul
rem Проверка: может ли агент создавать в 1С «Реализацию» по заказам из приложения.
rem Документ записывается внутри транзакции и сразу отменяется — в базе 1С ничего не остаётся.
cd /d "%~dp0"
echo.
echo === Sapar Trade: проверка создания реализации в 1С (без последствий) ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sapar-1c-agent.ps1" -TryOrder
echo.
pause
