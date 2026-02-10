const myId =
  localStorage.getItem("device_id") ||
  (() => {
    const id =
      "dev_" +
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    localStorage.setItem("device_id", id);
    return id;
  })();
let peers = {},
  targetPeer = null,
  notifFile = null,
  evtSource = null;

register().then(() => {
  connectSSE();
  loadSharedFiles();
  setupDragDrop();
  displayShareUrl();
  window.addEventListener("resize", renderPeers);
});

async function register() {
  try {
    const r = await fetch("/api/register", {
      method: "POST",
      body: JSON.stringify({ id: myId }),
    });
    if (!r.ok) throw new Error("status " + r.status);
    const d = await r.json();
    document.getElementById("meIcon").textContent = d.icon;
    document.getElementById("meName").textContent = d.name;
  } catch (e) {
    console.error("Registration failed:", e);
    document.getElementById("emptyState").innerHTML =
      '<div style="color:var(--danger)">Connection Error</div><div style="font-size:0.75rem">' +
      e.message +
      '</div><p style="font-size:0.7rem;margin-top:1rem">Check if your laptop firewall is blocking port 8080</p>';
  }
}

function connectSSE() {
  if (evtSource) evtSource.close();
  evtSource = new EventSource("/api/events?id=" + myId);
  evtSource.addEventListener("peers", (e) => {
    peers = {};
    const data = JSON.parse(e.data);
    if (data && Array.isArray(data)) data.forEach((p) => (peers[p.id] = p));
    renderPeers();
  });
  evtSource.addEventListener("device-joined", (e) => {
    const p = JSON.parse(e.data);
    peers[p.id] = p;
    renderPeers();
  });
  evtSource.addEventListener("device-left", (e) => {
    const p = JSON.parse(e.data);
    delete peers[p.id];
    renderPeers();
  });
  evtSource.addEventListener("file-sent", (e) => {
    const d = JSON.parse(e.data);
    notifFile = d.filename;
    document.getElementById("notifTitle").textContent =
      d.from_icon + " " + d.from_name + " sent a file";
    document.getElementById("notifSub").textContent = d.filename;
    document.getElementById("notif").classList.add("show");
    setTimeout(
      () => document.getElementById("notif").classList.remove("show"),
      8000,
    );
    loadSharedFiles();
  });
  evtSource.addEventListener("shared-update", () => loadSharedFiles());
  evtSource.onerror = () => setTimeout(connectSSE, 3000);
}

function renderPeers() {
  const area = document.getElementById("deviceArea");
  area.querySelectorAll(".peer").forEach((el) => el.remove());
  const ids = Object.keys(peers);
  const emptyState = document.getElementById("emptyState");
  emptyState.style.display = ids.length ? "none" : "block";

  // Update device count
  document.getElementById("deviceCount").textContent =
    ids.length + " device" + (ids.length !== 1 ? "s" : "") + " online";

  const centerX = area.offsetWidth / 2;
  const centerY = area.offsetHeight / 2;
  const R = Math.min(centerX, centerY) * 0.7;

  ids.forEach((id, i) => {
    const angle = ((2 * Math.PI) / ids.length) * i - Math.PI / 2;
    const x = centerX + R * Math.cos(angle);
    const y = centerY + R * Math.sin(angle);
    const p = peers[id];
    const el = document.createElement("div");
    el.className = "peer";
    el.style.cssText =
      "left:" + x + "px;top:" + y + "px;transform:translate(-50%,-50%)";
    el.innerHTML =
      '<div class="avatar">' +
      p.icon +
      '</div><div class="label">' +
      p.name +
      '</div><div class="type">' +
      p.type +
      "</div>";
    el.onclick = () => {
      targetPeer = id;
      document.getElementById("modalIcon").textContent = p.icon;
      document.getElementById("modalName").textContent = p.name;
      document.getElementById("modalOverlay").classList.add("open");
    };
    area.appendChild(el);
  });
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  targetPeer = null;
}
function openSharedUpload() {
  document.getElementById("sharedOverlay").classList.add("open");
}
function closeSharedOverlay() {
  document.getElementById("sharedOverlay").classList.remove("open");
}

// File input change handlers are set up in setupDragDrop()

function upload(files, to, prefix) {
  if (!files.length) return;
  const fd = new FormData();
  let totalSize = 0;
  for (const f of files) {
    fd.append("files", f);
    totalSize += f.size;
  }
  if (to) fd.append("to", to);
  fd.append("from", myId);

  const prog = document.getElementById(prefix + "Progress"),
    fill = document.getElementById(prefix + "Fill"),
    percentEl = document.getElementById(prefix + "Percent"),
    statusEl = document.getElementById(prefix + "Status");

  prog.style.display = "block";
  fill.style.width = "0%";
  percentEl.textContent = "0%";
  statusEl.textContent =
    "Uploading " +
    files.length +
    " file" +
    (files.length > 1 ? "s" : "") +
    "...";

  const xhr = new XMLHttpRequest();
  xhr.upload.onprogress = (e) => {
    const percent = Math.round((e.loaded / e.total) * 100);
    fill.style.width = percent + "%";
    percentEl.textContent = percent + "%";
    statusEl.textContent = formatBytes(e.loaded) + " / " + formatBytes(e.total);
  };
  xhr.onload = () => {
    fill.style.width = "100%";
    percentEl.textContent = "100%";
    statusEl.textContent = "Complete!";
    toast("✓ Sent successfully!");
    setTimeout(() => {
      closeModal();
      closeSharedOverlay();
      prog.style.display = "none";
    }, 1000);
    loadSharedFiles();
  };
  xhr.onerror = () => {
    toast("✗ Upload failed!");
    prog.style.display = "none";
  };
  xhr.open("POST", "/api/upload");
  xhr.send(fd);
}

async function loadSharedFiles() {
  const r = await fetch("/api/files");
  const files = await r.json();
  const bar = document.getElementById("sharedBar");
  bar.querySelectorAll(".file-chip").forEach((el) => el.remove());
  files.forEach((f) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    chip.title = "Click to download " + f.name;
    chip.innerHTML =
      '<span class="file-icon">📄</span>' +
      '<div class="file-info">' +
      '<span class="name">' +
      f.name +
      "</span>" +
      '<span class="size">' +
      formatBytes(f.size) +
      "</span>" +
      "</div>" +
      '<span class="del" title="Delete file" onclick="event.stopPropagation();delFile(\'' +
      f.name +
      "')\">×</span>";
    chip.onclick = () =>
      (location.href = "/download/" + f.name + "?id=" + myId);
    bar.appendChild(chip);
  });
}

async function delFile(n) {
  await fetch("/api/delete/" + n, { method: "DELETE" });
  loadSharedFiles();
}
function downloadNotifFile() {
  if (notifFile) location.href = "/download/" + notifFile + "?id=" + myId;
  document.getElementById("notif").classList.remove("show");
}
function toast(m) {
  const t = document.getElementById("toast");
  t.textContent = m;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function setupDragDrop() {
  const configs = [
    {
      area: "modalDropArea",
      input: "modalFileInput",
      getTo: () => targetPeer,
      prefix: "transfer",
    },
    {
      area: "sharedDropArea",
      input: "sharedFileInput",
      getTo: () => null,
      prefix: "shared",
    },
  ];

  configs.forEach(({ area: areaId, input: inputId, getTo, prefix }) => {
    const area = document.getElementById(areaId);
    const input = document.getElementById(inputId);

    // Click to open file picker
    area.addEventListener("click", () => input.click());

    // File selected via picker
    input.addEventListener("change", () => {
      if (input.files.length) {
        upload(input.files, getTo(), prefix);
        input.value = "";
      }
    });

    // Drag events
    ["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
      area.addEventListener(evt, preventDefaults, false);
    });

    ["dragenter", "dragover"].forEach((evt) => {
      area.addEventListener(evt, () => area.classList.add("drag-over"), false);
    });

    ["dragleave", "drop"].forEach((evt) => {
      area.addEventListener(
        evt,
        () => area.classList.remove("drag-over"),
        false,
      );
    });

    // Drop handler
    area.addEventListener(
      "drop",
      (e) => {
        const files = e.dataTransfer.files;
        if (files.length) upload(files, getTo(), prefix);
      },
      false,
    );
  });
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function displayShareUrl() {
  const url = window.location.href;
  document.getElementById("shareUrl").textContent = url;
}

function copyUrl() {
  const url = window.location.href;
  navigator.clipboard
    .writeText(url)
    .then(() => {
      toast("✓ URL copied to clipboard!");
    })
    .catch(() => {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      toast("✓ URL copied!");
    });
}
