@echo off
rem Keep sync_worker.php running; restart 15 s after it stops.
rem Task Scheduler starts this file at boot (see README.md).
cd /d "%~dp0"
if not exist logs mkdir logs
:loop
"C:\xampp\php\php.exe" sync_worker.php
echo [%date% %time%] sync_worker stopped - restarting in 15 s >> logs\worker_restart.log
timeout /t 15 /nobreak >nul
goto loop
