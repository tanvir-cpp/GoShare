let peers = {},
  targetPeer = null,
  uploadQueue = [],
  incomingFiles = [],
  notifFile = null,
  evtSource = null,
  serverIp = window.location.hostname,
  currentXhr = null,
  transferStartTime = 0,
  abortCurrentTransfer = false,
  sseRetryCount = 0;

register().then(() => {
  connectSSE();
  loadSharedFiles();
  setupDragDrop();
  setupGlobalDragFeedback();
  window.addEventListener("resize", renderPeers);
  window.addEventListener("beforeunload", () => {
    if (evtSource) evtSource.close();
  });
  // Remove skeleton loading states
  document.querySelectorAll(".skeleton").forEach(el => el.classList.remove("skeleton"));
  // Request notification permission
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
});

async function register() {
  // Fetch server info for correct LAN URL
  try {
    const infoRes = await fetch("/api/info");
    const infoData = await infoRes.json();
    serverIp = infoData.ip;
  } catch (e) {
    console.error("Failed to fetch server info:", e);
  }

  const customName = localStorage.getItem("user_name");
  try {
    const r = await fetch("/api/register", {
      method: "POST",
      body: JSON.stringify({ id: myId, name: customName }),
    });
    const d = await r.json();
    document.getElementById("meIcon").innerHTML = getDeviceSvg(d.icon);
    document.getElementById("meName").textContent = d.name;

    // Update Navbar
    const navNameEl = document.getElementById("navUserName");
    const navIconEl = document.getElementById("navUserIcon");
    if (navNameEl) navNameEl.textContent = d.name;
    if (navIconEl) navIconEl.innerHTML = getDeviceSvg(d.icon);

    // Re-render peers if name was updated (though SSE should handle it, this is for immediate feedback)
    renderPeers();
  } catch (e) {
    console.error("Registration failed:", e);
    document.getElementById("emptyState").innerHTML =
      '<div style="color:var(--danger)">Connection Error</div><div style="font-size:0.75rem">' +
      e.message +
      '</div><p style="font-size:0.7rem;margin-top:1rem">Check if your laptop firewall is blocking port 8080</p>';
  }
}

// Identity helpers moved to shared.js (changeName, closeNameModal)

async function saveNameFromModal() {
  const input = document.getElementById("newNameInput");
  const newName = input.value.trim();
  const currentName = document.getElementById("meName").textContent;

  if (newName && newName !== currentName) {
    localStorage.setItem("user_name", newName);
    await register();
    showToast("Name updated!");
  }
  closeNameModal();
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
  evtSource.addEventListener("files-sent", (e) => {
    const d = JSON.parse(e.data);
    incomingFiles = d.filenames;

    // Show Accept/Decline modal for private transfers
    const modal = document.getElementById("lanRequestModal");
    const info = document.getElementById("lanRequestInfo");
    info.textContent = `${d.from_name} wants to send you ${incomingFiles.length} file(s).`;
    modal.classList.add("open");

    // Backup: standard notification too
    notifFile = incomingFiles[0];
    document.getElementById("notifTitle").textContent =
      d.from_name + " sent " + incomingFiles.length + " file(s)";
    document.getElementById("notifSub").textContent =
      incomingFiles[0] + (incomingFiles.length > 1 ? " and more..." : "");
    document.getElementById("notif").classList.add("notif-show");
    setTimeout(() => closeNotif(), 10000);
    // Browser notification
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("GoShare — File Received", {
        body: incomingFiles[0] + (incomingFiles.length > 1 ? " and " + (incomingFiles.length - 1) + " more" : ""),
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚀</text></svg>",
      });
    }
  });
  evtSource.addEventListener("shared-update", () => loadSharedFiles());
  evtSource.onopen = () => { sseRetryCount = 0; };
  evtSource.onerror = () => {
    sseRetryCount++;
    const delay = Math.min(3000 * Math.pow(1.5, sseRetryCount - 1), 30000);
    setTimeout(connectSSE, delay);
  };
}

function renderPeers() {
  const area = document.getElementById("deviceArea");
  area.querySelectorAll(".peer-node").forEach((el) => el.remove());
  const ids = Object.keys(peers);
  const emptyState = document.getElementById("emptyState");
  if (ids.length) {
    emptyState.classList.add("hidden");
  } else {
    emptyState.classList.remove("hidden");
  }

  // Update device count
  document.getElementById("deviceCount").textContent =
    ids.length + " device" + (ids.length !== 1 ? "s" : "") + " online";

  const centerX = area.offsetWidth / 2;
  const centerY = area.offsetHeight / 2;
  const R = Math.min(centerX, centerY) * 0.75;

  ids.forEach((id, i) => {
    const angle = ((2 * Math.PI) / ids.length) * i - Math.PI / 2;
    const x = centerX + R * Math.cos(angle);
    const y = centerY + R * Math.sin(angle);
    const p = peers[id];

    const el = document.createElement("div");
    el.className = "peer-node";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.transform = "translate(-50%,-50%)";

    el.innerHTML = `
      <div style="font-size: 2.25rem; line-height: 1; filter: drop-shadow(0 0 8px rgba(255,255,255,0.1));">${getDeviceSvg(p.icon)}</div>
      <div class="peer-name">${escapeHtml(p.name)}</div>
    `;

    // Keyboard accessibility
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Send files to " + p.name);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    });

    // Drag-and-drop on individual peer
    el.addEventListener("dragenter", (e) => {
      e.preventDefault();
      el.classList.add("drop-target");
    });
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.classList.add("drop-target");
    });
    el.addEventListener("dragleave", () => {
      el.classList.remove("drop-target");
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove("drop-target");
      document.body.classList.remove("drag-active");
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        targetPeer = p.id;
        uploadQueue = files;
        startLanUpload();
      }
    });

    el.onclick = () => {
      targetPeer = id;
      const mIcon = document.getElementById("modalIcon");
      if (mIcon) mIcon.innerHTML = getDeviceSvg(p.icon);
      document.getElementById("modalName").textContent = p.name;
      document.getElementById("modalOverlay").classList.add("open");
    };
    area.appendChild(el);
  });
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  targetPeer = null;
  uploadQueue = [];
  renderQueue("transfer");
}
function openSharedUpload() {
  uploadQueue = []; // Reset queue when opening
  document.getElementById("sharedOverlay").classList.add("open");
}
function closeSharedOverlay() {
  document.getElementById("sharedOverlay").classList.remove("open");
  uploadQueue = [];
  renderQueue("shared");
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

  // Show Premium Overlay
  const overlay = document.getElementById("transferOverlay");
  const card = document.getElementById("transferCard");
  const bar = document.getElementById("transferBar");
  const percentEl = document.getElementById("uiPercent");
  const speedEl = document.getElementById("uiSpeed");
  const etaEl = document.getElementById("uiEta");
  const nameEl = document.getElementById("transferName");
  const stageEl = document.getElementById("transferStage");
  const abortBtn = document.getElementById("abortBtn");
  const successBtn = document.getElementById("successCloseBtn");
  const iconBox = document.getElementById("transferIcon");

  nameEl.textContent =
    files.length > 1 ? `Sending ${files.length} files` : files[0].name;
  stageEl.textContent = "Getting ready...";
  bar.style.width = "0%";
  percentEl.textContent = "0%";
  speedEl.textContent = "0 MB/s";
  etaEl.textContent = "--:--";
  abortBtn.classList.remove("hidden");
  successBtn.classList.add("hidden");
  if (iconBox) {
    iconBox.classList.remove("bg-success", "border-success", "success-ring");
    iconBox.innerHTML = `<svg style="width: 32px; height: 32px; color: var(--text-dim);" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75m0-3-3-3m0 0-3 3m3-3v11.25m6-2.25h.75a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-.75" /></svg>`;
  }

  overlay.classList.add("open");
  setTimeout(() => card.classList.remove("scale-95", "opacity-0"), 10);

  transferStartTime = Date.now();
  currentXhr = new XMLHttpRequest();

  currentXhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const now = Date.now();
      const duration = (now - transferStartTime) / 1000;
      const speed = e.loaded / duration; // bytes per second
      const remainingBytes = e.total - e.loaded;
      const eta = remainingBytes / speed;

      const percent = Math.round((e.loaded / e.total) * 100);
      bar.style.width = percent + "%";
      percentEl.textContent = percent + "%";
      speedEl.textContent = formatBytes(speed) + "/s";
      stageEl.textContent = "Sending your files...";

      if (eta > 0 && eta < 3600) {
        const mins = Math.floor(eta / 60);
        const secs = Math.floor(eta % 60);
        etaEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
      } else {
        etaEl.textContent = "--:--";
      }
    }
  };

  currentXhr.onload = () => {
    if (currentXhr.status >= 200 && currentXhr.status < 300) {
      bar.style.width = "100%";
      percentEl.textContent = "100%";
      stageEl.textContent = "Sent successfully!";
      speedEl.textContent = "Done";
      etaEl.textContent = "0:00";

      // Success Animation — green checkmark with pulse
      if (iconBox) {
        iconBox.classList.remove("bg-white/[0.03]", "border-white/[0.05]");
        iconBox.classList.add("bg-success", "border-success", "success-ring");
        iconBox.innerHTML = `<svg style="width: 40px; height: 40px; color: #fff;" class="check-animate" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>`;
      }
      abortBtn.classList.add("hidden");
      successBtn.classList.remove("hidden");

      showToast("Files sent! ✓");
      loadSharedFiles();
      // Auto-close overlay after success
      setTimeout(() => {
        closeTransferOverlay();
      }, 2000);
    } else {
      showToast("Upload failed: " + currentXhr.statusText);
      closeTransferOverlay();
    }
  };

  currentXhr.onerror = () => {
    showToast("Upload failed!");
    closeTransferOverlay();
  };

  currentXhr.open("POST", "/api/upload");
  currentXhr.send(fd);
}

function closeTransferOverlay() {
  const overlay = document.getElementById("transferOverlay");
  const card = document.getElementById("transferCard");
  const iconBox = document.getElementById("transferIcon");

  card.classList.add("scale-95", "opacity-0");
  setTimeout(() => {
    overlay.classList.remove("open");
    // Reset icon and classes for next time
    if (iconBox) iconBox.classList.remove("bg-success", "border-success", "success-ring");
    closeModal();
    closeSharedOverlay();
  }, 300);
}

function abortTransfer() {
  if (currentXhr) {
    currentXhr.abort();
    showToast("Transfer cancelled");
  }
  closeTransferOverlay();
}

async function loadSharedFiles() {
  try {
    const r = await fetch("/api/files");
    const files = await r.json();
    const bar = document.getElementById("sharedBar");
    if (!bar) return;

    // Clear existing chips
    bar.innerHTML = '<!-- File chips will be dynamically added here -->';

    if (!files || !Array.isArray(files) || files.length === 0) {
      bar.style.display = "none";
      return;
    }
    bar.style.display = "";

    bar.classList.remove("hidden");
    files.forEach((f) => {
      const chip = document.createElement("div");
      chip.className = "file-chip";
      chip.style.cssText = "flex-shrink: 0; display: flex; align-items: center; gap: 0.75rem; background: var(--surface-light); border: 1px solid var(--border); border-radius: var(--radius-full); padding: 0.5rem 1rem; cursor: pointer; transition: all 0.2s;";
      chip.title = "Download " + f.name;
      const safeName = escapeHtml(f.name);
      chip.innerHTML = `
        <span style="color: var(--accent); display: flex; font-size: 14px;">
          <i class="fa-solid fa-file"></i>
        </span>
        <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; font-weight: 500;">
          ${safeName}
        </div>
        <span style="color: var(--text-dim); font-size: 1.25rem; font-weight: 300; line-height: 1;" onclick="event.stopPropagation();delFile(this)">×</span>
      `;
      chip.dataset.filename = f.name;
      chip.onclick = () =>
        (location.href = "/download/" + encodeURIComponent(f.name) + "?id=" + myId);
      bar.appendChild(chip);
    });
  } catch (e) {
    console.error("Failed to load shared files:", e);
  }
}

async function delFile(el) {
  const chip = el.closest('.file-chip');
  const name = chip ? chip.dataset.filename : '';
  if (!name || !confirm('Delete "' + name + '"?')) return;
  await fetch("/api/delete/" + encodeURIComponent(name), { method: "DELETE" });
  loadSharedFiles();
}
function downloadNotifFile() {
  if (notifFile) location.href = "/download/" + encodeURIComponent(notifFile) + "?id=" + myId;
  closeNotif();
}
function closeNotif() {
  document.getElementById("notif").classList.remove("notif-show");
}
// Toast and formatBytes removed (now in shared.js)

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
        queueFiles(input.files, prefix);
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
        if (files.length) {
          queueFiles(files, prefix);
        }
      },
      false,
    );
  });
}

function queueFiles(files, prefix) {
  const newFiles = Array.from(files);
  // Filter out duplicates (by name and size)
  const uniqueNewFiles = newFiles.filter(nf => !uploadQueue.some(qf => qf.name === nf.name && qf.size === nf.size));
  uploadQueue = [...uploadQueue, ...uniqueNewFiles];
  renderQueue(prefix);
}

function removeFromQueue(index, prefix) {
  uploadQueue.splice(index, 1);
  renderQueue(prefix);
}

function renderQueue(prefix) {
  const isShared = prefix === "shared";
  const list = document.getElementById(isShared ? "sharedFileList" : "modalFileList");
  const sendBtn = document.getElementById(isShared ? "sharedSendBtn" : "modalSendBtn");
  const dropArea = document.getElementById(isShared ? "sharedDropArea" : "modalDropArea");

  if (!list || !sendBtn || !dropArea) return;

  list.innerHTML = "";
  if (uploadQueue.length > 0) {
    uploadQueue.forEach((f, i) => {
      const item = document.createElement("div");
      item.style.cssText = "background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 0.75rem 1rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;";
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem; max-width: 80%;">
          <i class="fa-solid fa-file" style="color: var(--accent); opacity: 0.7;"></i>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(f.name)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="color: var(--text-dim); font-size: 0.7rem;">${formatBytes(f.size)}</span>
          <i class="fa-solid fa-xmark" style="cursor: pointer; padding: 4px; color: var(--text-dim);" onclick="removeFromQueue(${i}, '${prefix}')"></i>
        </div>
      `;
      list.appendChild(item);
    });
    list.classList.remove("hidden");
    sendBtn.classList.remove("hidden");
    // Make dropArea smaller but keep it visible
    dropArea.style.padding = "1rem";
    dropArea.querySelector("i").style.fontSize = "20px";
    dropArea.querySelector("i").style.marginBottom = "0.5rem";
    dropArea.querySelectorAll("div").forEach(d => d.style.fontSize = "0.7rem");
  } else {
    list.classList.add("hidden");
    sendBtn.classList.add("hidden");
    // Reset dropArea
    dropArea.style.padding = "2.5rem 1.5rem";
    const icon = dropArea.querySelector("i");
    if (icon) { icon.style.fontSize = "32px"; icon.style.marginBottom = "1rem"; }
    const divs = dropArea.querySelectorAll("div");
    if (divs[0]) divs[0].style.fontSize = "0.9rem";
    if (divs[1]) divs[1].style.fontSize = "0.75rem";
  }
}

function startLanUpload(isShared) {
  if (uploadQueue.length === 0) return;
  const prefix = isShared ? "shared" : "transfer";
  const to = isShared ? null : targetPeer;
  upload(uploadQueue, to, prefix);

  // Close the triggering selection modal
  if (isShared) {
    document.getElementById("sharedOverlay").classList.remove("open");
  } else {
    document.getElementById("modalOverlay").classList.remove("open");
  }

  uploadQueue = [];
  renderQueue(prefix);
}

function respondToLan(accepted) {
  document.getElementById("lanRequestModal").classList.remove("open");
  if (accepted && incomingFiles.length > 0) {
    // Start downloading each file
    incomingFiles.forEach((name, i) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = "/download/" + encodeURIComponent(name) + "?id=" + myId;
        link.download = name;
        link.click();
      }, i * 500); // Stagger downloads to prevent browser blocking
    });
    showToast(`Downloading ${incomingFiles.length} file(s)...`);
    loadSharedFiles();
  }
  incomingFiles = [];
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

async function openConnectModal() {
  const modal = document.getElementById("connectModal");
  const urlText = document.getElementById("lanUrlText");
  const qrEl = document.getElementById("lanQr");

  let fullUrl;
  const hostname = window.location.hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

  if (isLocal) {
    // Running locally — fetch the real LAN IP so other devices can connect
    try {
      const infoRes = await fetch("/api/info");
      const infoData = await infoRes.json();
      if (infoData.ip && infoData.ip !== "127.0.0.1") {
        serverIp = infoData.ip;
      }
    } catch (e) {
      console.warn("Could not refresh server IP:", e);
    }
    const port = window.location.port ? `:${window.location.port}` : "";
    fullUrl = `${window.location.protocol}//${serverIp}${port}${window.location.pathname}`;
  } else {
    // Hosted on a public domain (e.g. goshare.koyeb.app) — use current URL as-is
    fullUrl = window.location.href.split("?")[0]; // strip any query params
  }

  urlText.textContent = fullUrl;

  qrEl.innerHTML = "";
  try {
    new QRCode(qrEl, {
      text: fullUrl,
      width: 160,
      height: 160,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch (e) {
    qrEl.innerHTML = '<div style="padding: 1rem; color: var(--text-dim); font-size: 0.85rem;">QR code unavailable</div>';
  }

  modal.classList.add("open");
}

function closeConnectModal() {
  const modal = document.getElementById("connectModal");
  modal.classList.remove("open");
}

function copyConnectUrl() {
  const url = document.getElementById("lanUrlText").textContent;
  navigator.clipboard.writeText(url).then(() => {
    showToast("URL copied!");
  });
}

// Global drag feedback — highlights all peer nodes when files are dragged onto the page
function setupGlobalDragFeedback() {
  let dragCounter = 0;

  document.addEventListener("dragenter", (e) => {
    if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
      dragCounter++;
      document.body.classList.add("drag-active");
    }
  });

  document.addEventListener("dragleave", () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      document.body.classList.remove("drag-active");
    }
  });

  document.addEventListener("drop", () => {
    dragCounter = 0;
    document.body.classList.remove("drag-active");
  });
}
