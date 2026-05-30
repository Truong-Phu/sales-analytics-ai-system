@echo off
chcp 65001 > nul
echo ========================================
echo    MSAS - Tat tat ca services
echo ========================================

echo [1/5] Tat FastAPI AI Service (port 8001)...
taskkill /f /im uvicorn.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1

echo [2/5] Tat ASP.NET Backend (port 5136)...
taskkill /f /im dotnet.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5136 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1

echo [3/5] Tat React Frontend (port 5173)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1

echo [4/5] Tat Mobile App / Expo Metro (port 8081)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8081 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
taskkill /f /im node.exe >nul 2>&1

echo [5/5] Tat ngrok...
taskkill /f /im ngrok.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4040 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1

echo.
echo ========================================
echo  Tat ca services da duoc tat.
echo ========================================
pause
