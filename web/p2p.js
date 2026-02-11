const API_BASE = "";
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
let selectedFile = null;
let pollTimer = null;
let pollIndex = 0;
let pendingCandidates = [];

// ─── Init ───
(function init() {
  const params = new URLSearchParams(globalThis.location.search);
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
  }
})();

// ─── Sender: File Selection ───
function setupFileInput() {
  const fileInput = document.getElementById("fileInput");
  const dropArea = document.getElementById("fileSelectArea");

  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) {
      selectedFile = fileInput.files[0];
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
      () => dropArea.classList.add("drag-over"),
      false,
    ),
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropArea.addEventListener(
      evt,
      () => dropArea.classList.remove("drag-over"),
      false,
    ),
  );
  dropArea.addEventListener(
    "drop",
    (e) => {
      if (e.dataTransfer.files.length) {
        selectedFile = e.dataTransfer.files[0];
        showSelectedFile();
      }
    },
    false,
  );
}

function showSelectedFile() {
  document.getElementById("fileName").textContent = selectedFile.name;
  document.getElementById("fileSize").textContent = formatBytes(
    selectedFile.size,
  );
  document.getElementById("fileSelectArea").classList.add("hidden");
  document.getElementById("selectedFile").classList.remove("hidden");
}

function clearFile() {
  selectedFile = null;
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
    const res = await fetch(API_BASE + "/api/p2p/create", { method: "POST" });
    const data = await res.json();
    roomId = data.room;

    // Show share link + QR
    const shareLink = globalThis.location.origin + globalThis.location.pathname + "?room=" + roomId;
    document.getElementById("shareUrl").textContent = shareLink;

    const qrEl = document.getElementById("qrcode");
    qrEl.innerHTML = "";
    new QRCode(qrEl, {
      text: shareLink,
      width: 200,
      height: 200,
      colorDark: "#ffffff",
      colorLight: "#000000",
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
    console.log("DataChannel open — starting file send");
    sendFile();
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
        '<div class="waiting-dot" style="background:var(--success);animation:none"></div> <span style="color:var(--success)">Receiver connected!</span>';
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

// ─── Sender: Send File via DataChannel ───
function sendFile() {
  if (selectedFile === null || dataChannel?.readyState !== "open")
    return;

  // Send metadata first
  const meta = JSON.stringify({
    name: selectedFile.name,
    size: selectedFile.size,
    type: selectedFile.type,
  });
  dataChannel.send(meta);

  document.getElementById("shareInfo").classList.add("hidden");
  document.getElementById("senderProgress").classList.remove("hidden");

  const BUFFER_HIGH = 2 * 1024 * 1024; // 2MB
  dataChannel.bufferedAmountLowThreshold = 512 * 1024; // 512KB

  let offset = 0;
  const fileSize = selectedFile.size;

  function updateProgress() {
    const percent = Math.min(100, Math.round((offset / fileSize) * 100));
    document.getElementById("progressBar").style.width = percent + "%";
    document.getElementById("progressPercent").textContent = percent + "%";
    document.getElementById("progressDetail").textContent =
      formatBytes(offset) + " / " + formatBytes(fileSize);
  }

  function sendNextChunk() {
    if (dataChannel.readyState !== "open") return;

    if (offset >= fileSize) {
      dataChannel.send("__EOF__");
      document.getElementById("senderProgress").classList.add("hidden");
      document.getElementById("senderDone").classList.remove("hidden");
      stopPolling();
      return;
    }

    if (dataChannel.bufferedAmount > BUFFER_HIGH) {
      dataChannel.onbufferedamountlow = () => {
        dataChannel.onbufferedamountlow = null;
        sendNextChunk();
      };
      return;
    }

    const slice = selectedFile.slice(offset, offset + CHUNK_SIZE);
    slice.arrayBuffer()
      .then(buffer => {
        if (dataChannel.readyState !== "open") return;
        dataChannel.send(buffer);
        offset += buffer.byteLength;
        updateProgress();
        sendNextChunk();
      })
      .catch(err => {
        console.error("File read error", err);
      });
  }

  sendNextChunk();
}

// ─── Receiver: Connect & Receive ───
async function startReceiver() {
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  const connectTimeout = setTimeout(() => {
    if (dataChannel?.readyState !== "open") {
      showRecvError("Connection timed out. The sender may have closed the page.");
      stopPolling();
      pc?.close();
    }
  }, 30000);

  pc.onicecandidate = (e) => {
    if (e.candidate) sendSignal("ice-candidate", e.candidate);
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
      showRecvError("Connection lost. Please try again.");
    }
  };

  pc.ondatachannel = (e) => handleDataChannel(e, connectTimeout);

  startPolling();
}

let receiverState = {
  chunks: [],
  meta: null,
  size: 0
};

function handleDataChannel(e, timeout) {
  clearTimeout(timeout);
  dataChannel = e.channel;
  dataChannel.binaryType = "arraybuffer";
  dataChannel.onmessage = onReceiverMessage;
  dataChannel.onclose = onReceiverClose;
}

function onReceiverMessage(event) {
  const { meta, size } = handleIncomingMessage(
    event,
    receiverState.meta,
    receiverState.chunks,
    receiverState.size
  );
  if (meta) receiverState.meta = meta;
  if (size !== undefined) receiverState.size = size;
}

function onReceiverClose() {
  if (!receiverState.meta || receiverState.size < receiverState.meta.size) {
    showRecvError("Transfer interrupted.");
  }
}

function handleIncomingMessage(event, fileMeta, receivedChunks, receivedSize) {
  if (!fileMeta && typeof event.data === "string") {
    try {
      const meta = JSON.parse(event.data);
      updateRecvUI(meta);
      return { meta };
    } catch (err) {
      console.warn("Metadata error", err);
    }
  }

  if (event.data === "__EOF__") {
    finalizeDownload(fileMeta, receivedChunks);
    stopPolling();
    return {};
  }

  if (event.data instanceof ArrayBuffer) {
    receivedChunks.push(event.data);
    const newSize = receivedSize + event.data.byteLength;
    if (fileMeta) updateRecvProgress(newSize, fileMeta.size);
    return { size: newSize };
  }
  return {};
}

function updateRecvUI(meta) {
  document.getElementById("recvConnecting").classList.add("hidden");
  document.getElementById("recvProgress").classList.remove("hidden");
  document.getElementById("recvFileName").textContent = meta.name;
  document.getElementById("recvFileSize").textContent = formatBytes(meta.size);
}

function updateRecvProgress(current, total) {
  const percent = Math.min(100, Math.round((current / total) * 100));
  document.getElementById("recvBar").style.width = percent + "%";
  document.getElementById("recvPercent").textContent = percent + "%";
}

function finalizeDownload(fileMeta, chunks) {
  const blob = new Blob(chunks, { type: fileMeta?.type || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  document.getElementById("recvProgress").classList.add("hidden");
  document.getElementById("recvDone").classList.remove("hidden");
  document.getElementById("recvDoneFile").textContent = `${fileMeta?.name || "file"} — ${formatBytes(blob.size)}`;

  const link = document.getElementById("recvDownloadLink");
  link.href = url;
  link.download = fileMeta?.name || "download";
  link.onclick = () => setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function showRecvError(msg) {
  document.getElementById("recvConnecting").classList.add("hidden");
  document.getElementById("recvProgress").classList.add("hidden");
  document.getElementById("recvError").classList.remove("hidden");
  if (msg) document.getElementById("recvErrorMsg").textContent = msg;
}

// ─── Signaling: Send & Poll ───
function sendSignal(type, data) {
  fetch(API_BASE + "/api/p2p/signal", {
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
      API_BASE + "/api/p2p/poll?room=" + roomId + "&role=" + role + "&since=" + pollIndex,
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

async function handleSignal(signal) {
  if (role === "receiver") {
    await handleReceiverSignal(signal);
  } else if (role === "sender") {
    await handleSenderSignal(signal);
  }
}

async function handleReceiverSignal(signal) {
  if (signal.type === "offer") {
    await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
    for (const c of pendingCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    }
    pendingCandidates = [];
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSignal("answer", pc.localDescription);
  } else if (signal.type === "ice-candidate" && signal.data) {
    if (pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(signal.data));
    } else {
      pendingCandidates.push(signal.data);
    }
  }
}

async function handleSenderSignal(signal) {
  if (signal.type === "answer") {
    await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
    for (const c of pendingCandidates) {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    }
    pendingCandidates = [];
  } else if (signal.type === "ice-candidate" && signal.data) {
    if (pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(signal.data));
    } else {
      pendingCandidates.push(signal.data);
    }
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
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => showToast("Link copied!"))
      .catch(() => fallbackCopy(url));
  } else {
    fallbackCopy(url);
  }
}

function fallbackCopy(text) {
  const input = document.createElement("input");
  input.value = text;
  document.body.appendChild(input);
  input.select();
  try {
    /* eslint-disable-next-line deprecation/deprecation */
    document.execCommand("copy");
  } catch (err) {
    console.error("Fallback copy failed", err);
  }
  input.remove();
  showToast("Link copied!");
}

function showToast(msg) {
  const t = document.getElementById("toastEl");
  t.textContent = msg;
  t.classList.add("toast-show");
  setTimeout(() => {
    t.classList.remove("toast-show");
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
