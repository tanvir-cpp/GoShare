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

// ─── Init ───
(function init() {
  const params = new URLSearchParams(window.location.search);
  roomId = params.get("room");

  if (roomId) {
    // Receiver mode
    role = "receiver";
    document.getElementById("senderView").classList.add("hidden");
    document.getElementById("receiverView").classList.remove("hidden");
    startReceiver();
  } else {
    // Sender mode
    role = "sender";
    setupFileInput();
    updateIdentity();
  }
})();

function updateIdentity() {
  const name = localStorage.getItem("user_name") || "Anonymous";
  const el = document.getElementById("userNameDisplay");
  if (el) el.textContent = name;
}

async function changeName() {
  const currentName = localStorage.getItem("user_name") || "Anonymous";
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
    item.className = "bg-card border border-border rounded-xl p-4 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2";
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
    const shareLink = window.location.origin + "/p2p.html?room=" + roomId;
    document.getElementById("shareUrl").textContent = shareLink;

    const qrEl = document.getElementById("qrcode");
    qrEl.innerHTML = "";
    new QRCode(qrEl, {
      text: shareLink,
      width: 200,
      height: 200,
      colorDark: "#a78bfa",
      colorLight: "#09090b",
      correctLevel: QRCode.CorrectLevel.M,
    });

    document.getElementById("shareInfo").classList.remove("hidden");
    btn.textContent = "Link generated!";

    // Setup WebRTC as sender
    setupSenderConnection();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Generate Share Link";
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
        '<div class="w-2 h-2 rounded-full bg-green-500"></div> <span class="text-green-400">Receiver connected!</span>';

      // Send transfer request after connection if files are selected
      if (selectedFiles.length > 0) {
        const manifest = {
          sender: localStorage.getItem("user_name") || "Anonymous",
          files: selectedFiles.map(f => ({ name: f.name, size: f.size, type: f.type }))
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
  if (selectedFiles.length === 0 || !dataChannel || dataChannel.readyState !== "open") {
    if (selectedFiles.length > 0) transferAccepted = true; // Wait for channel to open
    return;
  }

  transferAccepted = false; // Reset flag

  document.getElementById("shareInfo").classList.add("hidden");
  document.getElementById("senderProgress").classList.remove("hidden");

  const BUFFER_HIGH = 2 * 1024 * 1024; // 2MB
  dataChannel.bufferedAmountLowThreshold = 512 * 1024; // 512KB

  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    document.getElementById("progressLabel").textContent = `Sending (${i + 1}/${selectedFiles.length}): ${file.name}`;

    // Send metadata for this file
    dataChannel.send(JSON.stringify({
      name: file.name,
      size: file.size,
      type: file.type,
      index: i,
      total: selectedFiles.length
    }));

    await new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      let offset = 0;

      function updateProgress() {
        const percent = Math.min(100, Math.round((offset / file.size) * 100));
        document.getElementById("progressBar").style.width = percent + "%";
        document.getElementById("progressPercent").textContent = percent + "%";
        document.getElementById("progressDetail").textContent =
          formatBytes(offset) + " / " + formatBytes(file.size);
      }

      function sendNextChunk() {
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

  document.getElementById("senderProgress").classList.add("hidden");
  document.getElementById("senderDone").classList.remove("hidden");
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
      showRecvError("Connection timed out. The sender may have closed the page.");
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
      showRecvError("Connection lost. Please try again.");
    }
  };

  pc.ondatachannel = (e) => {
    clearTimeout(connectTimeout);
    console.log("Received data channel");
    dataChannel = e.channel;
    dataChannel.binaryType = "arraybuffer";

    dataChannel.onmessage = (event) => {
      // First message for a file is metadata (JSON string)
      if (!currentFileMeta && typeof event.data === "string") {
        try {
          currentFileMeta = JSON.parse(event.data);
          document.getElementById("recvConnecting").classList.add("hidden");
          document.getElementById("recvProgress").classList.remove("hidden");
          document.getElementById("recvFileName").textContent = `[${currentFileMeta.index + 1}/${currentFileMeta.total}] ${currentFileMeta.name}`;
          document.getElementById("recvFileSize").textContent = formatBytes(currentFileMeta.size);
          receivedSize = 0;
          currentFileChunks = [];
          return;
        } catch (e) { }
      }

      // Check for EOF (end of current file)
      if (typeof event.data === "string" && event.data === "__EOF__") {
        const blob = new Blob(currentFileChunks, {
          type: currentFileMeta?.type || "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);

        if (currentFileMeta.index + 1 === currentFileMeta.total) {
          // All files complete
          document.getElementById("recvProgress").classList.add("hidden");
          document.getElementById("recvDone").classList.remove("hidden");
          document.getElementById("recvDoneFile").textContent = `Received ${currentFileMeta.total} file(s)`;

          const link = document.getElementById("recvDownloadLink");
          link.href = url;
          link.download = currentFileMeta?.name || "download";
          link.innerHTML = `Download Final File: ${currentFileMeta.name}`;
          link.onclick = () => setTimeout(() => URL.revokeObjectURL(url), 5000);
          stopPolling();
        } else {
          // Download individual file and prepare for next
          const a = document.createElement("a");
          a.href = url;
          a.download = currentFileMeta.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          currentFileMeta = null;
        }
        return;
      }

      // Binary data chunk
      if (event.data instanceof ArrayBuffer) {
        currentFileChunks.push(event.data);
        receivedSize += event.data.byteLength;

        if (currentFileMeta) {
          const percent = Math.min(100, Math.round((receivedSize / currentFileMeta.size) * 100));
          document.getElementById("recvBar").style.width = percent + "%";
          document.getElementById("recvPercent").textContent = percent + "%";
        }
      }
    };

    dataChannel.onclose = () => {
      console.log("DataChannel closed");
      if (!fileMeta || receivedSize < fileMeta.size) {
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
  document.getElementById("recvProgress").classList.add("hidden");
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
      document.getElementById("requestInfo").textContent = `${sender} wants to share ${count} file(s) (${formatBytes(totalSize)})`;
      document.getElementById("requestModal").classList.remove("hidden");
    } else if (signal.type === "transfer-response") {
      if (signal.data.accepted) {
        toast("Transfer accepted! Starting...");
        transferAccepted = true;
        sendFile();
      } else {
        toast("Transfer declined by receiver.");
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
  // Reset everything
  if (pc) {
    pc.close();
    pc = null;
  }
  dataChannel = null;
  roomId = null;
  selectedFile = null;
  pollIndex = 0;
  pendingCandidates = [];
  stopPolling();

  document.getElementById("senderDone").classList.add("hidden");
  document.getElementById("senderProgress").classList.add("hidden");
  document.getElementById("shareInfo").classList.add("hidden");
  document.getElementById("selectedFile").classList.add("hidden");
  document.getElementById("fileSelectArea").classList.remove("hidden");
  document.getElementById("fileInput").value = "";

  const btn = document.getElementById("shareBtn");
  btn.disabled = false;
  btn.textContent = "Generate Share Link";
}
