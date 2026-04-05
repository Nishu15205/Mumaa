#!/bin/bash
# Start both socket service and Next.js dev server
# This script keeps both running using the shell's job control

cd "$(dirname "$0")"

# Start socket service in background
cd mini-services/socket-service
nohup bun index.ts > /tmp/socket-service.log 2>&1 &
SOCKET_PID=$!
echo "Socket service PID: $SOCKET_PID"
cd ../..

# Wait for socket service to be ready
sleep 2
if curl -s http://localhost:3003/health > /dev/null 2>&1; then
  echo "Socket service ready on :3003"
else
  echo "WARNING: Socket service may not be ready"
fi

# Start Next.js
cd /home/z/my-project
exec npx next dev -p 3000
