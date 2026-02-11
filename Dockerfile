# ─── Build Stage ───
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy dependency files first (best for layer caching)
COPY go.mod ./
# RUN go mod download # Uncomment if you add external dependencies

# Copy source code
COPY . .

# Build as a static binary
# -ldflags="-s -w" reduces binary size by ~30%
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o goshare ./cmd/goshare

# ─── Production Stage ───
FROM alpine:latest

# Security: Create a non-root user
RUN adduser -D -u 1000 appuser
WORKDIR /app

# Copy the binary and static assets from the builder stage
COPY --from=builder /app/goshare .
COPY --from=builder /app/web ./web

# Create storage directory and set permissions
RUN mkdir -p shared_files && chown appuser:appuser shared_files

# --- Configuration ---
ENV PORT=8080
ENV SHARED_DIR=shared_files

# Define persistent storage for uploads
VOLUME /app/shared_files

# Expose the service port
EXPOSE 8080

# Basic health check to ensure the API is responsive
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/info || exit 1

# Switch to the non-root user
USER appuser

# Start the application
CMD ["./goshare"]
