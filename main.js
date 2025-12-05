// DOM element
const showListBtn = document.getElementById("showListBtn");
const midiListContainer = document.getElementById("midiListContainer");
const midiListDiv = document.getElementById("midiList");
const closeList = document.getElementById("closeList");

export let midiList = [];
let isFullyLoaded = false;

function sortByTitle(data) {
    return [...data].sort((a, b) => {
        const aT = a.title ? a.title.toUpperCase() : "";
        const bT = b.title ? b.title.toUpperCase() : "";
        return aT < bT ? -1 : aT > bT ? 1 : 0;
    });
}

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

            console.log(`第 ${page} 頁抓取成功: ${items.length} 筆`);

            // 下一頁
            page++;
            url = `https://imuse.ncnu.edu.tw/Midi-library/api/midis?page=${page}&limit=100&sort=uploaded_at&order=desc`;

            await new Promise(r => setTimeout(r, 250)); // rate limit
        }

        midiList = sortByTitle(midiList);
        isFullyLoaded = true;
        renderMidiList();

    } catch (err) {
        console.error(err);
        midiListDiv.innerHTML += `<p style="color:red; text-align:center;">❌ 錯誤: ${err.message}</p>`;
    }
}

// 渲染
function renderMidiList() {
    midiListDiv.innerHTML = "";

    const info = document.createElement("div");
    info.className = "success-box";
    info.innerHTML = `✅ 載入完成，共 <b>${midiList.length}</b> 筆資料`;
    midiListDiv.appendChild(info);

    midiList.forEach(mid => {
        const div = document.createElement("div");
        div.className = "midi-item";
        div.textContent = mid.title;

        // 修正：事件綁定到正確函數名稱
        div.addEventListener("click", () => Get_midEvent(mid, div));

        midiListDiv.appendChild(div);
    });
}

// 下載事件物件
async function Get_midEvent(mid, divElement) {
    const original = divElement.textContent;
    divElement.style.background = "#fff3cd";
    divElement.textContent = `⏳ 下載中... ${mid.title}`;

    try {
        const url = `https://imuse.ncnu.edu.tw/Midi-library/api/midis/${mid.id}/events`;
        const res = await fetch(url);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const eventObj = await res.json();
        console.log("🎵 Event Object:", eventObj);

        divElement.style.background = "#d4edda";
        divElement.textContent = `✅ 完成: ${mid.title}`;

        setTimeout(() => {
            divElement.style.background = "";
            divElement.textContent = original;
        }, 1500);

    } catch (err) {
        console.error(err);
        divElement.style.background = "#f8d7da";
        divElement.style.color = "#721c24";
        divElement.textContent = `❌ 下載失敗`;
    }
}

// 開關 UI
closeList.addEventListener("click", () => {
    midiListContainer.style.display = "none";
});

showListBtn.addEventListener("click", () => {
    if (!isFullyLoaded) loadMidiFiles();
    else midiListContainer.style.display = "flex";
});
