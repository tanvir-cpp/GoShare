# 🛡️ Security Policy

## Supported Versions

The following versions of GoShare are currently supported for security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## 🛡️ Security Hardening Measures

GoShare is built with security as a core pillar. We implement several layers of protection:

### 1. Direct P2P Encryption
In **P2P Mode**, file data is transferred directly browser-to-browser via WebRTC `DataChannels`. The server acts only as a signaling broker (exchanging metadata).
- **End-to-End Encryption**: Data is encrypted using DTLS (Datagram Transport Layer Security) and SRTP (Secure Real-time Transport Protocol).
- **Non-Persistent**: File data never touches our disks or memory in P2P mode.

### 2. Safeguarded LAN Transfers
In **LAN Mode**, files are temporarily stored and streamed:
- **Ephemeral Storage**: Private files sent to a specific device are automatically deleted from the server's disk immediately after a successful download.
- **Memory Protection**: Multipart form parsing is limited to a 32MB RAM buffer; larger files are streamed directly to disk to prevent Denial-of-Service (DoS) through memory exhaustion.

### 3. Path Traversal Defense
- **Strict Sanitization**: All incoming filenames are processed through `filepath.Base` to remove directory segments.
- **ID Validation**: Device IDs and destination paths are validated against alphanumeric patterns to prevent unauthorized file access.

### 4. Zero Data Footprint
- **No Accounts**: There are no database-backed accounts. Identities are ephemeral.
- **Privacy by Design**: We store no user logs, metadata beyond what's needed for the active session, or tracking cookies.

### 5. Network Isolation
- **Smart Grouping**: In deployed environments (like Koyeb), devices are grouped by their public IP address.
- **Privacy Barrier**: Users can only discover and share files with peers on the same local network (e.g., University Wi-Fi). This prevents users on different networks from seeing each other on the "Nearby" radar.

---

## 🛑 Reporting a Vulnerability

If you discover a security vulnerability within GoShare, please report it immediately.

**Please DO NOT report security vulnerabilities via public GitHub issues.**

Instead, please contact the maintainers via the GitHub Security Advisory system (if enabled) or reach out privately. We aim to respond to all security reports within 48 hours.

We value the work of security researchers and will work with you to ensure a coordinated disclosure.
