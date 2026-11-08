@echo off
setlocal
cd /d "%~dp0"
set "TASK_PYTHON=%~dp0..\02_End_to_End\runtime\python312\python.exe"
if not exist "%TASK_PYTHON%" (
  start "" "%~dp0index.html"
  exit /b 0
)
"%TASK_PYTHON%" -B "%~dp0serve_platform.py"
