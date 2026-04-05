#!/bin/bash
cd .
while true; do
  bun run dev >> dev.log 2>&1
  echo "[RESTART] Server died, restarting in 2s..." >> dev.log
  sleep 2
done
