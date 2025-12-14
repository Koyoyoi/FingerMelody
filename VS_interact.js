import { handData } from "./main.js";

// videoCanvas
const videoCV = document.getElementById("videoCanvas");

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

export function FingerPoint() {
    if (!handData) return;

    drawCtx.clearRect(0, 0, drawCV.width, drawCV.height);

    const scaleX = drawCV.width / baseWidth;
    const scaleY = drawCV.height / baseHeight;

    ['Left', 'Right'].forEach(handSide => {
        const lm = handData[handSide];
        if (!lm || lm.length < 9) return;

        const thumb = lm[4];
        const index = lm[8];

        if (!thumb || !index) return;

        // 按比例縮放到新的 canvas
        const thumbX = drawCV.width - thumb[0] * scaleX;  // 水平鏡像
        const thumbY = thumb[1] * scaleY;
        const indexX = drawCV.width - index[0] * scaleX;
        const indexY = index[1] * scaleY;

        drawCtx.beginPath();
        drawCtx.arc(thumbX, thumbY, 10, 0, Math.PI * 2);
        drawCtx.fillStyle = 'red';
        drawCtx.fill();

        drawCtx.beginPath();
        drawCtx.arc(indexX, indexY, 10, 0, Math.PI * 2);
        drawCtx.fillStyle = 'blue';
        drawCtx.fill();
    });
}

