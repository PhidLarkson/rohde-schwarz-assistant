#!/bin/bash
# Rhoda Lab Assistant — start backend + frontend
# Usage: ./start.sh

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║  Rhoda — R&S Lab Assistant           ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Python deps
if ! python3 -c "import flask" 2>/dev/null; then
  echo "📦 Installing Python dependencies..."
  pip install -r server/requirements.txt --quiet
fi

# Node deps
if [ ! -d "node_modules" ]; then
  echo "📦 Installing Node dependencies..."
  npm install
fi

cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill $PID_BACK $PID_FRONT 2>/dev/null
  wait $PID_BACK $PID_FRONT 2>/dev/null
  echo "✅ Done"
}
trap cleanup EXIT INT TERM

# Backend
echo "🔬 Starting backend..."
cd "$DIR" && python3 server/app.py &
PID_BACK=$!
sleep 2

# Frontend
echo "🌐 Starting frontend..."
cd "$DIR" && npx vite &
PID_FRONT=$!

echo ""
echo "  ════════════════════════════════════════"
echo "  Backend  → http://localhost:5001"
echo "  Frontend → https://localhost:8081"
echo "  Health   → http://localhost:5001/api/health"
echo "  Logs     → http://localhost:5001/api/session/logs"
echo "  Progress → http://localhost:5001/api/session/progress"
echo "  ════════════════════════════════════════"
echo ""

wait $PID_BACK $PID_FRONT
