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
["pointerdown", "keydown", "touchstart"].forEach(evt => document.body.addEventListener(evt, tryStartAC, { once: true }));

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
playBtn.addEventListener("click", async () => { play(); });
// 停止 MIDI
stopBtn.addEventListener("click", () => stop());

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


const instruments = {
    "鋼琴": [
        { "program": 0, "name": "原聲大鋼琴" },
        { "program": 1, "name": "明亮鋼琴" },
        { "program": 2, "name": "電鋼琴" },
        { "program": 3, "name": "搖滾鋼琴" },
        { "program": 4, "name": "電鋼琴1" },
        { "program": 5, "name": "電鋼琴2" },
        { "program": 6, "name": "羽管鍵琴" },
        { "program": 7, "name": "電琴" }
    ],
    "敲擊鍵盤": [
        { "program": 8, "name": "鋼片琴" },
        { "program": 9, "name": "鐘琴" },
        { "program": 10, "name": "音樂盒" },
        { "program": 11, "name": "顫音琴" },
        { "program": 12, "name": "馬林巴琴" },
        { "program": 13, "name": "木琴" },
        { "program": 14, "name": "管鐘" },
        { "program": 15, "name": "三角鐵" }
    ],
    "風琴": [
        { "program": 16, "name": "抽拉風琴" },
        { "program": 17, "name": "敲擊風琴" },
        { "program": 18, "name": "搖滾風琴" },
        { "program": 19, "name": "教堂風琴" },
        { "program": 20, "name": "簧風琴" },
        { "program": 21, "name": "手風琴" },
        { "program": 22, "name": "口琴" },
        { "program": 23, "name": "探戈手風琴" }
    ],
    "吉他": [
        { "program": 24, "name": "原聲吉他（尼龍弦）" },
        { "program": 25, "name": "原聲吉他（鋼弦）" },
        { "program": 26, "name": "電吉他（爵士）" },
        { "program": 27, "name": "電吉他（乾淨音）" },
        { "program": 28, "name": "電吉他（弱音）" },
        { "program": 29, "name": "過載吉他" },
        { "program": 30, "name": "失真吉他" },
        { "program": 31, "name": "吉他泛音" }
    ],
    "低音": [
        { "program": 32, "name": "原聲低音" },
        { "program": 33, "name": "電貝斯（手指）" },
        { "program": 34, "name": "電貝斯（撥片）" },
        { "program": 35, "name": "無品貝斯" },
        { "program": 36, "name": "拍擊貝斯1" },
        { "program": 37, "name": "拍擊貝斯2" },
        { "program": 38, "name": "合成貝斯1" },
        { "program": 39, "name": "合成貝斯2" }
    ],
    "弦樂": [
        { "program": 40, "name": "小提琴" },
        { "program": 41, "name": "中提琴" },
        { "program": 42, "name": "大提琴" },
        { "program": 43, "name": "低音大提琴" },
        { "program": 44, "name": "顫音弦樂" },
        { "program": 45, "name": "撥弦弦樂" },
        { "program": 46, "name": "管弦豎琴" },
        { "program": 47, "name": "定音鼓" }
    ],
    "合奏": [
        { "program": 48, "name": "弦樂合奏1" },
        { "program": 49, "name": "弦樂合奏2" },
        { "program": 50, "name": "合成弦樂1" },
        { "program": 51, "name": "合成弦樂2" },
        { "program": 52, "name": "人聲合唱Aah" },
        { "program": 53, "name": "人聲Ooh" },
        { "program": 54, "name": "合成人聲合唱" },
        { "program": 55, "name": "管弦打擊音" }
    ],
    "銅管": [
        { "program": 56, "name": "小號" },
        { "program": 57, "name": "長號" },
        { "program": 58, "name": "大號" },
        { "program": 59, "name": "弱音小號" },
        { "program": 60, "name": "法國號" },
        { "program": 61, "name": "銅管合奏" },
        { "program": 62, "name": "合成銅管1" },
        { "program": 63, "name": "合成銅管2" }
    ],
    "木管": [
        { "program": 64, "name": "高音薩克斯" },
        { "program": 65, "name": "中音薩克斯" },
        { "program": 66, "name": "次中音薩克斯" },
        { "program": 67, "name": "低音薩克斯" },
        { "program": 68, "name": "雙簧管" },
        { "program": 69, "name": "英國號" },
        { "program": 70, "name": "巴松管" },
        { "program": 71, "name": "單簧管" }
    ],
    "長笛類": [
        { "program": 72, "name": "短笛" },
        { "program": 73, "name": "長笛" },
        { "program": 74, "name": "直笛" },
        { "program": 75, "name": "泛笛" },
        { "program": 76, "name": "吹瓶" },
        { "program": 77, "name": "尺八" },
        { "program": 78, "name": "口哨" },
        { "program": 79, "name": "陶笛" }
    ],
    "合成音 Lead": [
        { "program": 80, "name": "主音1（方波）" },
        { "program": 81, "name": "主音2（鋸齒波）" },
        { "program": 82, "name": "主音3（玩具音）" },
        { "program": 83, "name": "主音4（輕音）" },
        { "program": 84, "name": "主音5（Charang）" },
        { "program": 85, "name": "主音6（人聲）" },
        { "program": 86, "name": "主音7（五度和音）" },
        { "program": 87, "name": "主音8（低音+主音）" }
    ],
    "合成音 Pad": [
        { "program": 88, "name": "合成音墊1（新世代）" },
        { "program": 89, "name": "合成音墊2（溫暖）" },
        { "program": 90, "name": "合成音墊3（多音合成）" },
        { "program": 91, "name": "合成音墊4（合唱）" },
        { "program": 92, "name": "合成音墊5（拉弦）" },
        { "program": 93, "name": "合成音墊6（金屬質感）" },
        { "program": 94, "name": "合成音墊7（光環）" },
        { "program": 95, "name": "合成音墊8（掃掠）" }
    ],
    "合成音效果": [
        { "program": 96, "name": "效果1（雨）" },
        { "program": 97, "name": "效果2（配樂）" },
        { "program": 98, "name": "效果3（水晶）" },
        { "program": 99, "name": "效果4（氛圍）" },
        { "program": 100, "name": "效果5（明亮）" },
        { "program": 101, "name": "效果6（小妖精）" },
        { "program": 102, "name": "效果7（回聲）" },
        { "program": 103, "name": "效果8（科幻）" }
    ],
    "民族樂器": [
        { "program": 104, "name": "錫塔琴" },
        { "program": 105, "name": "班卓琴" },
        { "program": 106, "name": "三味線" },
        { "program": 107, "name": "箏" },
        { "program": 108, "name": "卡林巴琴" },
        { "program": 109, "name": "風笛" },
        { "program": 110, "name": "小提琴（民俗）" },
        { "program": 111, "name": "山奈" }
    ],
    "打擊樂": [
        { "program": 112, "name": "鈴鐺" },
        { "program": 113, "name": "阿哥哥" },
        { "program": 114, "name": "鋼鼓" },
        { "program": 115, "name": "木魚" },
        { "program": 116, "name": "太鼓" },
        { "program": 117, "name": "旋律小鼓" },
        { "program": 118, "name": "合成鼓" },
        { "program": 119, "name": "反向鈸" }
    ],
    "音效": [
        { "program": 120, "name": "吉他泛音噪音" },
        { "program": 121, "name": "氣息聲" },
        { "program": 122, "name": "海浪" },
        { "program": 123, "name": "鳥叫" },
        { "program": 124, "name": "電話鈴聲" },
        { "program": 125, "name": "直升機" },
        { "program": 126, "name": "掌聲" },
        { "program": 127, "name": "槍聲" }
    ]
}

const showInstrumentBtn = document.getElementById('showInstrumentBtn');
const instrumentListContainer = document.getElementById('instrumentListContainer');
const closeInstrument = document.getElementById('closeInstrument');
const instrumentList = document.getElementById('instrumentList');

// 顯示/隱藏清單
showInstrumentBtn.onclick = () => {
    instrumentListContainer.style.display =
        instrumentListContainer.style.display === 'block' ? 'none' : 'block';
};
closeInstrument.onclick = () => instrumentListContainer.style.display = 'none';
window.addEventListener('click', e => {
    if (e.target === instrumentListContainer) instrumentListContainer.style.display = 'none';
});
window.addEventListener('keydown', e => {
    if (e.key === 'Escape') instrumentListContainer.style.display = 'none';
});

// 生成手風琴
export function InstrumentList() {
    instrumentList.innerHTML = '';
    let currentOpen = null;

    for (let category in instruments) {
        const categoryBtn = document.createElement('div');
        categoryBtn.className = 'category-item';
        categoryBtn.textContent = category;

        const sublist = document.createElement('div');
        sublist.className = 'instrument-sublist';

        instruments[category].forEach(inst => {
            const btn = document.createElement('button');
            btn.className = 'instrument-item';
            btn.textContent = `${inst.program}: ${inst.name}`;
            btn.onclick = () => console.log('選擇樂器：', inst.name, 'Program:', inst.program);
            sublist.appendChild(btn);
        });

        categoryBtn.onclick = () => {
            if (currentOpen && currentOpen !== sublist) {
                currentOpen.classList.remove('show');
            }
            sublist.classList.toggle('show');
            currentOpen = sublist.classList.contains('show') ? sublist : null;
        };

        instrumentList.appendChild(categoryBtn);
        instrumentList.appendChild(sublist);
    }
}

