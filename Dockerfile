# ── Stage 1: Build frontend ───────────────────────────────────
FROM node:24-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build
# Output goes to /build/backend/public per vite.config.js (outDir: '../backend/public')

# ── Stage 2: Backend runtime ──────────────────────────────────
FROM node:24-alpine

WORKDIR /app

# Install build tools needed for better-sqlite3 native addon
RUN apk add --no-cache python3 make g++

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy backend source
COPY backend/src ./backend/src

# Copy built frontend into backend/public
COPY --from=frontend-builder /build/backend/public ./backend/public

# Data directory for SQLite
RUN mkdir -p /data

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app /data

USER nodejs

EXPOSE 3010

ENV NODE_ENV=production
ENV DATA_DIR=/data

CMD ["node", "backend/src/server.js"]
