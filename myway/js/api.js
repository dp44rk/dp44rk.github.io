// 서버 주소 정하기 + 호출
// - 같은 서버에서 열면 같은 주소
// - GitHub Pages 시연: ?api=https://xxxx.trycloudflare.com  (키오스크 QR에도 들어 있음)
const qs = new URLSearchParams(location.search);
const LS = 'myway.api';
let base = qs.get('api') || safeGet(LS) || (location.hostname.endsWith('github.io') ? '' : location.origin);
if (qs.get('api')) safeSet(LS, qs.get('api'));
base = base.replace(/\/$/, '');
let health = null;

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

async function post(path, body, { type = 'json', timeoutMs = 60000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ac.signal });
    if (!r.ok) throw new Error(`${r.status} ${await r.text().catch(() => '')}`);
    return type === 'blob' ? r.blob() : r.json();
  } finally { clearTimeout(t); }
}

export const api = {
  base: () => base,
  setBase(v) { base = String(v || '').replace(/\/$/, ''); safeSet(LS, base); health = null; },
  online: () => !!health?.ok,
  aiReady: () => !!health?.ok && !health.mock,
  async health() {
    if (!base) { health = null; return null; }
    try {
      const ac = new AbortController(); setTimeout(() => ac.abort(), 4000);
      health = await (await fetch(base + '/api/health', { signal: ac.signal })).json();
    } catch { health = null; }
    return health;
  },
  step: (b) => post('/api/step', b),
  goal: (text) => post('/api/goal', { text }, { timeoutMs: 15000 }),
  explain: (term) => post('/api/explain', { term }, { timeoutMs: 12000 }),
  tts: (text) => post('/api/tts', { text }, { type: 'blob', timeoutMs: 15000 }),
  async kioskState(id, since, wait = 20) {
    const r = await fetch(`${base}/api/kiosk/${encodeURIComponent(id)}/state?since=${since}&wait=${wait}`);
    return r.json();
  },
  sendProfile: (id, profile) => post(`/api/kiosk/${encodeURIComponent(id)}/profile`, { profile }, { timeoutMs: 8000 }),
};
