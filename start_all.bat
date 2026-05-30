@echo off
chcp 65001 > nul
echo ========================================
echo    MSAS - Khoi dong he thong
echo ========================================

:: Giai phong cac port truoc khi start
echo [0/5] Giai phong ports cu (8001, 5136, 5173, 8081, 4040)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8001 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5136 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8081 " 2^>nul') do taskkill /PID %%a /F >nul 2>&1
taskkill /f /im ngrok.exe >nul 2>&1
timeout /t 2 /nobreak > nul

echo [1/5] Khoi dong FastAPI AI Service (port 8001)...
start "FastAPI AI" cmd /k "cd /d D:\graduation_thesis\src\ai-service && D:\graduation_thesis\src\.venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8001 --reload"
timeout /t 3 /nobreak > nul

echo [2/5] Khoi dong ASP.NET Backend (port 5136)...
start "ASP.NET Backend" cmd /k "cd /d D:\graduation_thesis\src\backend\SalesAnalytics.API && dotnet run --launch-profile http"
timeout /t 5 /nobreak > nul

echo [3/5] Khoi dong React Frontend (port 5173)...
start "React Frontend" cmd /k "cd /d D:\graduation_thesis\src\frontend && npm run dev"
timeout /t 3 /nobreak > nul

echo [4/5] Khoi dong Mobile App (Expo) - tu dong detect IP LAN...
start "Mobile Expo" cmd /k "cd /d D:\graduation_thesis\src\mobile && npm start"
timeout /t 2 /nobreak > nul

echo [5/5] Khoi dong ngrok (tunnel port 5173 - frontend + API proxy)...
start "ngrok" cmd /k "ngrok http 5173"
echo     Dang cho ngrok khoi dong (6 giay)...
timeout /t 6 /nobreak > nul

:: Lay ngrok URL qua script ps1 va ghi vao ngrok-current.txt
set NGROK_URL=
for /f "delims=" %%i in ('powershell -ExecutionPolicy Bypass -File "D:\graduation_thesis\get-ngrok-url.ps1"') do set NGROK_URL=%%i

if "%NGROK_URL%"=="" (
    echo [WARN] Khong lay duoc ngrok URL - kiem tra cua so ngrok
)

echo.
echo ========================================
echo  Tat ca services dang khoi dong...
echo  Cho khoang 30 giay roi truy cap:
echo ----------------------------------------
echo  [LOCAL]
echo  Web:    http://localhost:5173
echo  API:    http://localhost:5136/swagger
echo  AI:     http://localhost:8001/docs
echo  Mobile: Quet QR trong cua so Expo
echo ----------------------------------------
echo  [DEMO - INTERNET / HOI DONG]
if not "%NGROK_URL%"=="" (
    echo  Web:    %NGROK_URL%
    echo  API:    %NGROK_URL%/swagger
    echo  SePay:  %NGROK_URL%/api/payment/webhook/sepay
    echo  (URL tu dong ghi vao ngrok-current.txt)
) else (
    echo  [!] Chua lay duoc URL - xem cua so ngrok de copy thu cong
)
echo ========================================
pause
