import * as spessasynthLib from 'https://cdn.jsdelivr.net/npm/spessasynth_lib@4.0.18/+esm';
const { WorkletSynthesizer } = spessasynthLib;

//  全域 AudioContext 與效果 
const AC = new (window.AudioContext || window.webkitAudioContext)();

// masterGain：控制整體音量
const masterGain = AC.createGain();
masterGain.gain.value = 1.8;

// 輕壓縮器，提高音量感知並防止爆音
const comp = AC.createDynamicsCompressor();
comp.threshold.value = -18;
comp.knee.value = 6;
comp.ratio.value = 2;
comp.attack.value = 0.005;
comp.release.value = 0.1;

// 連接順序：comp -> masterGain -> destination
comp.connect(masterGain).connect(AC.destination);

let synth;


// 初始化 SpessaSynth 
export async function initSynth() {
    const SOUND_FONT_URL = "https://spessasus.github.io/SpessaSynth/soundfonts/GeneralUserGS.sf3";
    const WORKLET_URL = "https://cdn.jsdelivr.net/npm/spessasynth_lib@4.0.18/dist/spessasynth_processor.min.js";

    await AC.audioWorklet.addModule(WORKLET_URL);

    synth = new WorkletSynthesizer(AC);
    synth.connect(comp); // connect 到壓縮器

    // 載入 SoundFont
    const sfResponse = await fetch(SOUND_FONT_URL);
    const sfBuffer = await sfResponse.arrayBuffer();
    await synth.soundBankManager.addSoundBank(sfBuffer, "main");

    try {
        synth.soundBankManager?.setDefaultSoundBank?.('main');
    } catch (e) {
        console.warn('setDefaultSoundBank failed:', e);
    }

    console.log("🎹 Synth 初始化完成");
}

// MIDI 播放 / 停止
let midiEvent = [];
let midiIndex = 0;
let activeNotes = [];
let scheduledNotes = [];

export function playMidi() {
    if (!synth || !midiEvent || midiEvent.length === 0) return;

    const startTime = AC.currentTime;

    // 清除上次排程前：不能直接 clear，要先 noteOff
    stopMidi();  // <<< 自動完整停止

    // midiEvent 是二維陣列：每組同時間事件
    midiEvent.forEach(group => {
        if (!group || group.length === 0) return;

        const time = group[0].time;

        group.forEach(event => {
            synth.programChange(event.channel || 0, event.program || 0);

            const noteOnTime = startTime + time;
            const noteOffTime = noteOnTime + event.duration;

            // --- 排程 noteOn ---
            const onId = setTimeout(() => {
                const ch = event.channel || 0;
                const midi = event.midi;

                synth.noteOn(
                    ch,
                    midi,
                    Math.max(Math.floor(event.velocity * 127), 100)
                );

                // 記錄發聲中的音
                activeNotes.push({ ch, midi });

            }, (noteOnTime - AC.currentTime) * 1000);

            scheduledNotes.push(onId);

            // --- 排程 noteOff ---
            const offId = setTimeout(() => {
                const ch = event.channel || 0;
                const midi = event.midi;

                synth.noteOff(ch, midi);

                // 從 activeNotes 移除
                activeNotes = activeNotes.filter(
                    n => !(n.ch === ch && n.midi === midi)
                );
            }, (noteOffTime - AC.currentTime) * 1000);

            scheduledNotes.push(offId);
        });
    });

    console.log("MIDI 播放中");
}

export function stopMidi() {
    // ① 先完整 noteOff
    activeNotes.forEach(n => {
        try {
            synth.noteOff(n.ch, n.midi);
        } catch (e) {
            console.warn("noteOff error:", e);
        }
    });
    activeNotes = [];

    // ② 再清除所有排程
    scheduledNotes.forEach(id => clearTimeout(id));
    scheduledNotes = [];

    console.log("MIDI 停止");
}

export function handPlayMidi() {
    if (!synth || !midiEvent?.length) return;

    const events = midiEvent[midiIndex];
    if (!events?.length) return;

    // 播放當前 MIDI 事件
    events.forEach(evt => {
        const ch = evt.channel || 0;
        const vel = Math.floor(evt.velocity * 127);

        synth.programChange(ch, evt.program || 0);
        synth.noteOn(ch, evt.midi, vel);

        activeNotes.push({ ch, midi: evt.midi });
    });

    // 更新索引
    midiIndex = (midiIndex + 1) % midiEvent.length;
}

export function relAllNotes() {
    activeNotes.forEach(n => {
        synth.noteOff(n.ch, n.midi);
    });
    activeNotes = [];
}

export function midiCC(handData, refx) {
    if (!handData?.Left?.[8]) return;

    const x = handData.Left[8][0]; // X 座標
    const y = handData.Left[8][1]; // Y 座標

    // 音量 (CC#11)
    let vol = 1 - (y / window.innerHeight);
    vol = Math.max(0, Math.min(1, vol)) + 0.1; // 避免太小
    const ccVal = Math.floor(vol * 127);

    activeNotes.forEach(n => {
        synth.controllerChange(n.ch, 11, ccVal);
    });

    // Channel Pressure 
    const range = 100; // ±200px
    let ratio = (x - refx) / range; // -1 ~ 1
    ratio = Math.max(-1, Math.min(1, ratio));

    // 映射到 Channel Pressure (0~127)
    const pressure = Math.floor(64 + ratio * 63); // 中央64，左右±63
    console.log(pressure)

    activeNotes.forEach(n => {
        synth.channelPressure(n.ch, pressure);
    });
}

// MIDI list
let isFullyLoaded = false;
const midiListContainer = document.getElementById("midiListContainer");
const midiListDiv = document.getElementById("midiList");
const searchInput = document.getElementById("midiSearchInput");
let midiList = [];

// 排序
function sortByTitle(data) {
    return [...data].sort((a, b) => {
        const titleA = a.title?.toUpperCase() || "";
        const titleB = b.title?.toUpperCase() || "";
        return titleA < titleB ? -1 : titleA > titleB ? 1 : 0;
    });
}

// 載入 MIDI 列表
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
        midiListDiv.innerHTML += `<p style='color:red;text-align:center;'>❌ 錯誤: ${err.message}</p>`;
    }
}

// 渲染 MIDI 列表
export function renderMidiList(filteredList) {
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

        div.addEventListener("click", () => Get_midiEvent(mid, div));
        midiListDiv.appendChild(div);
    });
}

// 搜尋
searchInput.addEventListener("input", () => {
    const keyword = searchInput.value.trim().toLowerCase();
    if (!keyword) return renderMidiList();

    const filtered = midiList.filter(mid =>
        mid.title?.toLowerCase().includes(keyword) ||
        mid.composer?.toLowerCase().includes(keyword)
    );
    renderMidiList(filtered);
});

// 下載 MIDI Events
async function Get_midiEvent(mid, divElement) {
    stopMidi();
    midiIndex = 0;
    const originalText = divElement.textContent;
    divElement.style.background = "#fff3cd";
    divElement.textContent = `⏳ 下載中... ${mid.title}`;

    try {
        const url = `https://imuse.ncnu.edu.tw/Midi-library/api/midis/${mid.id}/events`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        // 取出 events 並 group by time
        if (Array.isArray(json.events)) {
            const groups = new Map();

            json.events.forEach(ev => {
                const t = ev.time;
                if (!groups.has(t)) groups.set(t, []);
                groups.get(t).push(ev);
            });

            // 依 time 排序後轉成二維陣列
            midiEvent = [...groups.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(entry => entry[1]);
        } else {
            midiEvent = [];
        }

        divElement.style.background = "#d4edda";
        divElement.textContent = `✅ 完成: ${mid.title}`;

        setTimeout(() => {
            divElement.style.background = "";
            divElement.textContent = originalText;
        }, 1500);

    } catch (err) {
        console.error("❌ 下載 MIDI 失敗:", err);
        divElement.style.color = "red";
        divElement.textContent = `❌ 下載失敗`;
    }

}
