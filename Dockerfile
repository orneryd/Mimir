FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files (both root and workspace)
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install ALL dependencies (including dev deps for building)
# Single npm install handles both root and workspace (frontend)
# Remove package-lock.json to avoid any auth issues
# Use --legacy-peer-deps to handle peer dependency conflicts (zod v3 vs v4)
RUN rm -f package-lock.json && \
    npm config set registry https://registry.npmjs.org/ && \
    npm config delete //registry.npmjs.org/:_authToken || true && \
    npm install --legacy-peer-deps --no-audit --no-fund

# Copy source and build both backend and frontend
COPY . .
# Remove any local node_modules that might have been copied, then rebuild
RUN rm -rf frontend/node_modules/esbuild && \
    npm install esbuild@0.21.5 --workspace=frontend --legacy-peer-deps && \
    npm run build && npm run build --workspace=frontend

# Remove dev dependencies after build
# RUN npm prune --omit=dev

# Final runtime image
FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

# Install runtime dependencies (curl for environment validation)
RUN apk add --no-cache curl

# Copy only build artifacts and production deps with correct ownership
# Using --chown during COPY is much faster than RUN chown -R (avoids 100+ second delay)
COPY --chown=node:node --from=builder /app/build ./build
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/.mimir ./.mimir
COPY --chown=node:node --from=builder /app/docs ./docs
COPY --chown=node:node --from=builder /app/frontend/dist ./frontend/dist

# Switch to non-root user (files already owned by node:node from COPY --chown)
USER node

# MCP server runs on stdio, no HTTP port needed
# But we keep the port for potential future HTTP transport

# Expose HTTP port for MCP server
EXPOSE 3000

# Health check for HTTP endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "build/http-server.js"]
