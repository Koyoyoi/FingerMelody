import { loadMidiFiles, isFullyLoaded } from "./midiProcess.js";
import { detectHand, setupMediaPipe } from "./MediaPipe/MediaPipe.js";

// get misi list element
const showList = document.getElementById("showListBtn");
const midiList = document.getElementById("midiListContainer");
const closeList = document.getElementById("closeList");

// 按鈕事件(midi list)
showList.addEventListener("click", () => {
    if (!isFullyLoaded) {
        loadMidiFiles();
    } else {
        midiList.style.display = "flex";
    }
});

closeList.addEventListener("click", () => {
    midiList.style.display = "none";
});

// Canvas
const canvas = document.getElementById("videoCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);

// WebCam 
export let video = document.createElement("video");
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

// main Loop
export let handData = { "Left": [], "Right": [] };
async function mainLoop() {
    await detectHand();

    if (handData.Left.length || handData.Right.length)
        console.log(handData);
    
    // reset hands data
    handData.Left = [];
    handData.Right = [];
    
    // set up video stream
    const { videoWidth: vw, videoHeight: vh } = video;
    const { width: cw, height: ch } = canvas;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(-1, 0, 0, 1, cw, 0); // 水平翻轉 + 移位置
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(video, 0, 0, cw, ch);

    requestAnimationFrame(mainLoop);
}

async function initSystem() {
    await setupMediaPipe();
    initCamera();
}

window.addEventListener('DOMContentLoaded', initSystem());
