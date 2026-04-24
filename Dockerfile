# Multi-stage Dockerfile for WhatsApp CRM

# ── Stage 1: Build frontend ─────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Production image ───────────────────────────────────────
FROM node:20-alpine AS production
RUN apk add --no-cache tini
WORKDIR /app

# Backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Backend source
COPY backend/ ./backend/

# Frontend build output
COPY --from=frontend-build /app/frontend/.next ./frontend/.next
COPY --from=frontend-build /app/frontend/public ./frontend/public
COPY --from=frontend-build /app/frontend/package*.json ./frontend/
COPY --from=frontend-build /app/frontend/next.config.mjs ./frontend/
COPY --from=frontend-build /app/frontend/node_modules ./frontend/node_modules

# Create data directory for SQLite
RUN mkdir -p /app/backend/data

# Expose ports
EXPOSE 3061 3003

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Default: start backend (use docker-compose to run both)
CMD ["node", "backend/src/index.js"]
