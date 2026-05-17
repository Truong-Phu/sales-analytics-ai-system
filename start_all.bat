@echo off
chcp 65001 > nul
echo ========================================
echo    MSAS - Khoi dong he thong
echo ========================================

:: Giai phong cac port dang bi chiem truoc khi start
echo [0/4] Giai phong ports cu (8001, 5136, 5173, 8081)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5136 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8081 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 /nobreak > nul

echo [1/4] Khoi dong FastAPI AI Service (port 8001)...
start "FastAPI AI" cmd /k "cd /d D:\graduation_thesis\src\ai-service && D:\graduation_thesis\src\.venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8001 --reload"

timeout /t 3 /nobreak > nul

echo [2/4] Khoi dong ASP.NET Backend (port 5136)...
start "ASP.NET Backend" cmd /k "cd /d D:\graduation_thesis\src\backend\SalesAnalytics.API && dotnet run --launch-profile http"

timeout /t 5 /nobreak > nul

echo [3/4] Khoi dong React Frontend (port 5173)...
start "React Frontend" cmd /k "cd /d D:\graduation_thesis\src\frontend && npm run dev"

timeout /t 2 /nobreak > nul

echo [4/4] Khoi dong Mobile App (Expo)...
start "Mobile Expo" cmd /k "cd /d D:\graduation_thesis\src\mobile && npm start"

echo.
echo ========================================
echo Tat ca services dang khoi dong...
echo Cho khoang 30 giay roi truy cap:
echo   Web:    http://localhost:5173
echo   API:    http://localhost:5136/swagger
echo   AI:     http://localhost:8001/docs
echo   Mobile: Quet QR trong cua so Expo
echo ========================================
pause
