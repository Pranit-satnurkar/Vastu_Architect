@echo off
REM Batch script to start both frontend and backend servers

echo.
echo ========================================
echo   VASTU ARCHITECT - Server Startup
echo ========================================
echo.

REM Activate virtual environment
call .venv\Scripts\activate.bat

REM Start backend in one terminal
echo Starting backend on port 8000...
start "Backend - FastAPI (port 8000)" cmd /k "cd backend && python -m uvicorn main:app --reload --port 8000"

REM Wait for backend to start
echo Waiting for backend to initialize...
timeout /t 3 /nobreak

REM Start frontend in another terminal
echo Starting frontend on port 3000...
start "Frontend - Next.js (port 3000)" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo Servers starting:
echo - Backend: http://localhost:8000
echo - Frontend: http://localhost:3000
echo ========================================
echo.
echo Press Ctrl+C in each terminal to stop.
pause
