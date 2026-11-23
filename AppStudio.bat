@echo off
cd /d "%~dp0"
set SPID3R_PATH=.;%SPID3R_PATH%
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'spid3r' -ArgumentList @('gui','gui/main.matrix','--html','gui/host.html') -WorkingDirectory '%CD%' -WindowStyle Hidden"
