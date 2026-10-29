// 화면 변환: 키오스크 화면 구조 → "내 방식" 화면 설계(JSON)
// - AI가 쉬운 말 라벨·묶음·순서·짧은 설명을 정하고, 검증기가 확인·보정한다.
// - AI가 없거나 실패하면 규칙 변환을 쓴다. (브라우저·서버 공용, 의존성 없음)
// 원칙 (원제안자 답변): 한 화면에 다 못 담으면 스크롤, 그래도 어려우면 글씨 > 버튼 > 자세한 설명 순으로 우선.
//                      버튼·터치 영역 확대. 변환 후에도 원래 버튼과 연결 유지(눌러도 원래 흐름 그대로).
import { simplify, glossFor, hardWords, check } from './plain.js';

const PRIMARY = ['yes', 'next', 'pay'];
const DECLINE = ['no', 'skip', 'close', 'cancel'];
const MINOR = ['back', 'staff'];
const TYPE_TITLE = {
  start: '주문을 시작해요', dine: '어디서 드세요?', menu: '메뉴를 골라요', option: '맛과 크기를 골라요',
  upsell: '더 사라는 권유예요', cart: '고른 것을 확인해요', point: '점수 모으기 (안 해도 돼요)',
  pay_method: '돈 낼 방법을 골라요', pay_card: '카드를 꽂아요', done: '주문이 끝났어요', ad: '광고예요', other: '',
};

/** 버튼 글자 → 쉬운 말 라벨 (사전) */
export function plainLabel(t) {
  const s = String(t || '').trim();
  if (/^[◀<←]$/.test(s)) return '앞 쪽';
  if (/^[▶>→]$/.test(s)) return '다음 쪽';
  if (/^[✕×xX]$/.test(s)) return '닫기';
  if (s === '+') return '하나 더'; if (s === '−' || s === '-') return '하나 빼기';
  const g = glossFor(s);
  if (g && s.split(/\s+/).length <= 3) return g;
  return simplify(s);
}

function rows(els) {
  // 세로로 겹치는 버튼끼리 한 줄
  const sorted = els.slice().sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
  const out = [];
  for (const e of sorted) {
    const r = out.find((row) => row.some((o) => Math.min(o.box[3], e.box[3]) - Math.max(o.box[1], e.box[1]) > 0.5 * Math.min(o.box[3] - o.box[1], e.box[3] - e.box[1])));
    if (r) r.push(e); else out.push([e]);
  }
  out.forEach((r) => r.sort((a, b) => a.box[0] - b.box[0]));
  return out;
}

/** 규칙 변환 */
export function ruleConvert(screen) {
  const els = screen.els || [];
  const sections = [];
  const used = new Set();
  const add = (title, list, role) => { const items = list.filter((e) => !used.has(e.id)); if (!items.length) return; items.forEach((e) => used.add(e.id)); sections.push({ title, role, ids: items.map((e) => e.id) }); };

  add('종류', els.filter((e) => e.k === 'tab'), 'tabs');
  add('메뉴', els.filter((e) => e.k === 'item'), 'items');
  // 같은 묶음 제목(g)이 있는 버튼끼리, 없으면 줄 단위
  const plainBtns = els.filter((e) => e.k === 'btn' && !used.has(e.id));
  const byGroup = new Map();
  for (const e of plainBtns) { const key = e.g || ''; if (!byGroup.has(key)) byGroup.set(key, []); byGroup.get(key).push(e); }
  for (const [g, list] of byGroup) {
    if (g) add(plainLabel(g), list, 'choice');
    else for (const r of rows(list)) add('', r, 'choice');
  }
  add('개수', els.filter((e) => e.k === 'plus' || e.k === 'minus'), 'qty');
  add('', els.filter((e) => e.k === 'next' && /^[◀▶<>]$/.test(e.t.trim()) || e.k === 'back' && /^[◀<]$/.test(e.t.trim())), 'pager');
  add('', els.filter((e) => PRIMARY.includes(e.k) || DECLINE.includes(e.k)).sort((a, b) => (PRIMARY.includes(a.k) ? -1 : 1) - (PRIMARY.includes(b.k) ? -1 : 1)), 'actions');
  add('그 밖', els.filter((e) => !used.has(e.id)), 'minor');

  const labels = {}, hints = {};
  for (const e of els) {
    labels[e.id] = e.k === 'item' ? e.t : plainLabel(e.t); // 메뉴 이름은 그대로
    if (e.p && e.k === 'item') hints[e.id] = `${Number(e.p).toLocaleString('ko-KR')}원`;
  }
  return { v: 1, source: 'rule', title: TYPE_TITLE[screen.type] || plainLabel(screen.title || ''), sections, labels, hints, primary: (els.find((e) => PRIMARY.includes(e.k)) || {}).id ?? null };
}

/**
 * 검증·보정: 모든 버튼이 정확히 한 번 나오는지, 없는 버튼을 지어내지 않았는지, 라벨이 쉬운 말인지.
 * 반환: { plan(보정됨), report: { ok, coverage, invented, duplicated, relabeled, problems[] } }
 */
export function validate(plan, screen) {
  const ids = new Set((screen.els || []).map((e) => e.id));
  const rule = ruleConvert(screen);
  const problems = [];
  const seen = new Set();
  let invented = 0, duplicated = 0, relabeled = 0;
  const sections = [];
  for (const s of Array.isArray(plan?.sections) ? plan.sections : []) {
    const keep = [];
    for (const raw of Array.isArray(s?.ids) ? s.ids : []) {
      const id = Number(raw);
      if (!ids.has(id)) { invented++; continue; }
      if (seen.has(id)) { duplicated++; continue; }
      seen.add(id); keep.push(id);
    }
    if (keep.length) sections.push({ title: cleanTitle(s.title), role: s.role || '', ids: keep });
  }
  const missing = [...ids].filter((id) => !seen.has(id));
  if (missing.length) { problems.push(`빠진 버튼 ${missing.length}개 → 규칙으로 채움`); sections.push({ title: '그 밖', role: 'minor', ids: missing }); }
  if (invented) problems.push(`없는 버튼 ${invented}개 제거`);
  if (duplicated) problems.push(`중복 ${duplicated}개 제거`);

  const labels = {}, hints = {};
  const kindOf = new Map((screen.els || []).map((e) => [e.id, e.k]));
  for (const id of ids) {
    let l = plan?.labels?.[id] ?? plan?.labels?.[String(id)];
    if (!okLabel(l, 4, kindOf.get(id))) { if (l !== undefined) relabeled++; l = rule.labels[id]; }
    labels[id] = l;
    const h = plan?.hints?.[id] ?? plan?.hints?.[String(id)];
    if (h && okHint(h)) hints[id] = h; else if (rule.hints[id]) hints[id] = rule.hints[id];
  }
  if (relabeled) problems.push(`어려운·긴 라벨 ${relabeled}개 → 규칙 라벨`);
  const title = okLabel(plan?.title, 6) ? plan.title : rule.title;
  const coverage = ids.size ? (ids.size - missing.length) / ids.size : 1;
  return {
    plan: { v: 1, source: plan?.source || 'ai', title, sections, labels, hints, primary: rule.primary },
    report: { ok: !missing.length && !invented && !duplicated && !relabeled, coverage: +coverage.toFixed(3), invented, duplicated, relabeled, missing: missing.length, problems },
  };
}
function okLabel(l, maxWords = 4, kind) {
  if (typeof l !== 'string' || !l.trim()) return false;
  if (l.length > 24 || l.trim().split(/\s+/).length > maxWords) return false;
  if (kind === 'item') return true; // 메뉴 이름(카라멜 마끼아또 등)은 고유 이름이라 허용
  return hardWords(l.replace(/[\d,]+원/g, '')).length === 0;
}
function okHint(h) { return typeof h === 'string' && h.length <= 30 && check(h, { maxWords: 7, maxSentences: 1, maxActions: 1 }).ok; }
function cleanTitle(t) { const s = String(t || '').trim(); return okLabel(s, 5) ? s : s ? simplify(s).slice(0, 20) : ''; }

/** AI 변환 프롬프트 (서버에서 사용) */
export function convertPrompt(screen, profile = {}) {
  const els = (screen.els || []).map((e) => ({ id: e.id, t: e.t, k: e.k, g: e.g || undefined, p: e.p || undefined, row: Math.round(((e.box[1] + e.box[3]) / 2) / 50) }));
  const sys = `너는 키오스크 화면을 어르신이 쓰기 쉬운 화면으로 다시 설계한다. JSON만 출력한다.
형식: {"title":"화면 제목(쉬운 말, 5어절 이하)","sections":[{"title":"묶음 이름(없으면 빈 글자)","ids":[버튼 id들]}],"labels":{"id":"쉬운 말 라벨"},"hints":{"id":"짧은 설명(선택)"}}
규칙:
- 모든 버튼 id를 정확히 한 번씩 sections에 넣는다. 없는 id를 만들지 않는다.
- 순서: 사용자가 지금 고를 것 → 결정 버튼(담기·다음·결제) → 거절·취소 → 처음으로·직원 호출.
- 같은 질문의 선택지끼리 한 묶음(예: 온도: 따뜻한 것/차가운 것). 묶음 이름은 쉬운 말.
- labels: 외래어·전문어를 쉬운 우리말로, 4어절·24글자 이하. 메뉴 이름(아메리카노, 김치찌개)은 그대로 둔다. 가격은 붙이지 않는다.
  예: Take out→가지고 가기, Eat in→여기서 먹기, HOT→따뜻한 것, ICE→차가운 것, Regular→보통 크기, 결제하기→돈 내기, 적립 안 함→점수 안 모으기, 세트 변경→묶음으로 바꾸기.
- hints는 꼭 필요할 때만, 7어절 이하.`;
  const user = `화면 종류: ${screen.type}\n화면 제목: ${screen.title || ''}\n${profile.experience === 'first' ? '처음 쓰는 분: 설명을 조금 더.\n' : ''}버튼: ${JSON.stringify(els)}`;
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}
