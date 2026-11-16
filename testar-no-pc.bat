@echo off
title Servidor DVR TV - Local e Samsung TV
echo ========================================================
echo  Iniciando Servidor DVR TV com Node.js
echo ========================================================
start http://localhost:8080/
node "%~dp0server.js"
pause
