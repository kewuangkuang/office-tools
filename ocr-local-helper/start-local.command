#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_PORT="${LOCAL_OCR_WEB_PORT:-8766}"

PYTHON_BIN=""
for candidate in python3.13 python3.12 python3.11 python3.10; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v "$candidate")"
    break
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "需要 Python 3.10、3.11、3.12 或 3.13。"
  read -r -p "按回车键退出…" _
  exit 1
fi

cleanup() {
  trap - EXIT INT TERM
  if [ -n "${WEB_PID:-}" ] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  if [ -n "${HELPER_PID:-}" ] && kill -0 "$HELPER_PID" 2>/dev/null; then
    kill "$HELPER_PID" 2>/dev/null || true
  fi
  if [ -n "${WEB_PID:-}" ]; then wait "$WEB_PID" 2>/dev/null || true; fi
  if [ -n "${HELPER_PID:-}" ]; then wait "$HELPER_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

"$SCRIPT_DIR/start-macos.command" &
HELPER_PID=$!

"$PYTHON_BIN" -m http.server "$WEB_PORT" --bind 127.0.0.1 --directory "$PROJECT_DIR" &
WEB_PID=$!

sleep 1
LOCAL_URL="http://127.0.0.1:${WEB_PORT}/index.html"
echo "本地网页：$LOCAL_URL"
echo "本地 OCR 助手：http://127.0.0.1:8765/health"
echo "保持此窗口打开；关闭窗口会同时停止本地网页和 OCR 助手。"

if command -v open >/dev/null 2>&1; then
  open "$LOCAL_URL"
fi

while kill -0 "$HELPER_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 1
done

if ! kill -0 "$HELPER_PID" 2>/dev/null; then
  echo "OCR 助手已退出，请查看上面的安装或启动错误。"
fi
