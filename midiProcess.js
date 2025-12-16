import * as spessasynthLib from 'https://cdn.jsdelivr.net/npm/spessasynth_lib@4.0.18/+esm';
const { WorkletSynthesizer } = spessasynthLib;

let AC; // 延遲建立
let masterGain, comp;

let AC_started = false;

function tryStartAC() {
    if (AC_started) return;
    if (!AC) setupAC();
    AC.resume().then(() => {
        console.log("🎹 AudioContext 已啟動");
        AC_started = true;
    });
}

// 監聽任意使用者互動
["pointerdown", "keydown", "touchstart"].forEach(evt =>
    document.body.addEventListener(evt, tryStartAC, { once: true })
);

function setupAC() {
    if (!AC) {
        AC = new (window.AudioContext || window.webkitAudioContext)();

        // masterGain
        masterGain = AC.createGain();
        masterGain.gain.value = 1.8;

        // 輕壓縮器
        comp = AC.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 6;
        comp.ratio.value = 2;
        comp.attack.value = 0.005;
        comp.release.value = 0.1;

        // 連接順序
        comp.connect(masterGain).connect(AC.destination);
    }
}

// 初始化 SpessaSynth 
let synth;
export async function initSynth() {
    setupAC()

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
import { bubleUP } from './visualDraw.js';
export let lyric = "";
let midiEvent = [], activeNotes = [], scheduledNotes = [];
let midiIndex = 0
// midi Buttoms for play and stop
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
// 播放 MIDI
playBtn.addEventListener("click", async () => { midi.play(); });
// 停止 MIDI
stopBtn.addEventListener("click", () => midi.stop());

export function play() {
    if (!synth || !midiEvent || midiEvent.length === 0) return;

    const startTime = AC.currentTime;

    stop(); // 先完整停止

    midiEvent.forEach(group => {
        if (!group || !group.notes) return;

        // group.notes 是物件，midi => event
        Object.values(group.notes).forEach(event => {
            const time = event.time;
            const noteOnTime = startTime + time;
            const noteOffTime = noteOnTime + event.duration;

            // --- 排程 noteOn ---
            const onId = setTimeout(() => {
                const ch = event.channel || 0;
                synth.programChange(ch, event.program || 0);
                synth.noteOn(ch, event.midi, Math.max(Math.floor(event.velocity * 127), 100));

                activeNotes.push({ ch, midi: event.midi });
            }, (noteOnTime - AC.currentTime) * 1000);

            scheduledNotes.push(onId);

            // --- 排程 noteOff ---
            const offId = setTimeout(() => {
                const ch = event.channel || 0;
                synth.noteOff(ch, event.midi);

                activeNotes = activeNotes.filter(n => !(n.ch === ch && n.midi === event.midi));
            }, (noteOffTime - AC.currentTime) * 1000);

            scheduledNotes.push(offId);
        });
    });

    console.log("MIDI 播放中");
}

export function stop() {
    // 先完整 noteOff
    noteSeqOff();

    // 再清除所有排程
    scheduledNotes.forEach(id => clearTimeout(id));
    scheduledNotes = [];

    console.log("MIDI 停止");
}

export function handPlay() {
    if (!synth || !midiEvent?.length) return;

    const group = midiEvent[midiIndex];
    if (!group?.notes) return;

    Object.values(group.notes).forEach(evt => {
        const ch = evt.channel || 0;
        synth.programChange(ch, evt.program || 0);
        synth.noteOn(ch, evt.midi, 100);

        activeNotes.push({ ch, midi: evt.midi });
    });
    lyric = group.lyrics
    midiIndex = (midiIndex + 1) % midiEvent.length;
}

export function noteSeqOff() {
    bubleUP(lyric);
    lyric = "";
    activeNotes.forEach(n => {
        synth.noteOff(n.ch, n.midi);
    });
    activeNotes = [];
}

export function CCtrl(indexPos, CP_Y) {
    if (!indexPos) {
        activeNotes.forEach(n => {
            synth.controllerChange(n.ch, 11, 100);
        });
        return;
    }
    const x = indexPos[0]; // X 座標
    const y = indexPos[1]; // Y 座標

    // 音量 (CC#11)
    let vol = 1 - (y / window.innerHeight);
    vol = Math.max(0, Math.min(1, vol)) + 0.1; // 避免太小
    const ccVal = Math.floor(vol * 127);

    activeNotes.forEach(n => {
        synth.controllerChange(n.ch, 11, ccVal);
    });

    // Channel Pressure 
    const range = 150;
    let ratio = (x - CP_Y) / range; // -1 ~ 1
    ratio = Math.max(-1, Math.min(1, ratio));

    // 映射到 Channel Pressure (0~127)
    const pressure = Math.floor(64 + ratio * 63); // 中央64，左右±63

    activeNotes.forEach(n => {
        synth.channelPressure(n.ch, pressure);
    });
}

// MIDI list
const showListBtn = document.getElementById("showListBtn");
const midiListContainer = document.getElementById("midiListContainer");
const closeList = document.getElementById("closeList");

// 開啟 MIDI 清單
showListBtn.addEventListener("click", async () => { midiListContainer.style.display = "flex"; });
// 關閉 MIDI 清單
closeList.addEventListener("click", () => midiListContainer.style.display = "none");

let midiList = [];
let isFullyLoaded = false;
const midiListDiv = document.getElementById("midiList");
const searchInput = document.getElementById("midiSearchInput");

// 排序
function sortByTitle(data) {
    return [...data].sort((a, b) => {
        const titleA = a.title?.toUpperCase() || "";
        const titleB = b.title?.toUpperCase() || "";
        return titleA < titleB ? -1 : titleA > titleB ? 1 : 0;
    });
}

// 載入 MIDI 列表
export async function loadFiles() {
    if (isFullyLoaded) return;

    let page = 1;
    try {
        while (true) {
            let url = `https://imuse.ncnu.edu.tw/Midi-library/api/midis?page=${page}&limit=100&sort=uploaded_at&order=desc`;

            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            const items = Array.isArray(json.items) ? json.items : [];
            if (items.length === 0) break;

            midiList = [...midiList, ...items];
            page++;

            await new Promise(r => setTimeout(r, 250));
        }

        midiList = sortByTitle(midiList);
        isFullyLoaded = true;
        renderList();

    } catch (err) {
        console.error("載入錯誤:", err);
        midiListDiv.innerHTML += `<p style='color:red;text-align:center;'>❌ 錯誤: ${err.message}</p>`;
    }
}

// 渲染 MIDI 列表
export function renderList(filteredList) {
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

        div.addEventListener("click", () => getEvents(mid, div));
        midiListDiv.appendChild(div);
    });
}

// 搜尋
searchInput.addEventListener("input", () => {
    const keyword = searchInput.value.trim().toLowerCase();
    if (!keyword) return renderList();

    const filtered = midiList.filter(mid =>
        mid.title?.toLowerCase().includes(keyword) ||
        mid.composer?.toLowerCase().includes(keyword)
    );
    renderList(filtered);
});

// URL:?midi -> 尋找 midi 並播放
export function URL(title) {
    if (!midiList || midiList.length === 0) return;

    // 找到 midiList 中對應 title 的 mid 物件
    const mid = midiList.find(item => item.title === title);
    if (!mid) {
        console.warn(`找不到標題為 "${title}" 的 MIDI`);
        return;
    }

    // 直接呼叫 Get_midiEvent，不傳入 divElement
    getEvents(mid);
}

// 下載 MIDI Events
async function getEvents(mid, divElement) {
    stop();
    midiIndex = 0;

    // 取得全局 overlay
    const songTitle = document.getElementById("songTitle");

    let titleDiv, composerDiv, originalTitle, originalComposer;

    if (divElement) {
        // 保存原本歌名與作者的元素
        titleDiv = divElement.querySelector(".midi-title");
        composerDiv = divElement.querySelector(".midi-composer");

        originalTitle = titleDiv ? titleDiv.textContent : "";
        originalComposer = composerDiv ? composerDiv.textContent : "";

        // 下載中提示
        divElement.style.background = "#fff3cd";
        if (titleDiv) titleDiv.textContent = `⏳ ${mid.title}`;
        if (composerDiv) composerDiv.textContent = mid.composer || "";
    }

    // 顯示 title
    if (songTitle) {
        songTitle.innerHTML = `${mid.title}`;
        songTitle.style.display = "block";
    }

    try {
        const url = `https://imuse.ncnu.edu.tw/Midi-library/api/midis/${mid.id}/events`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        if (Array.isArray(json.events)) {
            const groups = new Map();

            json.events.forEach(ev => {
                if (ev.channel !== 0) return; // 只保留 channel 0

                // 統一 time 小數6位
                const t = Math.floor(ev.time * 1e6) / 1e6;

                if (!groups.has(t)) groups.set(t, { lyrics: "", notes: {} });
                // 如果有 lyric，就把文字加入
                if (json.lyrics && Array.isArray(json.lyrics)) {
                    for (let i = 0; i < json.lyrics.length; i++) {
                        const lyric = json.lyrics[i];
                        const lyricTime = Math.floor(lyric.time * 1e6) / 1e6;

                        if (Math.abs(lyricTime - t) < 0.00001) {
                            groups.get(t).lyrics = lyric.text;
                            json.lyrics.splice(i, 1);
                            break;
                        }
                    }
                }

                groups.get(t).notes[ev.midi] = ev;
            });

            // 轉成排序陣列
            midiEvent = [...groups.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(entry => entry[1]); // 只取 value
        } else {
            midiEvent = [];
        }


        // 下載完成提示
        if (divElement) {
            divElement.style.background = "#d4edda";
            if (titleDiv) titleDiv.textContent = `✅ ${mid.title}`;
            if (composerDiv) composerDiv.textContent = mid.composer || "";

            // 1.5 秒後復原原本歌名與作曲者
            setTimeout(() => {
                divElement.style.background = "";
                if (titleDiv) titleDiv.textContent = originalTitle;
                if (composerDiv) composerDiv.textContent = originalComposer;
            }, 1500);
        }

        // 更新 overlay
        if (songTitle) {
            songTitle.innerHTML = `${mid.title}`;
        }

    } catch (err) {
        console.error("❌ 下載 MIDI 失敗:", err);
        if (divElement) {
            divElement.style.background = "#f8d7da";
            if (titleDiv) titleDiv.textContent = `❌ 下載失敗`;
            if (composerDiv) composerDiv.textContent = "";
        }
        if (songTitle) {
            songTitle.innerHTML = `❌ ${mid.title}`;
        }
    }
}

// instrument list
const showInstrumentBtn = document.getElementById('showInstrumentBtn');
const instrumentListContainer = document.getElementById('instrumentListContainer');
const closeInstrument = document.getElementById('closeInstrument');

showInstrumentBtn.onclick = () => {
    instrumentListContainer.style.display = 'block';
};

closeInstrument.onclick = () => {
    instrumentListContainer.style.display = 'none';
};