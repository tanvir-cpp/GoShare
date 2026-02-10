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
    const res = await fetch("/api/p2p/create", { method: "POST" });
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
      colorDark: "#8b5cf6",
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
        '<div class="w-2 h-2 rounded-full bg-green-500"></div> <span class="text-green-400">Receiver connected!</span>';
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
  if (!selectedFile || !dataChannel || dataChannel.readyState !== "open")
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

  const fileReader = new FileReader();
  let offset = 0;
  const fileSize = selectedFile.size;

  function updateProgress() {
    const percent = Math.min(100, Math.round((offset / fileSize) * 100));
    document.getElementById("progressBar").style.width = percent + "%";
    document.getElementById("progressPercent").textContent = percent + "%";
    document.getElementById("progressDetail").textContent =
      formatBytes(offset) + " / " + formatBytes(fileSize);
  }

  function readAndSend() {
    const slice = selectedFile.slice(offset, offset + CHUNK_SIZE);
    fileReader.readAsArrayBuffer(slice);
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
        readAndSend();
      };
      return;
    }

    readAndSend();
  }

  fileReader.onload = (e) => {
    if (dataChannel.readyState !== "open") return;
    dataChannel.send(e.target.result);
    offset += e.target.result.byteLength;
    updateProgress();
    sendNextChunk();
  };

  fileReader.onerror = () => {
    console.error("File read error");
  };

  sendNextChunk();
}

// ─── Receiver: Connect & Receive ───
async function startReceiver() {
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  let receivedChunks = [];
  let fileMeta = null;
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
      // First message is metadata (JSON string)
      if (!fileMeta && typeof event.data === "string") {
        try {
          fileMeta = JSON.parse(event.data);
          document.getElementById("recvConnecting").classList.add("hidden");
          document.getElementById("recvProgress").classList.remove("hidden");
          document.getElementById("recvFileName").textContent = fileMeta.name;
          document.getElementById("recvFileSize").textContent = formatBytes(
            fileMeta.size,
          );
          return;
        } catch (e) {
          // Not JSON, treat as data
        }
      }

      // Check for EOF
      if (typeof event.data === "string" && event.data === "__EOF__") {
        // File complete
        const blob = new Blob(receivedChunks, {
          type: fileMeta?.type || "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);

        document.getElementById("recvProgress").classList.add("hidden");
        document.getElementById("recvDone").classList.remove("hidden");
        document.getElementById("recvDoneFile").textContent =
          (fileMeta?.name || "file") + " — " + formatBytes(blob.size);

        const link = document.getElementById("recvDownloadLink");
        link.href = url;
        link.download = fileMeta?.name || "download";
        link.onclick = () => {
          // Auto-revoke after download starts
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        };

        stopPolling();
        return;
      }

      // Binary data chunk
      if (event.data instanceof ArrayBuffer) {
        receivedChunks.push(event.data);
        receivedSize += event.data.byteLength;

        if (fileMeta) {
          const percent = Math.min(
            100,
            Math.round((receivedSize / fileMeta.size) * 100),
          );
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
