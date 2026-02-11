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
  queuedFiles = [],
  incomingFiles = [],
  notifFile = null,
  evtSource = null,
  serverIp = window.location.hostname;

// SVG icon mapping for device icons (matches backend icon identifiers)
const deviceIcons = {
  fox: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" /></svg>',
  panda:
    '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>',
  owl: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>',
  wolf: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m3.75 7.5 16.5-4.125M12 6.75c-2.708 0-5.363.224-7.948.655C2.999 7.58 2.25 8.507 2.25 9.574v9.176A2.25 2.25 0 0 0 4.5 21h15a2.25 2.25 0 0 0 2.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169A48.329 48.329 0 0 0 12 6.75Z" /></svg>',
  bear: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>',
  hawk: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>',
  cat: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>',
  dolphin:
    '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>',
  tiger:
    '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>',
  lion: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>',
  koala:
    '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.379a48.474 48.474 0 0 0-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12M12.265 3.11a.375.375 0 1 1-.53 0L12 2.845l.265.265Z" /></svg>',
  raven:
    '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>',
  otter:
    '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" /></svg>',
  shark:
    '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>',
  elephant:
    '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>',
  butterfly:
    '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>',
};

function getDeviceSvg(iconName) {
  return deviceIcons[iconName] || deviceIcons.fox;
}

register().then(() => {
  connectSSE();
  loadSharedFiles();
  setupDragDrop();
  window.addEventListener("resize", renderPeers);
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

async function changeName() {
  const currentName = document.getElementById("meName").textContent;
  const modal = document.getElementById("nameModal");
  const input = document.getElementById("newNameInput");

  input.value = currentName === "Anonymous" ? "" : currentName;
  modal.classList.remove("hidden");
  setTimeout(() => {
    document.getElementById("nameModalCard").classList.remove("scale-95", "opacity-0");
    input.focus();
  }, 10);
}

function closeNameModal() {
  const modal = document.getElementById("nameModal");
  document.getElementById("nameModalCard").classList.add("scale-95", "opacity-0");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

async function saveNameFromModal() {
  const input = document.getElementById("newNameInput");
  const newName = input.value.trim();
  const currentName = document.getElementById("meName").textContent;

  if (newName && newName !== currentName) {
    localStorage.setItem("user_name", newName);
    await register();
    toast("Name updated!");
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
    modal.classList.remove("hidden");

    // Backup: standard notification too
    document.getElementById("notifTitle").textContent =
      d.from_name + " sent " + incomingFiles.length + " file(s)";
    document.getElementById("notifSub").textContent = incomingFiles[0] + (incomingFiles.length > 1 ? " and more..." : "");
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
    el.className =
      "peer absolute w-[clamp(70px,20vw,84px)] h-[clamp(70px,20vw,84px)] rounded-2xl bg-card border border-border flex flex-col items-center justify-center cursor-pointer transition-all shadow-md hover:border-accent hover:bg-card-hover hover:shadow-xl";
    el.style.cssText =
      "left:" + x + "px;top:" + y + "px;transform:translate(-50%,-50%)";
    el.innerHTML =
      '<div class="w-6 h-6 text-accent">' +
      getDeviceSvg(p.icon) +
      '</div><div class="text-[clamp(0.55rem,1.8vw,0.7rem)] text-white mt-1 font-semibold max-w-[90%] whitespace-nowrap overflow-hidden text-ellipsis">' +
      p.name +
      '</div><div class="text-[0.55rem] text-muted">' +
      p.type +
      "</div>";
    el.onclick = () => {
      targetPeer = id;
      document.getElementById("modalIcon").innerHTML = getDeviceSvg(p.icon);
      document.getElementById("modalName").textContent = p.name;
      document.getElementById("modalOverlay").classList.add("open");
    };
    area.appendChild(el);
  });
}

function closeModal() {
  document.getElementById("modalOverlay").classList.remove("open");
  targetPeer = null;
  queuedFiles = [];
  renderQueue();
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

  prog.classList.remove("hidden");
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
    toast("Sent successfully!");
    setTimeout(() => {
      closeModal();
      closeSharedOverlay();
      prog.classList.add("hidden");
    }, 1000);
    loadSharedFiles();
  };
  xhr.onerror = () => {
    toast("Upload failed!");
    prog.classList.add("hidden");
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
    chip.className =
      "file-chip flex-shrink-0 flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-2 transition-all hover:border-accent hover:bg-card-hover max-w-[180px] cursor-pointer";
    chip.title = "Click to download " + f.name;
    chip.innerHTML =
      '<span class="text-accent w-4 h-4 flex-shrink-0"><svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/></svg></span>' +
      '<div class="flex-1 min-w-0 text-left">' +
      '<span class="block text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis">' +
      f.name +
      "</span>" +
      '<span class="text-[0.65rem] text-muted">' +
      formatBytes(f.size) +
      "</span>" +
      "</div>" +
      '<span class="text-muted text-lg leading-none cursor-pointer hover:text-danger" title="Delete file" onclick="event.stopPropagation();delFile(\'' +
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
  document.getElementById("notif").classList.remove("notif-show");
}
function toast(m) {
  const t = document.getElementById("toast");
  t.textContent = m;
  t.classList.add("toast-show");
  setTimeout(() => t.classList.remove("toast-show"), 2000);
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
        if (prefix === "transfer") {
          queueFiles(input.files);
        } else {
          upload(input.files, getTo(), prefix);
        }
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
          if (prefix === "transfer") {
            queueFiles(files);
          } else {
            upload(files, getTo(), prefix);
          }
        }
      },
      false,
    );
  });
}

function queueFiles(files) {
  queuedFiles = Array.from(files);
  renderQueue();
}

function renderQueue() {
  const list = document.getElementById("modalFileList");
  const sendBtn = document.getElementById("modalSendBtn");
  const dropArea = document.getElementById("modalDropArea");

  list.innerHTML = "";
  if (queuedFiles.length > 0) {
    queuedFiles.forEach((f, i) => {
      const item = document.createElement("div");
      item.className = "bg-bg/50 rounded-lg p-2 text-xs flex items-center justify-between border border-border";
      item.innerHTML = `<span class="truncate pr-2">${f.name}</span> <span class="text-muted">${formatBytes(f.size)}</span>`;
      list.appendChild(item);
    });
    list.classList.remove("hidden");
    sendBtn.classList.remove("hidden");
    dropArea.classList.add("hidden");
  } else {
    list.classList.add("hidden");
    sendBtn.classList.add("hidden");
    dropArea.classList.remove("hidden");
  }
}

function startLanUpload() {
  if (queuedFiles.length === 0) return;
  upload(queuedFiles, targetPeer, "transfer");
  queuedFiles = [];
}

function respondToLan(accepted) {
  document.getElementById("lanRequestModal").classList.add("hidden");
  if (accepted && incomingFiles.length > 0) {
    // Start downloading each file
    incomingFiles.forEach((name, i) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = "/download/" + name + "?id=" + myId;
        link.download = name;
        link.click();
      }, i * 500); // Stagger downloads to prevent browser blocking
    });
    toast(`Downloading ${incomingFiles.length} file(s)...`);
    loadSharedFiles();
  }
  incomingFiles = [];
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function openConnectModal() {
  const modal = document.getElementById("connectModal");
  const modalContent = document.getElementById("connectModalCard");
  const urlText = document.getElementById("lanUrlText");
  const qrEl = document.getElementById("lanQr");

  const fullUrl = `http://${serverIp}:${window.location.port}${window.location.pathname}`;
  urlText.textContent = fullUrl;

  qrEl.innerHTML = "";
  new QRCode(qrEl, {
    text: fullUrl,
    width: 160,
    height: 160,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });

  modal.classList.remove("hidden");
  setTimeout(() => {
    modalContent.classList.remove("scale-95", "opacity-0");
  }, 10);
}

function closeConnectModal() {
  const modal = document.getElementById("connectModal");
  const modalContent = document.getElementById("connectModalCard");
  modalContent.classList.add("scale-95", "opacity-0");
  setTimeout(() => modal.classList.add("hidden"), 300);
}

function copyConnectUrl() {
  const url = document.getElementById("lanUrlText").textContent;
  navigator.clipboard.writeText(url).then(() => {
    toast("URL copied!");
  });
}
function copyUrl() {
  const url = window.location.href;
  navigator.clipboard
    .writeText(url)
    .then(() => {
      toast("URL copied to clipboard!");
    })
    .catch(() => {
      // Fallback for older browsers
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      toast("URL copied!");
    });
}
