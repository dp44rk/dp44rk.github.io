// 화면 구조 정리·검증 (브라우저·서버 공용, 의존성 없음)
import { clampBox } from './layout.js';

export const SCREEN_TYPES = ['start', 'dine', 'menu', 'option', 'upsell', 'cart', 'point', 'pay_method', 'pay_card', 'done', 'ad', 'other'];
export const ELEMENT_KINDS = ['btn', 'tab', 'item', 'close', 'yes', 'no', 'skip', 'next', 'back', 'pay', 'cancel', 'staff', 'plus', 'minus'];

/** 모델 출력 정리·검증 */
export function normalizeScreen(raw) {
  const s = {
    kiosk: raw?.kiosk !== false,
    quality: ['ok', 'far', 'blur', 'dark', 'glare', 'partial'].includes(raw?.quality) ? raw.quality : 'ok',
    screen: clampBox(raw?.screen) || [0, 0, 1000, 1000],
    type: SCREEN_TYPES.includes(raw?.type) ? raw.type : 'other',
    title: String(raw?.title || '').slice(0, 80),
    els: [],
    total: Number.isFinite(+raw?.total) && raw?.total !== null ? +raw.total : null,
    no: raw?.no ?? null,
    pick: raw?.pick ?? null,
    why: String(raw?.why || '').slice(0, 120),
    say: String(raw?.say || '').slice(0, 120),
    mean: raw?.mean ? String(raw.mean).slice(0, 80) : null,
    conf: Math.max(0, Math.min(1, Number(raw?.conf ?? 0.5))),
  };
  const seen = new Set();
  for (const e of Array.isArray(raw?.els) ? raw.els.slice(0, 40) : []) {
    const box = clampBox(e?.b);
    const id = Number(e?.id);
    if (!box || !Number.isFinite(id) || seen.has(id)) continue;
    seen.add(id);
    s.els.push({
      id,
      t: String(e.t ?? '').slice(0, 40),
      r: String(e.r ?? e.t ?? '').slice(0, 40),
      k: ELEMENT_KINDS.includes(e.k) ? e.k : 'btn',
      box,
      p: Number.isFinite(+e.p) && e.p !== null ? +e.p : null,
      c: e.c || null,
      sel: !!e.sel,
    });
  }
  if (s.pick !== null && !s.els.some((e) => e.id === Number(s.pick))) s.pick = null;
  else if (s.pick !== null) s.pick = Number(s.pick);
  return s;
}

