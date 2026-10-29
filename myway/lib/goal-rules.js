// 목표 규칙 해석·되묻기 문장 (브라우저·서버 공용)
const NUM = { 하나: 1, 한: 1, 둘: 2, 두: 2, 셋: 3, 세: 3, 넷: 4, 네: 4, 다섯: 5 };
const KNUM = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];

/** API 없이 쓰는 간이 해석 (MOCK / 실패 시) */
export function parseGoalRule(text) {
  const t = String(text);
  const place = /가져|포장|테이크|들고/.test(t) ? 'takeout' : /먹고|매장|여기서/.test(t) ? 'eatin' : null;
  const temp = /아이스|차가운|시원|찬 /.test(t) ? 'ice' : /따뜻|뜨거운|핫/.test(t) ? 'hot' : null;
  let qty = 1;
  const m = t.match(/(하나|한|둘|두|셋|세|넷|네|다섯|\d+)\s*(잔|개|그릇|인분)?/);
  if (m) qty = NUM[m[1]] || Number(m[1]) || 1;
  const menu = ['아메리카노', '카페라떼', '라떼', '바닐라라떼', '카푸치노', '아이스티', '레몬에이드', '녹차', '초코', '김치찌개', '된장찌개', '비빔밥', '제육', '불고기', '돈가스', '냉면', '칼국수', '국밥', '떡볶이', '김밥', '라면', '치즈버거', '불고기버거', '감자튀김', '콜라'];
  const name = menu.find((x) => t.includes(x)) || t.replace(/(하나|한\s?잔|가져갈.*|먹고.*|주세요|줘|할래|거야).*/g, '').replace(/아이스|따뜻한|차가운/g, '').trim() || null;
  const drink = /커피|라떼|아메리카노|티|에이드|차|초코|콜라|주스/.test(t);
  return { items: name ? [{ name, qty, unit: drink ? '잔' : '개', temp, size: null, extra: [] }] : [], place, pay: null, unclear: null };
}

export function confirmText(goal) {
  if (!goal?.items?.length) return '무엇을 주문할지 다시 말해 주세요.';
  const parts = goal.items.map((i) => {
    const temp = i.temp === 'ice' ? '차가운 ' : i.temp === 'hot' ? '따뜻한 ' : '';
    const q = KNUM[i.qty] || i.qty;
    return `${temp}${i.name} ${q} ${i.unit || '개'}`;
  });
  const place = goal.place === 'takeout' ? ', 가지고 가기' : goal.place === 'eatin' ? ', 여기서 먹기' : '';
  return `${parts.join(', ')}${place}. 맞아요?`;
}

