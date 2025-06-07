# Multi-stage build for TykBasic
FROM node:18-alpine AS frontend-builder

# Build frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --only=production
COPY frontend/ ./
RUN npm run build

# Backend stage
FROM node:18-alpine AS backend

# Install system dependencies for SQLite
RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

# Copy backend package files
COPY package*.json ./
RUN npm ci --only=production

# Copy backend source
COPY backend/ ./backend/
COPY tyk-configs/ ./tyk-configs/
COPY gateway-swagger.yml ./
COPY TYK_FRONTEND_IMPLEMENTATION_GUIDE.md ./

# Copy built frontend from previous stage
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Create required directories
RUN mkdir -p data logs uploads

# Create non-root user
RUN addgroup -g 1001 -S tykbasic && \
    adduser -S tykbasic -u 1001 -G tykbasic

# Set ownership
RUN chown -R tykbasic:tykbasic /app

USER tykbasic

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

EXPOSE 3001

CMD ["npm", "run", "backend:start"] 