#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON_BIN=""
for candidate in python3.13 python3.12 python3.11 python3.10; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v "$candidate")"
    break
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "需要 Python 3.10、3.11、3.12 或 3.13。当前未找到受支持的 python3。"
  echo "请安装受支持版本后重新双击此文件。"
  read -r -p "按回车键退出…" _
  exit 1
fi

if [ ! -d ".venv" ]; then
  "$PYTHON_BIN" -m venv .venv
fi

VENV_PYTHON="$SCRIPT_DIR/.venv/bin/python"
"$VENV_PYTHON" -m pip install --disable-pip-version-check --upgrade pip
"$VENV_PYTHON" -m pip install --disable-pip-version-check paddlepaddle==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
"$VENV_PYTHON" -m pip install --disable-pip-version-check -r requirements.txt

echo "本地高精度 OCR 已启动：http://127.0.0.1:8765"
echo "保持此窗口打开，然后打开本地工具网页：http://127.0.0.1:8766/index.html"
exec "$VENV_PYTHON" -m uvicorn server:app --host 127.0.0.1 --port 8765
