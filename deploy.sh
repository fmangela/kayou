#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT="${BACKEND_PORT:-3174}"
LOG_DIR="$ROOT_DIR/logs"
BACKEND_LOG="$LOG_DIR/backend.log"
PID_FILE="$ROOT_DIR/.deploy-backend.pid"

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "缺少命令: $command_name"
    exit 1
  fi
}

find_listening_pid() {
  local port="$1"
  if ! command -v ss >/dev/null 2>&1; then
    return 1
  fi
  ss -ltnp "sport = :$port" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1
}

port_is_available() {
  local port="$1"
  node -e '
    const net = require("net");
    const port = Number(process.argv[1]);
    const server = net.createServer();
    server.once("error", () => process.exit(1));
    server.once("listening", () => server.close(() => process.exit(0)));
    server.listen(port, "127.0.0.1");
  ' "$port"
}

wait_for_port() {
  local port="$1"
  local attempts=60

  while (( attempts > 0 )); do
    if node -e '
      const net = require("net");
      const socket = net.createConnection({ host: "127.0.0.1", port: Number(process.argv[1]) });
      socket.once("connect", () => { socket.end(); process.exit(0); });
      socket.once("error", () => process.exit(1));
      socket.setTimeout(500, () => { socket.destroy(); process.exit(1); });
    ' "$port" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
    attempts=$((attempts - 1))
  done

  echo "后端启动失败，端口 $port 未在预期时间内就绪。"
  return 1
}

ensure_dependencies() {
  local dir="$1"
  local label="$2"
  echo "[$label] 安装依赖..."
  (
    cd "$dir"
    npm install
  )
}

stop_existing_backend() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      echo "[backend] 停止旧进程 PID=$pid"
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi

  if ! port_is_available "$BACKEND_PORT"; then
    local pid cmdline
    pid="$(find_listening_pid "$BACKEND_PORT" || true)"
    cmdline="$(ps -p "$pid" -o cmd= 2>/dev/null || true)"

    if [[ -n "${pid:-}" && ( "$cmdline" == *"$BACKEND_DIR"* || "$cmdline" == *"node server.js"* || "$cmdline" == *"npm run start"* || "$cmdline" == *"npm run dev"* ) ]]; then
      echo "[backend] 端口 $BACKEND_PORT 上存在旧服务，正在停止 PID=$pid"
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
    else
      echo "端口 $BACKEND_PORT 已被其他进程占用，已停止部署。"
      if command -v ss >/dev/null 2>&1; then
        ss -ltnp "sport = :$BACKEND_PORT" || true
      fi
      exit 1
    fi
  fi
}

start_backend() {
  mkdir -p "$LOG_DIR"
  echo "[backend] 启动生产服务..."
  (
    cd "$BACKEND_DIR"
    if command -v setsid >/dev/null 2>&1; then
      NODE_ENV=production setsid npm run start >>"$BACKEND_LOG" 2>&1 < /dev/null &
    else
      NODE_ENV=production nohup npm run start >>"$BACKEND_LOG" 2>&1 < /dev/null &
    fi
    echo $! >"$PID_FILE"
  )
  wait_for_port "$BACKEND_PORT"
}

require_command node
require_command npm

echo "[deploy] 开始部署 Kayou"
ensure_dependencies "$BACKEND_DIR" "backend"
ensure_dependencies "$FRONTEND_DIR" "frontend"

echo "[frontend] 构建前端..."
(
  cd "$FRONTEND_DIR"
  npm run build
)

stop_existing_backend
start_backend

echo "[deploy] 部署完成"
echo "[deploy] 后端日志: $BACKEND_LOG"
echo "[deploy] 访问地址: http://127.0.0.1:$BACKEND_PORT"
