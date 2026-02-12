const myId =
    localStorage.getItem("device_id") ||
    (() => {
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        const id = "dev_" + Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem("device_id", id);
        return id;
    })();

const deviceIcons = {
    fox: "🦊",
    panda: "🐼",
    owl: "🦉",
    wolf: "🐺",
    bear: "🐻",
    hawk: "🦅",
    cat: "🐱",
    dolphin: "🐬",
    tiger: "🐯",
    lion: "🦁",
    koala: "🐨",
    raven: "🐦",
    otter: "🦦",
    shark: "🦈",
    elephant: "🐘",
    butterfly: "🦋",
    dragon: "🐲",
    crab: "🦀",
    squid: "🦑",
    unicorn: "🦄",
    rabbit: "🐰",
    monkey: "🐵",
    duck: "🦆",
    frog: "🐸",
    snake: "🐍",
    whale: "🐋",
    octopus: "🐙",
    bee: "🐝",
    bug: "🐞",
    turtle: "🐢",
    dino: "🦖",
    alien: "👽",
    robot: "🤖",
    ghost: "👻",
    rocket: "🚀",
    fire: "🔥",
    star: "⭐",
    planet: "🪐",
    lightning: "⚡",
    snowflake: "❄️",
    phoenix: "🐦‍🔥",
    mammoth: "🦣",
    sloth: "🦥",
    penguin: "🐧",
    parrot: "🦜",
    fish: "🐠",
    lobster: "🦞",
    scorpio: "🦂",
    spider: "🕷️",
    clover: "🍀"
};

function getDeviceSvg(iconNameOrName) {
    // If it's a known icon name, return it
    if (deviceIcons[iconNameOrName]) return deviceIcons[iconNameOrName];

    // FNV-1a hash for better distribution (avoids collisions like "ab" vs "ba")
    let hash = 0x811c9dc5;
    for (let i = 0; i < iconNameOrName.length; i++) {
        hash ^= iconNameOrName.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    const keys = Object.keys(deviceIcons);
    return deviceIcons[keys[hash % keys.length]];
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

function showToast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.opacity = "1";
    t.style.transform = "translateX(-50%) translateY(0)";
    setTimeout(() => {
        t.style.opacity = "0";
        t.style.transform = "translateX(-50%) translateY(20px)";
    }, 2000);
}

// XSS prevention helper
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// Copy URL to clipboard (works on both LAN and P2P pages)
function copyUrl() {
    const urlEl = document.getElementById("shareUrl");
    const url = urlEl ? urlEl.textContent : window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        showToast("URL copied to clipboard!");
    }).catch(() => {
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        showToast("URL copied!");
    });
}

function updateIdentity() {
    const name = localStorage.getItem("user_name") || "Anonymous";

    const el = document.getElementById("userNameDisplay");
    if (el) el.textContent = name;

    // Update Navbar
    const navNameEl = document.getElementById("navUserName");
    const navIconEl = document.getElementById("navUserIcon");
    if (navNameEl) {
        navNameEl.textContent = name;
        navNameEl.classList.remove("skeleton");
    }
    if (navIconEl) {
        navIconEl.textContent = getDeviceSvg(name);
        navIconEl.classList.remove("skeleton");
    }

    // Specific for LAN page if exists
    const meNameEl = document.getElementById("meName");
    const meIconEl = document.getElementById("meIcon");
    if (meNameEl) meNameEl.textContent = name;
    if (meIconEl) meIconEl.innerHTML = getDeviceSvg(name);
}

function changeName() {
    const currentName = localStorage.getItem("user_name") || "Anonymous";
    const modal = document.getElementById("nameModal");
    const input = document.getElementById("newNameInput");
    if (!modal || !input) return;

    input.value = currentName === "Anonymous" ? "" : currentName;
    updateModalPreview(); // Set initial preview
    modal.classList.add("open");
    input.focus();
}

function updateModalPreview() {
    const input = document.getElementById("newNameInput");
    const name = input.value.trim() || "Anonymous";

    const previewName = document.getElementById("previewName");
    const previewAvatar = document.getElementById("previewAvatar");
    const charCount = document.getElementById("nameCharCount");

    if (previewName) previewName.textContent = name;
    if (previewAvatar) previewAvatar.innerHTML = getDeviceSvg(name);
    if (charCount) charCount.textContent = input.value.length;
}

function closeNameModal() {
    const modal = document.getElementById("nameModal");
    if (modal) modal.classList.remove("open");
}
