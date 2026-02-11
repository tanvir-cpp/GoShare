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

    // Otherwise, seed from the string (name) to pick a consistent icon
    const seed = Array.from(iconNameOrName).reduce(
        (acc, char) => acc + char.charCodeAt(0),
        0,
    );
    const keys = Object.keys(deviceIcons);
    return deviceIcons[keys[seed % keys.length]];
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

// Unified modal close logic helpers
function closeModal() {
    const overlays = document.querySelectorAll(".modal-overlay");
    overlays.forEach((o) => o.classList.remove("open"));
}

function updateIdentity() {
    const name = localStorage.getItem("user_name") || "Anonymous";

    const el = document.getElementById("userNameDisplay");
    if (el) el.textContent = name;

    // Update Navbar
    const navNameEl = document.getElementById("navUserName");
    const navIconEl = document.getElementById("navUserIcon");
    if (navNameEl) navNameEl.textContent = name;
    if (navIconEl) {
        navIconEl.innerHTML = getDeviceSvg(name);
        navIconEl.style.fontSize = "1.25rem";
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
