#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# WhatsApp CRM — Database Backup Script
# Usage: ./scripts/backup.sh [backup_dir]
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_FILE="$PROJECT_DIR/backend/data/crm.db"
BACKUP_DIR="${1:-$PROJECT_DIR/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/crm_backup_$TIMESTAMP.db"
KEEP_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "[Backup] ERROR: Database file not found at $DB_FILE"
  exit 1
fi

echo "[Backup] Starting backup of $DB_FILE ..."

# Use SQLite .backup for a safe hot-copy (handles WAL mode)
if command -v sqlite3 &>/dev/null; then
  sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'"
else
  # Fallback: simple copy (safe if WAL is checkpointed)
  cp "$DB_FILE" "$BACKUP_FILE"
  # Also copy WAL and SHM if they exist
  [ -f "$DB_FILE-wal" ] && cp "$DB_FILE-wal" "$BACKUP_FILE-wal"
  [ -f "$DB_FILE-shm" ] && cp "$DB_FILE-shm" "$BACKUP_FILE-shm"
fi

# Compress
gzip "$BACKUP_FILE"
BACKUP_FILE="$BACKUP_FILE.gz"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[Backup] Created: $BACKUP_FILE ($SIZE)"

# Prune old backups
DELETED=$(find "$BACKUP_DIR" -name "crm_backup_*.db.gz" -mtime +$KEEP_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[Backup] Pruned $DELETED backups older than $KEEP_DAYS days"
fi

echo "[Backup] Done."
