#!/bin/bash

# 检查网络是否存在，不存在则创建
if ! docker network ls | grep -q "waredetective-net"; then
    echo "Creating network waredetective-net..."
    docker network create waredetective-net
else
    echo "Network waredetective-net already exists."
fi

# 启动容器
echo "Starting services..."
docker compose up --build -d
