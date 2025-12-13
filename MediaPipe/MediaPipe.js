import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";
import { handData, video } from '../main.js';

// 全域變數：用來儲存模型實例
let handLandmarker;

// 初始化 MediaPipe 手部模型
export async function setupMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    // 建立手部標誌點模型
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "./MediaPipe/hand_landmarker.task",
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        min_hand_detection_confidence: 0.5,
        min_tracking_confidence: 0.5,
        numHands: 2
    });
    //.....add other landmarker
}

// 偵測手部關鍵點並繪製圖像，同時更新 handData
export async function detectHand() {
    if (!handLandmarker) return;

    // 提供 IMAGE_DIMENSIONS，避免 NORM_RECT 警告
    let data = handLandmarker.detectForVideo(video, performance.now(), {
        image: video,
        imageWidth: video.videoWidth,
        imageHeight: video.videoHeight
    });

    const handPoints = data.landmarks;
    const handednesses = data.handednesses;

    for (let i = 0; i < handednesses.length; i++) {
        let points = [];
        let left_or_right = String(handednesses[i][0].categoryName);
        for (let p of handPoints[i]) {
            points.push([p.x * video.videoWidth, p.y * video.videoHeight, p.z * 10]);
        }
        handData[left_or_right] = points;
    }
}

