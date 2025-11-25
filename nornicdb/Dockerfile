FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git make

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -o nornicdb ./cmd/nornicdb

# Runtime image
FROM alpine:3.19

RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy binary
COPY --from=builder /app/nornicdb /usr/local/bin/nornicdb

# Create data directory
RUN mkdir -p /data

# Default configuration
ENV NORNICDB_DATA_DIR=/data
ENV NORNICDB_BOLT_PORT=7687
ENV NORNICDB_HTTP_PORT=7474

EXPOSE 7687 7474

VOLUME ["/data"]

ENTRYPOINT ["nornicdb"]
CMD ["serve"]
