#!/bin/bash
# Keep-alive wrapper for Next.js dev server
# Restarts automatically if it crashes
cd .

while true; do
  echo "[$(date)] Starting Next.js..."
  npx next dev -p 3000 >> ./dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date)] Next.js exited (code: $EXIT_CODE), restarting in 2s..."
  sleep 2
done
