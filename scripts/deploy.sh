#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# WhatsApp CRM — Deploy Script (Docker Compose)
# Usage: ./scripts/deploy.sh [--build] [--restart]
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

BUILD=false
RESTART=false

for arg in "$@"; do
  case $arg in
    --build)   BUILD=true ;;
    --restart) RESTART=true ;;
    *)         echo "Unknown option: $arg"; exit 1 ;;
  esac
done

echo "========================================="
echo "  WhatsApp CRM — Deploy"
echo "========================================="

# 1. Pull latest code (if in a git repo)
if [ -d .git ]; then
  echo "[Deploy] Pulling latest code..."
  git pull --rebase 2>/dev/null || echo "[Deploy] Git pull skipped (not on a branch or no remote)"
fi

# 2. Backup database before deploy
if [ -f backend/data/crm.db ]; then
  echo "[Deploy] Running pre-deploy backup..."
  bash scripts/backup.sh
fi

# 3. Build / restart
if $BUILD || ! docker compose ps --quiet 2>/dev/null | grep -q .; then
  echo "[Deploy] Building and starting containers..."
  docker compose build
  docker compose up -d
elif $RESTART; then
  echo "[Deploy] Restarting containers..."
  docker compose restart
else
  echo "[Deploy] Updating containers (recreate if config changed)..."
  docker compose up -d
fi

# 4. Wait for health
echo "[Deploy] Waiting for backend health..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3061/api/health > /dev/null 2>&1; then
    echo "[Deploy] Backend is healthy!"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[Deploy] WARNING: Backend did not become healthy in 30 seconds"
    docker compose logs --tail=20 backend
    exit 1
  fi
  sleep 1
done

# 5. Show status
echo ""
echo "[Deploy] Current status:"
docker compose ps
echo ""
echo "[Deploy] Done."
