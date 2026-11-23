@echo off
cd /d "%~dp0"
set SPID3R_PATH=.;frameworks;core;core/cli;%SPID3R_PATH%
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'spid3r' -ArgumentList @('gui','core/gui/main.matrix','--html','core/gui/host.html') -WorkingDirectory '%CD%' -WindowStyle Hidden"
