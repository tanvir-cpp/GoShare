# Build Stage
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy dependency files first for layer caching
COPY go.mod ./
# RUN go mod download # Only if go.sum exists or there are external deps

# Copy the rest of the source code
COPY . .

# Build optimized static binary
# -ldflags="-s -w" reduces binary size by removing debug info
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o goshare ./cmd/goshare

# Final Production Stage
FROM alpine:latest

# Create a non-root user for security
RUN adduser -D -u 1000 appuser
WORKDIR /app

# Copy the binary and required assets
COPY --from=builder /app/goshare .
COPY --from=builder /app/web ./web

# Create storage directory for uploads
RUN mkdir -p shared_files && chown appuser:appuser shared_files

# Expose the service port
EXPOSE 8080

# Switch to non-root user
USER appuser

# Start the application
CMD ["./goshare"]
