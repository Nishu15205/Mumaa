#!/bin/bash
# MUMAA Dev Server - Auto-restart script
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting MUMAA dev server..."
  bun run dev
  echo "[$(date)] Server stopped. Restarting in 3s..."
  sleep 3
done
