// ─── P2P WebRTC File Sharing ───
const CHUNK_SIZE = 64 * 1024; // 64 KB chunks
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];
const POLL_INTERVAL = 800; // ms

let pc = null;
let dataChannel = null;
let roomId = null;
let role = null; // "sender" or "receiver"
let selectedFiles = [];
let pollTimer = null;
let pollIndex = 0;
let pendingCandidates = [];
let transferAccepted = false;
let transferStartTime = 0;
let abortCurrentTransfer = false;
let isTransferring = false;
let serverIp = window.location.hostname;

// ─── Init ───
(async function init() {
  const params = new URLSearchParams(window.location.search);
  roomId = params.get("room");

  // Fetch true server IP for local network sharing scenarios
  try {
    const infoRes = await fetch("/api/info");
    const infoData = await infoRes.json();
    serverIp = infoData.ip;
  } catch (e) {
    console.warn("Failed to fetch server IP, falling back to hostname:", e);
  }

  if (roomId) {
    // Receiver mode
    role = "receiver";
    document.getElementById("senderView").classList.add("hidden");
    document.getElementById("receiverView").classList.remove("hidden");
    updateIdentity(); // Allow receiver to have a name too
    startReceiver();
  } else {
    // Sender mode
    role = "sender";
    setupFileInput();
    updateIdentity();
  }
})();

const deviceIcons = {
  fox: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" /></svg>',
  panda: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>',
  owl: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>',
  wolf: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m3.75 7.5 16.5-4.125M12 6.75c-2.708 0-5.363.224-7.948.655C2.999 7.58 2.25 8.507 2.25 9.574v9.176A2.25 2.25 0 0 0 4.5 21h15a2.25 2.25 0 0 0 2.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169A48.329 48.329 0 0 0 12 6.75Z" /></svg>',
  bear: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>',
  hawk: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>',
  cat: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>',
  dolphin: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>',
  tiger: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>',
  lion: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>',
  koala: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75-1.5.75a3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0 3.354 3.354 0 0 0-3 0 3.354 3.354 0 0 1-3 0L3 16.5m15-3.379a48.474 48.474 0 0 0-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 0 1 3 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 0 1 6 13.12M12.265 3.11a.375.375 0 1 1-.53 0L12 2.845l.265.265Z" /></svg>',
  raven: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>',
  otter: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" /></svg>',
  shark: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>',
  elephant: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>',
  butterfly: '<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>',
};

function getDeviceSvg(name) {
  const seed = Array.from(name).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const keys = Object.keys(deviceIcons);
  return deviceIcons[keys[seed % keys.length]];
}

function updateIdentity() {
  const name = localStorage.getItem("user_name") || "Anonymous";
  const el = document.getElementById("userNameDisplay");
  if (el) el.textContent = name;

  // Update Navbar
  const navNameEl = document.getElementById("navUserName");
  const navIconEl = document.getElementById("navUserIcon");
  if (navNameEl) navNameEl.textContent = name;
  if (navIconEl) navIconEl.innerHTML = getDeviceSvg(name);
}


async function changeName() {
  const currentName = localStorage.getItem("user_name") || "Anonymous";
  const modal = document.getElementById("nameModal");
  const input = document.getElementById("newNameInput");

  input.value = currentName === "Anonymous" ? "" : currentName;
  modal.classList.add("open");
  input.focus();
}

function closeNameModal() {
  const modal = document.getElementById("nameModal");
  modal.classList.remove("open");
}

async function saveNameFromModal() {
  const input = document.getElementById("newNameInput");
  const newName = input.value.trim();
  const currentName = localStorage.getItem("user_name") || "Anonymous";

  if (newName && newName !== currentName) {
    localStorage.setItem("user_name", newName);
    updateIdentity();
    showToast("Name updated!");
  }
  closeNameModal();
}

// ─── Sender: File Selection ───
function setupFileInput() {
  const fileInput = document.getElementById("fileInput");
  const dropArea = document.getElementById("fileSelectArea");

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) {
      selectedFiles = Array.from(fileInput.files);
      showSelectedFile();
    }
  });

  // Drag & drop
  ["dragenter", "dragover", "dragleave", "drop"].forEach((evt) =>
    dropArea.addEventListener(
      evt,
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      false,
    ),
  );
  ["dragenter", "dragover"].forEach((evt) =>
    dropArea.addEventListener(
      evt,
      () => dropArea.classList.add("border-accent", "bg-accent/5"),
      false,
    ),
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropArea.addEventListener(
      evt,
      () => dropArea.classList.remove("border-accent", "bg-accent/5"),
      false,
    ),
  );
  dropArea.addEventListener(
    "drop",
    (e) => {
      if (e.dataTransfer.files.length) {
        selectedFiles = Array.from(e.dataTransfer.files);
        showSelectedFile();
      }
    },
    false,
  );
}

function showSelectedFile() {
  const fileList = document.getElementById("fileList");
  fileList.innerHTML = "";
  let totalSize = 0;

  selectedFiles.forEach((file, index) => {
    totalSize += file.size;
    const item = document.createElement("div");
    item.className =
      "bg-card border border-border rounded-xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2";
    item.innerHTML = `
      <div class="w-8 h-8 text-accent flex-shrink-0">
        <svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold truncate">${file.name}</div>
        <div class="text-slate-500 text-sm">${formatBytes(file.size)}</div>
      </div>
      <button onclick="removeFile(${index})" class="text-slate-500 hover:text-danger transition text-xl">&times;</button>
    `;
    fileList.appendChild(item);
  });

  if (totalSize > 2 * 1024 * 1024 * 1024) {
    showToast("Warning: Total size over 2GB may fail on some devices");
  }

  document.getElementById("fileSelectArea").classList.add("hidden");
  document.getElementById("selectedFile").classList.remove("hidden");
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  if (selectedFiles.length === 0) {
    clearFile();
  } else {
    showSelectedFile();
  }
}

function clearFile() {
  selectedFiles = [];
  document.getElementById("fileInput").value = "";
  document.getElementById("selectedFile").classList.add("hidden");
  document.getElementById("fileSelectArea").classList.remove("hidden");
  document.getElementById("shareInfo").classList.add("hidden");
}

// ─── Sender: Create Room & Setup WebRTC ───
async function createRoom() {
  const btn = document.getElementById("shareBtn");
  btn.disabled = true;
  btn.textContent = "Creating link…";

  try {
    const res = await fetch("/api/p2p/create", { method: "POST" });
    if (!res.ok) throw new Error("Server error: " + res.status);
    const data = await res.json();
    roomId = data.room;

    // Show share link + QR
    const port = window.location.port ? `:${window.location.port}` : "";
    let base = window.location.origin;

    // Replace localhost with the real IP if needed
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
    ) {
      base = `${window.location.protocol}//${serverIp}${port}`;
    }

    const shareLink = base + "/p2p.html?room=" + roomId;
    document.getElementById("shareUrl").textContent = shareLink;

    const qrEl = document.getElementById("qrcode");
    qrEl.innerHTML = "";
    new QRCode(qrEl, {
      text: shareLink,
      width: 200,
      height: 200,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });

    document.getElementById("shareInfo").classList.remove("hidden");
    btn.textContent = "Link created!";

    // Setup WebRTC as sender
    setupSenderConnection();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Create share link";
    console.error("Failed to create room:", err);
  }
}

function setupSenderConnection() {
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // Create data channel
  dataChannel = pc.createDataChannel("fileTransfer", {
    ordered: true,
  });

  dataChannel.binaryType = "arraybuffer";

  dataChannel.onopen = () => {
    console.log("DataChannel open");
    if (transferAccepted) {
      sendFile();
    }
  };

  dataChannel.onclose = () => {
    console.log("DataChannel closed");
  };

  // Gather ICE candidates and send to signaling server
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignal("ice-candidate", e.candidate);
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log("ICE state:", pc.iceConnectionState);
    if (
      pc.iceConnectionState === "connected" ||
      pc.iceConnectionState === "completed"
    ) {
      document.getElementById("waitingStatus").innerHTML =
        '<div class="w-2 h-2 rounded-full bg-success"></div> <span class="text-success">Someone joined!</span>';

      // Send transfer request after connection if files are selected
      if (selectedFiles.length > 0) {
        const manifest = {
          sender: localStorage.getItem("user_name") || "Anonymous",
          files: selectedFiles.map((f) => ({
            name: f.name,
            size: f.size,
            type: f.type,
          })),
        };
        sendSignal("transfer-request", manifest);
      }
    }
  };

  // Create offer
  pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .then(() => {
      sendSignal("offer", pc.localDescription);
      // Start polling for answer/candidates
      startPolling();
    })
    .catch((err) => console.error("Offer error:", err));
}

// ─── Sender: Send Files via DataChannel ───
async function sendFile() {
  if (isTransferring) return;
  if (
    selectedFiles.length === 0 ||
    !dataChannel ||
    dataChannel.readyState !== "open"
  ) {
    if (selectedFiles.length > 0) transferAccepted = true; // Wait for channel to open
    return;
  }

  isTransferring = true;
  transferAccepted = false; // Reset flag
  abortCurrentTransfer = false;

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

  document.getElementById("shareInfo").classList.add("hidden");
  overlay.style.display = "flex";
  setTimeout(() => card.classList.remove("scale-95", "opacity-0"), 10);

  const BUFFER_HIGH = 2 * 1024 * 1024; // 2MB
  dataChannel.bufferedAmountLowThreshold = 512 * 1024; // 512KB

  transferStartTime = Date.now();

  for (let i = 0; i < selectedFiles.length; i++) {
    if (abortCurrentTransfer) break;
    const file = selectedFiles[i];
    nameEl.textContent = file.name;
    stageEl.textContent = `Preparing file ${i + 1} of ${selectedFiles.length}...`;

    // Send metadata for this file
    dataChannel.send(
      JSON.stringify({
        name: file.name,
        size: file.size,
        type: file.type,
        index: i,
        total: selectedFiles.length,
      }),
    );

    await new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      let offset = 0;

      function updateProgress() {
        const now = Date.now();
        const duration = Math.max(0.1, (now - transferStartTime) / 1000); // Guard against div-by-zero
        const speed = offset / duration;
        const remainingBytes = file.size - offset;
        const eta = remainingBytes / speed;

        const percent = Math.min(100, Math.round((offset / file.size) * 100));
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

      function sendNextChunk() {
        if (abortCurrentTransfer) return reject("Aborted");
        if (dataChannel.readyState !== "open") return reject("Channel closed");

        if (offset >= file.size) {
          dataChannel.send("__EOF__");
          resolve();
          return;
        }

        if (dataChannel.bufferedAmount > BUFFER_HIGH) {
          dataChannel.onbufferedamountlow = () => {
            dataChannel.onbufferedamountlow = null;
            readAndSend();
          };
          return;
        }
        readAndSend();
      }

      function readAndSend() {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        fileReader.readAsArrayBuffer(slice);
      }

      fileReader.onload = (e) => {
        dataChannel.send(e.target.result);
        offset += e.target.result.byteLength;
        updateProgress();
        sendNextChunk();
      };

      fileReader.onerror = () => reject("File read error");
      sendNextChunk();
    });
  }

  if (abortCurrentTransfer) {
    closeTransferOverlay();
    return;
  }

  // Success State
  stageEl.textContent = "Sent successfully!";
  bar.style.width = "100%";
  percentEl.textContent = "100%";
  speedEl.textContent = "Done";
  etaEl.textContent = "0:00";

  iconBox.classList.add("bg-success", "border-success", "success-ring");
  iconBox.innerHTML = `<svg class="w-8 h-8 sm:w-10 sm:h-10 text-white check-animate" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>`;
  abortBtn.classList.add("hidden");
  successBtn.classList.remove("hidden");

  isTransferring = false;
  stopPolling();
}

// ─── Receiver: Connect & Receive ───
async function startReceiver() {
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  let currentFileChunks = [];
  let currentFileMeta = null;
  let receivedSize = 0;

  // Connection timeout — 30 seconds
  const connectTimeout = setTimeout(() => {
    if (!dataChannel || dataChannel.readyState !== "open") {
      showRecvError(
        "Connection timed out. The sender may have closed the page.",
      );
      stopPolling();
      if (pc) pc.close();
    }
  }, 30000);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignal("ice-candidate", e.candidate);
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log("ICE state:", pc.iceConnectionState);
    if (
      pc.iceConnectionState === "failed" ||
      pc.iceConnectionState === "disconnected"
    ) {
      console.warn("ICE connection failed/disconnected", pc.iceConnectionState);
      showRecvError(
        "Connection lost. Try refreshing both devices.",
      );
    }
  };

  pc.ondatachannel = (e) => {
    clearTimeout(connectTimeout);
    console.log("Received data channel");
    dataChannel = e.channel;
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onmessage = (event) => {
      // First message for a file is metadata (JSON string)
      if (typeof event.data === "string" && event.data !== "__EOF__") {
        try {
          currentFileMeta = JSON.parse(event.data);
          receivedSize = 0;
          currentFileChunks = [];
          transferStartTime = Date.now();

          const overlay = document.getElementById("transferOverlay");
          const card = document.getElementById("transferCard");
          const nameEl = document.getElementById("transferName");
          const stageEl = document.getElementById("transferStage");
          const bar = document.getElementById("transferBar");
          const abortBtn = document.getElementById("abortBtn");
          const successBtn = document.getElementById("successCloseBtn");
          const iconBox = document.getElementById("transferIcon");

          nameEl.textContent = currentFileMeta.name;
          stageEl.textContent = `Receiving file ${currentFileMeta.index + 1} of ${currentFileMeta.total}...`;
          bar.style.width = "0%";
          abortBtn.classList.remove("hidden");
          successBtn.classList.add("hidden");
          iconBox.classList.remove("bg-success", "border-success", "success-ring");
          iconBox.innerHTML = `<svg class="w-7 h-7 sm:w-8 sm:h-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>`;

          overlay.style.display = "flex";
          setTimeout(() => card.classList.remove("scale-95", "opacity-0"), 10);
          return;
        } catch (e) { }
      }

      // Check for EOF (end of current file)
      if (typeof event.data === "string" && event.data === "__EOF__") {
        const blob = new Blob(currentFileChunks, {
          type: currentFileMeta?.type || "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);

        const stageEl = document.getElementById("transferStage");
        const bar = document.getElementById("transferBar");
        const iconBox = document.getElementById("transferIcon");
        const abortBtn = document.getElementById("abortBtn");
        const successBtn = document.getElementById("successCloseBtn");

        if (currentFileMeta.index + 1 === currentFileMeta.total) {
          // All files complete
          stageEl.textContent = "All files received!";
          bar.style.width = "100%";
          iconBox.classList.add("bg-success", "border-success", "success-ring");
          iconBox.innerHTML = `<svg class="w-8 h-8 sm:w-10 sm:h-10 text-white check-animate" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>`;
          abortBtn.classList.add("hidden");
          successBtn.classList.remove("hidden");
          stopPolling();
        }

        const a = document.createElement("a");
        a.href = url;
        a.download = currentFileMeta.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return;
      }

      // Binary data chunk
      if (event.data instanceof ArrayBuffer) {
        currentFileChunks.push(event.data);
        receivedSize += event.data.byteLength;

        if (currentFileMeta) {
          const now = Date.now();
          const duration = Math.max(0.1, (now - transferStartTime) / 1000);
          const speed = receivedSize / duration;
          const remainingBytes = currentFileMeta.size - receivedSize;
          const eta = remainingBytes / speed;

          const bar = document.getElementById("transferBar");
          const percentEl = document.getElementById("uiPercent");
          const speedEl = document.getElementById("uiSpeed");
          const etaEl = document.getElementById("uiEta");

          const percent = Math.min(
            100,
            Math.round((receivedSize / currentFileMeta.size) * 100),
          );
          bar.style.width = percent + "%";
          percentEl.textContent = percent + "%";
          speedEl.textContent = formatBytes(speed) + "/s";

          if (eta > 0 && eta < 3600) {
            const mins = Math.floor(eta / 60);
            const secs = Math.floor(eta % 60);
            etaEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
          } else {
            etaEl.textContent = "--:--";
          }
        }
      }
    };

    dataChannel.onclose = () => {
      console.log("DataChannel closed");
      if (!currentFileMeta || receivedSize < currentFileMeta.size) {
        showRecvError(
          "Transfer interrupted. The sender may have closed their browser.",
        );
      }
    };
  };

  // Start polling for the sender's offer
  startPolling();
}

function showRecvError(msg) {
  document.getElementById("recvConnecting").classList.add("hidden");
  document.getElementById("recvError").classList.remove("hidden");
  if (msg) document.getElementById("recvErrorMsg").textContent = msg;
}

// ─── Signaling: Send & Poll ───
function sendSignal(type, data) {
  fetch("/api/p2p/signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room: roomId,
      from: role,
      type: type,
      data: data,
    }),
  }).catch((err) => console.error("Signal send error:", err));
}

function startPolling() {
  pollIndex = 0;
  pollTimer = setInterval(pollSignals, POLL_INTERVAL);
  pollSignals(); // Immediate first poll
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollSignals() {
  try {
    const res = await fetch(
      "/api/p2p/poll?room=" + roomId + "&role=" + role + "&since=" + pollIndex,
    );
    if (!res.ok) {
      if (res.status === 404) {
        showRecvError("Room not found or expired.");
        stopPolling();
      }
      return;
    }

    const data = await res.json();
    pollIndex = data.index;

    for (const signal of data.signals || []) {
      await handleSignal(signal);
    }
  } catch (err) {
    console.error("Poll error:", err);
  }
}

function respondToTransfer(accepted) {
  document.getElementById("requestModal").classList.add("hidden");
  sendSignal("transfer-response", { accepted: accepted });
  if (!accepted) {
    showRecvError("You declined the transfer.");
  }
}

async function handleSignal(signal) {
  console.log("Handling signal:", signal.type, "from:", signal.from);

  try {
    if (signal.type === "offer" && role === "receiver") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
      // Process any ICE candidates that arrived before the offer
      for (const c of pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidates = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal("answer", pc.localDescription);
    } else if (signal.type === "answer" && role === "sender") {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
      // Process any ICE candidates that arrived before the answer
      for (const c of pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      pendingCandidates = [];
    } else if (signal.type === "ice-candidate") {
      if (signal.data) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.data));
        } else {
          // Buffer candidates until remote description is set
          pendingCandidates.push(signal.data);
        }
      }
    } else if (signal.type === "transfer-request") {
      const { sender, files } = signal.data;
      const count = files.length;
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      document.getElementById("requestInfo").textContent =
        `${sender} wants to share ${count} file(s) (${formatBytes(totalSize)})`;
      document.getElementById("requestModal").classList.remove("hidden");
    } else if (signal.type === "transfer-response") {
      if (signal.data.accepted) {
        showToast("Transfer accepted! Starting...");
        transferAccepted = true;
        sendFile();
      } else {
        showToast("Transfer declined by receiver.");
        transferAccepted = false;
        resetSender();
      }
    }
  } catch (err) {
    console.error("Signal handling error:", err);
  }
}

// ─── Utilities ───
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function copyLink() {
  const url = document.getElementById("shareUrl").textContent;
  navigator.clipboard
    .writeText(url)
    .then(() => showToast("Link copied!"))
    .catch(() => {
      // Fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      showToast("Link copied!");
    });
}

function showToast(msg) {
  const t = document.getElementById("toastEl");
  t.textContent = msg;
  t.classList.remove("opacity-0", "translate-y-4", "pointer-events-none");
  t.classList.add("opacity-100", "translate-y-0");
  setTimeout(() => {
    t.classList.add("opacity-0", "translate-y-4", "pointer-events-none");
    t.classList.remove("opacity-100", "translate-y-0");
  }, 2000);
}

function resetSender() {
  if (pc) {
    pc.close();
    pc = null;
  }
  dataChannel = null;
  roomId = null;
  selectedFiles = [];
  isTransferring = false;
  pollIndex = 0;
  pendingCandidates = [];
  stopPolling();

  document.getElementById("shareInfo").classList.add("hidden");
  document.getElementById("selectedFile").classList.add("hidden");
  document.getElementById("fileSelectArea").classList.remove("hidden");
  document.getElementById("fileInput").value = "";

  const btn = document.getElementById("shareBtn");
  btn.disabled = false;
  btn.textContent = "Create share link";
  closeTransferOverlay();
}

function closeTransferOverlay() {
  const overlay = document.getElementById("transferOverlay");
  const card = document.getElementById("transferCard");
  const iconBox = document.getElementById("transferIcon");

  card.classList.add("scale-95", "opacity-0");
  setTimeout(() => {
    overlay.style.display = "none";
    iconBox.classList.remove("bg-success", "border-success", "success-ring");
  }, 300);
}

function abortTransfer() {
  abortCurrentTransfer = true;
  if (dataChannel) dataChannel.close();
  showToast("Transfer cancelled");
  closeTransferOverlay();
}
