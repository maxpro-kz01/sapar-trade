@echo off
chcp 65001 >nul
rem Sapar Trade: включить автозапуск агента каждые 5 минут (задание Планировщика Windows).
rem Сам запрашивает права администратора. Задание работает от имени пользователя, который запустил файл.
set "ST_USER=%~1"
if "%ST_USER%"=="" set "ST_USER=%USERDOMAIN%\%USERNAME%"
net session >nul 2>&1
if errorlevel 1 (
  echo Нужны права администратора — подтвердите в появившемся окне.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '\"%ST_USER%\"' -Verb RunAs"
  exit /b
)
cd /d "%~dp0"
echo.
echo === Sapar Trade: автозапуск агента каждые 5 минут ===
echo Пользователь Windows: %ST_USER%
echo Сейчас появится окно — введите ПАРОЛЬ этого пользователя Windows (не 1С).
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-task.ps1" -User "%ST_USER%"
echo.
echo Если выше зелёная надпись «Задание ... создано» — готово: через 1-2 минуты данные начнут обновляться сами.
pause
