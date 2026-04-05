#!/bin/sh
set -e

echo "============================================="
echo "  MUMAA - Starting Docker Container"
echo "============================================="

# ─── Database Setup ──────────────────────────────────────────────────────────

# Ensure the db directory exists
mkdir -p /app/db

# If no database file exists, run Prisma migrations/seed
if [ ! -f "/app/db/custom.db" ]; then
  echo "[DB] No database found. Running Prisma schema push..."
  DATABASE_URL="file:/app/db/custom.db" npx prisma db push --skip-generate 2>/dev/null || true
  echo "[DB] Database initialized at /app/db/custom.db"
else
  echo "[DB] Existing database found at /app/db/custom.db"

  # Run any pending schema changes on existing DB
  echo "[DB] Applying any pending schema changes..."
  DATABASE_URL="file:/app/db/custom.db" npx prisma db push --skip-generate --accept-data-loss 2>/dev/null || true
fi

# Ensure DATABASE_URL points to the correct path in the container
export DATABASE_URL="file:/app/db/custom.db"
echo "[DB] DATABASE_URL set to: ${DATABASE_URL}"

# ─── Upload Directory ────────────────────────────────────────────────────────

mkdir -p /app/upload
echo "[UPLOAD] Upload directory ready at /app/upload"

# ─── Start Socket Service (Background) ───────────────────────────────────────

echo "[SOCKET] Starting Socket.IO service on port 3003..."
cd /app/mini-services/socket-service && bun index.ts &
SOCKET_PID=$!
echo "[SOCKET] Socket service started (PID: ${SOCKET_PID})"

# ─── Start Next.js App (Foreground) ──────────────────────────────────────────

cd /app
echo "[APP] Starting Next.js production server on port 3000..."
echo "============================================="

# Run Next.js in the foreground
exec bun .next/standalone/server.js
