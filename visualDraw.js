import { handData, video } from "./main.js";
import { lyric } from "./midiProcess.js";
// videoCanvas
const videoCV = document.getElementById("videoCanvas");;
const videoCtx = videoCV.getContext("2d");

//  drawCanvas  
const drawCV = document.getElementById("drawCanvas");
const drawCtx = drawCV.getContext("2d");

function resizeCanvas() {
    videoCV.width = window.innerWidth;
    videoCV.height = window.innerHeight;
    drawCV.width = window.innerWidth;
    drawCV.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// FingerPoint: 畫雙手大拇指(4)與食指(8)在 overlay canvas
const baseWidth = 1280;  // 原始座標對應的攝影機寬
const baseHeight = 720;  // 原始座標對應的攝影機高

export function visualStream() {
    // clear canvas
    videoCtx.clearRect(0, 0, videoCV.width, videoCV.height);
    drawCtx.clearRect(0, 0, drawCV.width, drawCV.height);
    // set up video stream
    videoCtx.setTransform(-1, 0, 0, 1, videoCV.width, 0);
    videoCtx.drawImage(video, 0, 0, videoCV.width, videoCV.height);
}

let currentHand = "Right";
export function FingerPoint(pinchHand) {
    if (!handData || currentHand == pinchHand) return;

    // 更新目前 pinch 的手（外部狀態）
    if (pinchHand && currentHand !== pinchHand) {
        currentHand = pinchHand;
    }

    const scaleX = drawCV.width / baseWidth;
    const scaleY = drawCV.height / baseHeight;

    ['Left', 'Right'].forEach(handSide => {
        const lm = handData[handSide];
        if (!lm || lm.length < 9) return;

        const index = lm[8];
        if (!index) return;

        const indexX = drawCV.width - index[0] * scaleX;
        const indexY = index[1] * scaleY;

        if (handSide === currentHand) {
            // pinch 手：畫食指和拇指 + 連線
            const thumb = lm[4];
            if (!thumb) return;

            const thumbX = drawCV.width - thumb[0] * scaleX;
            const thumbY = thumb[1] * scaleY;

            // 畫拇指
            drawCtx.beginPath();
            drawCtx.arc(thumbX, thumbY, 50, 0, Math.PI * 2);
            drawCtx.fillStyle = '#F0A986';
            drawCtx.fill();

            // 畫食指
            drawCtx.beginPath();
            drawCtx.arc(indexX, indexY, 50, 0, Math.PI * 2);
            drawCtx.fillStyle = '#F0A986';
            drawCtx.fill();

            // 畫連線
            drawCtx.beginPath();
            drawCtx.moveTo(thumbX, thumbY);
            drawCtx.lineTo(indexX, indexY);
            drawCtx.lineWidth = 20;
            drawCtx.strokeStyle = '#F0A986';
            drawCtx.stroke();

        } else {
            // 非 pinch 手：只畫食指，半徑依 Y 變化
            // 假設 Y 越小 (靠上) 半徑越大，Y 越大 (靠下) 半徑越小
            const radius = 100 * (1 - indexY / drawCV.height) + 10; // 最小 5，最大 25
            drawCtx.beginPath();
            drawCtx.arc(indexX, indexY, radius, 0, Math.PI * 2);
            drawCtx.fillStyle = '#FFC408';
            drawCtx.fill();
        }
    });
}

let lyricPos = { x: 0, y: 0 };
export function drawLyric(pinchHand) {

    // 沒有 pinch 手或沒有歌詞就不畫
    if (!pinchHand || lyric === "") return;

    // 該手的 index finger 不存在就不畫
    const finger = handData?.[pinchHand]?.[8];
    if (!finger) return;

    const scaleX = drawCV.width / baseWidth;
    const scaleY = drawCV.height / baseHeight;

    lyricPos.x = drawCV.width - finger[0] * scaleX;
    lyricPos.y = finger[1] * scaleY;

    // 畫圓圈
    drawCtx.beginPath();
    drawCtx.arc(lyricPos.x, lyricPos.y, 60, 0, 2 * Math.PI);
    drawCtx.fillStyle = '#91B493';
    drawCtx.fill();
    drawCtx.lineWidth = 10;
    drawCtx.strokeStyle = '#B5CAA0';
    drawCtx.stroke();

    drawCtx.font = "bold 80px Arial";
    drawCtx.fillStyle = "white";
    drawCtx.textAlign = "center";
    drawCtx.textBaseline = "middle";
    drawCtx.fillText(lyric, lyricPos.x, lyricPos.y + 10);
}

let bubleSeq = []; // 全域存放泡泡

export function bubleUP(lyric) {
    // 有文字 → push 到泡泡序列
    if (lyric && lyricPos) {
        bubleSeq.push({
            lyric: lyric,
            x: lyricPos.x,
            y: lyricPos.y,
            speedY: 5 // 每幀上升 2px
        });
        return;
    }

    if (!bubleSeq.length) return;

    // 從後往前遍歷，方便移除
    for (let i = bubleSeq.length - 1; i >= 0; i--) {
        const b = bubleSeq[i];

        // 上升
        b.y -= b.speedY;

        // 畫圓圈
        drawCtx.beginPath();
        drawCtx.arc(b.x, b.y, 60, 0, 2 * Math.PI);
        drawCtx.fillStyle = '#91B493';
        drawCtx.fill();
        drawCtx.lineWidth = 10;
        drawCtx.strokeStyle = '#B5CAA0';
        drawCtx.stroke();

        // 畫文字
        drawCtx.font = "bold 80px Arial";
        drawCtx.fillStyle = "white";
        drawCtx.textAlign = "center";
        drawCtx.textBaseline = "middle";
        drawCtx.fillText(b.lyric, b.x, b.y + 10);

        // 超出畫面移除
        if (b.y < 0) bubleSeq.splice(i, 1);
    }
    console.log(bubleSeq.length)
}
