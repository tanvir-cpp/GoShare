# ─── Build Stage ───
FROM golang:1.24-bookworm AS builder

WORKDIR /app

# Copy all files
COPY . .

# Build the application as a static binary
# Using a unique name to avoid directory conflicts
RUN CGO_ENABLED=0 GOOS=linux go build -v -o goshare-app ./cmd/goshare

# ─── Production Stage ───
FROM alpine:latest

# Security: Install certificates for any potential external triggers (WebRTC)
RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy the binary and static assets
COPY --from=builder /app/goshare-app .
COPY --from=builder /app/web ./web

# Create storage directory and set permissions
RUN mkdir -p shared_files && chmod 777 shared_files

# --- Configuration ---
ENV PORT=8080
ENV SHARED_DIR=shared_files

# Expose the service port
EXPOSE 8080

# Run the app
CMD ["./goshare-app"]
