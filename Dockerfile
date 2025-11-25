FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files for all workspaces (better caching - these change less frequently)
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY vscode-extension/package*.json ./vscode-extension/

# Copy .npmrc to override global npm config (use public registry, no auth)
COPY .npmrc ./

# Install dependencies using npm ci (much faster than npm install)
# npm ci uses package-lock.json exactly and is optimized for CI/CD
# .npmrc already configures public registry and disables auth
RUN npm ci --legacy-peer-deps --no-audit --no-fund

# Copy source code (do this AFTER npm install for better layer caching)
COPY . .

# Build backend only (frontend should be pre-built locally)
RUN npm run build

# Copy pre-built frontend from local machine (build with: npm run build:frontend)
# This avoids Alpine ARM64 rollup optional dependency issues
COPY frontend/dist ./frontend/dist

# Remove dev dependencies after build to reduce final image size
RUN npm prune --omit=dev --legacy-peer-deps

# Final runtime image
FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

# Install runtime dependencies (curl for health checks, python3 for Lambda execution)
RUN apk add --no-cache curl python3

# Copy only necessary files from builder with correct ownership
# Using --chown during COPY is much faster than RUN chown
COPY --chown=node:node --from=builder /app/build ./build
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/docs ./docs
COPY --chown=node:node --from=builder /app/frontend/dist ./frontend/dist

# Switch to non-root user for security
USER node

# Expose HTTP port
EXPOSE 3000

# Health check for HTTP endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "build/http-server.js"]
