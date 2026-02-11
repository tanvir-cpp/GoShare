# 📖 GoShare Technical Documentation

This document provides a deep dive into the architecture, signaling logic, and implementation details of GoShare.

## 🏗️ Architecture

GoShare follows a "Fat Client, Thin Server" philosophy. The server manages discovery and signaling, while the clients (browsers) handle the heavy lifting of UI state and actual file data transfer (P2P).

### Backend (Go)
The backend is built using pure Go standard library components to ensure maximum portability and minimal footprint.
- **Port Handling**: Prioritizes the `PORT` environment variable for cloud compatibility.
- **In-Memory Registry**: Uses a thread-safe map (`sync.RWMutex`) to track active devices.
- **Event Streaming**: Implements Server-Sent Events (SSE) for real-time updates without the overhead of WebSockets.

### Frontend (Vanilla Stack)
- **Logic**: ES6+ JavaScript.
- **Styles**: Custom Vanilla CSS design system.
- **Real-time**: EventSource API for receiving peer updates.

---

## 📡 Signaling & Discovery

### LAN Mode (SSE)
When a device joins the LAN network, it registers via `/api/register`. It then opens an SSE connection at `/api/events`.
- **Peer Join**: When User A joins, the server sends an `event: device-joined` to User B and C.
- **Peer Leave**: Managed via both explicit disconnect and a background `CleanupStale` goroutine that monitors heartbeats.

### P2P Mode (Signaling Broker)
Since WebRTC requires an initial metadata exchange (Offer/Answer), GoShare provides a signaling broker:
1. **Create Room**: `POST /api/p2p/create` returns a unique room ID.
2. **Post Signal**: `POST /api/p2p/signal` allows a peer to push an SDP or ICE candidate.
3. **Poll Signals**: `GET /api/p2p/poll?room={id}&role={role}&since={index}` allows the other peer to retrieve pending signals.

---

## 🔌 API Reference

### Device Management
- `POST /api/register`: Register a new device with a unique ID.
- `GET /api/events?id={id}`: SSE endpoint for peer updates.
- `GET /api/device/{id}`: Metadata for a specific device.

### File Transfer (LAN)
- `POST /api/upload`: Multi-part form upload. Supports `public` and `private` (to specific device) transfers.
- `GET /api/files`: List all publicly shared files.
- `GET /download/{filename}?id={my_id}`: Download a file. Private files are auto-deleted after one successful download.
- `DELETE /api/delete/{filename}`: Remove a file from the public directory.

### signaling (P2P)
- `POST /api/p2p/create`: Initialize a P2P room.
- `POST /api/p2p/signal`: Send WebRTC signaling data.
- `GET /api/p2p/poll`: Long-polling or frequent polling for signals.

---

## 🔒 Security Considerations

- **Direct Transfer**: In P2P mode, file data is encrypted by WebRTC (DTLS/SRTP) and never touches the server.
- **Ephemeral Storage**: In LAN mode, private files are deleted immediately after download.
- **Zero Accounts**: No user data is stored; identities are temporary and based on browser IDs.
