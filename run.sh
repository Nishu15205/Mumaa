#!/bin/bash
# MUMAA Platform - Development Server
# Usage: bash run.sh
# This script ensures both Next.js and Socket Service stay alive.

cd "$(dirname "$0")"

# Kill any stale processes on our ports
lsof -ti :3000 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti :3003 2>/dev/null | xargs kill -9 2>/dev/null
sleep 1

# Start socket service in background
cd mini-services/socket-service
nohup bun index.ts > /tmp/socket-service.log 2>&1 &
SOCKET_PID=$!
echo "Socket Service PID: $SOCKET_PID"
echo $SOCKET_PID > /tmp/mumaa-socket.pid
cd ../..

# Wait for socket service
for i in $(seq 1 10); do
  if curl -s http://localhost:3003/health > /dev/null 2>&1; then
    echo "Socket service ready on :3003"
    break
  fi
  sleep 1
done

# Start Next.js dev server (foreground - this blocks)
echo "Starting Next.js on :3000..."
cd /home/z/my-project
exec npx next dev -p 3000
