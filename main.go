package main

import (
	"crypto/md5"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ── Config ──────────────────────────────────────────────────────────────────

var (
	sharedDir = "shared_files"
	port      = 8080
	lock      sync.RWMutex
	devices   = make(map[string]*Device)
)

type Device struct {
	ID       string        `json:"id"`
	Name     string        `json:"name"`
	Icon     string        `json:"icon"`
	Type     string        `json:"type"`
	IP       string        `json:"-"`
	UA       string        `json:"-"`
	LastSeen time.Time     `json:"-"`
	Queues   []chan []byte `json:"-"`
}

// ── Device Logic ─────────────────────────────────────────────────────────────

var adjectives = []string{"Swift", "Brave", "Calm", "Bold", "Keen", "Warm", "Cool", "Wise", "Bright", "Happy", "Gentle", "Lucky", "Noble", "Quiet", "Vivid", "Witty"}
var animals = []string{"Panda", "Fox", "Owl", "Wolf", "Bear", "Hawk", "Lynx", "Orca", "Tiger", "Eagle", "Koala", "Raven", "Otter", "Falcon", "Shark", "Bison"}
var icons = []string{"🦊", "🐼", "🦉", "🐺", "🐻", "🦅", "🐱", "🐬", "🐯", "🦁", "🐨", "🐦", "🦦", "🦈", "🐘", "🦋"}

func makeDeviceName(id string) string {
	h := md5.Sum([]byte(id))
	val := int(h[0]) | int(h[1])<<8
	return fmt.Sprintf("%s %s", adjectives[val%len(adjectives)], animals[(val>>8)%len(animals)])
}

func makeDeviceIcon(id string) string {
	h := md5.Sum([]byte(id))
	val := int(h[0])
	return icons[val%len(icons)]
}

func detectType(ua string) string {
	ua = strings.ToLower(ua)
	if strings.Contains(ua, "iphone") || (strings.Contains(ua, "android") && strings.Contains(ua, "mobile")) {
		return "phone"
	}
	if strings.Contains(ua, "ipad") || strings.Contains(ua, "tablet") {
		return "tablet"
	}
	return "desktop"
}

func broadcast(eventType string, data interface{}, excludeID string) {
	msg, _ := json.Marshal(data)
	sseMsg := []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, msg))

	lock.RLock()
	defer lock.RUnlock()
	for id, dev := range devices {
		if id == excludeID {
			continue
		}
		for _, q := range dev.Queues {
			select {
			case q <- sseMsg:
			default:
			}
		}
	}
}

func notify(id string, eventType string, data interface{}) {
	msg, _ := json.Marshal(data)
	sseMsg := []byte(fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, msg))

	lock.RLock()
	dev, ok := devices[id]
	lock.RUnlock()

	if ok {
		for _, q := range dev.Queues {
			select {
			case q <- sseMsg:
			default:
			}
		}
	}
}

func cleanupStale() {
	for {
		time.Sleep(15 * time.Second)
		var stale []string
		lock.RLock()
		for id, dev := range devices {
			if time.Since(dev.LastSeen) > 60*time.Second && len(dev.Queues) == 0 {
				stale = append(stale, id)
			}
		}
		lock.RUnlock()

		if len(stale) > 0 {
			lock.Lock()
			for _, id := range stale {
				delete(devices, id)
			}
			lock.Unlock()
			for _, id := range stale {
				broadcast("device-left", map[string]string{"id": id}, "")
			}
		}
	}
}

// ── HTML Template ───────────────────────────────────────────────────────────

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SnapShare Go</title>
<style>
:root{
  --bg1:#0c0e1a;--bg2:#151832;--surface:#1a1e3a;
  --glass:rgba(255,255,255,.06);--border:rgba(255,255,255,.08);
  --text:#e2e8f0;--muted:#7a84a6;--accent:#6c63ff;
  --accent2:#00d4aa;--pink:#ff6b9d;--warn:#fbbf24;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;overflow:hidden}
body{
  font-family:'Segoe UI',system-ui,sans-serif;
  background:var(--bg1);color:var(--text);
  display:flex;flex-direction:column;align-items:center;
  justify-content:center;position:relative;
}
.bg-blur{position:fixed;inset:0;overflow:hidden;z-index:0}
.bg-blur .orb{position:absolute;border-radius:50%;filter:blur(100px);opacity:.18;animation:float 20s ease-in-out infinite}
.orb:nth-child(1){width:500px;height:500px;background:#6c63ff;top:-10%;left:-5%}
.orb:nth-child(2){width:400px;height:400px;background:#00d4aa;bottom:-8%;right:-5%;animation-delay:-7s}
.orb:nth-child(3){width:350px;height:350px;background:#ff6b9d;top:40%;left:50%;animation-delay:-14s}
@keyframes float{0%,100%{transform:translate(0,0)}33%{transform:translate(60px,-40px)}66%{transform:translate(-40px,60px)}}

.app{position:relative;z-index:1;text-align:center;width:100%;max-width:720px;padding:1rem}
header h1{font-size:1.6rem;font-weight:700}
header h1 span{color:var(--accent)}
header p{color:var(--muted);font-size:.88rem;margin-top:.25rem}

.device-area{position:relative;margin:2rem auto;width:340px;height:340px}
.me{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:110px;height:110px;border-radius:50%;background:rgba(108,99,255,.1);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:transform .2s;z-index:2}
.me:hover{transform:translate(-50%,-50%) scale(1.08)}
.me .avatar{font-size:2.6rem}
.me .label{font-size:.72rem;color:var(--accent);margin-top:.2rem;font-weight:600}
.me .sublabel{font-size:.62rem;color:var(--muted)}
.me-ring{position:absolute;top:50%;left:50%;width:130px;height:130px;border-radius:50%;border:2px solid rgba(108,99,255,.3);transform:translate(-50%,-50%);animation:pulse-ring 3s ease-in-out infinite}
@keyframes pulse-ring{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.6}50%{transform:translate(-50%,-50%) scale(1.15);opacity:.2}}

.peer{position:absolute;width:90px;height:90px;border-radius:50%;background:var(--glass);backdrop-filter:blur(12px);border:1px solid var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:transform .25s;animation:peer-in .5s ease-out both}
.peer:hover{transform:translate(-50%,-50%) scale(1.12)!important}
.peer .avatar{font-size:2rem}
.peer .label{font-size:.65rem;color:var(--text);margin-top:.15rem;font-weight:500}
.peer .type{font-size:.55rem;color:var(--muted)}
@keyframes peer-in{from{opacity:0;transform:translate(-50%,-50%) scale(.5)}to{opacity:1}}

.empty-state{color:var(--muted);font-size:.92rem;margin-top:1.5rem}
.shared-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(21,24,50,.92);backdrop-filter:blur(16px);border-top:1px solid var(--border);padding:.6rem 1rem;z-index:10;display:flex;align-items:center;gap:.8rem;overflow-x:auto}
.shared-toggle{flex-shrink:0;padding:.5rem 1rem;background:var(--glass);border:1px solid var(--border);border-radius:8px;color:var(--text);cursor:pointer;font-size:.8rem;font-weight:600}
.file-chip{flex-shrink:0;display:flex;align-items:center;gap:.5rem;background:var(--glass);border:1px solid var(--border);border-radius:8px;padding:.4rem .8rem;font-size:.78rem;cursor:pointer}
.file-chip .del{color:var(--pink);margin-left:.3rem;font-weight:700;opacity:.6}

.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);z-index:50;display:none;align-items:center;justify-content:center}
.modal-overlay.open{display:flex}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:2rem;width:90%;max-width:420px;text-align:center}
.modal .peer-target{font-size:2.8rem;margin:.5rem 0}
.modal .peer-name{color:var(--accent);font-weight:600;margin-bottom:1rem}
.modal .drop-area{border:2px dashed var(--border);border-radius:12px;padding:2rem 1rem;margin:1rem 0;cursor:pointer}
.modal .drop-area:hover{border-color:var(--accent);background:rgba(108,99,255,.08)}
.modal-btn{padding:.55rem 1.4rem;border:none;border-radius:8px;font-size:.9rem;font-weight:600;cursor:pointer;margin:.3rem}
.btn-accent{background:var(--accent);color:#fff}
.btn-ghost{background:var(--glass);color:var(--text);border:1px solid var(--border)}

.transfer-progress{display:none;margin:1rem 0}
.transfer-bar{height:5px;background:var(--glass);border-radius:3px;overflow:hidden}
.transfer-fill{height:100%;width:0;background:var(--accent);transition:width .2s}

.notif{position:fixed;top:1.5rem;right:1.5rem;z-index:60;background:var(--surface);border:1px solid var(--accent);border-radius:12px;padding:1rem 1.2rem;min-width:260px;opacity:0;transform:translateX(100%);transition:all .4s ease}
.notif.show{opacity:1;transform:translateX(0)}
.notif .nbtn{margin-top:.6rem;padding:.35rem .9rem;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer}

.toast{position:fixed;bottom:4.5rem;left:50%;transform:translateX(-50%);padding:.6rem 1.4rem;border-radius:8px;background:var(--accent2);color:var(--bg1);font-weight:600;opacity:0;transition:opacity .3s;z-index:70}
.toast.show{opacity:1}
</style>
</head>
<body>
<div class="bg-blur"><div class="orb"></div><div class="orb"></div><div class="orb"></div></div>
<div class="app">
  <header><h1>⚡ <span>SnapShare Go</span></h1><p>Open this page on other devices to start sharing</p></header>
  <div class="device-area" id="deviceArea">
    <div class="me-ring"></div>
    <div class="me" onclick="openSharedUpload()"><div class="avatar" id="meIcon"></div><div class="label" id="meName"></div><div class="sublabel">You</div></div>
  </div>
  <div class="empty-state" id="emptyState">Waiting for other devices...<div style="font-size:.78rem;margin-top:.4rem;opacity:.7">Open this URL on another device in your network</div></div>
</div>
<div class="shared-bar" id="sharedBar"><button class="shared-toggle" onclick="openSharedUpload()">+ Drop file</button></div>
<div class="modal-overlay" id="modalOverlay"><div class="modal">
  <h2>Send file to</h2><div class="peer-target" id="modalIcon"></div><div class="peer-name" id="modalName"></div>
  <div class="drop-area" onclick="document.getElementById('modalFileInput').click()">📄 <strong>Drop files</strong><p>or click to browse</p><input type="file" id="modalFileInput" multiple></div>
  <div class="transfer-progress" id="transferProgress"><div class="transfer-bar"><div class="transfer-fill" id="transferFill"></div></div><div id="transferText" style="font-size:.8rem;color:var(--muted);margin-top:.3rem">Sending...</div></div>
  <button class="modal-btn btn-ghost" onclick="closeModal()">Cancel</button>
</div></div>
<div class="modal-overlay" id="sharedOverlay"><div class="modal">
  <h2>📤 Shared space</h2><div class="drop-area" onclick="document.getElementById('sharedFileInput').click()">📄 <strong>Drop files</strong><input type="file" id="sharedFileInput" multiple></div>
  <div class="transfer-progress" id="sharedProgress"><div class="transfer-bar"><div class="transfer-fill" id="sharedFill"></div></div><div id="sharedText" style="font-size:.8rem;color:var(--muted);margin-top:.3rem">Uploading...</div></div>
  <button class="modal-btn btn-ghost" onclick="closeSharedOverlay()">Close</button>
</div></div>
<div class="notif" id="notif"><div id="notifTitle" style="font-weight:600"></div><div id="notifSub" style="color:var(--muted);font-size:.8rem"></div><button class="nbtn" onclick="downloadNotifFile()">Download</button></div>
<div class="toast" id="toast"></div>

<script>
const myId = localStorage.getItem('device_id') || (() => { const id = crypto.randomUUID(); localStorage.setItem('device_id', id); return id; })();
let peers = {}, targetPeer = null, notifFile = null, evtSource = null;

register().then(() => { connectSSE(); loadSharedFiles(); });

async function register() {
  const r = await fetch('/api/register', { method: 'POST', body: JSON.stringify({id: myId}) });
  const d = await r.json();
  document.getElementById('meIcon').textContent = d.icon;
  document.getElementById('meName').textContent = d.name;
}

function connectSSE() {
  if (evtSource) evtSource.close();
  evtSource = new EventSource('/api/events?id=' + myId);
  evtSource.addEventListener('peers', e => { peers = {}; JSON.parse(e.data).forEach(p => peers[p.id] = p); renderPeers(); });
  evtSource.addEventListener('device-joined', e => { const p = JSON.parse(e.data); peers[p.id] = p; renderPeers(); });
  evtSource.addEventListener('device-left', e => { const p = JSON.parse(e.data); delete peers[p.id]; renderPeers(); });
  evtSource.addEventListener('file-sent', e => { const d = JSON.parse(e.data); notifFile = d.filename; document.getElementById('notifTitle').textContent = d.from_icon + ' ' + d.from_name + ' sent a file'; document.getElementById('notifSub').textContent = d.filename; document.getElementById('notif').classList.add('show'); setTimeout(()=>document.getElementById('notif').classList.remove('show'), 8000); loadSharedFiles(); });
  evtSource.addEventListener('shared-update', () => loadSharedFiles());
  evtSource.onerror = () => setTimeout(connectSSE, 3000);
}

function renderPeers() {
  const area = document.getElementById('deviceArea');
  area.querySelectorAll('.peer').forEach(el => el.remove());
  const ids = Object.keys(peers);
  document.getElementById('emptyState').style.display = ids.length ? 'none' : 'block';
  const R = 130;
  ids.forEach((id, i) => {
    const angle = (2 * Math.PI / ids.length) * i - Math.PI / 2;
    const x = 50 + (R / (area.offsetWidth / 2)) * Math.cos(angle) * 100;
    const y = 50 + (R / (area.offsetHeight / 2)) * Math.sin(angle) * 100;
    const p = peers[id];
    const el = document.createElement('div');
    el.className = 'peer'; el.style.cssText = 'left:'+x+'%;top:'+y+'%;transform:translate(-50%,-50%)';
    el.innerHTML = '<div class="avatar">'+p.icon+'</div><div class="label">'+p.name+'</div><div class="type">'+p.type+'</div>';
    el.onclick = () => { targetPeer = id; document.getElementById('modalIcon').textContent = p.icon; document.getElementById('modalName').textContent = p.name; document.getElementById('modalOverlay').classList.add('open'); };
    area.appendChild(el);
  });
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); targetPeer = null; }
function openSharedUpload() { document.getElementById('sharedOverlay').classList.add('open'); }
function closeSharedOverlay() { document.getElementById('sharedOverlay').classList.remove('open'); }

document.getElementById('modalFileInput').onchange = e => upload(e.target.files, targetPeer, 'transfer');
document.getElementById('sharedFileInput').onchange = e => upload(e.target.files, null, 'shared');

function upload(files, to, prefix) {
  if (!files.length) return;
  const fd = new FormData(); for (const f of files) fd.append('files', f);
  if (to) fd.append('to', to); fd.append('from', myId);
  const prog = document.getElementById(prefix+'Progress'), fill = document.getElementById(prefix+'Fill');
  prog.style.display = 'block'; fill.style.width = '0%';
  const xhr = new XMLHttpRequest();
  xhr.upload.onprogress = e => fill.style.width = (e.loaded/e.total*100)+'%';
  xhr.onload = () => { fill.style.width = '100%'; toast('Sent!'); setTimeout(() => { closeModal(); closeSharedOverlay(); prog.style.display="none"; }, 1000); loadSharedFiles(); };
  xhr.open('POST', '/api/upload'); xhr.send(fd);
}

async function loadSharedFiles() {
  const r = await fetch('/api/files'); const files = await r.json();
  const bar = document.getElementById('sharedBar'); bar.querySelectorAll('.file-chip').forEach(el => el.remove());
  files.forEach(f => {
    const chip = document.createElement('div'); chip.className = 'file-chip';
    chip.innerHTML = '<span class="name">'+f.name+'</span><span class="del" onclick="event.stopPropagation();delFile(\''+f.name+'\')">×</span>';
    chip.onclick = () => location.href = '/download/' + f.name;
    bar.appendChild(chip);
  });
}

async function delFile(n) { await fetch('/api/delete/'+n, {method:'DELETE'}); loadSharedFiles(); }
function downloadNotifFile() { if (notifFile) location.href = '/download/'+notifFile; document.getElementById('notif').classList.remove('show'); }
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2000); }
</script>
</body>
</html>`

// ── Handlers ─────────────────────────────────────────────────────────────────

func handleRegister(w http.ResponseWriter, r *http.Request) {
	var body struct{ ID string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", 400)
		return
	}
	id := body.ID
	if id == "" {
		http.Error(w, "missing id", 400)
		return
	}

	lock.Lock()
	defer lock.Unlock()
	if _, ok := devices[id]; !ok {
		devices[id] = &Device{
			ID:       id,
			Name:     makeDeviceName(id),
			Icon:     makeDeviceIcon(id),
			Type:     detectType(r.UserAgent()),
			IP:       r.RemoteAddr,
			UA:       r.UserAgent(),
			LastSeen: time.Now(),
		}
	} else {
		devices[id].LastSeen = time.Now()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(devices[id])
}

func handleEvents(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "missing id", 400)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	q := make(chan []byte, 10)

	lock.Lock()
	if dev, ok := devices[id]; ok {
		dev.Queues = append(dev.Queues, q)
		dev.LastSeen = time.Now()
	}
	lock.Unlock()

	// Initial peer list
	var list []Device
	lock.RLock()
	for did, d := range devices {
		if did != id {
			list = append(list, *d)
		}
	}
	lock.RUnlock()
	msg, _ := json.Marshal(list)
	fmt.Fprintf(w, "event: peers\ndata: %s\n\n", msg)
	flusher.Flush()

	// Announce join
	lock.RLock()
	if me, ok := devices[id]; ok {
		go broadcast("device-joined", me, id)
	}
	lock.RUnlock()

	defer func() {
		lock.Lock()
		if dev, ok := devices[id]; ok {
			for i, qq := range dev.Queues {
				if qq == q {
					dev.Queues = append(dev.Queues[:i], dev.Queues[i+1:]...)
					break
				}
			}
		}
		lock.Unlock()
		broadcast("device-left", map[string]string{"id": id}, id)
	}()

	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg := <-q:
			w.Write(msg)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(100 << 20) // 100MB
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	toID := r.FormValue("to")
	fromID := r.FormValue("from")
	var saved []string

	os.MkdirAll(sharedDir, 0755)

	files := r.MultipartForm.File["files"]
	for _, fh := range files {
		f, _ := fh.Open()
		safeName := filepath.Base(fh.Filename)
		dst, _ := os.Create(filepath.Join(sharedDir, safeName))
		io.Copy(dst, f)
		f.Close()
		dst.Close()
		saved = append(saved, safeName)
	}

	if toID != "" && fromID != "" && len(saved) > 0 {
		lock.RLock()
		sender := devices[fromID]
		lock.RUnlock()
		if sender != nil {
			for _, name := range saved {
				notify(toID, "file-sent", map[string]interface{}{
					"filename":  name,
					"from_name": sender.Name,
					"from_icon": sender.Icon,
				})
			}
		}
	}

	broadcast("shared-update", nil, "")
	w.WriteHeader(200)
}

func handleListFiles(w http.ResponseWriter, r *http.Request) {
	entries, _ := os.ReadDir(sharedDir)
	var list []map[string]interface{}
	for _, e := range entries {
		if !e.IsDir() {
			info, _ := e.Info()
			list = append(list, map[string]interface{}{
				"name": e.Name(),
				"size": info.Size(),
			})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func handleDelete(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.URL.Path)
	os.Remove(filepath.Join(sharedDir, name))
	broadcast("shared-update", nil, "")
	w.WriteHeader(200)
}

func handleDownload(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(r.URL.Path)
	path := filepath.Join(sharedDir, name)
	if _, err := os.Stat(path); err == nil {
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", name))
		http.ServeFile(w, r, path)
	} else {
		http.NotFound(w, r)
	}
}

// ── Main ─────────────────────────────────────────────────────────────────────

func getLocalIP() string {
	addrs, _ := net.InterfaceAddrs()
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
	}
	return "127.0.0.1"
}

func main() {
	p := flag.Int("p", port, "Port number")
	d := flag.String("d", sharedDir, "Shared directory")
	flag.Parse()

	sharedDir = *d
	os.MkdirAll(sharedDir, 0755)

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte(page))
		} else if r.URL.Path == "/favicon.ico" {
			w.WriteHeader(204)
		} else {
			http.NotFound(w, r)
		}
	})
	http.HandleFunc("/api/register", handleRegister)
	http.HandleFunc("/api/events", handleEvents)
	http.HandleFunc("/api/upload", handleUpload)
	http.HandleFunc("/api/files", handleListFiles)
	http.HandleFunc("/api/delete/", handleDelete)
	http.HandleFunc("/download/", handleDownload)

	go cleanupStale()

	ip := getLocalIP()
	currentPort := *p

	for {
		addr := fmt.Sprintf("0.0.0.0:%d", currentPort)
		l, err := net.Listen("tcp", addr)
		if err == nil {
			l.Close()
			fmt.Printf("\n  ╔═══════════════════════════════════════════════╗\n")
			fmt.Printf("  ║           ⚡  SnapShare Go  ⚡               ║\n")
			fmt.Printf("  ╠═══════════════════════════════════════════════╣\n")
			fmt.Printf("  ║  Local:   http://localhost:%-17d ║\n", currentPort)
			fmt.Printf("  ║  Network: http://%-14s:%-12d  ║\n", ip, currentPort)
			fmt.Printf("  ╚═══════════════════════════════════════════════╝\n\n")
			fmt.Printf("  Open the URL on any device in your LAN to share files.\n")
			fmt.Printf("  Press Ctrl+C to stop.\n\n")
			log.Fatal(http.ListenAndServe(addr, nil))
		}
		fmt.Printf("  [!] Port %d is busy, trying %d...\n", currentPort, currentPort+1)
		currentPort++
	}
}
