@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 sau mai nou este necesar pentru Collector.
  echo Instaleaza Node.js, apoi redeschide acest fisier.
  pause
  exit /b 1
)
for /f %%P in ('powershell -NoProfile -Command "$c=Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue; if($c){'BUSY'}"') do set "PORTSTATE=%%P"
if /i "%PORTSTATE%"=="BUSY" (
  echo Portul 8000 este deja folosit.
  echo Inchide fereastra serverului vechi si porneste din nou Collector.
  pause
  exit /b 1
)
if not exist ".env" if "%OPENAI_API_KEY%"=="" (
  echo ATENTIE: OPENAI_API_KEY nu este configurata.
  echo Collector va porni in mod local; AI cloud va ramane indisponibil.
)
start "Collector server" cmd /k "node server.js"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000/index-server.html"
endlocal
