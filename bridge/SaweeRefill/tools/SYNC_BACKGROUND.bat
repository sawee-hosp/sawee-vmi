@echo off
setlocal EnableExtensions
rem ไปที่โฟลเดอร์แม่ของ tools\ (เช่น C:\SaweeRefill) — ย้ายโฟลเดอร์ได้โดยไม่ต้องแก้ไฟล์นี้
cd /d "%~dp0.."
set "PHP=C:\xampp\php\php.exe"
if not exist "%PHP%" exit /b 10
if not exist "cli\sync_requisition_status.php" exit /b 11
if not exist "cli\sync_stock_lots.php" exit /b 12
if not exist "cli\sync_virtual_stock.php" exit /b 13
"%PHP%" "cli\sync_requisition_status.php"
set "RC1=%errorlevel%"
"%PHP%" "cli\sync_stock_lots.php"
set "RC2=%errorlevel%"
"%PHP%" "cli\sync_virtual_stock.php"
set "RC3=%errorlevel%"
if not "%RC1%"=="0" exit /b %RC1%
if not "%RC2%"=="0" exit /b %RC2%
exit /b %RC3%
