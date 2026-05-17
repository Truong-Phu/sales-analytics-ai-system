@echo off
chcp 65001 > nul
echo ========================================
echo    MSAS - Khoi dong he thong
echo ========================================

echo [1/3] Khoi dong FastAPI AI Service (port 8001)...
start "FastAPI AI" cmd /k "cd /d D:\graduation_thesis\src\ai-service && .\.venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8001 --reload"

timeout /t 3 /nobreak > nul

echo [2/3] Khoi dong ASP.NET Backend (port 5136)...
start "ASP.NET Backend" cmd /k "cd /d D:\graduation_thesis\src\backend\SalesAnalytics.API && dotnet run --launch-profile http"

timeout /t 5 /nobreak > nul

echo [3/3] Khoi dong React Frontend (port 5173)...
start "React Frontend" cmd /k "cd /d D:\graduation_thesis\src\frontend && npm run dev"

echo.
echo ========================================
echo Tat ca services dang khoi dong...
echo Cho khoang 30 giay roi mo trinh duyet:
echo http://localhost:5173
echo ========================================
pause
