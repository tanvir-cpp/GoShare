# 📖 GoShare Technical Documentation

Welcome to the full technical documentation for **GoShare**. This document provides an in-depth analysis of the system architecture, internal modules, communication protocols, and security model.

---

## 1. 🏗️ High-Level Architecture

GoShare is designed as a **decentralized-first** file-sharing platform. It utilizes a "Fat Client, Thin Server" model where the server acts primarily as a discovery and signaling coordinator, while the clients (browsers) manage the UI state and data transfer.

### Core Philosophy
- **Zero-Persistence**: Identites and connections are ephemeral.
- **Privacy-First**: P2P data never touches the server.
- **Portability**: Single-binary Go executable with embedded frontend assets.
- **Premium UX**: Modern "Aero" design system with fluid animations.

---

## 2. 📂 Project Structure

```text
/
├── cmd/goshare/main.go     # Application entry point
├── docs/                   # Project documentation
├── internal/               # Core backend logic (encapsulated)
│   ├── discovery/          # Peer registry and signaling broker
│   ├── handler/            # HTTP request handlers (LAN, P2P, Middleware)
│   ├── network/            # Networking utilities (IP discovery)
│   └── server/             # Server initialization and routing
├── shared_files/           # Temporary disk storage for LAN transfers
└── web/                    # Frontend source
    ├── pages/              # HTML templates
    ├── static/             # Assets (CSS, JS, Images)
```

---

## 3. 🧪 Backend Implementation Details

### `internal/discovery` (The Registry)
This module manages the list of active peers on the local network.
- **Device Struct**: Stores peer metadata (`ID`, `Name`, `Icon`, `Type`, `Queues`).
- **SSE Broadcasting**: Uses Go channels to push events (`device-joined`, `shared-update`, `files-sent`) to connected clients.
- **Cleanup Goroutine**: A background process monitors `LastSeen` timestamps and active connections. Peer entries are purged after 60 seconds of inactivity to keep the registry clean.

### `internal/handler` (Request Processing)
- **`lan.go`**: Handles registration (`/api/register`), SSE connection (`/api/events`), and multi-part file uploads (`/api/upload`). 
  - *Optimization*: Uses a 32MB buffer for multi-part parsing. Files larger than this are streamed directly to disk to prevent RAM spikes.
- **`p2p.go`**: Implements a signaling broker for WebRTC.
  - *Rooms*: Temporary rooms store SDP offers/answers and ICE candidates.
  - *Long-Polling*: Clients use an indexed polling mechanism (`/api/p2p/poll?since=N`) to retrieve signals without missing packets.

### `internal/server` (Service Core)
Handles graceful shutdown by listening for `SIGINT` and `SIGTERM`. It ensures active network listeners are closed and file buffers are flushed before exiting.

---

## 4. 🌐 Frontend Engine

The frontend is a modern SPA (Single Page Application) built with vanilla technologies.

### The Aero Design System
Located in `web/static/css/`, the interface uses:
- **Glassmorphism**: Backdrop filters and semi-transparent layers for a premium look.
- **CSS Variables**: A centralized theme for easy maintenance.
- **Micro-animations**: Subtle transitions for hover states and modal entries.

### Real-Time Updates
GoShare uses the **EventSource API** to receive peer updates from the server. This is lighter and more robust for discovery than WebSockets in a local network environment.

### P2P Protocol (WebRTC)
Implementation in `web/static/js/p2p.js`:
1. **Signaling**: Exchange of SDP and ICE candidates via the signaling broker.
2. **DataChannels**: Direct binary transfer using 64KB chunks.
3. **Buffering**: Monitors `bufferedAmountLow` to maintain maximum throughput without overflow.

---

## 5. 📡 Communication Protocols

### LAN Mode (Client-Server-Client)
- **Registration**: Client POSTs identity to `/api/register`.
- **Discovery**: Server broadcasts `device-joined` via SSE.
- **Transfer**: 
  - Sender uploads file via `/api/upload`.
  - Server notifies receiver via SSE (`files-sent`).
  - Receiver downloads from `/download/{filename}?id={receiver_id}`.
  - *Security*: Private files are auto-deleted from disk immediately after a successful download.

### P2P Mode (Peer-to-Peer)
- **Brokerage**: The server only facilitates the exchange of session metadata.
- **Connection**: Once the WebRTC peer connection is established, data flows directly between browsers.
- **STUN Servers**: Uses Google's public STUN servers for NAT traversal behind firewalls.

---

## 6. 🔒 Security & Privacy Model

- **End-to-End Encryption**: P2P transfers are encrypted using WebRTC's native DTLS/SRTP protocols.
- **Ephemeral Identifiers**: No user accounts or passwords. Identifiers are generated in-browser and forgotten on refresh.
- **Path Traversal Protection**: Backend strictly sanitizes filenames and destination paths to prevent directory traversal attacks.
- **Direct Streaming**: Large LAN files stream directly from the HTTP request body to disk, then from disk to the receiver's response body, minimizing memory footprint.

---

## 7. 🚀 Deployment & Build

### Environment Variables
- `PORT`: Overrides the default port (8080).
- `SHARED_DIR`: Path to the file storage directory (defaults to `./shared_files`).

### Build Command
To build a production binary for your operating system:
```bash
go build -o goshare ./cmd/goshare/main.go
```

For cross-platform builds (e.g., Linux amd64):
```bash
GOOS=linux GOARCH=amd64 go build -o goshare-linux ./cmd/goshare/main.go
```

---

## 8. 🛠️ Troubleshooting

| Issue | Potential Cause | Fix |
|---|---|---|
| Peers not visible | Firewall blocking SSE | Ensure port 8080 (or your custom port) is open. |
| P2P connection fails | Strict Symmetric NAT | P2P might fail in complex corporate networks without a TURN server. |
| Upload fails | Disk Space | Ensure the server has write permissions and space in `shared_files`. |
| SSE disconnects | Browser sleeping | Keep the tab active or ensure "Battery Saver" mode isn't killing SSE. |

---

*Last Updated: February 2026*
