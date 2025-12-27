@echo off
echo Activating Conda environment 'langgraph'...
call conda activate langgraph
if %errorlevel% neq 0 (
    echo Error: Failed to activate 'langgraph' environment.
    pause
    exit /b 1
)

echo Starting VideoSubs backend...
cd /d "%~dp0"
uvicorn src.app:app --reload --host 127.0.0.1 --port 8000
pause
