import { loadMidiFiles, isFullyLoaded, initSynth, playMidi, stopMidi, handPlayMidi, relAllNotes } from "./midiProcess.js";
import { detectHand, setupMediaPipe } from "./MediaPipe/MediaPipe.js";

// MIDI list
const showListBtn = document.getElementById("showListBtn");
const midiListContainer = document.getElementById("midiListContainer");
const closeList = document.getElementById("closeList");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");

// 開啟 MIDI 清單
showListBtn.addEventListener("click", async () => {
    if (!isFullyLoaded) await loadMidiFiles();
    else midiListContainer.style.display = "flex";
});

// 關閉 MIDI 清單
closeList.addEventListener("click", () => midiListContainer.style.display = "none");

// 播放 MIDI
playBtn.addEventListener("click", async () => { playMidi(); });

// 停止 MIDI
stopBtn.addEventListener("click", () => stopMidi());

// Canvas 
const canvas = document.getElementById("videoCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

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

function isPinched(hand) {
    if (!hand || hand.length < 9) return false;

    const p4 = hand[4]; // thumb tip
    const p8 = hand[8]; // index tip

    const dx = p4[0] - p8[0];
    const dy = p4[1] - p8[1];
    const dist = Math.sqrt(dx * dx + dy * dy);

    return dist < 40; // 閾值可調
}

// main Loop
export let handData = { "Left": [], "Right": [] };
let pinchActive = false;

async function mainLoop() {
    // reset hands data
    handData.Left = [];
    handData.Right = [];
    await detectHand();

    const right = handData.Right;

    // ---- pinch detect ----
    if (right && right.length > 0) {
        const pinched = isPinched(right);

        // Pinch 開始
        if (pinched && !pinchActive) {
            pinchActive = true;
            handPlayMidi();    // 播一組 notes，noteOn
        }

        // Pinch 結束（放開）
        if (!pinched && pinchActive) {
            pinchActive = false;
            relAllNotes(); // <<< 放開時 noteOff
        }
    }



    // set up video stream
    const { videoWidth: vw, videoHeight: vh } = video;
    const { width: cw, height: ch } = canvas;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(-1, 0, 0, 1, cw, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(video, 0, 0, cw, ch);

    requestAnimationFrame(mainLoop);
}


// 初始化系統
async function initSystem() {
    await setupMediaPipe();
    initSynth();
    initCamera();
}

// DOM 載入完成後啟動
window.addEventListener('DOMContentLoaded', initSystem);
