#!/bin/bash

# Stop script on error
set -e

echo "========================================"
echo "Starting deployment..."
echo "========================================"

# 1. Pull latest code
echo "[1/4] Pulling latest code..."
git pull

# 2. Check/Fix backend/.env
# Prevent Docker from creating a directory if file is missing
if [ -d "backend/.env" ]; then
    echo "[Warning] backend/.env is a directory. Removing it..."
    rm -rf backend/.env
fi

if [ ! -f "backend/.env" ]; then
    echo "[Error] backend/.env not found!"
    echo "Please create 'backend/.env' manually with the following content:"
    echo "PORT=4000"
    echo "ADMIN_USER=your_username"
    echo "ADMIN_PASS=your_password"
    echo "JWT_SECRET=your_secret"
    exit 1
fi

# 3. Setup Network
echo "[2/4] Checking network..."
if ! docker network ls | grep -q "waredetective-net"; then
    echo "Creating network waredetective-net..."
    docker network create waredetective-net
else
    echo "Network waredetective-net already exists."
fi

# 4. Start Services
echo "[3/4] Building and starting services..."
# --remove-orphans cleans up old containers from previous configs
docker compose up --build -d --remove-orphans

echo "========================================"
echo "Deployment completed successfully!"
echo "========================================"
docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"
