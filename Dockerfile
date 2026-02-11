# ─── Build Stage ───
# Using the stable Go 1.24 image (Debian-based for build stability)
FROM golang:1.24 AS builder

WORKDIR /app

# Copy the entire project
COPY . .

# Build as a truly static binary
# -a: force rebuilding of packages
# -installsuffix cgo: ensures we don't use local cgo deps
RUN CGO_ENABLED=0 GOOS=linux go build \
    -a -installsuffix cgo \
    -ldflags="-s -w -extldflags '-static'" \
    -o /goshare ./cmd/goshare

# ─── Production Stage ───
FROM alpine:latest

# Security: Install CA certificates for any HTTPS outgoing traffic
RUN apk add --no-cache ca-certificates

# Create a non-root user
RUN adduser -D -u 1000 appuser
WORKDIR /app

# Copy the binary and static assets
COPY --from=builder /goshare .
COPY --from=builder /app/web ./web

# Create storage directory and set permissions
RUN mkdir -p shared_files && chown appuser:appuser shared_files

# --- Configuration ---
ENV PORT=8080
ENV SHARED_DIR=shared_files

# Expose the service port
EXPOSE 8080

# Switch to the non-root user
USER appuser

# Start the application
CMD ["./goshare"]
