@echo off
chcp 65001 >nul
rem Sapar Trade: включить автозапуск агента каждые 5 минут (задание Планировщика Windows).
rem Права администратора скрипт запросит сам; результат покажет в окне PowerShell, которое не закроется.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-task.ps1"
echo.
echo Дальше — в синем окне PowerShell: введите пароль Windows (если пароля нет — оставьте пустым и нажмите OK). Зелёная надпись «Задание ... создано» — готово.
pause
