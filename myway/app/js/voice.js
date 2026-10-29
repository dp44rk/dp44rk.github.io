// 말하기(TTS)와 듣기(STT)
// 말하기 순서: ① 미리 녹음한 Qwen3-TTS 음성(voice/index.json에 있는 문장) → ② 서버의 Qwen3-TTS
//            → ③ 폰 내장 음성(가장 자연스러운 한국어 목소리를 골라 씀). 이어폰이 연결돼 있으면 그쪽으로 나온다.
// 듣기: 브라우저 음성 인식(ko-KR). 안 되면 버튼·글로 대신한다.
import { api } from './api.js';

let rate = 0.9;
let useServerTts = true;
const cache = new Map();
let current = null;
let lastText = '';
const listeners = new Set();

export function setRate(r) { rate = r; }

// ---------- 미리 녹음한 음성 ----------
// 문장 → 파일 이름: FNV-1a 32비트 (scripts/prerender-tts.mjs와 같은 함수)
export function voiceKey(text) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  let h = 0x811c9dc5;
  for (const ch of new TextEncoder().encode(t)) { h ^= ch; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
let recorded = null; // Set of keys
let recordedBase = '';
const recordedReady = fetch(new URL('../../voice/index.json', import.meta.url), { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : null)).then((j) => { recorded = j ? new Set(j.keys) : new Set(); recordedBase = new URL('../../voice/', import.meta.url).href; })
  .catch(() => { recorded = new Set(); });
async function playUrl(url, r) {
  const a = new Audio(url);
  a.preservesPitch = true;
  a.playbackRate = r / 0.9; // 녹음은 0.9 빠르기를 기준으로 만들었다
  current = a;
  await a.play();
  await new Promise((res) => { a.onended = res; a.onpause = res; a.onerror = res; });
}
export function lastSaid() { return lastText; }
export function onSpeak(fn) { listeners.add(fn); return () => listeners.delete(fn); }

let sayGen = 0;
export function sentences(text) {
  return String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.?!])\s+/).filter(Boolean);
}
export function stop() {
  sayGen++;
  try { window.speechSynthesis?.cancel(); } catch {}
  if (current) { current.pause(); current = null; }
}

/** 즉시 짧게 (지연 없는 내장 음성) — "보고 있어요" 같은 대기 알림 */
export function quick(text) {
  listeners.forEach((f) => f(text, 'quick'));
  if (window.__muted) return Promise.resolve();
  const r = Math.min(1.1, rate + 0.1);
  if (recorded?.has(voiceKey(text))) return playUrl(recordedBase + voiceKey(text) + '.mp3', r).catch(() => local(text, r)); // 짧은 한 문장
  return local(text, r);
}

export async function say(text, { slow = false } = {}) {
  if (!text) return;
  lastText = text;
  listeners.forEach((f) => f(text));
  if (window.__muted) return;
  stop();
  const r = slow ? Math.max(0.6, rate - 0.2) : rate;
  await Promise.race([recordedReady, new Promise((res) => setTimeout(res, 600))]);
  // 문장 단위로 녹음돼 있으면 이어서 재생 (위치·글자 문장이 화면마다 다시 쓰이므로 문장 단위로 녹음)
  const parts = sentences(text);
  if (recorded && parts.every((p) => recorded.has(voiceKey(p)))) {
    try {
      const gen = ++sayGen;
      for (const p of parts) { if (gen !== sayGen) return; await playUrl(recordedBase + voiceKey(p) + '.mp3', r); }
      return;
    } catch {}
  }
  if (useServerTts && api.online()) {
    try {
      let url = cache.get(text);
      if (!url) {
        const blob = await api.tts(text);
        url = URL.createObjectURL(blob);
        cache.set(text, url);
      }
      await playUrl(url, r);
      return;
    } catch (e) {
      if (String(e).includes('503') || String(e).includes('TTS')) useServerTts = false;
    }
  }
  await local(text, r);
}

function local(text, r) {
  return new Promise((resolve) => {
    if (window.__muted) return resolve();
    const ss = window.speechSynthesis;
    if (!ss) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = r;
    const ko = bestKoreanVoice(ss);
    if (ko) u.voice = ko;
    u.onend = resolve; u.onerror = resolve;
    ss.speak(u);
    setTimeout(resolve, 2000 + text.length * 220); // 일부 브라우저에서 onend가 안 오는 문제 대비
  });
}

// 폰·브라우저에 깔린 한국어 목소리 중 가장 자연스러운 것: 향상된/프리미엄·신경망 목소리 우선
function bestKoreanVoice(ss) {
  const vs = ss.getVoices().filter((v) => v.lang?.toLowerCase().startsWith('ko'));
  if (!vs.length) return null;
  const score = (v) => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/premium|프리미엄/.test(n)) s += 50;
    if (/enhanced|향상/.test(n)) s += 40;
    if (/natural|neural|online/.test(n)) s += 35;   // Edge·Windows 신경망 목소리
    if (/google/.test(n)) s += 20;
    if (/yuna|유나|sunhi|선희|injoon|인준/.test(n)) s += 10;
    if (v.localService === false) s += 5;
    return s;
  };
  return vs.sort((a, b) => score(b) - score(a))[0];
}
try { window.speechSynthesis?.addEventListener?.('voiceschanged', () => {}); } catch {}

// 일부 브라우저는 사용자 동작 안에서 한 번 말해야 소리가 풀린다
export function unlock() {
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis?.speak(u); } catch {}
  try { const a = new Audio(); a.play().catch(() => {}); } catch {}
}

// 작은 알림음 (찍었어요)
let actx = null;
export function beep(freq = 880, ms = 90) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; g.gain.value = 0.12;
    o.connect(g); g.connect(actx.destination); o.start();
    setTimeout(() => { o.stop(); }, ms);
  } catch {}
}

// ---------- 듣기 ----------
export function canListen() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }

/** 한 번 듣고 글로 돌려준다. 실패하면 null */
export function listen({ timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return resolve(null);
    stop();
    const r = new SR();
    r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 3; r.continuous = false;
    let done = false;
    const finish = (v) => { if (!done) { done = true; try { r.stop(); } catch {} resolve(v); } };
    r.onresult = (e) => finish([...e.results[0]].map((x) => x.transcript).join(' | '));
    r.onerror = () => finish(null);
    r.onend = () => finish(null);
    setTimeout(() => finish(null), timeoutMs);
    try { r.start(); } catch { finish(null); }
  });
}

/** 들은 말 → 명령 */
export function command(text) {
  const t = String(text || '').replace(/\s/g, '');
  if (!t) return null;
  if (/^(네|예|응|맞아|맞아요|그래|좋아)/.test(t) || /맞아/.test(t)) return 'yes';
  if (/^(아니|아뇨|아냐)/.test(t)) return 'no';
  if (/다시|한번더|뭐라고/.test(t)) return 'again';
  if (/천천|느리게/.test(t)) return 'slow';
  if (/뭐야|무슨뜻|뜻이/.test(t)) return 'what';
  if (/모르겠|도와|직원/.test(t)) return 'help';
  if (/다음|찍어|눌렀/.test(t)) return 'next';
  return null;
}
