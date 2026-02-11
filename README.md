# 🚀 GoShare

[![License: MIT](https://img.shields.io/badge/License-MIT-white.svg)](https://opensource.org/licenses/MIT)
[![Go Report Card](https://goreportcard.com/badge/github.com/tanvir-cpp/GoShare)](https://goreportcard.com/report/github.com/tanvir-cpp/GoShare)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](docs/CONTRIBUTING.md)

**GoShare** is a high-performance, minimalist file-sharing platform designed for speed, privacy, and simplicity. It enables seamless file transfers across local networks (LAN) and direct browser-to-browser transfers (P2P) using WebRTC, all without requiring accounts or cloud storage.

---

## ✨ Key Features

- **🌐 LAN Auto-Discovery**: Instantly find and connect with devices on your local network using Server-Sent Events (SSE).
- **🛡️ Secure P2P Transfers**: Direct peer-to-peer sharing via WebRTC DataChannels—your files never touch the server and are end-to-end encrypted.
- **📱 True Cross-Platform**: Works on any device with a modern browser (Desktop, Mobile, Tablet).
- **🎨 Premium "Aero" UI**: A stunning, modern interface with glassmorphism, micro-animations, and sophisticated dark mode.
- **🛡️ Robust Reliability**: Built-in graceful shutdown, smart port management, and low-memory multi-part parsing.
- **⚡ Zero Configuration**: Just run the binary or Docker container and start sharing.

---

## 🛠️ Quick Start

### Run with Go
```bash
git clone https://github.com/tanvir-cpp/GoShare.git
cd GoShare
go run ./cmd/goshare/main.go
```
The application will be available at `http://localhost:8080` (or the IP displayed in the console).

### Run with Docker
```bash
docker build -t goshare .
docker run -p 8080:8080 goshare
```

---

## 🚢 Deployment

GoShare is optimized for modern cloud platforms.

### [Koyeb](https://app.koyeb.com/)
Deploying to Koyeb is the recommended way to get GoShare global:
1. Connect your GitHub repository.
2. Select the `main` branch (or your preferred deployment branch).
3. Select "Docker" as the build type.
4. Koyeb will automatically build and deploy using the provided `Dockerfile`.

---

## 📚 Documentation

Explore the inner workings and API of GoShare:
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
