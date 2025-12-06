// ================= Canvas & WebCam =================
const canvas = document.getElementById("videoCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const video = document.createElement("video");
video.autoplay = true;
video.playsInline = true;

async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720, facingMode: "user" },
            audio: false
        });
        video.srcObject = stream;
        await video.play();
        requestAnimationFrame(mainLoop);
    } catch (err) {
        console.error("WebCam 初始化失敗:", err);
    }
}

function mainLoop() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, cw, ch);
    ctx.translate(cw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, vw, vh, 0, 0, cw, ch);
    ctx.restore();

    requestAnimationFrame(mainLoop);
}

initCamera();

// ================= 按鈕事件（調用 midiProcess.js） =================
import { loadMidiFiles, isFullyLoaded } from "./midiProcess.js";

const showListBtn = document.getElementById("showListBtn");
const midiListContainer = document.getElementById("midiListContainer");
const closeList = document.getElementById("closeList");

showListBtn.addEventListener("click", () => {
    if (!isFullyLoaded) {
        loadMidiFiles();
    } else {
        midiListContainer.style.display = "flex";
    }
});

closeList.addEventListener("click", () => {
    midiListContainer.style.display = "none";
});
