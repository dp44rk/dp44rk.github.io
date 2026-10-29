// 목업 키오스크 엔진 — 실제 매장 키오스크의 흐름을 흉내 낸다.
// 연동 모드: 화면 구조를 서버에 올리고(폰이 읽음), 폰이 보낸 "내 방식" 프로필로 화면을 바꾼다.
import { STORES, PLAIN } from './stores.js';
import { ruleConvert, validate } from '../lib/convert.js';

const READ = { 'Eat in': '이트 인', 'Take out': '테이크 아웃', HOT: '핫', ICE: '아이스', Regular: '레귤러', Large: '라지', COFFEE: '커피', 'NON-COFFEE': '논 커피', TEA: '티', DESSERT: '디저트', NEW: '뉴' };
const W = 1080, H = 1920;

const qs = new URLSearchParams(location.search);
const storeKey = document.documentElement.dataset.store || qs.get('store') || 'cafe';
const S = STORES[storeKey];
const KIOSK_ID = qs.get('id') || S.id;
const API = (qs.get('api') || '').replace(/\/$/, '');
const APP_URL = new URL(qs.get('app') || '../app/', location.href).href;
// hub=local: 서버 없이 같은 브라우저 안에서 폰 앱과 연결 (GitHub Pages 시연)
const LOCAL = qs.get('hub') === 'local';
const chan = LOCAL && 'BroadcastChannel' in window ? new BroadcastChannel('myway-hub') : null;
let localVersion = 0;

const st = {
  screen: 'start', tab: S.tabs[0].id, page: 0, modal: null, cart: [], dine: null,
  upsellShown: false, adShown: false, orderNo: null, payMethod: null,
  myway: null, idle: 120, phone: '',
};

const root = document.getElementById('kiosk');
const stage = document.getElementById('stage');
document.documentElement.style.setProperty('--brand', S.theme.brand);
document.documentElement.style.setProperty('--accent', S.theme.accent);
document.documentElement.style.setProperty('--kbg', S.theme.bg);

// ---------- 유틸 ----------
const won = (n) => n.toLocaleString('ko-KR') + '원';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = (t) => (st.myway?.plain && PLAIN[t]) || t; // 내 방식: 쉬운 말 라벨
const sub = (t) => (st.myway?.plain && PLAIN[t] ? `<small class="orig">${esc(t)}</small>` : '');
function btn(k, t, { cls = '', act = '', extra = '', sel = false, label } = {}) {
  const shown = label ?? L(t);
  return `<button class="${cls}${sel ? ' sel' : ''}" data-k="${k}" data-t="${esc(shown)}" data-r="${esc(READ[shown] || shown)}" data-act="${act}" ${sel ? 'data-sel="1"' : ''} ${extra}>${esc(shown)}${label ? '' : sub(t)}</button>`;
}
function perPage() { return st.myway?.simple ? 4 : 9; }
function total() { return st.cart.reduce((a, c) => a + c.price * c.qty, 0); }
function itemById(id) { return S.items.find((i) => i.id === id); }

// ---------- 화면 ----------
function header() {
  return `<header class="kh">
    <div class="brand">${esc(S.name)}<small>${esc(S.sub)}</small></div>
    <div class="kh-r">
      ${st.myway?.noTimer ? '' : `<span class="timer">남은 시간 <b>${st.idle}</b>초</span>`}
      ${btn('back', '처음으로', { cls: 'ghost', act: 'home' })}
      ${btn('staff', '직원 호출', { cls: 'ghost', act: 'staff' })}
    </div></header>`;
}

const SCREENS = {
  start() {
    return `<div class="start">
      <div class="banner"><div class="b-art"></div><h1>${esc(S.startBanner.title)}</h1><p>${esc(S.startBanner.sub)}</p></div>
      <div class="langs">${['한국어', 'English', '中文', '日本語'].map((l, i) => `<span class="${i ? '' : 'on'}">${l}</span>`).join('')}</div>
      ${btn('next', '화면을 터치하여 주문을 시작하세요', { cls: 'touch', act: 'start' })}
    </div>`;
  },
  dine() {
    return `${header()}<div class="dine"><h2>${esc(L('식사 장소를 선택해 주세요'))}</h2>
      <div class="dine-btns">
        ${btn('btn', 'Eat in', { cls: 'dine-b eat', act: 'dine:eatin' })}
        ${btn('btn', 'Take out', { cls: 'dine-b take', act: 'dine:takeout' })}
      </div>
      <p class="fine">* 매장 이용 시 다회용 컵이 제공됩니다. 포장 주문 시 일회용 컵 보증금 300원이 부과될 수 있습니다.</p></div>`;
  },
  menu() {
    const list = S.items.filter((i) => i.tab === st.tab);
    const pp = perPage();
    const pages = Math.max(1, Math.ceil(list.length / pp));
    st.page = Math.min(st.page, pages - 1);
    const shown = list.slice(st.page * pp, st.page * pp + pp);
    return `${header()}
      <nav class="tabs">${S.tabs.map((t) => btn('tab', t.t, { cls: 'tab', act: 'tab:' + t.id, sel: t.id === st.tab })).join('')}</nav>
      <div class="grid g${pp}">${shown.map((i) => `<button class="item" data-k="item" data-t="${esc(i.t)}" data-r="${esc(i.t)}" data-p="${i.p}" data-act="item:${i.id}">
          ${i.badge ? `<em class="badge">${i.badge}</em>` : ''}<span class="pic" style="--c:${i.color}"></span>
          <span class="nm">${esc(i.t)}</span><span class="en">${esc(i.en)}</span><span class="pr">${won(i.p)}</span></button>`).join('')}</div>
      <div class="pager">${btn('back', '◀', { cls: 'pg', act: 'page:-1', label: '◀', extra: st.page ? '' : 'disabled' })}<span>${st.page + 1} / ${pages}</span>${btn('next', '▶', { cls: 'pg', act: 'page:1', label: '▶', extra: st.page < pages - 1 ? '' : 'disabled' })}</div>
      ${cartBar()}`;
  },
  cart() {
    return `${header()}<div class="sheet"><h2>${esc(L('주문 내역을 확인해 주세요'))}</h2>
      <ul class="lines big">${st.cart.map((c) => `<li><span>${esc(c.name)}<small>${esc(c.opts.join(' / '))}</small></span><span>x${c.qty}</span><b>${won(c.price * c.qty)}</b></li>`).join('')}</ul>
      <div class="sum">총 결제금액 <b>${won(total())}</b></div>
      <div class="row">${btn('back', '이전', { cls: 'gray', act: 'go:menu' })}${btn('pay', '결제하기', { cls: 'accent', act: 'go:' + (S.point ? 'point' : 'pay_method') })}</div></div>`;
  },
  point() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', 'C'];
    return `${header()}<div class="sheet"><h2>${esc(L('멤버십 포인트를 적립하시겠습니까?'))}</h2>
      <p class="fine">휴대폰 번호 입력 시 결제금액의 3% 적립 · 스탬프 10개 모으면 아메리카노 1잔 무료</p>
      <div class="phone">010-${esc(st.phone.padEnd(8, '_').replace(/(.{4})/, '$1-'))}</div>
      <div class="keypad">${keys.map((k) => `<button data-act="key:${k}" class="key">${k}</button>`).join('')}</div>
      <div class="row">${btn('skip', '적립 안 함', { cls: 'gray', act: 'go:pay_method' })}${btn('yes', '적립하기', { cls: 'accent', act: 'go:pay_method' })}</div></div>`;
  },
  pay_method() {
    return `${header()}<div class="sheet"><h2>${esc(L('결제 수단을 선택해 주세요'))}</h2>
      <div class="sum">결제금액 <b>${won(total())}</b></div>
      <div class="pays">${S.payMethods.map((m) => `<button class="payb" data-k="btn" data-t="${esc(L(m.t))}" data-r="${esc(L(m.t))}" data-act="pay:${m.id}">${esc(L(m.t))}${sub(m.t)}${m.sub ? `<small>${esc(m.sub)}</small>` : ''}</button>`).join('')}</div>
      <div class="row">${btn('back', '이전', { cls: 'gray', act: 'go:cart' })}</div></div>`;
  },
  pay_card() {
    return `${header()}<div class="sheet center"><h2>${esc(L('카드를 투입구에 꽂아주세요'))}</h2>
      <p class="fine">IC칩이 위를 향하도록 끝까지 넣어 주세요. 결제가 끝날 때까지 카드를 빼지 마세요.</p>
      <div class="cardart"><div class="card"></div><div class="arrow">▼</div></div>
      <div class="sum">결제금액 <b>${won(total())}</b></div>
      <div class="row">${btn('cancel', '결제 취소', { cls: 'gray', act: 'go:pay_method' })}</div>
      <button class="demo" data-act="insert" data-demo="1">[시연] 카드 꽂기</button></div>`;
  },
  paying() { return `${header()}<div class="sheet center"><h2>결제 중입니다…</h2><p class="fine">카드를 빼지 마세요.</p><div class="spin"></div></div>`; },
  done() {
    return `<div class="sheet center done"><h2>${esc(L('주문이 완료되었습니다'))}</h2>
      <div class="ono">주문번호 <b>${st.orderNo}</b></div>
      <p class="fine">주문번호가 호출되면 픽업대에서 받아가세요. (목업 결제 · 실제 결제 아님)</p>
      <h3>${esc(L('영수증을 출력하시겠습니까?'))}</h3>
      <div class="row">${btn('no', '출력 안 함', { cls: 'gray', act: 'home' })}${btn('yes', '영수증 출력', { cls: 'accent', act: 'home' })}</div></div>`;
  },
};

function cartBar() {
  const n = st.cart.reduce((a, c) => a + c.qty, 0);
  return `<footer class="cartbar">
    <div class="cl">${st.cart.length ? st.cart.slice(-3).map((c) => `<span>${esc(c.name)} ${c.qty}</span>`).join('') : '<span class="muted">메뉴를 선택해 주세요</span>'}</div>
    <div class="cr"><span class="cnt">${esc(L('장바구니'))} <b>${n}</b></span><span class="tot">${won(total())}</span>
    ${btn('pay', '결제하기', { cls: 'accent paybtn', act: 'checkout', extra: n ? '' : 'disabled' })}</div></footer>`;
}

const MODALS = {
  option(m) {
    const it = itemById(m.item);
    const groups = S.options.filter((o) => (o.drinkOnly ? it.drink : o.tabs ? o.tabs.includes(it.tab) : true));
    const price = it.p + groups.reduce((a, g) => a + (g.choices.find((c) => c.id === m.sel[g.id])?.p || 0), 0);
    return `<div class="modal opt"><h2>${esc(it.t)} <small>${won(it.p)}</small></h2>
      ${groups.map((g) => `<div class="og"><h4>${esc(L(g.t))}${g.required ? ' <i>(필수)</i>' : ''}</h4><div class="ochoices">
        ${g.choices.map((c) => {
          const disabled = it.onlyIce && g.id === 'temp' && c.id === 'hot';
          return btn('btn', c.t, { cls: 'och', act: `opt:${g.id}:${c.id}`, sel: m.sel[g.id] === c.id, extra: disabled ? 'disabled' : '' }).replace('</button>', c.p ? `<small>+${won(c.p)}</small></button>` : '</button>');
        }).join('')}</div></div>`).join('')}
      <div class="qty"><span>수량</span>${btn('minus', '−', { cls: 'q', act: 'qty:-1', label: '−' })}<b>${m.qty}</b>${btn('plus', '+', { cls: 'q', act: 'qty:1', label: '+' })}</div>
      <div class="row">${btn('cancel', '취소', { cls: 'gray', act: 'close' })}${btn('yes', '담기', { cls: 'accent', act: 'add', label: `${L('담기')} · ${won(price * m.qty)}` })}</div></div>`;
  },
  upsell() {
    const u = S.upsell;
    return `<div class="modal ups"><div class="ups-art"></div><h2>${esc(L(u.title))}</h2><p>${esc(u.sub)}</p>
      <div class="row">${btn('no', u.no, { cls: 'gray', act: 'ups:no' })}${btn('yes', u.yes, { cls: 'accent', act: 'ups:yes' })}</div></div>`;
  },
  ad() {
    return `<div class="modal ad">${btn('close', '✕', { cls: 'x', act: 'close', label: '✕' })}<div class="ad-art">APP</div>
      <h2>앱 설치하고 첫 주문 2,000원 할인!</h2><p>지금 QR을 찍어 앱을 설치하세요. 멤버십 가입 시 쿠폰 즉시 지급</p>
      <div class="row">${btn('no', '오늘 하루 보지 않기', { cls: 'gray', act: 'close' })}${btn('close', '닫기', { cls: 'accent', act: 'close' })}</div></div>`;
  },
  staff() {
    return `<div class="modal"><h2>직원을 호출했습니다</h2><p>잠시만 기다려 주세요.</p><div class="row">${btn('yes', '확인', { cls: 'accent', act: 'close' })}</div></div>`;
  },
};

// ---------- 그리기 ----------
function render() {
  root.className = `k-${st.screen}`;
  let html = SCREENS[st.screen]();
  if (st.modal) html += `<div class="dim"></div>${MODALS[st.modal.type](st.modal)}`;
  if (st.myway) html += `<div class="myway-ribbon">내 방식 적용 중 · ${[st.myway.fontScale > 1 && '큰 글씨', st.myway.contrast && '또렷한 색', st.myway.plain && '쉬운 말', st.myway.noTimer && '시간 제한 없음'].filter(Boolean).join(' · ')} <button data-act="myway-off">끄기</button></div>`;
  html += qrBadge();
  root.innerHTML = html;
  applyMyway();
  drawQr();
  if (st.myway?.convert && !['paying'].includes(st.screen)) requestAnimationFrame(convertScreen);
  else requestAnimationFrame(() => requestAnimationFrame(publish));
}

function applyMyway() {
  const m = st.myway;
  document.documentElement.classList.toggle('myway', !!m);
  document.documentElement.classList.toggle('contrast', !!m?.contrast);
  document.documentElement.style.setProperty('--fs', m?.fontScale || 1);
}

// ---------- 동작 ----------
root.addEventListener('click', (e) => {
  const ref = e.target.closest('[data-ref]');
  if (ref) { const o = origRefs[Number(ref.dataset.ref) - 1]; if (o && !o.disabled) o.click(); return; }
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  st.idle = 120;
  const [a, x, y] = b.dataset.act.split(':');
  switch (a) {
    case 'start': st.screen = 'dine'; break;
    case 'home': resetOrder(); break;
    case 'staff': st.modal = { type: 'staff' }; break;
    case 'dine':
      st.dine = x; st.screen = 'menu';
      if (!st.adShown && !st.myway) { st.modal = { type: 'ad' }; st.adShown = true; }
      break;
    case 'tab': st.tab = x; st.page = 0; break;
    case 'page': st.page = Math.max(0, st.page + Number(x)); break;
    case 'item': {
      const it = itemById(x);
      const sel = {};
      for (const g of S.options) if (g.required) sel[g.id] = g.id === 'temp' && it.onlyIce ? 'ice' : null;
      for (const g of S.options) if (!g.required) sel[g.id] = g.choices[0].id;
      if (it.drink && sel.size === null) sel.size = 'reg';
      if (it.tab === 'main' || it.tab === 'noodle') sel.spicy = 'normal';
      const hasOpts = S.options.some((g) => (g.drinkOnly ? it.drink : g.tabs ? g.tabs.includes(it.tab) : true));
      if (hasOpts) st.modal = { type: 'option', item: x, sel, qty: 1 };
      else addToCart(it, [], 0, 1);
      break;
    }
    case 'opt': st.modal.sel[x] = y; break;
    case 'qty': st.modal.qty = Math.max(1, Math.min(20, st.modal.qty + Number(x))); break;
    case 'close': st.modal = null; break;
    case 'add': {
      const m = st.modal, it = itemById(m.item);
      const groups = S.options.filter((o) => (o.drinkOnly ? it.drink : o.tabs ? o.tabs.includes(it.tab) : true));
      const missing = groups.find((g) => g.required && !m.sel[g.id]);
      if (missing) { flash(`${missing.t}을(를) 선택해 주세요`); return; }
      const opts = [], extra = groups.reduce((a, g) => { const c = g.choices.find((c) => c.id === m.sel[g.id]); if (c && (g.required || c.p)) opts.push(c.t); return a + (c?.p || 0); }, 0);
      addToCart(it, opts, extra, m.qty);
      st.modal = !st.upsellShown && !(st.myway?.noUpsell) ? { type: 'upsell' } : null;
      st.upsellShown = true;
      break;
    }
    case 'ups':
      if (x === 'yes') { const it = itemById(S.upsell.itemId); st.cart.push({ id: it.id, name: it.t + ' (추가)', opts: [], price: S.upsell.price, qty: 1 }); }
      st.modal = null; break;
    case 'checkout': if (st.cart.length) st.screen = 'cart'; break;
    case 'go': st.screen = x; break;
    case 'key':
      if (x === '←') st.phone = st.phone.slice(0, -1); else if (x === 'C') st.phone = ''; else if (st.phone.length < 8) st.phone += x;
      break;
    case 'pay': st.payMethod = x; st.screen = 'pay_card'; break;
    case 'insert': payNow(); return;
    case 'myway-off': st.myway = null; break;
  }
  render();
});

function addToCart(it, opts, extra, qty) { st.cart.push({ id: it.id, name: it.t, opts, price: it.p + extra, qty }); }
function resetOrder() {
  Object.assign(st, { screen: 'start', tab: S.tabs[0].id, page: 0, modal: null, cart: [], dine: null, upsellShown: false, adShown: false, orderNo: null, phone: '' });
}
async function payNow() {
  st.screen = 'paying'; render();
  if (!chan) try { await fetch(`${API}/api/kiosk/${KIOSK_ID}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ total: total(), items: st.cart }) }); } catch {}
  await new Promise((r) => setTimeout(r, 900));
  st.orderNo = 100 + Math.floor(Math.random() * 900);
  st.screen = 'done'; render();
  setTimeout(() => { if (st.screen === 'done') { resetOrder(); if (st.myway?.endOnDone !== false) st.myway = null; render(); } }, 25000);
}
function flash(msg) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; root.appendChild(d);
  setTimeout(() => d.remove(), 1800);
}

// 무활동 타이머 (실제 키오스크처럼 압박)
setInterval(() => {
  if (st.myway?.noTimer || st.screen === 'start' || st.screen === 'done') return;
  st.idle--;
  const t = root.querySelector('.timer b'); if (t) t.textContent = st.idle;
  if (st.idle <= 0) { resetOrder(); render(); }
}, 1000);

// ---------- 화면 구조 올리기 (연동 모드) ----------
function screenType() {
  if (st.modal) return { option: 'option', upsell: 'upsell', ad: 'ad', staff: 'other' }[st.modal.type];
  return { start: 'start', dine: 'dine', menu: 'menu', cart: 'cart', point: 'point', pay_method: 'pay_method', pay_card: 'pay_card', paying: 'pay_card', done: 'done' }[st.screen];
}
let pubTimer = null, lastPub = '';
// 화면 구조 모으기: 보이는 [data-k] 버튼 → id·글자·종류·상자(0~1000)·묶음 제목
function collect(scope, { keepRefs = false } = {}) {
  const r = root.getBoundingClientRect();
  const els = [], refs = [];
  let id = 1;
  for (const el of scope.querySelectorAll('[data-k]')) {
    if (el.disabled || el.closest('.mw') && !scope.classList.contains('mw')) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2 || b.bottom < r.top || b.top > r.bottom) continue;
    const cs = getComputedStyle(el);
    const g = el.closest('.og')?.querySelector('h4')?.childNodes[0]?.textContent?.trim();
    els.push({
      id: id++, t: el.dataset.t, r: el.dataset.r || el.dataset.t, k: el.dataset.k,
      b: [b.left, b.top, b.right, b.bottom].map((v, i) => Math.round(((v - (i % 2 ? r.top : r.left)) / (i % 2 ? r.height : r.width)) * 1000)),
      p: el.dataset.p ? Number(el.dataset.p) : null, c: cs.backgroundColor, sel: el.dataset.sel === '1', ...(g ? { g } : {}),
    });
    refs.push(el);
  }
  const title = (scope.querySelector('h2,h1')?.textContent || '').trim();
  return { screen: { kiosk: true, quality: 'ok', screen: [0, 0, 1000, 1000], type: screenType(), title, els, total: total() || null, no: st.orderNo, pick: null, conf: 1, bg: getComputedStyle(root).backgroundColor, say: '' }, refs };
}

function publish() {
  const mw = root.querySelector('.mw');
  const scope = mw || (st.modal ? root.querySelector('.modal') : root);
  const { screen } = collect(scope);
  if (mw) screen.converted = mw.dataset.source;
  window.__kioskState = screen;
  const key = JSON.stringify(screen);
  if (key === lastPub) return;
  lastPub = key;
  clearTimeout(pubTimer);
  pubTimer = setTimeout(() => {
    if (chan) { chan.postMessage({ type: 'state', id: KIOSK_ID, screen, version: ++localVersion }); return; }
    fetch(`${API}/api/kiosk/${KIOSK_ID}/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screen }) }).catch(() => {});
  }, 120);
}

// ---------- AI 화면 변환 (내 방식 모드) ----------
// 원래 화면은 그대로 두고 그 위에 "내 방식 화면"을 덮는다. 버튼을 누르면 원래 버튼을 누른 것과 같다 → 기존 흐름 유지.
const convCache = new Map(); // 같은 화면 = 같은 변환 (케이스별 저장)
let origRefs = [], convGen = 0;
function sigOf(sc) { return sc.type + '|' + sc.els.map((e) => e.t + (e.sel ? '*' : '') + e.k).join(','); }

function convertScreen() {
  const scope = st.modal ? root.querySelector('.modal') : root;
  const { screen, refs } = collect(scope);
  origRefs = refs;
  const norm = { ...screen, els: screen.els.map((e) => ({ ...e, box: e.b })) };
  const sig = sigOf(norm) + '|' + (st.myway?.experience || '');
  const cached = convCache.get(sig);
  const plan = cached?.plan || validate(ruleConvert(norm), norm).plan;
  drawOverlay(plan, norm, cached ? cached.source : 'rule');
  if (!cached && !chan && st.myway?.ai !== false) {
    const gen = ++convGen;
    fetch(`${API}/api/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screen: norm, profile: st.myway?.profile || {} }) })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.plan) return;
        convCache.set(sig, { plan: j.plan, source: j.source });
        if (gen === convGen && st.myway) drawOverlay(j.plan, norm, j.source);
      }).catch(() => {});
  } else if (!cached) convCache.set(sig, { plan, source: 'rule' });
}

function drawOverlay(plan, sc, source) {
  root.querySelector('.mw')?.remove();
  const byId = new Map(sc.els.map((e) => [e.id, e]));
  const cls = (e) => (['yes', 'next', 'pay'].includes(e.k) && !/^[◀▶]$/.test(e.t) ? 'pri' : ['no', 'skip', 'close', 'cancel'].includes(e.k) ? 'dec' : ['back', 'staff'].includes(e.k) ? 'min' : '');
  const mw = document.createElement('div');
  mw.className = 'mw'; mw.dataset.source = source;
  const t = total();
  const info = { cart: t && `모두 ${won(t)}`, point: '', pay_method: t && `모두 ${won(t)}`, pay_card: `모두 ${won(t)} · 화면 아래 구멍에 카드를 꽂으세요`, done: st.orderNo && `주문 번호 ${st.orderNo}번` }[sc.type];
  const lines = sc.type === 'cart' ? `<ul class="mw-l">${st.cart.map((c) => `<li>${esc(c.name)} ${c.qty}개 <b>${won(c.price * c.qty)}</b></li>`).join('')}</ul>` : '';
  mw.innerHTML = `<h2 class="mw-t">${esc(plan.title || '')}</h2>${info ? `<p class="mw-i">${esc(info)}</p>` : ''}${lines}` + plan.sections.map((s) => `
    <section class="mw-s ${s.role || ''}">${s.title ? `<h3>${esc(s.title)}</h3>` : ''}<div class="mw-g n${Math.min(s.ids.length, 3)}">
    ${s.ids.map((id) => { const e = byId.get(id); if (!e) return ''; const label = plan.labels[id] || e.t; const hint = plan.hints?.[id];
      return `<button class="mw-b ${cls(e)}${e.sel ? ' sel' : ''}" data-k="${e.k}" data-t="${esc(label)}" data-r="${esc(label)}" data-ref="${id}" ${e.sel ? 'data-sel="1"' : ''} ${e.p ? `data-p="${e.p}"` : ''}>
        <b>${esc(label)}</b>${label !== e.t ? `<small>${esc(e.t)}</small>` : ''}${hint ? `<em>${esc(hint)}</em>` : ''}</button>`; }).join('')}
    </div></section>`).join('') + (sc.type === 'pay_card' ? '<button class="demo" data-act="insert" data-demo="1">[시연] 카드 꽂기</button>' : '') + `<p class="mw-src">${source === 'rule' ? '규칙 변환' : 'AI 화면 변환'} · 버튼을 누르면 원래 화면에서 눌린 것과 같아요</p>`;
  root.appendChild(mw);
  requestAnimationFrame(() => requestAnimationFrame(publish));
}

// ---------- 프로필 받기 (롱폴링) ----------
let pv = 0;
async function pollProfile() {
  for (;;) {
    try {
      const r = await fetch(`${API}/api/kiosk/${KIOSK_ID}/profile?since=${pv}&wait=20`);
      const j = await r.json();
      if (j.version !== pv) { pv = j.version; st.myway = j.profile ? kioskPrefs(j.profile) : null; if (st.myway) st.modal = st.modal?.type === 'ad' ? null : st.modal; render(); }
    } catch { await new Promise((r) => setTimeout(r, 5000)); }
  }
}
// 폰 프로필 → 키오스크 화면 설정
function kioskPrefs(p) {
  const low = p.vision === 'low', first = p.experience === 'first';
  return {
    fontScale: low ? 1.7 : first ? 1.35 : 1.15,
    contrast: low || !!p.contrast,
    plain: false,        // 라벨은 AI 화면 변환이 바꾼다 (원래 화면은 원문 유지)
    noTimer: true,
    simple: low || first,
    noUpsell: !!p.noUpsell,
    convert: true,       // AI 화면 변환 켜기
    experience: p.experience,
    profile: { experience: p.experience, vision: p.vision },
  };
}

// ---------- QR 배지 ----------
function qrBadge() {
  return `<div class="qrbadge" aria-label="내 방식 QR"><canvas id="qrc" width="132" height="132"></canvas><span>내 방식 QR<br><small>폰으로 찍으면<br>쉽게 안내해 드려요</small></span></div>`;
}
function drawQr() {
  const c = document.getElementById('qrc');
  if (!c || !window.qrcode) return;
  const url = `${APP_URL}?k=${encodeURIComponent(KIOSK_ID)}${API ? '&api=' + encodeURIComponent(API) : ''}`;
  const q = window.qrcode(0, 'M'); q.addData(url); q.make();
  const n = q.getModuleCount(), ctx = c.getContext('2d'), s = c.width / (n + 4);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) ctx.fillRect((x + 2) * s, (y + 2) * s, Math.ceil(s), Math.ceil(s));
  c.dataset.url = url;
}

// ---------- 크기 맞추기 ----------
function fit() {
  const sc = Math.min(window.innerWidth / W, window.innerHeight / H);
  stage.style.transform = `scale(${sc})`;
  stage.style.left = `${(window.innerWidth - W * sc) / 2}px`;
  stage.style.top = `${(window.innerHeight - H * sc) / 2}px`;
  requestAnimationFrame(publish);
}
window.addEventListener('resize', fit);

// 테스트·평가용 조작 함수
window.__kiosk = { st, render, act: (a) => { const el = [...root.querySelectorAll('[data-act]')].find((e) => e.dataset.act === a); el?.click(); return !!el; }, setMyway: (p) => { st.myway = p ? kioskPrefs(p) : null; render(); } };

if (chan) {
  chan.onmessage = (e) => {
    const m = e.data || {};
    if (m.id && m.id !== KIOSK_ID) return;
    if (m.type === 'hello') { lastPub = ''; publish(); }
    if (m.type === 'profile') { st.myway = m.profile ? kioskPrefs(m.profile) : null; if (st.myway && st.modal?.type === 'ad') st.modal = null; render(); }
    if (m.type === 'reset') { resetOrder(); st.myway = null; render(); }
  };
}

fit();
render();
if (!chan && qs.get('offline') !== '1') pollProfile();
