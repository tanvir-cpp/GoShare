# GoShare Documentation

GoShare is a lightweight, high-performance file sharing application written in Go and Vanilla JavaScript. It supports two modes of transfer:
1. **LAN Mode**: Auto-discovery and drag-and-drop sharing on local networks.
2. **P2P Mode**: Secure, direct browser-to-browser transfer over the internet using WebRTC.

## 1. Architecture Overview

### Backend (Go)
The backend uses only the Go standard library (plus `package net` dependencies). It serves three main purposes:
- **Static File Server**: Serves the frontend (`web/` directory).
- **LAN Discovery & Signaling**: Manages device registration and broadcasts events (peers joining, files sent) using Server-Sent Events (SSE).
- **P2P Signaling**: Acts as a lightweight message broker for WebRTC handshake (Offer/Answer/ICE).

**Key Directories:**
- `main.go`: Entry point. Sets up HTTP server, routes, and `PORT` configuration.
- `pkg/discovery`: Handles in-memory device registry and SSE broadcasting.
- `pkg/handlers`: Contains all API logic (LAN upload, deletion, P2P creation).
- `pkg/network`: Utility to detect the local machine's LAN IP.

### Frontend (HTML/JS/CSS)
- **Vanilla JS**: No frameworks. Uses ES6+ features (`fetch`, `EventSource`, `RTCPeerConnection`).
- **CSS**: Custom monochromatic "Clean UI" design system (variables, flex/grid, responsiveness).
- **Pages**:
  - `index.html`: Landing page.
  - `lan.html`: Local network dashboard.
  - `p2p.html`: WebRTC transfer interface.

---

## 2. LAN Sharing Logic

**How it works:**
1. **Registration**: When `lan.html` loads, `app.js` calls `/api/register`. The backend generates a random device name (Adjective + Animal) and stores it in memory.
2. **Discovery (SSE)**: The client connects to `/api/events`. The backend keeps this connection open.
   - When a new device registers, the backend broadcasts a `device-joined` event to all open SSE connections.
   - When a device disconnects (heartbeat timeout), a `device-left` event is sent.
3. **Transfer**:
   - **Upload**: Files are POSTed to `/api/upload`. They are stored in `shared_files/public/` (or `private/{id}/`).
   - **Notification**: After upload, the backend sends a `file-sent` SSE event to the target device.
   - **Download**: The recipient clicks the notification to download from `/download/{filename}`.

---

## 3. P2P Sharing Logic (WebRTC)

**How it works:**
1. **Room Creation**: Sender clicks "Share". Frontend calls `/api/p2p/create` to get a unique `roomID`.
2. **Signaling**:
   - Both Sender and Receiver poll `/api/p2p/poll` every second.
   - **Sender** creates a WebRTC Offer and posts it to `/api/p2p/signal`.
   - **Receiver** picks up the Offer via polling, sets it as Remote Description, creates an Answer, and posts it back.
   - **Sender** picks up the Answer.
   - **ICE Candidates** (network paths) are exchanged similarly via the signaling endpoint.
3. **Data Channel**: Once connected, a direct `RTCDataChannel` is opened.
   - Files are chunked (64KB) and sent directly peer-to-peer.
   - **No data passes through the server** during the transfer (only metadata).

---

## 4. Deployment to Koyeb

This repository is configured for zero-config deployment on Koyeb.

**Prerequisites:**
- A [Koyeb account](https://app.koyeb.com/).
- This repository pushed to GitHub.

**Steps:**
1. **Push Branch**: Ensure the `deploy-koyeb` branch is pushed to GitHub.
   ```bash
   git push origin deploy-koyeb
   ```
2. **Create Service**:
   - Go to **Koyeb Dashboard** > **Create Web Service**.
   - Select **GitHub** as the source.
   - Repository: `tanvir-cpp/GoShare`.
   - Branch: `deploy-koyeb`.
   - Builder: **Docker**.
3. **Deploy**:
   - Koyeb will automatically detect the `Dockerfile`.
   - It will inject the `PORT` environment variable.
   - The app will build and go live at `https://<your-app>.koyeb.app`.

---

## 5. Local Development

**Run with Go:**
```bash
go run main.go
# Opens on http://localhost:8080
```

**Run with Docker:**
```bash
docker build -t goshare .
docker run -p 8080:8080 goshare
```

**Configuration:**
- `PORT` env var: Overrides default port 8080.
- `-d` flag: Sets shared files directory (default: `shared_files`).
