#!/usr/bin/env python3
"""
SnapShare — SnapDrop-style LAN file sharing.
Single-file Python server. No dependencies beyond the standard library.
"""

import os, sys, re, json, uuid, time, queue, socket, mimetypes, threading
import urllib.parse, http.server, socketserver, argparse, random, hashlib
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
SHARED_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shared_files")
PORT = 8080

# ── Device tracking ──────────────────────────────────────────────────────────
lock = threading.Lock()
devices = {}          # id → {name, icon, ip, ua, last_seen, queues: set()}
pending_files = {}    # id → [{filename, from_name, from_icon, size, ts}]

ADJECTIVES = [
    "Swift", "Brave", "Calm", "Bold", "Keen", "Warm", "Cool", "Wise",
    "Bright", "Happy", "Gentle", "Lucky", "Noble", "Quiet", "Vivid", "Witty",
]
ANIMALS = [
    "Panda", "Fox", "Owl", "Wolf", "Bear", "Hawk", "Lynx", "Orca",
    "Tiger", "Eagle", "Koala", "Raven", "Otter", "Falcon", "Shark", "Bison",
]
ICONS = ["🦊", "🐼", "🦉", "🐺", "🐻", "🦅", "🐱", "🐬",
         "🐯", "🦁", "🐨", "🐦", "🦦", "🦈", "🐘", "🦋"]


def make_device_name(device_id):
    h = int(hashlib.md5(device_id.encode()).hexdigest(), 16)
    return f"{ADJECTIVES[h % len(ADJECTIVES)]} {ANIMALS[(h >> 8) % len(ANIMALS)]}"


def make_device_icon(device_id):
    h = int(hashlib.md5(device_id.encode()).hexdigest(), 16)
    return ICONS[(h >> 4) % len(ICONS)]


def detect_device_type(ua):
    ua = (ua or "").lower()
    if "iphone" in ua or "android" in ua and "mobile" in ua:
        return "phone"
    if "ipad" in ua or "tablet" in ua:
        return "tablet"
    return "desktop"


def broadcast(event_type, data, exclude_id=None):
    """Push an SSE event to all connected devices."""
    msg = f"event: {event_type}\ndata: {json.dumps(data)}\n\n".encode()
    with lock:
        for did, dev in devices.items():
            if did == exclude_id:
                continue
            for q in list(dev["queues"]):
                try:
                    q.put_nowait(msg)
                except queue.Full:
                    pass


def notify(device_id, event_type, data):
    """Push an SSE event to one specific device."""
    msg = f"event: {event_type}\ndata: {json.dumps(data)}\n\n".encode()
    with lock:
        dev = devices.get(device_id)
        if dev:
            for q in list(dev["queues"]):
                try:
                    q.put_nowait(msg)
                except queue.Full:
                    pass


def device_list(exclude_id=None):
    with lock:
        return [
            {"id": did, "name": d["name"], "icon": d["icon"], "type": d["type"]}
            for did, d in devices.items()
            if did != exclude_id and (time.time() - d["last_seen"]) < 60
        ]


def cleanup_stale():
    """Remove devices not seen for >60 s."""
    while True:
        time.sleep(15)
        stale = []
        with lock:
            now = time.time()
            for did, d in list(devices.items()):
                if now - d["last_seen"] > 60 and not d["queues"]:
                    stale.append(did)
            for did in stale:
                del devices[did]
                pending_files.pop(did, None)
        for did in stale:
            broadcast("device-left", {"id": did})


threading.Thread(target=cleanup_stale, daemon=True).start()


# ── Multipart parsing ────────────────────────────────────────────────────────
def parse_multipart(body, boundary):
    for part in body.split(b"--" + boundary):
        if b"Content-Disposition" not in part:
            continue
        try:
            hdr_end = part.index(b"\r\n\r\n")
            hdr = part[:hdr_end].decode("utf-8", errors="replace")
            data = part[hdr_end + 4:]
            if data.endswith(b"\r\n"):
                data = data[:-2]
            m = re.search(r'filename="(.+?)"', hdr)
            if m:
                yield m.group(1), data
        except (ValueError, UnicodeDecodeError):
            continue


# ── HTML + CSS + JS ──────────────────────────────────────────────────────────
PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SnapShare</title>
<style>
/* ── Reset & base ────────────────────────────────────── */
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg1:#0c0e1a;--bg2:#151832;--surface:#1a1e3a;
  --glass:rgba(255,255,255,.06);--border:rgba(255,255,255,.08);
  --text:#e2e8f0;--muted:#7a84a6;--accent:#6c63ff;
  --accent2:#00d4aa;--pink:#ff6b9d;--warn:#fbbf24;
}
html,body{height:100%;overflow:hidden}
body{
  font-family:'Segoe UI',system-ui,sans-serif;
  background:var(--bg1);color:var(--text);
  display:flex;flex-direction:column;align-items:center;
  justify-content:center;position:relative;
}

/* ── Animated background ─────────────────────────────── */
.bg-blur{
  position:fixed;inset:0;overflow:hidden;z-index:0;
}
.bg-blur .orb{
  position:absolute;border-radius:50%;filter:blur(100px);
  opacity:.18;animation:float 20s ease-in-out infinite;
}
.orb:nth-child(1){width:500px;height:500px;background:#6c63ff;top:-10%;left:-5%;animation-delay:0s}
.orb:nth-child(2){width:400px;height:400px;background:#00d4aa;bottom:-8%;right:-5%;animation-delay:-7s}
.orb:nth-child(3){width:350px;height:350px;background:#ff6b9d;top:40%;left:50%;animation-delay:-14s}
@keyframes float{
  0%,100%{transform:translate(0,0) scale(1)}
  33%{transform:translate(60px,-40px) scale(1.1)}
  66%{transform:translate(-40px,60px) scale(.9)}
}

/* ── Layout ──────────────────────────────────────────── */
.app{position:relative;z-index:1;text-align:center;width:100%;max-width:720px;padding:1rem}
header h1{font-size:1.6rem;font-weight:700;letter-spacing:-.02em}
header h1 span{color:var(--accent)}
header p{color:var(--muted);font-size:.88rem;margin-top:.25rem}

/* ── Device area ─────────────────────────────────────── */
.device-area{
  position:relative;margin:2rem auto;
  width:340px;height:340px;
}
.me{
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  width:110px;height:110px;border-radius:50%;
  background:rgba(108,99,255,.1);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  cursor:pointer;transition:transform .2s;z-index:2;
}
.me:hover{transform:translate(-50%,-50%) scale(1.08)}
.me .avatar{font-size:2.6rem}
.me .label{font-size:.72rem;color:var(--accent);margin-top:.2rem;font-weight:600}
.me .sublabel{font-size:.62rem;color:var(--muted)}
.me-ring{
  position:absolute;top:50%;left:50%;
  width:130px;height:130px;border-radius:50%;
  border:2px solid rgba(108,99,255,.3);
  transform:translate(-50%,-50%);
  animation:pulse-ring 3s ease-in-out infinite;
}
@keyframes pulse-ring{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.6}50%{transform:translate(-50%,-50%) scale(1.15);opacity:.2}}

/* Peer bubbles */
.peer{
  position:absolute;width:90px;height:90px;border-radius:50%;
  background:var(--glass);backdrop-filter:blur(12px);
  border:1px solid var(--border);
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  cursor:pointer;transition:transform .25s,box-shadow .25s;
  animation:peer-in .5s ease-out both;
}
.peer:hover{transform:translate(-50%,-50%) scale(1.12)!important;box-shadow:0 0 30px rgba(108,99,255,.3)}
.peer .avatar{font-size:2rem}
.peer .label{font-size:.65rem;color:var(--text);margin-top:.15rem;font-weight:500;white-space:nowrap}
.peer .type{font-size:.55rem;color:var(--muted)}
@keyframes peer-in{from{opacity:0;transform:translate(-50%,-50%) scale(.5)}to{opacity:1}}

/* ── Empty state ─────────────────────────────────────── */
.empty-state{
  color:var(--muted);font-size:.92rem;
  margin-top:1.5rem;
  animation:fade-in 1s ease-out;
}
.empty-state .hint{font-size:.78rem;margin-top:.4rem;opacity:.7}
@keyframes fade-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}

/* ── Shared files bar ────────────────────────────────── */
.shared-bar{
  position:fixed;bottom:0;left:0;right:0;
  background:rgba(21,24,50,.92);backdrop-filter:blur(16px);
  border-top:1px solid var(--border);
  padding:.6rem 1rem;z-index:10;
  display:flex;align-items:center;gap:.8rem;
  overflow-x:auto;
}
.shared-bar::-webkit-scrollbar{height:4px}
.shared-bar::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
.shared-toggle{
  flex-shrink:0;padding:.5rem 1rem;background:var(--glass);
  border:1px solid var(--border);border-radius:8px;
  color:var(--text);cursor:pointer;font-size:.8rem;font-weight:600;
  display:flex;align-items:center;gap:.4rem;
}
.shared-toggle:hover{background:rgba(255,255,255,.1)}
.file-chip{
  flex-shrink:0;display:flex;align-items:center;gap:.5rem;
  background:var(--glass);border:1px solid var(--border);
  border-radius:8px;padding:.4rem .8rem;
  font-size:.78rem;cursor:pointer;transition:background .2s;
}
.file-chip:hover{background:rgba(108,99,255,.15)}
.file-chip .icon{font-size:1.1rem}
.file-chip .name{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-chip .size{color:var(--muted);font-size:.7rem}
.file-chip .del{
  color:var(--pink);cursor:pointer;margin-left:.3rem;font-weight:700;
  opacity:.6;transition:opacity .2s;
}
.file-chip .del:hover{opacity:1}

/* ── Modal ───────────────────────────────────────────── */
.modal-overlay{
  position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);
  z-index:50;display:none;align-items:center;justify-content:center;
}
.modal-overlay.open{display:flex}
.modal{
  background:var(--surface);border:1px solid var(--border);
  border-radius:16px;padding:2rem;width:90%;max-width:420px;
  text-align:center;animation:modal-in .3s ease-out;
}
@keyframes modal-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
.modal h2{font-size:1.2rem;margin-bottom:.3rem}
.modal .peer-target{font-size:2.8rem;margin:.5rem 0}
.modal .peer-name{color:var(--accent);font-weight:600;margin-bottom:1rem}
.modal .drop-area{
  border:2px dashed var(--border);border-radius:12px;
  padding:2rem 1rem;margin:1rem 0;cursor:pointer;
  transition:border-color .2s,background .2s;
}
.modal .drop-area:hover,.modal .drop-area.over{
  border-color:var(--accent);background:rgba(108,99,255,.08);
}
.modal .drop-area p{color:var(--muted);font-size:.85rem;margin-top:.3rem}
.modal input[type=file]{display:none}
.modal-btn{
  display:inline-block;padding:.55rem 1.4rem;border:none;border-radius:8px;
  font-size:.9rem;font-weight:600;cursor:pointer;margin:.3rem;
  transition:opacity .2s;
}
.modal-btn:hover{opacity:.85}
.btn-accent{background:var(--accent);color:#fff}
.btn-ghost{background:var(--glass);color:var(--text);border:1px solid var(--border)}

/* ── Transfer progress ───────────────────────────────── */
.transfer-progress{display:none;margin:1rem 0}
.transfer-bar{height:5px;background:var(--glass);border-radius:3px;overflow:hidden}
.transfer-fill{height:100%;width:0;background:var(--accent);transition:width .2s}
.transfer-text{font-size:.8rem;color:var(--muted);margin-top:.3rem}

/* ── Notification ────────────────────────────────────── */
.notif{
  position:fixed;top:1.5rem;right:1.5rem;z-index:60;
  background:var(--surface);border:1px solid var(--accent);
  border-radius:12px;padding:1rem 1.2rem;
  min-width:260px;opacity:0;transform:translateX(100%);
  transition:all .4s ease;pointer-events:none;
}
.notif.show{opacity:1;transform:translateX(0);pointer-events:auto}
.notif .ntitle{font-weight:600;font-size:.9rem;margin-bottom:.2rem}
.notif .nsub{color:var(--muted);font-size:.8rem}
.notif .nbtn{
  display:inline-block;margin-top:.6rem;padding:.35rem .9rem;
  background:var(--accent);color:#fff;border:none;border-radius:6px;
  font-size:.8rem;cursor:pointer;font-weight:600;
}
.notif .nbtn:hover{opacity:.85}

/* ── Toast ───────────────────────────────────────────── */
.toast{
  position:fixed;bottom:4.5rem;left:50%;transform:translateX(-50%);
  padding:.6rem 1.4rem;border-radius:8px;
  background:var(--accent2);color:var(--bg1);font-weight:600;
  font-size:.85rem;opacity:0;transition:opacity .3s;z-index:70;
  pointer-events:none;white-space:nowrap;
}
.toast.show{opacity:1}

@media(max-width:500px){
  .device-area{width:280px;height:280px}
  .me{width:90px;height:90px}
  .me .avatar{font-size:2rem}
  .peer{width:72px;height:72px}
  .peer .avatar{font-size:1.5rem}
}
</style>
</head>
<body>

<div class="bg-blur">
  <div class="orb"></div><div class="orb"></div><div class="orb"></div>
</div>

<div class="app">
  <header>
    <h1>&#9889; <span>SnapShare</span></h1>
    <p>Open this page on other devices to start sharing</p>
  </header>

  <div class="device-area" id="deviceArea">
    <div class="me-ring"></div>
    <div class="me" id="meNode" title="Click to share with everyone" onclick="openSharedUpload()">
      <div class="avatar" id="meIcon"></div>
      <div class="label" id="meName"></div>
      <div class="sublabel">You</div>
    </div>
  </div>

  <div class="empty-state" id="emptyState">
    Waiting for other devices&hellip;
    <div class="hint">Open this URL on another device in your network</div>
  </div>
</div>

<!-- Bottom shared-files bar -->
<div class="shared-bar" id="sharedBar">
  <button class="shared-toggle" onclick="openSharedUpload()" title="Upload to shared space">&#10133; Drop file</button>
</div>

<!-- Send-to-peer modal -->
<div class="modal-overlay" id="modalOverlay">
  <div class="modal" id="sendModal">
    <h2>Send file to</h2>
    <div class="peer-target" id="modalIcon"></div>
    <div class="peer-name" id="modalName"></div>
    <div class="drop-area" id="modalDrop" onclick="document.getElementById('modalFileInput').click()">
      &#128196; <strong>Drop files here</strong>
      <p>or click to browse</p>
      <input type="file" id="modalFileInput" multiple>
    </div>
    <div class="transfer-progress" id="transferProgress">
      <div class="transfer-bar"><div class="transfer-fill" id="transferFill"></div></div>
      <div class="transfer-text" id="transferText">Sending…</div>
    </div>
    <div>
      <button class="modal-btn btn-ghost" onclick="closeModal()">Cancel</button>
    </div>
  </div>
</div>

<!-- Shared-upload modal -->
<div class="modal-overlay" id="sharedOverlay">
  <div class="modal">
    <h2>&#128228; Upload to shared space</h2>
    <p style="color:var(--muted);font-size:.85rem;margin-bottom:.5rem">Everyone on the network can download these</p>
    <div class="drop-area" id="sharedDrop" onclick="document.getElementById('sharedFileInput').click()">
      &#128196; <strong>Drop files here</strong>
      <p>or click to browse</p>
      <input type="file" id="sharedFileInput" multiple>
    </div>
    <div class="transfer-progress" id="sharedProgress">
      <div class="transfer-bar"><div class="transfer-fill" id="sharedFill"></div></div>
      <div class="transfer-text" id="sharedText">Uploading…</div>
    </div>
    <div>
      <button class="modal-btn btn-ghost" onclick="closeSharedOverlay()">Close</button>
    </div>
  </div>
</div>

<!-- Notification -->
<div class="notif" id="notif">
  <div class="ntitle" id="notifTitle"></div>
  <div class="nsub" id="notifSub"></div>
  <button class="nbtn" id="notifBtn" onclick="downloadNotifFile()">Download</button>
</div>

<div class="toast" id="toast"></div>

<script>
/* ── State ──────────────────────────────────────────── */
const myId = localStorage.getItem('device_id') || (() => {
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  localStorage.setItem('device_id', id); return id;
})();
let peers = {};
let targetPeer = null;
let notifFile = null;
let evtSource = null;

/* ── Init ───────────────────────────────────────────── */
register().then(() => { connectSSE(); loadSharedFiles(); });

async function register() {
  const r = await fetch('/api/register', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({id: myId})
  });
  const d = await r.json();
  document.getElementById('meIcon').textContent = d.icon;
  document.getElementById('meName').textContent = d.name;
}

/* ── SSE ────────────────────────────────────────────── */
function connectSSE() {
  if (evtSource) evtSource.close();
  evtSource = new EventSource('/api/events?id=' + encodeURIComponent(myId));

  evtSource.addEventListener('peers', e => {
    const list = JSON.parse(e.data);
    peers = {};
    list.forEach(p => peers[p.id] = p);
    renderPeers();
  });
  evtSource.addEventListener('device-joined', e => {
    const p = JSON.parse(e.data);
    peers[p.id] = p;
    renderPeers();
  });
  evtSource.addEventListener('device-left', e => {
    const p = JSON.parse(e.data);
    delete peers[p.id];
    renderPeers();
  });
  evtSource.addEventListener('file-sent', e => {
    const d = JSON.parse(e.data);
    showNotif(d);
    loadSharedFiles();
  });
  evtSource.addEventListener('shared-update', () => loadSharedFiles());
  evtSource.onerror = () => setTimeout(connectSSE, 3000);
}

/* ── Render peers ───────────────────────────────────── */
function renderPeers() {
  const area = document.getElementById('deviceArea');
  area.querySelectorAll('.peer').forEach(el => el.remove());

  const ids = Object.keys(peers);
  const empty = document.getElementById('emptyState');
  empty.style.display = ids.length ? 'none' : 'block';

  const R = window.innerWidth < 500 ? 105 : 130;
  ids.forEach((id, i) => {
    const angle = (2 * Math.PI / ids.length) * i - Math.PI / 2;
    const x = 50 + (R / (area.offsetWidth / 2)) * Math.cos(angle) * 100;
    const y = 50 + (R / (area.offsetHeight / 2)) * Math.sin(angle) * 100;
    const p = peers[id];

    const el = document.createElement('div');
    el.className = 'peer';
    el.style.cssText = `left:${x}%;top:${y}%;transform:translate(-50%,-50%)`;
    el.innerHTML = `<div class="avatar">${p.icon}</div><div class="label">${esc(p.name)}</div><div class="type">${p.type}</div>`;
    el.onclick = () => openSendModal(id);
    area.appendChild(el);
  });
}

/* ── Send modal ─────────────────────────────────────── */
function openSendModal(peerId) {
  targetPeer = peerId;
  const p = peers[peerId];
  if (!p) return;
  document.getElementById('modalIcon').textContent = p.icon;
  document.getElementById('modalName').textContent = p.name;
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('transferProgress').style.display = 'none';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  targetPeer = null;
}

const modalDrop = document.getElementById('modalDrop');
const modalInput = document.getElementById('modalFileInput');
setupDropZone(modalDrop, modalInput, (files) => uploadTo(files, targetPeer));

function uploadTo(files, peerId) {
  if (!files.length || !peerId) return;
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  fd.append('to', peerId);
  fd.append('from', myId);

  const prog = document.getElementById('transferProgress');
  const fill = document.getElementById('transferFill');
  const text = document.getElementById('transferText');
  prog.style.display = 'block'; fill.style.width = '0%'; text.textContent = 'Sending…';

  const xhr = new XMLHttpRequest();
  xhr.upload.onprogress = e => {
    if (e.lengthComputable) {
      const pct = Math.round(e.loaded / e.total * 100);
      fill.style.width = pct + '%';
      text.textContent = pct + '%';
    }
  };
  xhr.onload = () => {
    fill.style.width = '100%'; text.textContent = 'Sent!';
    toast('File sent!');
    setTimeout(closeModal, 1200);
    loadSharedFiles();
  };
  xhr.onerror = () => { text.textContent = 'Failed'; };
  xhr.open('POST', '/api/upload');
  xhr.send(fd);
}

/* ── Shared upload modal ─────────────────────────────── */
function openSharedUpload() {
  document.getElementById('sharedOverlay').classList.add('open');
  document.getElementById('sharedProgress').style.display = 'none';
}
function closeSharedOverlay() {
  document.getElementById('sharedOverlay').classList.remove('open');
}

const sharedDrop = document.getElementById('sharedDrop');
const sharedInput = document.getElementById('sharedFileInput');
setupDropZone(sharedDrop, sharedInput, uploadShared);

function uploadShared(files) {
  if (!files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  fd.append('from', myId);

  const prog = document.getElementById('sharedProgress');
  const fill = document.getElementById('sharedFill');
  const text = document.getElementById('sharedText');
  prog.style.display = 'block'; fill.style.width = '0%'; text.textContent = 'Uploading…';

  const xhr = new XMLHttpRequest();
  xhr.upload.onprogress = e => {
    if (e.lengthComputable) {
      const pct = Math.round(e.loaded / e.total * 100);
      fill.style.width = pct + '%';
      text.textContent = pct + '%';
    }
  };
  xhr.onload = () => {
    fill.style.width = '100%'; text.textContent = 'Done!';
    toast('Uploaded!');
    setTimeout(closeSharedOverlay, 1000);
    loadSharedFiles();
  };
  xhr.onerror = () => { text.textContent = 'Failed'; };
  xhr.open('POST', '/api/upload');
  xhr.send(fd);
}

/* ── Shared files bar ────────────────────────────────── */
async function loadSharedFiles() {
  const r = await fetch('/api/files');
  const files = await r.json();
  const bar = document.getElementById('sharedBar');
  bar.querySelectorAll('.file-chip').forEach(el => el.remove());
  files.forEach(f => {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.innerHTML = `<span class="icon">${fileIcon(f.name)}</span><span class="name" title="${esc(f.name)}">${esc(f.name)}</span><span class="size">${fmtSize(f.size)}</span><span class="del" title="Delete" onclick="event.stopPropagation();delFile('${esc(f.name)}')">&times;</span>`;
    chip.onclick = () => location.href = '/download/' + encodeURIComponent(f.name);
    bar.appendChild(chip);
  });
}

async function delFile(name) {
  await fetch('/api/delete/' + encodeURIComponent(name), {method: 'DELETE'});
  toast('Deleted');
  loadSharedFiles();
}

/* ── Notification ────────────────────────────────────── */
function showNotif(d) {
  notifFile = d.filename;
  document.getElementById('notifTitle').textContent = `${d.from_icon} ${d.from_name} sent you a file`;
  document.getElementById('notifSub').textContent = `${d.filename} (${fmtSize(d.size)})`;
  const n = document.getElementById('notif');
  n.classList.add('show');
  setTimeout(() => n.classList.remove('show'), 8000);
}
function downloadNotifFile() {
  if (notifFile) location.href = '/download/' + encodeURIComponent(notifFile);
  document.getElementById('notif').classList.remove('show');
}

/* ── Helpers ─────────────────────────────────────────── */
function setupDropZone(zone, input, callback) {
  ['dragenter','dragover'].forEach(e => zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.add('over'); }));
  ['dragleave','drop'].forEach(e => zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.remove('over'); }));
  zone.addEventListener('drop', e => callback(e.dataTransfer.files));
  input.addEventListener('change', () => { callback(input.files); input.value = ''; });
}

function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function fileIcon(n) {
  const e = n.split('.').pop().toLowerCase();
  if ('jpg jpeg png gif svg webp bmp'.split(' ').includes(e)) return '🖼️';
  if ('mp4 avi mkv mov webm'.split(' ').includes(e)) return '🎬';
  if ('mp3 wav ogg flac aac'.split(' ').includes(e)) return '🎵';
  if ('zip rar 7z tar gz'.split(' ').includes(e)) return '📦';
  if (e === 'pdf') return '📕';
  if ('doc docx txt md rtf'.split(' ').includes(e)) return '📄';
  if ('xls xlsx csv'.split(' ').includes(e)) return '📊';
  if ('py js ts cpp java html css json'.split(' ').includes(e)) return '💻';
  return '📎';
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
</script>
</body>
</html>"""


# ── HTTP Handler ──────────────────────────────────────────────────────────────
class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"  [{ts}] {format % args}")

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html(self, code, text):
        body = text.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── GET ───────────────────────────────────────────────────────────────
    def do_GET(self):
        path = urllib.parse.unquote(self.path)

        if path == "/" or path == "/index.html":
            self._html(200, PAGE)

        elif path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()

        elif path.startswith("/api/events"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            did = qs.get("id", [""])[0]
            if not did:
                self._json(400, {"error": "missing id"})
                return
            self._handle_sse(did)

        elif path == "/api/files":
            files = []
            if os.path.isdir(SHARED_DIR):
                for name in sorted(os.listdir(SHARED_DIR)):
                    fp = os.path.join(SHARED_DIR, name)
                    if os.path.isfile(fp):
                        st = os.stat(fp)
                        files.append({"name": name, "size": st.st_size,
                                      "modified": datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M")})
            self._json(200, files)

        elif path.startswith("/download/"):
            fname = os.path.basename(path[len("/download/"):])
            fpath = os.path.join(SHARED_DIR, fname)
            if os.path.isfile(fpath):
                mime = mimetypes.guess_type(fpath)[0] or "application/octet-stream"
                size = os.path.getsize(fpath)
                self.send_response(200)
                self.send_header("Content-Type", mime)
                self.send_header("Content-Length", str(size))
                self.send_header("Content-Disposition", f'attachment; filename="{fname}"')
                self.end_headers()
                with open(fpath, "rb") as f:
                    import shutil
                    shutil.copyfileobj(f, self.wfile)
            else:
                self._json(404, {"error": "not found"})
        else:
            self._json(404, {"error": "not found"})

    # ── POST ──────────────────────────────────────────────────────────────
    def do_POST(self):
        path = urllib.parse.unquote(self.path)

        if path == "/api/register":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            did = body.get("id", "")
            ua = self.headers.get("User-Agent", "")
            ip = self.client_address[0]
            name = make_device_name(did)
            icon = make_device_icon(did)
            dtype = detect_device_type(ua)

            with lock:
                if did not in devices:
                    devices[did] = {"name": name, "icon": icon, "type": dtype,
                                    "ip": ip, "ua": ua, "last_seen": time.time(),
                                    "queues": set()}
                else:
                    devices[did]["last_seen"] = time.time()

            self._json(200, {"id": did, "name": name, "icon": icon, "type": dtype})

        elif path == "/api/upload":
            ct = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in ct:
                self._json(400, {"error": "bad request"})
                return
            boundary = ct.split("boundary=")[-1].encode()
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)

            os.makedirs(SHARED_DIR, exist_ok=True)

            # Extract the 'to' and 'from' fields
            to_id = None
            from_id = None
            saved = []

            for part in raw.split(b"--" + boundary):
                if b"Content-Disposition" not in part:
                    continue
                try:
                    hdr_end = part.index(b"\r\n\r\n")
                    hdr = part[:hdr_end].decode("utf-8", errors="replace")
                    data = part[hdr_end + 4:]
                    if data.endswith(b"\r\n"):
                        data = data[:-2]

                    fname_m = re.search(r'filename="(.+?)"', hdr)
                    name_m = re.search(r'name="(.+?)"', hdr)

                    if fname_m:
                        safe = os.path.basename(fname_m.group(1))
                        with open(os.path.join(SHARED_DIR, safe), "wb") as f:
                            f.write(data)
                        saved.append({"name": safe, "size": len(data)})
                        print(f"  ✓ {safe} ({len(data):,} bytes)")
                    elif name_m:
                        field = name_m.group(1)
                        val = data.decode("utf-8", errors="replace").strip()
                        if field == "to":
                            to_id = val
                        elif field == "from":
                            from_id = val
                except (ValueError, UnicodeDecodeError):
                    continue

            # Notify target device
            if to_id and from_id and saved:
                with lock:
                    sender = devices.get(from_id, {})
                for s in saved:
                    notify(to_id, "file-sent", {
                        "filename": s["name"], "size": s["size"],
                        "from_name": sender.get("name", "Someone"),
                        "from_icon": sender.get("icon", "📎"),
                    })

            # Notify everyone about shared files update
            broadcast("shared-update", {})

            self._json(200, {"saved": [s["name"] for s in saved]})
        else:
            self._json(404, {"error": "not found"})

    # ── DELETE ────────────────────────────────────────────────────────────
    def do_DELETE(self):
        path = urllib.parse.unquote(self.path)
        if path.startswith("/api/delete/"):
            fname = os.path.basename(path[len("/api/delete/"):])
            fpath = os.path.join(SHARED_DIR, fname)
            if os.path.isfile(fpath):
                os.remove(fpath)
                print(f"  ✗ Deleted {fname}")
                broadcast("shared-update", {})
                self._json(200, {"ok": True})
            else:
                self._json(404, {"error": "not found"})
        else:
            self._json(404, {"error": "not found"})

    # ── SSE ───────────────────────────────────────────────────────────────
    def _handle_sse(self, device_id):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        q = queue.Queue(maxsize=200)

        # Register this queue
        with lock:
            if device_id in devices:
                devices[device_id]["queues"].add(q)
                devices[device_id]["last_seen"] = time.time()

        # Send current peer list
        plist = device_list(exclude_id=device_id)
        self.wfile.write(f"event: peers\ndata: {json.dumps(plist)}\n\n".encode())
        self.wfile.flush()

        # Announce join to others
        with lock:
            dev = devices.get(device_id)
        if dev:
            broadcast("device-joined",
                       {"id": device_id, "name": dev["name"],
                        "icon": dev["icon"], "type": dev["type"]},
                       exclude_id=device_id)

        try:
            while True:
                try:
                    msg = q.get(timeout=20)
                    self.wfile.write(msg)
                    self.wfile.flush()
                except queue.Empty:
                    # keepalive
                    self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    with lock:
                        if device_id in devices:
                            devices[device_id]["last_seen"] = time.time()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            with lock:
                if device_id in devices:
                    devices[device_id]["queues"].discard(q)
                    # If no more SSE connections, mark for cleanup
            broadcast("device-left", {"id": device_id}, exclude_id=device_id)


# ── Server ────────────────────────────────────────────────────────────────────
class ThreadedServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main():
    global SHARED_DIR

    parser = argparse.ArgumentParser(description="SnapShare — LAN File Sharing")
    parser.add_argument("-p", "--port", type=int, default=PORT)
    parser.add_argument("-d", "--dir", type=str, default=SHARED_DIR)
    args = parser.parse_args()

    SHARED_DIR = os.path.abspath(args.dir)
    os.makedirs(SHARED_DIR, exist_ok=True)

    ip = get_local_ip()
    port = args.port

    while True:
        try:
            with ThreadedServer(("0.0.0.0", port), Handler) as srv:
                print()
                print("  ╔═══════════════════════════════════════════════╗")
                print("  ║           ⚡  SnapShare  ⚡                  ║")
                print("  ╠═══════════════════════════════════════════════╣")
                print(f"  ║  Local:   http://localhost:{port:<17} ║")
                print(f"  ║  Network: http://{ip}:{port:<12}  ║")
                print("  ╚═══════════════════════════════════════════════╝")
                print()
                print("  Open the URL on any device in your LAN to share files.")
                print("  Press Ctrl+C to stop.\n")
                srv.serve_forever()
                break
        except OSError as e:
            # 10013: Permission denied, 10048: Address in use, 98: Linux address in use
            if e.errno in (10013, 10048, 98, 13):
                print(f"  [!] Port {port} is busy or restricted, trying {port + 1}...")
                port += 1
            else:
                raise e
        except KeyboardInterrupt:
            print("\n  Server stopped.")
            break


if __name__ == "__main__":
    main()
