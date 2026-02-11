# GoShare

Fast, private file sharing between devices. LAN discovery + P2P transfers via WebRTC.

No accounts. No cloud. Files go directly between devices.

[Full Documentation](DOCUMENTATION.md)

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

opens on `http://localhost:8080`.

## Deployment

### Deploy to Koyeb

1. **Push** this repository to GitHub.
2. **Create Service** on [Koyeb](https://app.koyeb.com/).
3. Select **GitHub** -> `tanvir-cpp/GoShare` -> Branch: `deploy-koyeb`.
4. **Deploy**. Koyeb will auto-detect the Dockerfile and PORT.

### Deploy to Render

1. Create a **Web Service** on [render.com](https://render.com).
2. Connect your repo, select **Docker** runtime.
3. Deploy.

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
