#!/bin/bash

echo "🧪 Starting Full End-to-End Test (Frontend + Backend)"
echo "======================================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Kill any existing processes on our ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:2567 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2

# Start server
echo "🚀 Starting server..."
cd server
npm run build > /dev/null 2>&1
NODE_ENV=test node dist/index.js > ../test-results/server.log 2>&1 &
SERVER_PID=$!
cd ..
echo "   Server PID: $SERVER_PID"
sleep 5

# Check if server is running
if ! curl -s http://localhost:2567/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Server failed to start${NC}"
    cat test-results/server.log
    kill $SERVER_PID 2>/dev/null
    exit 1
fi
echo -e "${GREEN}✅ Server started${NC}"

# Start client
echo "🎨 Starting client..."
cd client
npm run build > /dev/null 2>&1
npm run preview -- --port 3000 > ../test-results/client.log 2>&1 &
CLIENT_PID=$!
cd ..
echo "   Client PID: $CLIENT_PID"
sleep 8

# Check if client is running
if ! curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${RED}❌ Client failed to start${NC}"
    cat test-results/client.log
    kill $SERVER_PID $CLIENT_PID 2>/dev/null
    exit 1
fi
echo -e "${GREEN}✅ Client started${NC}"

# Run Playwright tests
echo ""
echo "🎭 Running Playwright E2E tests..."
echo "-----------------------------------"
npx playwright test

TEST_RESULT=$?

# Cleanup
echo ""
echo "🧹 Cleaning up..."
kill $SERVER_PID $CLIENT_PID 2>/dev/null
sleep 2

# Show results
echo ""
echo "======================================================="
if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
    echo "📸 Screenshots saved in test-results/"
    exit 0
else
    echo -e "${RED}❌ TESTS FAILED${NC}"
    echo "📸 Error screenshots saved in test-results/"
    echo "📋 Logs:"
    echo "   Server: test-results/server.log"
    echo "   Client: test-results/client.log"
    exit 1
fi
