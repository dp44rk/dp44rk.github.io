// 쉬운 말 규칙: 사전 치환 + 검사기 + 지표
// 근거: 국립국어원(2024) 고령층 키오스크 쉬운 언어 지침의 예시
//       (웰던→바싹 익히기, 명세표 인자→명세표 받기, 외래어 메뉴에 설명 덧붙이기)
// 원칙: 화면에 "쓰여 있는 글자"는 따옴표('…') 안에 그대로 두고 뜻을 덧붙인다.
//       사용자가 화면에서 그 글자를 찾아야 하기 때문.

/** 어려운 말 → 쉬운 말. 앞에 있을수록 우선. */
export const DICT = [
  // 자주 보는 키오스크 문구 (통째로)
  ['터치하여', '눌러서'], ['터치해서', '눌러서'], ['적립 안 함', '점수 안 모으기'], ['적립안함', '점수 안 모으기'],
  ['세트로 변경', '묶음으로 바꾸기'], ['세트 변경', '묶음으로 바꾸기'], ['단품 주문', '하나만 사기'], ['신용/체크카드', '카드'],
  ['영수증 출력', '영수증 받기'], ['출력 안 함', '영수증 안 받기'], ['직원 호출', '직원 부르기'],
  ['카드 결제', '카드로 내기'], ['카드결제', '카드로 내기'], ['모바일 페이', '폰으로 내기'], ['현금 결제', '현금으로 내기'], ['쿠폰/기프티콘', '할인권'],
  // 동사형 먼저 (문법이 깨지지 않게)
  ['선택해 주세요', '골라 주세요'], ['선택해주세요', '골라 주세요'], ['선택하세요', '고르세요'], ['선택하는', '고르는'], ['선택한', '고른'], ['선택해', '골라'],
  ['결제해 주세요', '돈을 내 주세요'], ['결제해주세요', '돈을 내 주세요'], ['결제하기', '돈 내기'], ['결제하는', '돈 내는'], ['결제할', '돈 낼'], ['결제해', '돈 내'],
  ['적립하시겠습니까', '점수를 모을까요'], ['적립하기', '점수 모으기'], ['적립하는', '점수 모으는'],
  ['터치하세요', '누르세요'], ['터치해 주세요', '눌러 주세요'], ['클릭하세요', '누르세요'],
  ['non-coffee', '커피 아닌 음료'], ['coffee', '커피'], ['tea', '차'], ['dessert', '후식'], ['beverage', '마실 것'],
  ['+1샷', '커피 진하게'], ['1샷', '커피 진하게'], ['샷', '커피 진하기'],
  ['테이크아웃', '가지고 가기'], ['테이크 아웃', '가지고 가기'], ['take out', '가지고 가기'], ['takeout', '가지고 가기'], ['to go', '가지고 가기'],
  ['eat in', '여기서 먹기'], ['dine in', '여기서 먹기'], ['매장 식사', '여기서 먹기'], ['매장식사', '여기서 먹기'],
  ['아이스', '차가운 것'], ['iced', '차가운 것'], ['ice', '차가운 것'], ['hot', '따뜻한 것'], ['핫', '따뜻한 것'],
  ['레귤러', '보통 크기'], ['regular', '보통 크기'], ['라지', '큰 크기'], ['large', '큰 크기'], ['스몰', '작은 크기'],
  ['톨', '작은 컵'], ['그란데', '중간 컵'], ['벤티', '큰 컵'], ['사이즈 업', '더 큰 컵'], ['사이즈업', '더 큰 컵'], ['사이즈', '크기'],
  ['샷 추가', '커피 더 진하게'], ['샷추가', '커피 더 진하게'], ['디카페인', '카페인 뺀 것'], ['시럽', '단맛 물'],
  ['휘핑크림', '생크림'], ['휘핑', '생크림'], ['토핑', '위에 얹는 것'], ['옵션', '고르는 것'],
  ['업그레이드', '바꾸기'], ['세트', '묶음'], ['단품', '하나만'], ['사이드', '곁들이는 음식'],
  ['디저트', '후식'], ['베이커리', '빵'], ['드링크', '마실 것'], ['베버리지', '마실 것'],
  ['장바구니', '고른 것 목록'], ['카트', '고른 것 목록'],
  ['간편결제', '폰으로 돈 내기'], ['페이', '폰으로 돈 내기'], ['결제', '돈 내기'], ['계산', '돈 내기'],
  ['포인트 적립', '점수 모으기'], ['적립', '점수 모으기'], ['포인트', '점수'], ['멤버십', '회원'], ['쿠폰', '할인권'],
  ['바코드', '줄무늬 표시'], ['QR', '네모 무늬 표시'],
  ['명세표 인자', '명세표 받기'], ['인자', '뽑기'], ['웰던', '바싹 익히기'], ['미디움', '적당히 익히기'], ['레어', '살짝 익히기'],
  ['키오스크', '주문 기계'], ['터치', '누르기'], ['클릭', '누르기'], ['스크롤', '밀어 넘기기'], ['팝업', '작은 창'],
  ['수량', '개수'], ['선택', '고르기'], ['품절', '다 팔림'], ['프로모션', '할인 행사'], ['이벤트', '행사'],
];

// 검사 때 따옴표 밖에 나오면 안 되는 말 (사전 왼쪽 + 몇 가지)
const BANNED = DICT.map(([k]) => k).filter((k) => !['선택', '수량', '계산', 'QR', '인자', 'hot', 'ice', '핫', '톨', '세트', '카트'].includes(k))
  .concat(['스캔', '인증', '프로세스', '인터페이스', '메뉴판']);

// 한국어 단어 경계 근사: 영문은 단어경계, 한글은 앞이 한글이 아닐 때만
function makeRe(word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (/^[a-z ]+$/i.test(word)) return new RegExp(`\\b${esc}\\b`, 'gi');
  return new RegExp(`(^|[^가-힣])${esc}`, 'g');
}
const BANNED_RE = BANNED.map((w) => [w, makeRe(w)]);

export const ACTION_RE = /(누르세요|고르세요|넣으세요|꽂으세요|대세요|찍으세요|말하세요|말씀하세요|받으세요|빼세요|기다리세요|닫으세요)/g;

/** 따옴표 안('…', "…", ‘…’, “…”)을 지운 문자열 */
export function outsideQuotes(s) {
  return String(s).replace(/'[^']*'|"[^"]*"|‘[^’]*’|“[^”]*”/g, ' ');
}

export function splitSentences(s) {
  return String(s)
    .split(/(?<=[.?!。])\s+|(?<=요)\s+(?=[가-힣'"‘“])/)
    .map((x) => x.trim()).filter(Boolean);
}

export function wordCount(sentence) {
  return String(sentence).replace(/[.?!,]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
}

/** 따옴표 밖 어려운 말을 쉬운 말로 바꾼다 */
export function simplify(text) {
  // 따옴표 구간은 보호
  const parts = String(text).split(/('[^']*'|"[^"]*"|‘[^’]*’|“[^”]*”)/);
  return parts.map((p, i) => {
    if (i % 2 === 1) return p;
    let out = p;
    for (const [k, v] of DICT) {
      const re = makeRe(k);
      out = out.replace(re, (m, pre) => (typeof pre === 'string' && !/^[a-z ]+$/i.test(k) ? pre + v : v));
    }
    return out;
  }).join('');
}

/** 화면 글자에 붙일 뜻 (사전에 있으면) — 예: 'ICE' → '차가운 것' */
export function glossFor(label) {
  const l = String(label || '').trim().toLowerCase();
  if (!l) return null;
  for (const [k, v] of DICT) if (l === k.toLowerCase()) return v;
  const s = simplify(label);
  return s !== label ? s : null;
}

/**
 * 검사기. limits: { maxWords, maxSentences, maxActions }
 * 반환: { ok, problems[], stats }
 */
export function check(text, limits = {}) {
  const { maxWords = 8, maxSentences = 4, maxActions = 1 } = limits;
  const problems = [];
  const sents = splitSentences(text);
  if (sents.length > maxSentences) problems.push(`문장이 ${sents.length}개 (최대 ${maxSentences})`);
  let actions = 0;
  const words = [];
  for (const s of sents) {
    const outside = outsideQuotes(s);
    const wc = wordCount(s);
    words.push(wc);
    if (wc > maxWords) problems.push(`"${s}" — ${wc}어절 (최대 ${maxWords})`);
    const a = (outside.match(ACTION_RE) || []).length;
    if (a > 1) problems.push(`"${s}" — 할 일이 ${a}개`);
    actions += a;
  }
  if (actions > maxActions) problems.push(`한 번에 할 일이 ${actions}개 (최대 ${maxActions})`);
  const hard = hardWords(text);
  if (hard.length) problems.push(`어려운 말: ${hard.join(', ')}`);
  return { ok: problems.length === 0, problems, stats: stats(text) };
}

export function hardWords(text) {
  const outside = outsideQuotes(text);
  const found = new Set();
  for (const [w, re] of BANNED_RE) { re.lastIndex = 0; if (re.test(outside)) found.add(w); }
  // 따옴표 밖 영어 단어도 어려운 말로 본다 (숫자·단위 제외)
  for (const m of outside.matchAll(/[A-Za-z]{2,}/g)) found.add(m[0]);
  return [...found];
}

/** 보고서용 지표 */
export function stats(text) {
  const sents = splitSentences(text);
  const wcs = sents.map(wordCount);
  const totalWords = wcs.reduce((a, b) => a + b, 0);
  const outside = outsideQuotes(text);
  const hard = hardWords(text).length;
  const acts = sents.map((s) => (outsideQuotes(s).match(ACTION_RE) || []).length);
  return {
    sentences: sents.length,
    avgWords: sents.length ? +(totalWords / sents.length).toFixed(2) : 0,
    maxWords: wcs.length ? Math.max(...wcs) : 0,
    hardWords: hard,
    hardPer100Words: totalWords ? +((hard / totalWords) * 100).toFixed(2) : 0,
    actionsTotal: acts.reduce((a, b) => a + b, 0),
    maxActionsPerSentence: acts.length ? Math.max(...acts) : 0,
    chars: outside.replace(/\s/g, '').length,
  };
}

/** 프로필 → 검사 한도 */
export function limitsFor(profile = {}) {
  const exp = profile.experience || 'some';
  return {
    maxWords: exp === 'often' ? 12 : exp === 'first' ? 7 : 9,
    maxSentences: profile.detail === 'short' || exp === 'often' ? 2 : 4,
    maxActions: 1,
  };
}

/** 받침 여부로 조사 고르기: josa('포장','을/를') → '포장을' */
export function hasBatchim(word) {
  const s = String(word).trim().replace(/['"’”)\]]+$/, '');
  const ch = s.charCodeAt(s.length - 1);
  if (ch >= 0xac00 && ch <= 0xd7a3) return (ch - 0xac00) % 28 !== 0;
  if (/[0-9]$/.test(s)) return /[013678]$/.test(s); // 영,일,삼,육,칠,팔 받침
  if (/[a-z]$/i.test(s)) return /[lmnrkpt]$/i.test(s);
  return false;
}
export function josa(word, pair) {
  const [a, b] = pair.split('/'); // a: 받침 있을 때, b: 없을 때
  return hasBatchim(word) ? a : b;
}
