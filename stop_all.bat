@echo off
chcp 65001 > nul
echo Dang tat tat ca services...
taskkill /f /im uvicorn.exe 2>nul
taskkill /f /im dotnet.exe 2>nul
taskkill /f /im node.exe 2>nul
echo Done. Tat ca services da duoc tat.
pause
