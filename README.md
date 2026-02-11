# 🚀 GoShare

[![License: MIT](https://img.shields.io/badge/License-MIT-white.svg)](https://opensource.org/licenses/MIT)
[![Go Report Card](https://goreportcard.com/badge/github.com/tanvir-cpp/GoShare)](https://goreportcard.com/report/github.com/tanvir-cpp/GoShare)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**GoShare** is a high-performance, minimalist file-sharing platform designed for speed, privacy, and simplicity. It enables seamless file transfers across local networks (LAN) and direct browser-to-browser transfers (P2P) using WebRTC, all without requiring any accounts or cloud storage.

---

## ✨ Key Features

- **🌐 LAN Auto-Discovery**: Instantly find and connect with devices on your local network.
- **🛡️ Secure P2P Transfers**: Direct peer-to-peer sharing via WebRTC DataChannels—your files never touch the server.
- **📱 True Cross-Platform**: Works on any device with a modern browser (Desktop, Mobile, Tablet).
- **⚡ Zero Configuration**: Just run the binary or Docker container and start sharing.
- **🎨 Monochromatic "Pro" UI**: A sophisticated, distraction-free interface built with vanilla technologies.

---

## 🛠️ Quick Start

### Run with Go
```bash
git clone https://github.com/tanvir-cpp/GoShare.git
cd GoShare
go run main.go
```
The application will be available at `http://localhost:8080`.

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
2. Select the `deploy-koyeb` branch.
3. Koyeb will automatically build and deploy using the provided `Dockerfile`.

---

## 📚 Documentation

Detailed documentation on project architecture, API endpoints, and internal logic can be found in the [Documentation Guide](DOCUMENTATION.md).

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for more details.

---

## ⚖️ License

Distributed under the MIT License. See `LICENSE` for more information.
