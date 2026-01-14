# Proxy Ray Web Manager

一个独立的前后端分离的 Web 管理系统，用于管理 Xray 代理配置、订阅源及节点，并生成可供其他客户端订阅的配置链接。

## 功能特性

1.  **用户认证**: 提供安全的后台登录功能（JWT）。
2.  **配置管理**:
    *   可视化管理端口映射（本地端口 -> 出站节点）。
    *   自动生成标准的 Xray `config.json`。
3.  **订阅管理**:
    *   支持添加 Vmess / Vless / Trojan / Shadowsocks 订阅链接。
    *   自动解析节点并分类。
4.  **配置分享**:
    *   生成包含当前所有映射规则的配置订阅链接。
    *   提供二维码分享，方便移动端快速导入。

## 技术栈

*   **后端**: Node.js, Express, JSON Database
*   **前端**: Vue 3, Vite, Element Plus
*   **部署**: Docker & Docker Compose

## 快速开始

### 方式一：使用 Docker (推荐)

确保已安装 Docker 和 Docker Compose。

1.  进入项目目录：
    ```bash
    cd web-proxy-setting
    ```

2.  启动服务：
    ```bash
    docker-compose up --build -d
    或者 docker compose up --build -d
    ```

3.  访问管理界面：
    *   打开浏览器访问: `http://localhost:4000`
    *   默认账号: `admin`
    *   默认密码: `admin123` (可在 `backend/.env` 中修改)

### 方式二：本地开发部署

**1. 后端启动**

```bash
cd backend
# 安装依赖
npm install
# 启动服务 (运行在 4000 端口)
node server.js
# 或开发模式
npm run dev
```

**2. 前端启动**

```bash
cd frontend
# 安装依赖
npm install
# 启动开发服务器 (运行在 5173 端口)
npm run dev
```

前端开发服务器会自动将 `/api` 请求代理到后端 4000 端口。

## 项目结构

*   `backend/`: 后端源码
    *   `data/`: 存放 `mappings.json` 和 `subscriptions.json` (自动生成)
    *   `.env`: 配置文件 (账号密码, JWT 密钥)
*   `frontend/`: 前端源码
*   `Dockerfile`: 容器构建脚本

## 注意事项

*   生成的订阅链接默认使用访问页面的 Host。如果在局域网或公网使用，请确保生成的 URL 中的 IP 地址是其他设备可访问的地址。
