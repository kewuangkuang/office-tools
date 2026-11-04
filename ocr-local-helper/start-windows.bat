@echo off
setlocal EnableExtensions

cd /d "%~dp0"
set "PROJECT_DIR=%~dp0.."
set "PYTHON_VERSION="

for %%P in (3.13 3.12 3.11 3.10) do (
  py -%%P -c "import sys" >nul 2>&1
  if not errorlevel 1 (
    set "PYTHON_VERSION=%%P"
    goto :python_found
  )
)

:python_found
if "%PYTHON_VERSION%"=="" (
  echo 需要 Python 3.10、3.11、3.12 或 3.13，并且已加入 Python Launcher。
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" py -%PYTHON_VERSION% -m venv ".venv"
if errorlevel 1 (
  echo 创建 Python 虚拟环境失败。
  pause
  exit /b 1
)

set "VENV_PYTHON=%~dp0.venv\Scripts\python.exe"
"%VENV_PYTHON%" -m pip install --disable-pip-version-check --upgrade pip
"%VENV_PYTHON%" -m pip install --disable-pip-version-check paddlepaddle==3.2.0
"%VENV_PYTHON%" -m pip install --disable-pip-version-check -r requirements.txt
if errorlevel 1 (
  echo OCR 依赖安装失败，请检查网络后重新运行此文件。
  pause
  exit /b 1
)

start "办公工具箱本地网页" /b "%VENV_PYTHON%" -m http.server 8766 --bind 127.0.0.1 --directory "%PROJECT_DIR%"
start "" "http://127.0.0.1:8766/index.html"
echo 本地网页：http://127.0.0.1:8766/index.html
echo 本地 OCR 助手：http://127.0.0.1:8765/health
echo 保持此窗口打开；关闭窗口会停止 OCR 助手。

"%VENV_PYTHON%" -m uvicorn server:app --host 127.0.0.1 --port 8765
pause
