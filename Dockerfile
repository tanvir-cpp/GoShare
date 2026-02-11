# ─── Build Stage ───
FROM golang:1.24.0-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy source code
COPY . .

# Ensure dependencies are correct (even if using only standard library)
RUN go mod tidy

# Build as a static binary
# Targeting the explicit main.go file path
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o goshare cmd/goshare/main.go

# ─── Production Stage ───
FROM alpine:latest

# Security: Create a non-root user
RUN adduser -D -u 1000 appuser
WORKDIR /app

# Copy the binary and static assets
COPY --from=builder /app/goshare .
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
