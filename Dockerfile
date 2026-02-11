# ─── Build Stage ───
FROM golang:1.24-bookworm AS builder

WORKDIR /app

# Copy dependency files first
COPY go.mod ./
# Download dependencies (even if none external, good practice)
RUN go mod download

# Copy the entire source code
COPY . .

# Verification: List files to ensure copy worked (debug step)
RUN ls -la && ls -la cmd/ && ls -la cmd/goshare/

# Build the application
# Use -v to see what packages are being compiled
RUN CGO_ENABLED=0 GOOS=linux go build -v -o goshare-app ./cmd/goshare

# ─── Production Stage ───
FROM alpine:latest

# Security: Install certificates
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
