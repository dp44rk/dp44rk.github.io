// 말하기(TTS)와 듣기(STT)
// 말하기: 서버의 Qwen3-TTS → 실패하면 폰 내장 음성. 이어폰이 연결돼 있으면 그쪽으로 나온다.
// 듣기: 브라우저 음성 인식(ko-KR). 안 되면 버튼·글로 대신한다.
import { api } from './api.js';

let rate = 0.9;
let useServerTts = true;
const cache = new Map();
let current = null;
let lastText = '';
const listeners = new Set();

export function setRate(r) { rate = r; }
export function lastSaid() { return lastText; }
export function onSpeak(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function stop() {
  try { window.speechSynthesis?.cancel(); } catch {}
  if (current) { current.pause(); current = null; }
}

/** 즉시 짧게 (지연 없는 내장 음성) — "보고 있어요" 같은 대기 알림 */
export function quick(text) {
  return local(text, Math.min(1.1, rate + 0.1));
}

export async function say(text, { slow = false } = {}) {
  if (!text) return;
  lastText = text;
  listeners.forEach((f) => f(text));
  if (window.__muted) return;
  stop();
  const r = slow ? Math.max(0.6, rate - 0.2) : rate;
  if (useServerTts && api.online()) {
    try {
      let url = cache.get(text);
      if (!url) {
        const blob = await api.tts(text);
        url = URL.createObjectURL(blob);
        cache.set(text, url);
      }
      const a = new Audio(url);
      a.preservesPitch = true;
      a.playbackRate = r / 0.9; // 서버 음성은 이미 차분하므로 0.9를 기준으로
      current = a;
      await a.play();
      await new Promise((res) => { a.onended = res; a.onpause = res; });
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
    const ko = ss.getVoices().find((v) => v.lang?.startsWith('ko'));
    if (ko) u.voice = ko;
    u.onend = resolve; u.onerror = resolve;
    ss.speak(u);
    setTimeout(resolve, 2000 + text.length * 220); // 일부 브라우저에서 onend가 안 오는 문제 대비
  });
}

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
