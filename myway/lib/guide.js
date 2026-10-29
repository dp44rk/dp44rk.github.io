// 규칙 플래너 + 말 만들기
// 모델은 "무엇이 보이는지"와 "무엇을 누를지 후보"만 준다. 안전장치와 말투는 여기서 결정한다.
import { describePlace, boxColor, cssColorName } from './layout.js';
import { check, simplify, glossFor, hardWords, limitsFor, stats, josa } from './plain.js';

const TYPE_SAY = {
  start: '주문을 시작하는 화면이에요.',
  dine: '먹을 곳을 고르는 화면이에요.',
  menu: '메뉴를 고르는 화면이에요.',
  option: '맛과 크기를 고르는 화면이에요.',
  upsell: '더 사라는 권유예요. 안 사도 돼요.',
  cart: '고른 것을 확인하는 화면이에요.',
  point: '점수 모으기 화면이에요. 안 해도 돼요.',
  pay_method: '돈 낼 방법을 고르는 화면이에요.',
  pay_card: '카드를 넣는 화면이에요.',
  done: '주문이 끝났어요.',
  ad: '광고 화면이에요.',
  other: '',
};

const RETAKE = {
  far: '조금 더 가까이 가서 찍어 주세요.',
  blur: '사진이 흔들렸어요. 폰을 꼭 잡고 다시 찍어 주세요.',
  dark: '너무 어두워요. 화면 쪽으로 다시 찍어 주세요.',
  glare: '빛이 비쳐서 안 보여요. 폰을 조금 기울여 주세요.',
  partial: '화면이 잘렸어요. 화면 전체가 나오게 찍어 주세요.',
  nokiosk: '주문 화면이 안 보여요. 화면 쪽으로 폰을 들어 주세요.',
};

export function signature(screen) {
  // 선택 상태·합계까지 넣어야 "골랐는데 그대로"를 막힘으로 오해하지 않는다
  return screen.type + '|' + (screen.total ?? '') + '|' + screen.els.map((e) => e.t + (e.sel ? '*' : '')).sort().join(',');
}

const num = new Intl.NumberFormat('ko-KR');
export function won(n) {
  if (!Number.isFinite(n)) return null;
  // "4천5백 원" 처럼 듣기 쉬운 꼴
  const man = Math.floor(n / 10000), cheon = Math.floor((n % 10000) / 1000), baek = Math.floor((n % 1000) / 100), rest = n % 100;
  if (rest) return `${num.format(n)}원`;
  let s = '';
  if (man) s += `${man}만`;
  if (cheon) s += `${cheon === 1 && !man ? '천' : cheon + '천'}`;
  if (baek) s += `${baek === 1 ? '백' : baek + '백'}`;
  return (s || '0') + ' 원';
}

// 여러 개면 글자가 있고 큰 버튼을 고른다 ('✕'보다 '닫기')
function find(screen, kinds) {
  const c = screen.els.filter((e) => kinds.includes(e.k));
  const area = (e) => (e.box[2] - e.box[0]) * (e.box[3] - e.box[1]) * (isSymbol(e.t) ? 0.2 : 1);
  return c.sort((a, b) => area(b) - area(a))[0];
}
export function isSymbol(t) { return /^[\s✕×xX✖︎<>◀▶←→+−\-]+$/.test(String(t || '')); }
const SYMBOL_NAME = { '✕': '엑스', '×': '엑스', x: '엑스', X: '엑스', '✖': '엑스', '◀': '왼쪽 화살표', '<': '왼쪽 화살표', '←': '왼쪽 화살표', '▶': '오른쪽 화살표', '>': '오른쪽 화살표', '→': '오른쪽 화살표', '+': '더하기', '−': '빼기', '-': '빼기' };

/**
 * plan(screen, state, profile) → { action, target, reason }
 * action: retake | press | confirm_pay | done | unsure | help | stuck
 */
export function plan(screen, state = {}, profile = {}) {
  if (!screen.kiosk) return { action: 'retake', why: 'nokiosk' };
  if (screen.quality !== 'ok' && !screen.els.length) return { action: 'retake', why: screen.quality };

  const sig = signature(screen);
  const sameAsBefore = state.lastSig && state.lastSig === sig && state.lastAction === 'press';

  if (screen.type === 'done') return { action: 'done' };

  let target = screen.els.find((e) => e.id === screen.pick) || null;

  // 권유·광고: 목표에 묶음이 없으면 거절
  const goalWantsSet = JSON.stringify(state.goal || {}).match(/세트|묶음|set/i);
  if ((screen.type === 'upsell' || screen.type === 'ad') && !goalWantsSet) {
    target = find(screen, ['no', 'close', 'skip']) || target;
  }
  // 적립: 프로필이 건너뛰기면 거절
  if (screen.type === 'point' && profile.skipPoints !== false) {
    target = find(screen, ['skip', 'no', 'close']) || target;
  }
  // 결제: 확인 전에는 절대 결제 버튼을 안내하지 않음
  // 돈이 실제로 나가는 곳(결제 수단·카드 넣기) 전에 반드시 확인
  const isPay = screen.type === 'pay_method' || screen.type === 'pay_card' || (screen.type === 'cart' && target?.k === 'pay');
  if (isPay && !state.payConfirmed) return { action: 'confirm_pay', target, sig };
  if (screen.type === 'pay_card') return { action: 'insert_card', sig };

  if (!target || screen.conf < 0.35) {
    const unsure = (state.unsure || 0) + 1;
    return { action: unsure >= 3 ? 'help' : 'unsure', sig, unsure };
  }
  if (sameAsBefore) {
    const stuck = (state.stuck || 0) + 1;
    if (stuck >= 3) return { action: 'help', sig, target };
    return { action: 'stuck', target, sig, stuck };
  }
  return { action: 'press', target, sig };
}

/** 상황 문장: 모델 say → 사전 치환 → 검사 → 실패 시 템플릿 */
export function situationSentence(screen, limits) {
  const tmpl = TYPE_SAY[screen.type] || '';
  let s = (screen.say || '').trim();
  if (!s) return { text: tmpl, source: 'template' };
  // 모델이 어려운 말을 썼으면 기계 치환 대신 템플릿 (치환하면 문법이 깨지기 쉬움)
  if (hardWords(s).length) return { text: tmpl, source: 'template', rejected: s, problems: ['어려운 말: ' + hardWords(s).join(', ')] };
  if (!/[.?!]$/.test(s)) s += '.';
  const c = check(s, { ...limits, maxSentences: 1, maxActions: 0 });
  if (c.ok) return { text: s, source: 'model' };
  return { text: tmpl, source: 'template', rejected: s, problems: c.problems };
}

/**
 * speak({ plan, screen, img, profile, state }) → { utterance, display, target, check }
 * img: 디코드된 RGBA (카메라 모드) 또는 null (연동 모드 — 요소의 c(css 색) 사용)
 */
export function speak({ plan: p, screen, img, profile = {}, state = {} }) {
  const limits = limitsFor(profile);
  const detail = profile.experience === 'often' ? 'short' : profile.experience === 'first' ? 'full' : 'mid';
  const out = { action: p.action, lines: [], display: {}, target: null };

  if (p.action === 'retake') {
    out.lines.push(RETAKE[p.why] || RETAKE.partial);
    out.display = { big: '다시 찍어 주세요', sub: RETAKE[p.why] || '' };
    return finish(out, limits);
  }
  if (p.action === 'done') {
    out.lines.push('주문이 끝났어요.');
    if (screen.no) out.lines.push(`주문 번호는 ${screen.no}번이에요.`);
    out.lines.push('번호를 부르면 받으러 가세요.');
    out.display = { big: '주문 끝!', sub: screen.no ? `주문 번호 ${screen.no}번` : '' };
    return finish(out, { ...limits, maxActions: 1, maxSentences: 4 });
  }
  if (p.action === 'insert_card') {
    out.lines.push('카드를 넣는 화면이에요.');
    out.lines.push('화면 아래 구멍에 카드를 꽂으세요.');
    out.lines.push('끝날 때까지 그대로 두세요.');
    out.display = { big: '카드를 꽂으세요', sub: '화면 아래 구멍 · 끝날 때까지 그대로' };
    return finish(out, { ...limits, maxSentences: 4 });
  }
  if (p.action === 'unsure') {
    out.lines.push('잘 모르겠어요.');
    out.lines.push('화면 전체가 나오게 다시 찍어 주세요.');
    out.display = { big: '다시 찍어 주세요', sub: '화면 전체가 나오게' };
    return finish(out, limits);
  }
  if (p.action === 'help') {
    out.lines.push('제가 잘 못 찾겠어요.');
    out.lines.push('폰 화면을 직원에게 보여 주세요.');
    out.display = { big: '직원에게 보여 주세요', sub: '', help: true };
    return finish(out, limits);
  }

  const t = p.target;
  const others = screen.els.filter((e) => ['btn', 'item', 'tab', 'yes', 'no', 'skip', 'next', 'pay'].includes(e.k));
  // 색: 연동 모드는 CSS 색, 카메라 모드는 픽셀
  let color = null, bgColor = null;
  if (t) {
    if (t.c) color = cssColorName(t.c);
    else if (img) { const bc = boxColor(img, t.box); if (bc && bc.share > 0.35) color = bc.name; }
    if (screen.bg) bgColor = cssColorName(screen.bg);
    else if (img) bgColor = boxColor(img, screen.screen)?.name || null;
  }

  if (p.action === 'confirm_pay') {
    out.lines.push('돈을 내는 화면이에요.');
    const w = won(screen.total);
    if (w) out.lines.push(`모두 ${w}이에요.`);
    out.lines.push("맞으면 '네'라고 말하세요.");
    out.display = { big: w ? `${w} 맞아요?` : '돈 낼까요?', sub: '맞으면 네', confirm: true };
    out.target = t ? pubTarget(t) : null;
    return finish(out, { ...limits, maxSentences: 4 });
  }

  const symbol = isSymbol(t.t);
  const label = symbol ? SYMBOL_NAME[t.t.trim()] || '표시' : t.r || t.t;
  const english = !symbol && /[A-Za-z]/.test(t.t) && !/[가-힣]/.test(t.t);
  const short = label.split(/\s+/).length <= 3;
  const gloss = !short || symbol ? null : glossFor(t.t) || glossFor(t.r) || cleanMeaning(screen.mean, label);
  const place = describePlace({ target: t, others: others.filter((o) => o.k === t.k), screen: screen.screen, color, bgColor });

  if (p.action === 'stuck') {
    out.lines.push('화면이 그대로예요.');
    out.lines.push(`'${label}'${josa(label, '을/를')} 조금 더 꾹 누르세요.`);
  } else if (detail === 'short') {
    out.lines.push(`${place.where}, '${label}'${josa(label, '을/를')} 누르세요.`);
  } else {
    if (detail === 'full' || ['upsell', 'point', 'ad', 'pay_method'].includes(screen.type)) {
      const sit = situationSentence(screen, limits);
      if (sit.text) out.lines.push(sit.text);
      out.situation = sit;
    }
    if (symbol) out.lines.push(`${place.where}에 '${label}' 표시가 있어요.`);
    else {
      out.lines.push(place.sentence);
      out.lines.push(`${english ? '영어로 ' : ''}'${label}'${josa(label, '이라고/라고')} 써 있어요.`);
    }
    if (gloss && detail === 'full') out.lines.push(`${gloss}${josa(gloss, '이라는/라는')} 뜻이에요.`);
    out.lines.push('그걸 누르세요.');
  }
  out.target = pubTarget(t);
  out.place = { grid: place.grid.name, ordinal: place.ordinal, color };
  out.display = { big: `'${label}' 누르기`, sub: `${place.where}${color ? ' · ' + color + ' 네모' : ''}`, gloss };
  return finish(out, { ...limits, maxSentences: 6 });
}

function cleanMeaning(mean, label) {
  if (!mean) return null;
  const m = simplify(String(mean)).replace(/[.?!]+$/, '').replace(/(이에요|예요|입니다|라는 뜻)$/, '').trim();
  if (!m || m === label || hardWords(m).length || m.split(/\s+/).length > 5) return null;
  return m;
}

function pubTarget(t) { return { id: t.id, t: t.t, r: t.r, k: t.k, box: t.box }; }

function finish(out, limits) {
  out.utterance = out.lines.join(' ');
  // 위치 문장은 규칙 생성이라 어절 수 예외를 둔다. 할 일 개수·어려운 말은 전체에 대해 검사.
  out.check = check(out.utterance, { maxWords: Math.max(limits.maxWords, 9), maxSentences: limits.maxSentences, maxActions: 1 });
  out.stats = stats(out.utterance);
  return out;
}
