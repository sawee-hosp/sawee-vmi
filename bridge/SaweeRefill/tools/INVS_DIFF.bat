@echo off
setlocal EnableExtensions
rem INVS Diff - read-only: find which INVS tables change when you do one transaction by hand
cd /d "%~dp0.."
set "PHP=C:\xampp\php\php.exe"
if not exist "%PHP%" (echo PHP not found: %PHP% & pause & exit /b 10)
echo.
echo === INVS Diff (read-only) ===
set /p DRUG=Test drug WORKING_CODE: 
set /p DEPT=Sub-stock DEPT_ID (RPST/dept): 
echo.
echo [1/3] Snapshot BEFORE ...
"%PHP%" "cli\invs_diff.php" snap before --drug=%DRUG% --dept=%DEPT%
echo.
echo Now do ONE transaction in INVS by hand (e.g. sub-stock issue of drug %DRUG% for dept %DEPT%), save/confirm it,
echo then come back and press any key.
pause
echo [2/3] Snapshot AFTER ...
"%PHP%" "cli\invs_diff.php" snap after --drug=%DRUG% --dept=%DEPT%
echo [3/3] Compare ...
"%PHP%" "cli\invs_diff.php" diff before after
start notepad "cache\invs_diff\report_before_after.txt"
pause
