#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
BACKEND_PORT=3174
FRONTEND_PORT=5174
BACKEND_PID=""
BACKEND_REUSED=0
FRONTEND_REUSED=0

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "缺少命令: $command_name"
    exit 1
  fi
}

show_port_usage() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$port" || true
  fi
}

find_listening_pid() {
  local port="$1"

  if ! command -v ss >/dev/null 2>&1; then
    return 1
  fi

  ss -ltnp "sport = :$port" | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n 1
}

port_matches_process() {
  local port="$1"
  local expected_pattern="$2"
  local pid
  local command_line

  pid="$(find_listening_pid "$port")"

  if [[ -z "${pid:-}" ]]; then
    return 1
  fi

  command_line="$(ps -p "$pid" -o cmd= 2>/dev/null || true)"

  if [[ -z "$command_line" ]]; then
    return 1
  fi

  [[ "$command_line" == *"$expected_pattern"* ]]
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
  local service_name="$2"
  local attempts=40

  while (( attempts > 0 )); do
    if node -e '
      const net = require("net");
      const port = Number(process.argv[1]);
      const socket = net.createConnection({ host: "127.0.0.1", port });

      socket.once("connect", () => {
        socket.end();
        process.exit(0);
      });

      socket.once("error", () => process.exit(1));
      socket.setTimeout(300, () => {
        socket.destroy();
        process.exit(1);
      });
    ' "$port" >/dev/null 2>&1; then
      return 0
    fi

    sleep 0.5
    attempts=$((attempts - 1))
  done

  echo "$service_name 启动失败，端口 $port 在预期时间内没有就绪。"
  return 1
}

ensure_dependencies() {
  local dir="$1"
  local label="$2"

  if [ ! -d "$dir/node_modules" ]; then
    echo "[$label] 未检测到 node_modules，正在执行 npm install..."
    (
      cd "$dir"
      npm install
    )
  fi
}

cleanup() {
  local exit_code=$?

  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi

  exit "$exit_code"
}

trap cleanup EXIT INT TERM

require_command node
require_command npm

ensure_dependencies "$BACKEND_DIR" "backend"
ensure_dependencies "$FRONTEND_DIR" "frontend"

if ! port_is_available "$BACKEND_PORT"; then
  if port_matches_process "$BACKEND_PORT" "node server.js"; then
    BACKEND_REUSED=1
    echo "[backend] 检测到已在运行，直接复用: http://localhost:$BACKEND_PORT"
  else
    echo "后端端口 $BACKEND_PORT 已被占用，请先释放端口后再启动。"
    show_port_usage "$BACKEND_PORT"
    exit 1
  fi
fi

if ! port_is_available "$FRONTEND_PORT"; then
  if port_matches_process "$FRONTEND_PORT" "vite"; then
    FRONTEND_REUSED=1
    echo "[frontend] 检测到已在运行，直接复用: http://localhost:$FRONTEND_PORT"
  else
    echo "前端端口 $FRONTEND_PORT 已被占用，请先释放端口后再启动。"
    show_port_usage "$FRONTEND_PORT"
    exit 1
  fi
fi

if (( BACKEND_REUSED == 0 )); then
  echo "[backend] 启动中: http://localhost:$BACKEND_PORT"
  (
    cd "$BACKEND_DIR"
    npm run dev
  ) &
  BACKEND_PID=$!

  wait_for_port "$BACKEND_PORT" "后端"
else
  wait_for_port "$BACKEND_PORT" "后端"
fi

if (( FRONTEND_REUSED == 1 )); then
  echo "前端已在运行，本次不重复启动。"

  if [[ -n "${BACKEND_PID:-}" ]]; then
    wait "$BACKEND_PID"
  fi

  exit 0
fi

echo "[frontend] 启动中: http://localhost:$FRONTEND_PORT"
echo "按 Ctrl+C 可同时停止前后端服务。"

cd "$FRONTEND_DIR"
npm run dev
