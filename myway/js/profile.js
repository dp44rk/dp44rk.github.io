// 내 방식 프로필: 폰에 저장 + QR(주소 #p=…)로 주고받기. 개인정보(이름·연락처·장애 여부)는 담지 않는다.
const KEY = 'myway.profile.v1';

export const DEFAULT = {
  v: 1,
  rate: 0.9,          // 말 빠르기 (0.7~1.2)
  vision: 'normal',   // normal | low  (low: 아주 큰 글씨, 소리 위주)
  experience: 'some', // first | some | often  (안내 자세함)
  skipPoints: true,   // 적립·쿠폰 건너뛰기
  noUpsell: true,     // 권유는 바로 거절 안내
  plain: true,        // 쉬운 말
};

export function load() {
  try {
    const fromHash = readHash();
    if (fromHash) { save(fromHash); history.replaceState(null, '', location.pathname + location.search); return { ...fromHash, imported: true }; }
    const s = localStorage.getItem(KEY);
    return s ? { ...DEFAULT, ...JSON.parse(s) } : null;
  } catch { return null; }
}
export function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(clean(p))); } catch {}
}
export function clear() { try { localStorage.removeItem(KEY); } catch {} }

function clean(p) {
  const o = {};
  for (const k of Object.keys(DEFAULT)) o[k] = p[k] ?? DEFAULT[k];
  return o;
}

// 짧은 코드: 키 하나당 한 글자 → base64url
const CODE = { rate: 'r', vision: 'v', experience: 'e', skipPoints: 's', noUpsell: 'u', plain: 'p' };
export function encode(p) {
  const c = clean(p);
  const s = `1.r${Math.round(c.rate * 10)}.v${c.vision[0]}.e${c.experience[0]}.s${+c.skipPoints}.u${+c.noUpsell}.p${+c.plain}`;
  return s;
}
export function decode(s) {
  if (!s || !s.startsWith('1.')) return null;
  const p = { ...DEFAULT };
  for (const part of s.split('.').slice(1)) {
    const k = part[0], v = part.slice(1);
    if (k === 'r') p.rate = Math.max(0.6, Math.min(1.3, Number(v) / 10));
    if (k === 'v') p.vision = v === 'l' ? 'low' : 'normal';
    if (k === 'e') p.experience = v === 'f' ? 'first' : v === 'o' ? 'often' : 'some';
    if (k === 's') p.skipPoints = v === '1';
    if (k === 'u') p.noUpsell = v === '1';
    if (k === 'p') p.plain = v === '1';
  }
  return p;
}
function readHash() {
  const m = location.hash.match(/[#&]p=([\w.]+)/);
  return m ? decode(m[1]) : null;
}
export function shareUrl(p) {
  const u = new URL(location.href);
  u.hash = 'p=' + encode(p);
  u.searchParams.delete('k');
  return u.href;
}

export function describe(p) {
  return [
    p.rate < 0.85 ? '천천히 말하기' : p.rate > 1.05 ? '빠르게 말하기' : '보통 빠르기',
    p.vision === 'low' ? '아주 큰 글씨' : '큰 글씨',
    { first: '아주 자세히', some: '알맞게', often: '짧게' }[p.experience] + ' 안내',
    p.skipPoints ? '적립 건너뛰기' : '적립 안내',
    p.noUpsell ? '권유는 거절' : '권유는 물어보기',
  ];
}
