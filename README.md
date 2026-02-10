# GoShare

Fast, private file sharing between devices. LAN discovery + P2P transfers via WebRTC.

No accounts. No cloud. Files go directly between devices.

## Features

- **LAN Share** — Auto-discover devices on your local network. Drag and drop files to send.
- **P2P Share** — Generate a link or QR code. Files transfer directly between browsers using WebRTC.
- **Private** — LAN files never leave your network. P2P uses encrypted WebRTC data channels.
- **Cross-platform** — Works on any device with a modern browser. No app install needed.

## Quick Start

```bash
# Clone and run
git clone https://github.com/tanvir-cpp/GoShare.git
cd GoShare
go run main.go
```

Opens on `http://localhost:8080`. Any device on the same network can connect via the network URL shown in the terminal.

### Options

```
-p    Port number (default: 8080)
-d    Shared files directory (default: shared_files)
```

## Docker

```bash
docker build -t goshare .
docker run -p 8080:8080 goshare
```

## Deploy to Render

1. Push to GitHub
2. Create a **Web Service** on [render.com](https://render.com)
3. Connect your repo, select **Docker** runtime
4. Deploy — get a public URL like `https://goshare.onrender.com`

## Project Structure

```
main.go                 Entry point, router, static server
pkg/
  discovery/            Device discovery, naming, SSE broadcast
  handlers/             API handlers (LAN upload/download, P2P signaling)
  network/              LAN IP detection
web/
  home.html             Homepage
  lan.html              LAN share page
  p2p.html              P2P share page
  app.js                LAN frontend logic
  p2p.js                WebRTC P2P logic
```

## Tech Stack

- **Backend:** Go (standard library only)
- **Frontend:** Tailwind CSS (CDN), vanilla JS
- **P2P:** WebRTC DataChannel with HTTP polling signaling
- **LAN:** Server-Sent Events for real-time peer sync

## License

MIT
