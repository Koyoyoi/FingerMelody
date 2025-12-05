// Canvas & WebCam
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
        requestAnimationFrame(drawVideo);
    } catch(err) {
        console.error("WebCam 初始化失敗:", err);
    }
}

function drawVideo() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, cw, ch);
    ctx.translate(cw, 0);
    ctx.scale(-1, 1); // 水平翻轉
    ctx.drawImage(video, 0, 0, vw, vh, 0, 0, cw, ch);
    ctx.restore();

    requestAnimationFrame(drawVideo);
}

initCamera();

// ================= MIDI 列表 =================
const showListBtn = document.getElementById("showListBtn");
const midiListContainer = document.getElementById("midiListContainer");
const midiListDiv = document.getElementById("midiList");
const closeList = document.getElementById("closeList");
const searchInput = document.getElementById("midiSearchInput");

export let midiList = [];
let isFullyLoaded = false;

function sortByTitle(data) {
    return [...data].sort((a, b) => {
        const titleA = a.title ? a.title.toUpperCase() : '';
        const titleB = b.title ? b.title.toUpperCase() : '';
        return titleA < titleB ? -1 : (titleA > titleB ? 1 : 0);
    });
}

// 載入 MIDI 分頁
export async function loadMidiFiles() {
    if (isFullyLoaded) return;

    midiListContainer.style.display = "flex";
    midiListDiv.innerHTML = `<div class="status-box">正在初始化請求...</div>`;
    midiList = [];

    let page = 1;
    let url = `https://imuse.ncnu.edu.tw/Midi-library/api/midis?page=${page}&limit=100&sort=uploaded_at&order=desc`;

    try {
        while (url) {
            midiListDiv.innerHTML = `
                <div class="status-box">
                    <p>⏳ 正在讀取第 <b>${page}</b> 頁...</p>
                    <small>來源: ${url}</small><br>
                    <p>目前已累積: ${midiList.length} 筆</p>
                </div>`;

            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            const items = Array.isArray(json.items) ? json.items : [];
            if (items.length === 0) break;

            midiList = [...midiList, ...items];
            page++;
            url = `https://imuse.ncnu.edu.tw/Midi-library/api/midis?page=${page}&limit=100&sort=uploaded_at&order=desc`;
            await new Promise(r => setTimeout(r, 250));
        }

        midiList = sortByTitle(midiList);
        isFullyLoaded = true;
        renderMidiList();

    } catch (err) {
        console.error("載入錯誤:", err);
        midiListDiv.innerHTML += `<p style='color:red; text-align:center;'>❌ 發生錯誤 (第 ${page} 頁): ${err.message}</p>`;
    }
}

// 渲染 MIDI 列表
function renderMidiList(filteredList) {
    const listToRender = filteredList || midiList;

    midiListDiv.innerHTML = "";

    const infoDiv = document.createElement("div");
    infoDiv.className = "success-box";
    infoDiv.innerHTML = `✅ 共 <b>${listToRender.length}</b> 筆資料`;
    midiListDiv.appendChild(infoDiv);

    listToRender.forEach(mid => {
        const div = document.createElement("div");
        div.className = "midi-item";

        const titleDiv = document.createElement("div");
        titleDiv.className = "midi-title";
        titleDiv.textContent = mid.title;

        const composerDiv = document.createElement("div");
        composerDiv.className = "midi-composer";
        composerDiv.textContent = mid.composer || "未知作曲者";

        div.appendChild(titleDiv);
        div.appendChild(composerDiv);

        div.addEventListener("click", () => Get_midEvent(mid, div));
        midiListDiv.appendChild(div);
    });
}

// 搜尋功能
searchInput.addEventListener("input", () => {
    const keyword = searchInput.value.trim().toLowerCase();
    if (!keyword) {
        renderMidiList();
        return;
    }

    const filtered = midiList.filter(mid => 
        (mid.title && mid.title.toLowerCase().includes(keyword)) ||
        (mid.composer && mid.composer.toLowerCase().includes(keyword))
    );
    renderMidiList(filtered);
});

// 下載 Event
async function Get_midEvent(mid, divElement) {
    const originalText = divElement.textContent;
    divElement.style.background = "#fff3cd";
    divElement.textContent = `⏳ 下載中... ${mid.title}`;

    try {
        const midEvent = `https://imuse.ncnu.edu.tw/Midi-library/api/midis/${mid.id}/events`;
        const res = await fetch(midEvent);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const eventObj = await res.json();
        console.log("下載成功 (Event Object):", eventObj);

        divElement.style.background = "#d4edda";
        divElement.textContent = `✅ 完成: ${mid.title}`;

        setTimeout(() => {
            divElement.style.background = "";
            divElement.textContent = originalText;
        }, 1500);

    } catch (err) {
        console.error("❌ 錯誤:", err);
        divElement.style.color = "red";
        divElement.textContent = `❌ 下載失敗`;
    }
}

// 事件綁定
closeList.addEventListener("click", () => {
    midiListContainer.style.display = "none";
});

showListBtn.addEventListener("click", () => {
    if (!isFullyLoaded) {
        loadMidiFiles();
    } else {
        midiListContainer.style.display = "flex";
    }
});
