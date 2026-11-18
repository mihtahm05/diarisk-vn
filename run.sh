#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# 1. Dọn dẹp port cũ
fuser -k 8000/tcp >/dev/null 2>&1
fuser -k 5000/tcp >/dev/null 2>&1
fuser -k 5173/tcp >/dev/null 2>&1

echo "🚀 1. Khởi chạy ML Service (Python - Port 8000)..."
cd "$DIR/ml-service" && .venv/bin/uvicorn app:app --reload --port 8000 &

echo "🚀 2. Khởi chạy Backend (Node.js - Port 5000)..."
cd "$DIR/backend" && npm run dev &

sleep 3

echo "🚀 3. Khởi chạy Frontend (React - Port 5173)..."
cd "$DIR/frontend" && npm run dev
