// 위치·색 말하기 — 모델이 아니라 규칙으로 계산 (같은 입력 → 항상 같은 말)
// 좌표계: 사진 기준 0~1000 정규화 [x1, y1, x2, y2]

export function clampBox(b) {
  if (!Array.isArray(b) || b.length !== 4) return null;
  let [x1, y1, x2, y2] = b.map((v) => Math.max(0, Math.min(1000, Number(v) || 0)));
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];
  if (x2 - x1 < 3 || y2 - y1 < 3) return null;
  return [x1, y1, x2, y2];
}

/** 화면(키오스크 디스플레이) 안에서의 상대 위치 0~1 */
export function relCenter(box, screen) {
  const s = screen || [0, 0, 1000, 1000];
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  const w = Math.max(1, s[2] - s[0]), h = Math.max(1, s[3] - s[1]);
  return { x: Math.max(0, Math.min(1, (cx - s[0]) / w)), y: Math.max(0, Math.min(1, (cy - s[1]) / h)) };
}

/** 9칸 위치 이름 */
export function gridName(box, screen) {
  const { x, y } = relCenter(box, screen);
  const col = x < 0.36 ? 0 : x > 0.64 ? 2 : 1;
  const row = y < 0.33 ? 0 : y > 0.67 ? 2 : 1;
  const H = ['왼쪽', '가운데', '오른쪽'], V = ['위', '가운데', '아래'];
  if (row === 1 && col === 1) return { name: '한가운데', row, col };
  if (row === 1) return { name: `${H[col]} 가운데`, row, col };
  if (col === 1) return { name: `가운데 ${V[row]}`, row, col };
  return { name: `${H[col]} ${V[row]}`, row, col };
}

/** 같은 칸(9칸)에 같은 종류가 2개 이상일 때만 "위에서 N번째" — 진짜 헷갈릴 때만 말한다 */
export function ordinalInCell(target, others, screen) {
  const g = gridName(target.box, screen).name;
  const same = others.filter((o) => o.box && gridName(o.box, screen).name === g);
  if (!same.some((o) => o.id === target.id)) same.push(target);
  if (same.length < 2) return null;
  const rows = same.slice().sort((a, b) => a.box[1] - b.box[1]);
  // 같은 줄(세로 겹침)에 있으면 왼쪽/오른쪽으로
  const rowMates = same.filter((o) => overlap1d(o.box[1], o.box[3], target.box[1], target.box[3]) > 0.5 * (target.box[3] - target.box[1]));
  if (rowMates.length === same.length) {
    const xs = rowMates.sort((a, b) => a.box[0] - b.box[0]);
    const i = xs.findIndex((o) => o.id === target.id) + 1;
    return `왼쪽에서 ${KOR_ORD[i] || i + '번째'}`;
  }
  const i = rows.findIndex((o) => o.id === target.id) + 1;
  return `위에서 ${KOR_ORD[i] || i + '번째'}`;
}

/** (예전 방식) 같은 열에 3개 이상이면 "위에서 N번째" */
export function ordinalInColumn(target, others) {
  const tx1 = target.box[0], tx2 = target.box[2];
  const col = others.filter((o) => o.box && overlap1d(tx1, tx2, o.box[0], o.box[2]) > 0.5 * Math.min(tx2 - tx1, o.box[2] - o.box[0]));
  if (col.length < 3) return null;
  col.sort((a, b) => a.box[1] - b.box[1]);
  const idx = col.findIndex((o) => o.id === target.id);
  if (idx < 0) return null;
  const n = idx + 1;
  if (n === col.length && n > 3) return '맨 아래';
  return `위에서 ${KOR_ORD[n] || n + '번째'}`;
}
const KOR_ORD = { 1: '첫 번째', 2: '두 번째', 3: '세 번째', 4: '네 번째', 5: '다섯 번째', 6: '여섯 번째', 7: '일곱 번째', 8: '여덟 번째' };

function overlap1d(a1, a2, b1, b2) { return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)); }

// ---------- 색 ----------
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

/** RGB → 한국어 색 이름 (관형형: '노란', '초록색') */
export function colorName(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (v < 0.22) return '검은';
  if (s < 0.18) return v > 0.82 ? '흰' : '회색';
  if (h < 15 || h >= 340) return v < 0.45 ? '갈색' : '빨간';
  if (h < 40) return v < 0.62 ? '갈색' : '주황색';
  if (h < 68) return v < 0.5 ? '갈색' : '노란';
  if (h < 165) return '초록색';
  if (h < 200) return '하늘색';
  if (h < 255) return '파란';
  if (h < 290) return '보라색';
  return '분홍색';
}

/** CSS 색 문자열(#rrggbb / rgb()) → 이름 */
export function cssColorName(css) {
  if (!css) return null;
  let m = String(css).match(/^#?([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return colorName(n >> 16, (n >> 8) & 255, n & 255); }
  m = String(css).match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i);
  if (m) { if (m[4] !== undefined && Number(m[4]) < 0.5) return null; return colorName(+m[1], +m[2], +m[3]); }
  return null;
}

/**
 * 디코드된 이미지에서 박스 안 대표 색 이름.
 * img: { width, height, data(RGBA) }. 글자 픽셀 영향을 줄이려고 색 이름별 최빈값.
 */
export function boxColor(img, box) {
  if (!img || !box) return null;
  const W = img.width, H = img.height;
  const shrink = 0.12;
  const bw = box[2] - box[0], bh = box[3] - box[1];
  const x1 = Math.floor(((box[0] + bw * shrink) / 1000) * W), x2 = Math.ceil(((box[2] - bw * shrink) / 1000) * W);
  const y1 = Math.floor(((box[1] + bh * shrink) / 1000) * H), y2 = Math.ceil(((box[3] - bh * shrink) / 1000) * H);
  const counts = new Map();
  const step = Math.max(1, Math.floor(Math.sqrt(((x2 - x1) * (y2 - y1)) / 400)));
  let total = 0;
  for (let y = Math.max(0, y1); y < Math.min(H, y2); y += step) {
    for (let x = Math.max(0, x1); x < Math.min(W, x2); x += step) {
      const i = (y * W + x) * 4;
      const n = colorName(img.data[i], img.data[i + 1], img.data[i + 2]);
      counts.set(n, (counts.get(n) || 0) + 1); total++;
    }
  }
  if (!total) return null;
  const [name, c] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { name, share: c / total };
}

/** 위치 문장 조각: "화면 오른쪽 위에 노란 네모가 있어요." */
export function describePlace({ target, others = [], screen, color, bgColor }) {
  const g = gridName(target.box, screen);
  const ord = ordinalInCell(target, others, screen);
  const where = ord ? `화면 ${g.name}, ${ord}` : `화면 ${g.name}`;
  const showColor = color && color !== bgColor && color !== '회색';
  const thing = showColor ? `${color} 네모` : '네모';
  return { where, thing, grid: g, ordinal: ord, sentence: `${where}에 ${thing}가 있어요.` };
}
