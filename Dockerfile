# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Backend & Final
FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --production
COPY backend/ .

# Ensure data directory exists
RUN mkdir -p data

# Copy built frontend
COPY --from=frontend-build /app/frontend/dist ../frontend/dist

EXPOSE 4000
CMD ["node", "server.js"]
