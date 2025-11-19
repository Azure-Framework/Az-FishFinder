const wrapper = document.getElementById("finder-wrapper");
const finder = document.getElementById("finder");
const header = document.getElementById("finder-header");
const closeBtn = document.getElementById("close-btn");
const depthEl = document.getElementById("depth-value");
const speedEl = document.getElementById("speed-value");
const statusEl = document.getElementById("status-text");

const canvas = document.getElementById("sonar-canvas");
const ctx = canvas.getContext("2d");

const resourceName = (typeof GetParentResourceName === "function")
    ? GetParentResourceName()
    : "az-fishfinder";

let visible = false;
let currentDepth = null;
let currentSpeed = null;
let inBoat = false;
let maxDepthRange = 40; // ft shown on right color bar
let lastPingTime = 0;

// ========== DRAGGING ==========
let drag = {
    active: false,
    offsetX: 0,
    offsetY: 0
};

header.addEventListener("mousedown", (e) => {
    drag.active = true;
    drag.offsetX = e.clientX - wrapper.offsetLeft;
    drag.offsetY = e.clientY - wrapper.offsetTop;
});

window.addEventListener("mousemove", (e) => {
    if (!drag.active) return;
    wrapper.style.left = `${e.clientX - drag.offsetX}px`;
    wrapper.style.top = `${e.clientY - drag.offsetY}px`;
});

window.addEventListener("mouseup", () => {
    drag.active = false;
});

// ========== CLOSE BUTTON ==========
closeBtn.addEventListener("click", () => {
    fetch(`https://${resourceName}/close`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json; charset=UTF-8"
        },
        body: "{}"
    }).catch(() => {});
});

// ========== SONAR DRAWING ==========

// Initialize canvas
function initSonar() {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

initSonar();

// Map depth (ft) to Y pixel (0 top, height bottom)
function depthToY(depthFt) {
    if (depthFt == null) {
        return canvas.height * 0.7;
    }
    const range = maxDepthRange;
    const d = Math.min(depthFt, range);
    const t = d / range; // 0..1
    return t * (canvas.height - 5); // keep a little headroom
}

// Draw one sonar column (scrolling)
function drawPing() {
    if (!visible) return;

    // Scroll existing image left
    const scroll = 2;
    const imgData = ctx.getImageData(scroll, 0, canvas.width - scroll, canvas.height);
    ctx.putImageData(imgData, 0, 0);

    // Clear right strip
    ctx.fillStyle = "black";
    ctx.fillRect(canvas.width - scroll, 0, scroll, canvas.height);

    // Determine bottom line position
    const bottomY = depthToY(currentDepth ?? maxDepthRange * 0.8);

    // Bottom "hard return" line – yellow/orange core, red lower band
    for (let x = canvas.width - scroll; x < canvas.width; x++) {
        // bottom core
        ctx.fillStyle = "#ffe66d";
        ctx.fillRect(x, bottomY - 1, 1, 3);

        // denser bottom thickness
        ctx.fillStyle = "#ff9a3c";
        ctx.fillRect(x, bottomY + 2, 1, 4);

        // darker base
        ctx.fillStyle = "#ad2626";
        ctx.fillRect(x, bottomY + 6, 1, canvas.height - bottomY - 6);
    }

    // Random noise dots mid-water
    for (let i = 0; i < 12; i++) {
        if (Math.random() < 0.4) continue;
        const y = Math.random() * (bottomY - 10);
        ctx.fillStyle = Math.random() < 0.5 ? "#5effff" : "#ffffff";
        ctx.fillRect(canvas.width - 1, y, 1, 1);
    }

    // Occasionally spawn a “fish” mark
    if (Math.random() < 0.25 && inBoat && currentDepth != null) {
        const fishDepth = currentDepth * (0.3 + Math.random() * 0.5); // somewhere mid-column
        const fishY = depthToY(fishDepth);
        const fishHeight = 5 + Math.random() * 6;

        ctx.fillStyle = "#ffed4a";
        ctx.fillRect(canvas.width - 5, fishY, 3, fishHeight);

        ctx.fillStyle = "#ff4d4d";
        ctx.fillRect(canvas.width - 2, fishY + 1, 2, fishHeight - 2);
    }

    lastPingTime = performance.now();
}

// Continuous animation loop (controls ping rate)
function tick() {
    const now = performance.now();
    if (visible && now - lastPingTime > 120) {
        drawPing();
    }
    requestAnimationFrame(tick);
}
tick();

// ========== NUI MESSAGES FROM LUA ==========
window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;

    if (data.type === "toggle") {
        visible = !!data.show;
        wrapper.style.display = visible ? "block" : "none";
        if (!visible) {
            // Reset a bit when closed
            initSonar();
            currentDepth = null;
            currentSpeed = null;
        }
    } else if (data.type === "update") {
        inBoat = !!data.inBoat;

        if (!inBoat) {
            statusEl.textContent = "NO SIGNAL - NOT IN BOAT / WATER";
            currentDepth = null;
            currentSpeed = null;
            depthEl.textContent = "--.-";
            speedEl.textContent = "--.-";
            return;
        }

        currentDepth = data.depth;
        currentSpeed = data.speed;

        depthEl.textContent = (data.depth != null) ? data.depth.toFixed(1) : "--.-";
        speedEl.textContent = (data.speed != null) ? data.speed.toFixed(1) : "--.-";

        statusEl.textContent = "RUNNING • SONAR ACTIVE";

        // Auto-adjust range a bit
        if (currentDepth && currentDepth > maxDepthRange * 0.8) {
            maxDepthRange = Math.min(120, maxDepthRange + 10);
        } else if (currentDepth && currentDepth < maxDepthRange * 0.4) {
            maxDepthRange = Math.max(20, maxDepthRange - 5);
        }
    }
});

// ESC inside NUI: tell Lua to drop focus but keep UI visible
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        fetch(`https://${resourceName}/escape`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json; charset=UTF-8"
            },
            body: "{}"
        }).catch(() => {});
    }
});
