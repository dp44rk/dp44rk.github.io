// 한 단계 안내 핵심 (브라우저·서버 공용, 의존성 없음)
import { plan, speak, signature } from './guide.js';
import { normalizeScreen } from './screen.js';

/** 연동 키오스크가 올린 화면 → 정리된 화면 (+ 목표에 맞는 버튼 고르기) */
export function fromKioskState(raw, goal, state) {
  const screen = normalizeScreen(raw);
  screen.bg = raw.bg || null;
  for (const e of screen.els) e.c = raw.els.find((x) => x.id === e.id)?.c || null;
  if (screen.pick === null) screen.pick = pickForGoal(screen, goal, state);
  return screen;
}

/** screen(정리된 화면) → 안내 응답 */
export function runStep({ screen, img = null, goal, state = {}, profile = {}, source = 'camera' }) {
  const p = plan(screen, state, profile);
  const out = speak({ plan: p, screen, img, profile, state });

  const sig = p.sig || signature(screen);
  const newState = {
    ...state,
    lastSig: sig,
    lastAction: p.action === 'press' || p.action === 'stuck' ? 'press' : p.action,
    stuck: p.action === 'stuck' ? p.stuck : 0,
    unsure: p.action === 'unsure' ? p.unsure : 0,
    payConfirmed: !!state.payConfirmed,
    history: [...(state.history || []), { type: screen.type, target: out.target?.r || out.target?.t || null, action: p.action }].slice(-12),
  };
  if (screen.type === 'done') newState.payConfirmed = false;

  const res = {
    source,
    screen: { type: screen.type, title: screen.title, quality: screen.quality, screen: screen.screen, total: screen.total, no: screen.no, conf: screen.conf, els: screen.els.map((e) => ({ id: e.id, t: e.t, r: e.r, k: e.k, box: e.box })) },
    action: out.action, say: out.utterance, lines: out.lines, display: out.display, target: out.target, place: out.place,
    check: { ok: out.check.ok, problems: out.check.problems }, stats: out.stats, situation: out.situation,
    state: newState,
  };
  return res;
}

// 연동 모드에서 키오스크가 pick을 주지 않으면 목표와 글자를 맞춰 고른다
export function pickForGoal(screen, goal, state) {
  const names = (goal?.items || []).flatMap((i) => [i.name, i.temp === 'ice' ? 'ICE' : i.temp === 'hot' ? 'HOT' : null]).filter(Boolean);
  const place = goal?.place;
  const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
  const els = screen.els;
  const by = (pred) => els.find(pred)?.id ?? null;
  switch (screen.type) {
    case 'dine': return by((e) => place === 'eatin' ? /매장|먹고|먹기|여기서|eat/i.test(e.t) : /포장|가져|가지고|take/i.test(e.t));
    case 'menu': {
      const added = (state.history || []).filter((h) => h.type === 'option' && (h.action === 'press' || h.action === 'stuck') && /담기|이걸로/.test(h.target || '')).length;
      if (added >= Math.max(1, (goal?.items || []).length)) return by((e) => e.k === 'pay') ?? by((e) => e.k === 'next' && !/^[◀▶<>]$/.test(e.t));
      const hit = by((e) => e.k === 'item' && names.some((n) => norm(e.t).includes(norm(n)) || norm(n).includes(norm(e.t))));
      if (hit !== null) return hit;
      return by((e) => e.k === 'tab' && /커피|coffee|음료|식사|메인/i.test(e.t));
    }
    case 'option': {
      const t = goal?.items?.[0]?.temp;
      const ICE = /ice|아이스|차가/i, HOT = /hot|핫|따뜻/i;
      const chosen = els.find((e) => e.sel && (t === 'ice' ? ICE : HOT).test(e.t));
      if (t && !chosen) { const x = by((e) => (t === 'ice' ? ICE : HOT).test(e.t)); if (x !== null) return x; }
      return by((e) => e.k === 'yes' || e.k === 'next');
    }
    case 'upsell': case 'ad': return by((e) => ['no', 'close', 'skip'].includes(e.k));
    case 'point': return by((e) => ['skip', 'no'].includes(e.k));
    case 'cart': return by((e) => e.k === 'pay') ?? by((e) => e.k === 'next');
    case 'pay_method': return by((e) => (goal?.pay === 'phone' ? /페이|pay/i.test(e.t) : /카드|card/i.test(e.t)));
    case 'start': return by((e) => e.k === 'next' || /주문|시작|터치/.test(e.t));
    default: return by((e) => e.k === 'next' || e.k === 'yes');
  }
}

