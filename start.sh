#!/bin/bash

echo "Starting CV Assistant..."

# Start backend server in background
echo "Starting backend server..."
npm run dev &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend server
echo "Starting frontend server..."
cd client && npm start &
FRONTEND_PID=$!

echo "Both servers are starting..."
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for user to stop
wait

# Cleanup on exit
echo "Stopping servers..."
kill $BACKEND_PID 2>/dev/null
kill $FRONTEND_PID 2>/dev/null
echo "Servers stopped."
