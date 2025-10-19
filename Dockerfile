FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev deps for building)
# Remove package-lock.json to avoid any auth issues
# Use --legacy-peer-deps to handle peer dependency conflicts (zod v3 vs v4)
RUN rm -f package-lock.json && \
    npm config set registry https://registry.npmjs.org/ && \
    npm config delete //registry.npmjs.org/:_authToken || true && \
    npm install --legacy-peer-deps --no-audit --no-fund

# Copy source and build
COPY . .
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Final runtime image
FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

# Copy only build artifacts and production deps
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

# Ensure non-root user owns the app directory and switch to it
RUN chown -R node:node /app
USER node

# MCP server runs on stdio, no HTTP port needed
# But we keep the port for potential future HTTP transport

# Expose HTTP port for MCP server
EXPOSE 3000

# Health check for HTTP endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "build/http-server.js"]
