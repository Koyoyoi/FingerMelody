import * as midi from "./midiProcess.js";
import { detectHand, setupMediaPipe } from "./MediaPipe/MediaPipe.js";

// MIDI list
const showListBtn = document.getElementById("showListBtn");
const midiListContainer = document.getElementById("midiListContainer");
const closeList = document.getElementById("closeList");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");

// 開啟 MIDI 清單
showListBtn.addEventListener("click", async () => { midiListContainer.style.display = "flex"; });
// 關閉 MIDI 清單
closeList.addEventListener("click", () => midiListContainer.style.display = "none");
// 播放 MIDI
playBtn.addEventListener("click", async () => { midi.play(); });
// 停止 MIDI
stopBtn.addEventListener("click", () => midi.stop());

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

    const p4 = hand[4]; // 拇指尖
    const p8 = hand[8]; // 食指尖

    const dx = p4[0] - p8[0];
    const dy = p4[1] - p8[1];
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 回傳是否捏合
    return dist < 50; // 閾值可調
}

// main Loop
import { visualStream, FingerPoint, drawLyric } from "./visualDraw.js";

export let handData = { "Left": [], "Right": [] };
let pinchActive = false;
let channelPressure_Y;

async function mainLoop() {
    visualStream();

    // reset hands data
    handData.Left = [];
    handData.Right = [];
    await detectHand();

    // pinch detect
    const RPinched = handData.Right && handData.Right.length > 0
        ? isPinched(handData.Right)
        : false;

    const LPinched = handData.Left && handData.Left.length > 0
        ? isPinched(handData.Left)
        : false;

    // 右手 pinch → 左手 CC
    if (RPinched) {
        // 更新音量（左手控制）
        if (handData?.Left?.[8]?.[0] != null) {
            midi.CCtrl(handData.Left[8], channelPressure_Y);
        }

        if (!pinchActive) {
            pinchActive = true;
            if (handData?.Left?.[8]?.[0] != null) {
                channelPressure_Y = handData.Left[8][0];
            }
            midi.handPlay();
        }
    }

    //左手 pinch 
    if (LPinched) {
        // 更新音量（右手控制）
        if (handData?.Right?.[8]?.[0] != null) {
            midi.CCtrl(handData.Right[8], channelPressure_Y);
        }

        if (!pinchActive) {
            pinchActive = true;
            if (handData?.Right?.[8]?.[0] != null) {
                channelPressure_Y = handData.Right[8][0];
            } midi.handPlay();
        }
    }

    //Pinch 結束（兩手都沒 pinch）
    if (!RPinched && !LPinched && pinchActive) {
        pinchActive = false;
        midi.noteSeqOff();
    }

    FingerPoint();
    if (RPinched) {
        drawLyric("Right");
        FingerPoint("Right");
    } else if (LPinched) {
        drawLyric("Left");
        FingerPoint("Left");
    }

    requestAnimationFrame(mainLoop);
}

// 初始化系統
async function initSystem() {
    await setupMediaPipe();
    await midi.loadFiles();
    await midi.initSynth();
    const urlParams = new URLSearchParams(window.location.search);
    const title = urlParams.get("midi");
    if (title) { midi.URL(title); }
    initCamera();
}

// DOM 載入完成後啟動
window.addEventListener('DOMContentLoaded', initSystem);
