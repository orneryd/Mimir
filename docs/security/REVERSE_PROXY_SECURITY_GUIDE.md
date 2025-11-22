# Reverse Proxy Security Guide (First-Line Defense)

**Version**: 1.0.0  
**Date**: 2025-11-21  
**Status**: Production-Ready  
**Implementation Time**: 2-4 hours

---

## 🎯 Overview

This guide provides a **complete reverse proxy security layer** for Mimir using Nginx. This is the **recommended first-line defense** before implementing full enterprise security features.

**Benefits**:
- ✅ **Zero code changes** to Mimir
- ✅ **Backward compatible** (can be added/removed without affecting Mimir)
- ✅ **Production-ready** in 2-4 hours
- ✅ **Industry-standard** approach
- ✅ **Easy to upgrade** (add OAuth, mTLS, WAF later)

**What This Provides**:
- HTTPS/TLS encryption
- API key authentication
- Rate limiting (DoS protection)
- IP whitelisting
- Request logging
- Security headers

---

## 📋 Table of Contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Implementation Steps](#implementation-steps)
4. [Configuration](#configuration)
5. [Testing](#testing)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)
8. [Upgrading](#upgrading)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet / Clients                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ HTTPS (443)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Nginx Reverse Proxy (mimir_nginx container)                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. TLS Termination (HTTPS → HTTP)                     │  │
│  │ 2. API Key Validation (X-API-Key header)              │  │
│  │ 3. Rate Limiting (100 req/min per IP)                 │  │
│  │ 4. IP Whitelisting (optional)                         │  │
│  │ 5. Security Headers (HSTS, X-Frame-Options, etc.)     │  │
│  │ 6. Request Logging (access.log)                       │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ HTTP (internal)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Mimir Server (mimir_server container)                      │
│  - No changes required                                       │
│  - Only accessible via Nginx (not exposed to internet)       │
│  - Receives pre-authenticated requests                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

**Required**:
- Docker & Docker Compose installed
- Mimir already running
- OpenSSL (for certificate generation)
- 10 minutes of time

**Optional**:
- Domain name (for Let's Encrypt)
- DNS access (for domain configuration)

---

## Implementation Steps

### Step 1: Create Directory Structure (2 minutes)

```bash
cd /path/to/Mimir

# Create nginx directories
mkdir -p nginx/ssl
mkdir -p nginx/conf.d
mkdir -p nginx/logs

# Create placeholder for API keys
touch nginx/.api-keys
```

### Step 2: Generate SSL Certificate (3 minutes)

**Option A: Self-Signed Certificate (Development/Internal)**

```bash
# Generate self-signed certificate (valid for 1 year)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/mimir.key \
  -out nginx/ssl/mimir.crt \
  -subj "/C=US/ST=State/L=City/O=Company/OU=IT/CN=mimir.local"

# Set proper permissions
chmod 600 nginx/ssl/mimir.key
chmod 644 nginx/ssl/mimir.crt
```

**Option B: Let's Encrypt (Production with Domain)**

```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate (requires domain pointing to your server)
sudo certbot certonly --standalone -d mimir.yourdomain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/mimir.yourdomain.com/fullchain.pem nginx/ssl/mimir.crt
sudo cp /etc/letsencrypt/live/mimir.yourdomain.com/privkey.pem nginx/ssl/mimir.key
sudo chown $USER:$USER nginx/ssl/mimir.*
```

### Step 3: Generate API Key (1 minute)

```bash
# Generate secure API key
export MIMIR_API_KEY=$(openssl rand -base64 32)

# Save to .env file
echo "" >> .env
echo "# Nginx Reverse Proxy Security" >> .env
echo "MIMIR_API_KEY=${MIMIR_API_KEY}" >> .env

# Display key (save this for clients)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Your Mimir API Key (save this!):"
echo "${MIMIR_API_KEY}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Optionally, save to a secure file
echo "${MIMIR_API_KEY}" > nginx/.api-keys
chmod 600 nginx/.api-keys
```

### Step 4: Create Nginx Configuration (5 minutes)

**⚠️ Important**: The configuration below uses `${MIMIR_API_KEY}` for environment variable substitution. Standard Nginx doesn't support this natively. You have two options:

1. **Use envsubst** (recommended for Docker):
   ```bash
   # Process config with envsubst before starting Nginx
   envsubst '${MIMIR_API_KEY}' < nginx.conf.template > nginx.conf
   ```

2. **Use Docker environment variables** (shown in docker-compose.yml below):
   The docker-compose configuration passes the environment variable to the container.

Create `nginx/nginx.conf`:

```nginx
# Nginx Configuration for Mimir Reverse Proxy
# Version: 1.0.0
# Last Updated: 2025-11-21

user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging format with detailed information
    log_format detailed '$remote_addr - $remote_user [$time_local] '
                       '"$request" $status $body_bytes_sent '
                       '"$http_referer" "$http_user_agent" '
                       'rt=$request_time uct="$upstream_connect_time" '
                       'uht="$upstream_header_time" urt="$upstream_response_time" '
                       'api_key=$http_x_api_key';

    access_log /var/log/nginx/access.log detailed;

    # Performance optimizations
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10m;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript 
               application/json application/javascript application/xml+rss;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
    limit_req_zone $binary_remote_addr zone=mcp_limit:10m rate=200r/m;
    limit_req_zone $binary_remote_addr zone=health_limit:10m rate=10r/s;
    
    # Connection limiting
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

    # Upstream configuration
    upstream mimir_backend {
        server mimir_server:9042 max_fails=3 fail_timeout=30s;
        keepalive 32;
    }

    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name _;
        
        # Allow Let's Encrypt challenges
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        # Redirect all other traffic to HTTPS
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name _;

        # SSL/TLS Configuration
        ssl_certificate /etc/nginx/ssl/mimir.crt;
        ssl_certificate_key /etc/nginx/ssl/mimir.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
        ssl_prefer_server_ciphers off;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;
        ssl_stapling on;
        ssl_stapling_verify on;

        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;

        # Connection limiting
        limit_conn conn_limit 10;

        # Health check endpoint (public, no auth required)
        location = /health {
            limit_req zone=health_limit burst=20 nodelay;
            
            proxy_pass http://mimir_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Short timeout for health checks
            proxy_connect_timeout 5s;
            proxy_send_timeout 5s;
            proxy_read_timeout 5s;
        }

        # MCP endpoint (requires authentication)
        location /mcp {
            # Rate limiting (higher limit for MCP)
            limit_req zone=mcp_limit burst=50 nodelay;

            # API Key Authentication
            set $api_key_valid 0;
            if ($http_x_api_key = "${MIMIR_API_KEY}") {
                set $api_key_valid 1;
            }
            if ($api_key_valid = 0) {
                return 401 '{"error":"Unauthorized","message":"Invalid or missing X-API-Key header"}';
            }

            # Proxy to Mimir
            proxy_pass http://mimir_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Longer timeouts for MCP (agent operations can be slow)
            proxy_connect_timeout 60s;
            proxy_send_timeout 300s;
            proxy_read_timeout 300s;
            
            # Buffering
            proxy_buffering off;
            proxy_request_buffering off;
        }

        # API endpoints (requires authentication)
        location /api/ {
            # Rate limiting
            limit_req zone=api_limit burst=20 nodelay;

            # API Key Authentication
            set $api_key_valid 0;
            if ($http_x_api_key = "${MIMIR_API_KEY}") {
                set $api_key_valid 1;
            }
            if ($api_key_valid = 0) {
                return 401 '{"error":"Unauthorized","message":"Invalid or missing X-API-Key header"}';
            }

            # Proxy to Mimir
            proxy_pass http://mimir_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Standard timeouts
            proxy_connect_timeout 30s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Frontend/UI (public, no auth required)
        location / {
            # Rate limiting (generous for UI)
            limit_req zone=api_limit burst=50 nodelay;

            # Proxy to Mimir
            proxy_pass http://mimir_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Standard timeouts
            proxy_connect_timeout 30s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }
    }
}
```

**Optional: IP Whitelisting**

If you want to restrict access to specific IPs, add this to the `server` block:

```nginx
# IP Whitelisting (add before location blocks)
# Allow specific IPs
allow 10.0.0.0/8;        # Internal network
allow 192.168.0.0/16;    # Private network
allow 172.16.0.0/12;     # Docker network
allow 203.0.113.0/24;    # Your office IP range
deny all;                # Deny everyone else
```

### Step 5: Create Docker Compose Override (5 minutes)

Create `docker-compose.security.yml`:

```yaml
version: '3.8'

services:
  # Nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: mimir_nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./nginx/logs:/var/log/nginx
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
    environment:
      - MIMIR_API_KEY=${MIMIR_API_KEY}
    depends_on:
      - mimir_server
    networks:
      - mimir_network
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Mimir Server (no longer directly exposed)
  mimir_server:
    # Remove or comment out the ports section
    # ports:
    #   - "9042:9042"
    
    # Use expose instead (only accessible within Docker network)
    expose:
      - "9042"
    
    # Add environment variable to indicate running behind proxy
    environment:
      - BEHIND_PROXY=true
      - TRUST_PROXY=true

  # Neo4j (remove HTTP port, keep only Bolt)
  neo4j:
    ports:
      # Remove HTTP port 7474 (security risk)
      # - "7474:7474"
      - "7687:7687"  # Keep Bolt for internal connections

networks:
  mimir_network:
    driver: bridge
```

### Step 6: Start Secured Stack (2 minutes)

```bash
# Stop existing Mimir (if running)
docker-compose down

# Start with security layer
docker-compose -f docker-compose.yml -f docker-compose.security.yml up -d

# Check status
docker-compose -f docker-compose.yml -f docker-compose.security.yml ps

# View logs
docker-compose -f docker-compose.yml -f docker-compose.security.yml logs -f nginx
```

---

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# ============================================================================
# REVERSE PROXY SECURITY CONFIGURATION
# ============================================================================

# API Key for authentication (generated in Step 3)
MIMIR_API_KEY=your-generated-api-key-here

# Rate Limiting (requests per minute)
NGINX_RATE_LIMIT_API=100
NGINX_RATE_LIMIT_MCP=200
NGINX_RATE_LIMIT_HEALTH=600

# SSL/TLS Configuration
NGINX_SSL_PROTOCOLS=TLSv1.2 TLSv1.3
NGINX_SSL_CIPHERS=ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256

# Proxy Timeouts (seconds)
NGINX_PROXY_CONNECT_TIMEOUT=30
NGINX_PROXY_SEND_TIMEOUT=60
NGINX_PROXY_READ_TIMEOUT=60

# Logging
NGINX_ACCESS_LOG=/var/log/nginx/access.log
NGINX_ERROR_LOG=/var/log/nginx/error.log

# IP Whitelisting (optional, comma-separated)
# NGINX_ALLOWED_IPS=10.0.0.0/8,192.168.0.0/16,203.0.113.0/24
```

### Multiple API Keys (Optional)

To support multiple API keys (e.g., different keys per client):

1. Create `nginx/conf.d/api-keys.conf`:

```nginx
# API Keys Map
map $http_x_api_key $api_key_name {
    default "invalid";
    "key1-xxxxxxxxxxxxxxxxxxxxxxxx" "client1";
    "key2-yyyyyyyyyyyyyyyyyyyyyyyy" "client2";
    "key3-zzzzzzzzzzzzzzzzzzzzzzzz" "admin";
}

# Validation
map $api_key_name $api_key_valid {
    default 0;
    "client1" 1;
    "client2" 1;
    "admin" 1;
}
```

2. Update `nginx.conf` to use the map:

```nginx
# Replace the if block with:
if ($api_key_valid = 0) {
    return 401 '{"error":"Unauthorized","message":"Invalid or missing X-API-Key header"}';
}
```

---

## Testing

### Test 1: HTTPS Redirect

```bash
# HTTP should redirect to HTTPS
curl -I http://localhost/health
# Expected: 301 Moved Permanently, Location: https://...
```

### Test 2: Health Check (No Auth Required)

```bash
# Health check should work without API key
curl -k https://localhost/health
# Expected: 200 OK, {"status":"healthy",...}
```

### Test 3: API Authentication

```bash
# Without API key - should fail
curl -k https://localhost/api/nodes/query \
  -H "Content-Type: application/json" \
  -d '{"type":"todo"}'
# Expected: 401 Unauthorized

# With API key - should work
curl -k https://localhost/api/nodes/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${MIMIR_API_KEY}" \
  -d '{"type":"todo"}'
# Expected: 200 OK, {"results":[...]}
```

### Test 4: Rate Limiting

```bash
# Send 150 requests rapidly
for i in {1..150}; do
  curl -k -H "X-API-Key: ${MIMIR_API_KEY}" https://localhost/health
done
# Expected: First 100-120 succeed, rest return 429 Too Many Requests
```

### Test 5: MCP Endpoint

```bash
# Test MCP with API key
curl -k -X POST https://localhost/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-API-Key: ${MIMIR_API_KEY}" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
# Expected: 200 OK, list of tools
```

### Test 6: Security Headers

```bash
# Check security headers
curl -k -I https://localhost/health
# Expected headers:
# Strict-Transport-Security: max-age=31536000; includeSubDomains
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# X-XSS-Protection: 1; mode=block
```

---

## Monitoring

### View Access Logs

```bash
# Real-time access logs
docker-compose -f docker-compose.yml -f docker-compose.security.yml \
  logs -f nginx | grep access

# Or directly from log file
tail -f nginx/logs/access.log
```

### View Error Logs

```bash
# Real-time error logs
docker-compose -f docker-compose.yml -f docker-compose.security.yml \
  logs -f nginx | grep error

# Or directly from log file
tail -f nginx/logs/error.log
```

### Monitor Rate Limiting

```bash
# Count 429 errors (rate limited requests)
grep "429" nginx/logs/access.log | wc -l

# Show IPs being rate limited
grep "429" nginx/logs/access.log | awk '{print $1}' | sort | uniq -c | sort -rn
```

### Monitor Authentication Failures

```bash
# Count 401 errors (failed authentication)
grep "401" nginx/logs/access.log | wc -l

# Show attempted API keys (first 8 chars)
grep "401" nginx/logs/access.log | grep -oP 'api_key=\K[^"]*' | sort | uniq -c
```

### Nginx Status (Optional)

Add to `nginx.conf` server block:

```nginx
location /nginx_status {
    stub_status on;
    access_log off;
    allow 127.0.0.1;
    deny all;
}
```

Check status:

```bash
docker-compose exec nginx curl http://localhost/nginx_status
```

---

## Troubleshooting

### Issue 1: "Connection Refused"

**Symptoms**: Cannot connect to https://localhost

**Solutions**:
```bash
# Check if Nginx is running
docker-compose ps nginx

# Check Nginx logs
docker-compose logs nginx

# Verify ports are exposed
docker-compose port nginx 443

# Check if mimir_server is accessible from nginx
docker-compose exec nginx ping mimir_server
```

### Issue 2: "SSL Certificate Error"

**Symptoms**: Browser shows "Your connection is not private"

**Solutions**:
- **Self-signed cert**: This is expected. Click "Advanced" → "Proceed" (or use `-k` with curl)
- **Production**: Use Let's Encrypt certificate (see Step 2, Option B)
- **Add to trust store**: Import `nginx/ssl/mimir.crt` to your system's trust store

### Issue 3: "401 Unauthorized" with Valid Key

**Symptoms**: API key is correct but still getting 401

**Solutions**:
```bash
# Check if API key is set in Nginx environment
docker-compose exec nginx env | grep MIMIR_API_KEY

# Verify key matches
echo $MIMIR_API_KEY

# Check Nginx config syntax
docker-compose exec nginx nginx -t

# Reload Nginx configuration
docker-compose exec nginx nginx -s reload
```

### Issue 4: "429 Too Many Requests"

**Symptoms**: Legitimate traffic being rate limited

**Solutions**:
```nginx
# Increase rate limits in nginx.conf
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=200r/m;  # Increase from 100

# Or increase burst
limit_req zone=api_limit burst=50 nodelay;  # Increase from 20
```

Then reload:
```bash
docker-compose exec nginx nginx -s reload
```

### Issue 5: "502 Bad Gateway"

**Symptoms**: Nginx can't reach Mimir

**Solutions**:
```bash
# Check if mimir_server is running
docker-compose ps mimir_server

# Check if mimir_server is healthy
curl http://localhost:9042/health

# Check Docker network
docker network inspect mimir_network

# Restart mimir_server
docker-compose restart mimir_server
```

---

## Upgrading

### Adding OAuth 2.0 (Future)

When ready to upgrade from API keys to OAuth:

1. Keep Nginx configuration
2. Replace API key validation with OAuth token validation
3. Use `nginx-lua` or external auth service

### Adding WAF (Web Application Firewall)

To add ModSecurity WAF:

```yaml
# docker-compose.security.yml
nginx:
  image: owasp/modsecurity-cri:nginx-alpine
  # ... rest of config
```

### Adding mTLS (Mutual TLS)

For client certificate authentication:

```nginx
# nginx.conf
ssl_client_certificate /etc/nginx/ssl/ca.crt;
ssl_verify_client on;
```

---

## Maintenance

### Rotate API Keys

```bash
# Generate new key
NEW_KEY=$(openssl rand -base64 32)

# Update .env
sed -i "s/MIMIR_API_KEY=.*/MIMIR_API_KEY=${NEW_KEY}/" .env

# Restart Nginx
docker-compose restart nginx

# Notify clients of new key
echo "New API key: ${NEW_KEY}"
```

### Renew SSL Certificate

**Self-Signed**:
```bash
# Regenerate (valid for 1 year)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/mimir.key \
  -out nginx/ssl/mimir.crt \
  -subj "/C=US/ST=State/L=City/O=Company/OU=IT/CN=mimir.local"

# Reload Nginx
docker-compose exec nginx nginx -s reload
```

**Let's Encrypt**:
```bash
# Renew (automatic with certbot)
sudo certbot renew

# Copy new certificates
sudo cp /etc/letsencrypt/live/mimir.yourdomain.com/fullchain.pem nginx/ssl/mimir.crt
sudo cp /etc/letsencrypt/live/mimir.yourdomain.com/privkey.pem nginx/ssl/mimir.key

# Reload Nginx
docker-compose exec nginx nginx -s reload
```

### Backup Configuration

```bash
# Backup Nginx config and certificates
tar czf mimir-nginx-backup-$(date +%Y%m%d).tar.gz \
  nginx/nginx.conf \
  nginx/ssl/ \
  nginx/conf.d/ \
  .env

# Store securely
mv mimir-nginx-backup-*.tar.gz ~/backups/
```

---

## Security Checklist

Before going to production:

- [ ] SSL certificate installed (Let's Encrypt for production)
- [ ] API key generated and securely stored
- [ ] Rate limits configured appropriately
- [ ] IP whitelisting configured (if needed)
- [ ] Mimir ports no longer exposed directly (only via Nginx)
- [ ] Neo4j HTTP port (7474) disabled
- [ ] Nginx logs being monitored
- [ ] Backup of configuration created
- [ ] Clients updated with new HTTPS URL and API key
- [ ] Health check endpoint verified
- [ ] Rate limiting tested
- [ ] Authentication tested
- [ ] SSL/TLS tested (ssllabs.com scan)

---

## Performance Tuning

### For High Traffic

```nginx
# nginx.conf
worker_processes auto;  # Use all CPU cores
worker_connections 4096;  # Increase from 1024

# Increase rate limits
limit_req_zone $binary_remote_addr zone=api_limit:50m rate=500r/m;

# Increase connection pool
upstream mimir_backend {
    server mimir_server:9042;
    keepalive 128;  # Increase from 32
}
```

### For Low Latency

```nginx
# Disable buffering for real-time responses
proxy_buffering off;
proxy_request_buffering off;

# Reduce timeouts
proxy_connect_timeout 10s;
proxy_send_timeout 30s;
proxy_read_timeout 30s;
```

---

## Summary

**What You Get**:
- ✅ HTTPS/TLS encryption
- ✅ API key authentication
- ✅ Rate limiting (100 req/min)
- ✅ Security headers
- ✅ Request logging
- ✅ IP whitelisting (optional)

**Implementation Time**: 2-4 hours

**Cost**: $0 (open-source)

**Maintenance**: Minimal (rotate keys quarterly, renew certs annually)

**Next Steps**:
- Phase 2: Add OAuth 2.0 ([Enterprise Readiness Audit](./ENTERPRISE_READINESS_AUDIT.md#phase-2-compliance-basics-2-4-weeks))
- Phase 3: Add RBAC, MFA, encryption ([Enterprise Readiness Audit](./ENTERPRISE_READINESS_AUDIT.md#phase-3-enterprise-hardening-1-2-months))

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-11-21  
**Maintainer**: Security Team  
**Status**: Production-Ready
