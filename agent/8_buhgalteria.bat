@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo === Sapar Trade: подключение 1С:Бухгалтерии (долги по счёту 1274) ===
echo Нужно: имя базы Бухгалтерии (из окна запуска 1С: Ref=...), пользователь и пароль.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sapar-1c-agent.ps1" -SetBuh
echo.
echo Если выше зелёным «Бухгалтерия: OK» и «Счёт 1274: ...» — готово, долги на сайте теперь из Бухгалтерии.
echo Если красная ошибка — сфотографируйте окно и пришлите разработчику.
pause
