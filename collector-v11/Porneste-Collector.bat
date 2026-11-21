@echo off
setlocal
cd /d "%~dp0"
set "PORT=8000"
for /f %%P in ('powershell -NoProfile -Command "$c=Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if($c){'BUSY'}"') do set "PORTSTATE=%%P"
if /i "%PORTSTATE%"=="BUSY" (
  echo Portul 8000 este deja folosit.
  echo Inchide fereastra CMD in care ruleaza serverul vechi, apoi porneste din nou acest fisier.
  pause
  exit /b 1
)
start "Collector server" /min cmd /c "cd /d "%~dp0" && (py -m http.server %PORT% || python -m http.server %PORT%)"
timeout /t 2 /nobreak >nul
start "" "http://localhost:%PORT%/index-server.html"
endlocal
