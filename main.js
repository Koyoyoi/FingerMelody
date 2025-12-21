import * as midi from "./midiProcess.js";
import { detectHand, setupMediaPipe } from "./MediaPipe/MediaPipe.js";

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
import { visualStream, FingerPoint, drawLyric, bubleUP } from "./visualDraw.js";

export let handData = { "Left": [], "Right": [] };
let prevPinch = false, activePinch;
let prevRPinched = false;
let prevLPinched = false;

let chPressure_Y;

async function mainLoop() {
    visualStream();

    // reset hands data
    handData.Left = [];
    handData.Right = [];
    await detectHand();

    // pinch detect
    const RPinched = !!(handData.Right?.length && isPinched(handData.Right));
    const LPinched = !!(handData.Left?.length && isPinched(handData.Left));

    // ⭐ 新 pinch（edge）
    const RPinchStart = RPinched && !prevRPinched;
    const LPinchStart = LPinched && !prevLPinched;

    // 第一隻手 pinch
    if (!prevPinch) {
        if (RPinchStart) {
            prevPinch = true;
            activePinch = "Right";

            if (handData?.Left?.[8]?.[0] != null) {
                chPressure_Y = handData.Left[8][0];
            }
            midi.handPlay();
        }
        else if (LPinchStart) {
            prevPinch = true;
            activePinch = "Left";

            if (handData?.Right?.[8]?.[0] != null) {
                chPressure_Y = handData.Right[8][0];
            }
            midi.handPlay();
        }
    }

    // pinch 時，另一隻手「新 pinch」
    if (prevPinch) {
        // 原本右手 → 左手「新 pinch」
        if (activePinch === "Right" && LPinchStart) {
            activePinch = "Left";
            midi.noteSeqOff();
            midi.handPlay();
        }

        // 原本左手 → 右手「新 pinch」
        if (activePinch === "Left" && RPinchStart) {
            activePinch = "Right";
            midi.noteSeqOff();
            midi.handPlay();
        }

        // active 是 Left，但 Left 已放開、Right 還在
        if (activePinch === "Left" && !LPinched && RPinched) {
            activePinch = "Right";
        }

        // active 是 Right，但 Right 已放開、Left 還在
        if (activePinch === "Right" && !RPinched && LPinched) {
            activePinch = "Left";
        }

        // 右手在彈 → 左手控制 CC
        if (activePinch === "Right" && handData?.Left?.[8]?.[0] != null) {
            midi.CCtrl(handData.Left[8], chPressure_Y);
        }

        // 左手在彈 → 右手控制 CC
        if (activePinch === "Left" && handData?.Right?.[8]?.[0] != null) {
            midi.CCtrl(handData.Right[8], chPressure_Y);
        }
    }

    // 全放開 → 停止
    if (!RPinched && !LPinched && prevPinch) {
        prevPinch = false;
        activePinch = null;
        midi.noteSeqOff();
    }

    FingerPoint();
    bubleUP();

    if (RPinched && activePinch === "Right") {
        drawLyric("Right");
        FingerPoint("Right");
    }
    else if (LPinched && activePinch === "Left") {
        drawLyric("Left");
        FingerPoint("Left");
    }

    prevRPinched = RPinched;
    prevLPinched = LPinched;

    requestAnimationFrame(mainLoop);
}

// 初始化系統
async function initSystem() {
    await setupMediaPipe();
    await midi.loadFiles();
    await midi.initSynth();
    midi.InstrumentList();
    const urlParams = new URLSearchParams(window.location.search);
    const title = urlParams.get("midi");
    if (title) { midi.URL(title); }
    initCamera();
}

// DOM 載入完成後啟動
window.addEventListener('DOMContentLoaded', initSystem);
