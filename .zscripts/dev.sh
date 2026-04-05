#!/bin/bash
# Dev startup script — starts Next.js + mini-services
cd /home/z/my-project

# Install deps
bun install 2>/dev/null

# Start socket service in background
echo "Starting socket service..."
cd /home/z/my-project/mini-services/socket-service
bun index.ts &
SOCKET_PID=$!
echo "Socket service PID: $SOCKET_PID"
cd /home/z/my-project

# Wait for socket service to be ready
for i in $(seq 1 10); do
  if curl -s http://localhost:3003/health > /dev/null 2>&1; then
    echo "Socket service ready!"
    break
  fi
  sleep 1
done

# Start Next.js dev server in foreground (this blocks)
echo "Starting Next.js..."
exec bun run dev
