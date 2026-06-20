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

# ── Resolve a Python >= 3.10 interpreter ──────────────────────────────────────
# Priority: pyenv shim → system python3.14/3.13/3.12/3.11/3.10 → give up
find_python() {
  for py in python3.14 python3.13 python3.12 python3.11 python3.10; do
    if command -v "$py" &>/dev/null; then
      echo "$py"; return
    fi
  done
  # Fallback: check if the default python3 is new enough
  local ver
  ver=$(python3 -c "import sys; print(sys.version_info >= (3,10))" 2>/dev/null)
  if [ "$ver" = "True" ]; then
    echo "python3"; return
  fi
  echo ""
}

PYTHON=$(find_python)
if [ -z "$PYTHON" ]; then
  echo "❌  Python 3.10+ is required but not found."
  echo "    Install it via pyenv:  pyenv install 3.11.0"
  exit 1
fi

# ── Virtual-env bootstrap ──────────────────────────────────────────────────────
VENV_DIR="$DIR/venv"

# If the venv exists but was built with an old Python (<3.10), recreate it
if [ -f "$VENV_DIR/pyvenv.cfg" ]; then
  VENV_VER=$(grep "^version" "$VENV_DIR/pyvenv.cfg" | awk '{print $3}')
  MAJOR=$(echo "$VENV_VER" | cut -d. -f1)
  MINOR=$(echo "$VENV_VER" | cut -d. -f2)
  if [ "$MAJOR" -lt 3 ] || { [ "$MAJOR" -eq 3 ] && [ "$MINOR" -lt 10 ]; }; then
    echo "⚠️  Existing venv is Python $VENV_VER (< 3.10). Recreating with $PYTHON..."
    rm -rf "$VENV_DIR"
  fi
fi

if [ ! -d "$VENV_DIR" ]; then
  echo "🐍 Creating virtual environment with $PYTHON..."
  "$PYTHON" -m venv "$VENV_DIR"
fi

VENV_PY="$VENV_DIR/bin/python"
VENV_PIP="$VENV_DIR/bin/pip"

# Install / upgrade Python deps inside the venv
if ! "$VENV_PY" -c "import flask" 2>/dev/null; then
  echo "📦 Installing Python dependencies into venv..."
  "$VENV_PIP" install --quiet --upgrade pip
  "$VENV_PIP" install --quiet -r server/requirements.txt
fi

# ── Node deps ─────────────────────────────────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "📦 Installing Node dependencies..."
  npm install
fi

# ── Shutdown hook ─────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill $PID_BACK $PID_FRONT 2>/dev/null
  wait $PID_BACK $PID_FRONT 2>/dev/null
  echo "✅ Done"
}
trap cleanup EXIT INT TERM

# ── Backend ───────────────────────────────────────────────────────────────────
echo "🔬 Starting backend (Python $(\"$VENV_PY\" --version 2>&1 | awk '{print $2}'))..."
"$VENV_PY" server/app.py &
PID_BACK=$!
sleep 2

# ── Frontend (Vite — QR code is printed by the qrTerminal plugin) ─────────────
echo "🌐 Starting frontend..."
npx vite &
PID_FRONT=$!

echo ""
echo "  ════════════════════════════════════════"
echo "  Backend  → http://localhost:5001"
echo "  Frontend → https://localhost:8081"
echo "  Health   → http://localhost:5001/api/health"
echo "  Logs     → http://localhost:5001/api/session/logs"
echo "  Progress → http://localhost:5001/api/session/progress"
echo "  ════════════════════════════════════════"
echo "  📱 A QR code for the network URL will"
echo "     appear above once Vite finishes loading."
echo "  ════════════════════════════════════════"
echo ""

wait $PID_BACK $PID_FRONT
