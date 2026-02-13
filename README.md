# 🚀 GoShare

[![License: MIT](https://img.shields.io/badge/License-MIT-white.svg)](https://opensource.org/licenses/MIT)
[![Go Report Card](https://goreportcard.com/badge/github.com/tanvir-cpp/GoShare)](https://goreportcard.com/report/github.com/tanvir-cpp/GoShare)
[![CI](https://github.com/tanvir-cpp/GoShare/actions/workflows/ci.yml/badge.svg)](https://github.com/tanvir-cpp/GoShare/actions/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](docs/CONTRIBUTING.md)

**GoShare** is a high-performance, minimalist file-sharing platform designed for speed, privacy, and simplicity. It enables seamless file transfers across local networks (LAN) and direct browser-to-browser transfers (P2P) using WebRTC, all without requiring accounts or cloud storage.

---

## ✨ Key Features

- **🌐 Smart LAN Discovery** — Automatically detects devices on the same Wi-Fi network using public IP grouping, ensuring privacy in shared environments (like university networks).
- **🛡️ Secure P2P Transfers** — Direct peer-to-peer sharing via WebRTC DataChannels — your files never touch the server and are end-to-end encrypted.
- **📱 Installable PWA** — Works on any device with a modern browser and can be installed as a native-like app on mobile and desktop.
- **🎨 Premium Dark UI** — A stunning interface with glassmorphism, micro-animations, and sophisticated dark mode.
- **🔒 Security Hardened** — Rate limiting, upload size limits, security headers, HTTP method enforcement, and automatic stale file cleanup.
- **⚡ Zero Configuration** — Just run the binary or Docker container and start sharing.

---

## 🛠️ Quick Start

### 1. Run with Go (from source)
Ensure you have **Go 1.24+** installed.
```bash
# Clone the repository
git clone https://github.com/tanvir-cpp/GoShare.git
cd GoShare

# Run directly from the root
go run ./cmd/goshare

# OR Build and run the binary
go build -o goshare ./cmd/goshare
./goshare
```

### 2. Run Pre-built Binary (Windows)
```powershell
.\goshare.exe
```

### 3. Run with Docker
```bash
docker build -t goshare .
docker run -p 8080:8080 goshare
```

The application will start on port `8080`. Access it at `http://localhost:8080` (or your local IP).

### CLI Flags
| Flag | Default | Description |
|------|---------|-------------|
| `-p` | `8080` | Port number |
| `-d` | `shared_files` | Shared directory path |

Environment variables `PORT` and `SHARED_DIR` override flags (useful for cloud deployments).

---

## 📖 Usage Guide

GoShare offers two modes of operation:

1.  **LAN Mode (Nearby Sharing)**:
    -   Connect all devices to the same Wi-Fi or Local Network.
    -   Click on **"Nearby"** in the top navigation.
    -   Devices will automatically appear on the radar. Drag and drop files onto a device icon to send.

2.  **P2P Mode (Global Sharing)**:
    -   Click on **"Global"** in the top navigation.
    -   Select the files you want to share.
    -   Click **"Create Secure Link"**.
    -   Share the generated URL or QR code with your recipient.

3.  **Install as App (PWA)**:
    -   **Android**: Open in Chrome → Menu → *"Install app"*
    -   **iOS**: Open in Safari → Share → *"Add to Home Screen"*
    -   **Desktop**: Click the install icon in Chrome's address bar

---

## 🏗️ Architecture

```
GoShare/
├── cmd/goshare/          # Application entry point
│   └── main.go
├── internal/
│   ├── discovery/        # Device registry & network-aware discovery
│   │   └── device.go     # Device model, IP detection & SSE broadcasting
│   ├── handler/          # HTTP handlers & middleware
│   │   ├── lan.go        # LAN file sharing endpoints
│   │   ├── p2p.go        # WebRTC signaling endpoints
│   │   ├── middleware.go  # CORS, security headers, panic recovery
│   │   ├── ratelimit.go  # Per-IP rate limiting
│   │   └── cleanup.go    # Stale private file cleanup
│   ├── network/          # Network utilities
│   │   └── ip.go         # Local IP detection
│   └── server/           # HTTP server & routing
│       ├── server.go     # Graceful shutdown, static file serving
│       └── routes.go     # Route registration & middleware chain
├── web/
│   ├── pages/            # HTML pages (home, lan, p2p, 404)
│   ├── static/           # CSS, JS, icons, manifest
│   └── sw.js             # Service worker (PWA offline caching)
├── docs/                 # Documentation
├── Dockerfile            # Multi-stage Docker build
└── .github/workflows/    # CI/CD pipeline
```

---

## 🔒 Security

GoShare includes multiple layers of security hardening:

| Feature | Details |
|---------|---------|
| **Rate Limiting** | 300 requests/minute per IP address (SSE connections exempted) |
| **Upload Size Limit** | 500 MB maximum per upload |
| **Security Headers** | `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy` |
| **Method Enforcement** | POST-only for register/upload, DELETE-only for file deletion |
| **Path Traversal Defense** | All filenames validated against directory traversal attacks |
| **Stale File Cleanup** | Private files auto-deleted after 30 minutes |
| **Panic Recovery** | Server stays alive even if a handler panics |

For full details, see [SECURITY.md](docs/SECURITY.md).

---

## 🧪 Testing

Run the full test suite:
```bash
go test -v ./...
```

Run with race detection:
```bash
go test -race ./...
```

Tests cover:
- Handler endpoints (register, upload, delete, download, health, info)
- P2P signaling (room creation, signaling, polling)
- Middleware (CORS, security headers, panic recovery, rate limiting)
- Discovery (device naming, icon assignment, type detection)
- Network (local IP detection)

---

## 🚢 Deployment

GoShare is optimized for modern cloud platforms.

### Health Check
A `/health` endpoint returns `{"status":"ok"}` for container liveness/readiness probes.

### [Koyeb](https://app.koyeb.com/)
Deploying to Koyeb is the recommended way to get GoShare global:
1. Connect your GitHub repository.
2. Select the `deploy-koyeb` branch.
3. Select "Docker" as the build type.
4. Koyeb will automatically build and deploy using the provided `Dockerfile`.

### CI/CD
Every push to `main` or `dev` triggers a GitHub Actions pipeline that:
1. Builds the Go binary
2. Runs the full test suite with race detection
3. Runs `go vet` for static analysis
4. Builds the Docker image (on `main` only)

---

## 📚 Documentation

- [**Technical Documentation**](docs/DOCUMENTATION.md): Deep dive into architecture, signaling, and internals.
- [**Contributing Guide**](docs/CONTRIBUTING.md): Learn how to help improve GoShare.
- [**Security Policy**](docs/SECURITY.md): Details on our security model and reporting vulnerabilities.

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

Please see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for more details.

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.

---

<p align="center">
  Built with ❤️ for a faster, more private web.
</p>

