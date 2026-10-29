// 내 방식 QR — 폰 앱
import * as P from './profile.js';
import * as V from './voice.js';
import * as Cam from './camera.js';
import { api } from './api.js';

const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);

const app = {
  profile: P.load(),
  goal: null,
  gstate: {},          // 서버가 돌려주는 진행 기록
  kioskId: qs.get('k') || null,
  kioskVersion: 0,
  last: null,          // 마지막 안내 응답
  busy: false,
  demo: null,          // 체험 모드 제공자 (demo.js)
};
window.__app = app;

// ---------- 화면 전환 ----------
function go(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.dataset.view === name));
  window.scrollTo(0, 0);
  const enter = ENTER[name];
  if (enter) enter();
}
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (g) { V.unlock(); go(g.dataset.go); }
});
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
}
function applyProfile() {
  const p = app.profile || P.DEFAULT;
  document.documentElement.classList.toggle('low', p.vision === 'low');
  V.setRate(p.rate);
}

// ---------- 내 방식 정하기 ----------
const QUESTIONS = [
  {
    q: '제 목소리 빠르기, 괜찮으세요?', sub: '이어폰을 끼시면 더 잘 들려요.', speak: '안녕하세요. 제 목소리 빠르기, 괜찮으세요?',
    c: [['더 천천히', '', (p) => (p.rate = 0.75)], ['이대로 좋아요', '', (p) => (p.rate = 0.9)], ['더 빠르게', '', (p) => (p.rate = 1.1)]],
    retry: true,
  },
  {
    q: '이 글씨가 잘 보이세요?', sub: '안 보이시면 글씨를 아주 크게 하고, 소리로 더 많이 알려 드려요.', speak: '이 글씨가 잘 보이세요?',
    c: [['잘 보여요', '', (p) => (p.vision = 'normal')], ['잘 안 보여요', '아주 크게', (p) => (p.vision = 'low')]],
  },
  {
    q: '키오스크로 주문해 보셨어요?', sub: '처음이시면 아주 자세히 알려 드려요.', speak: '키오스크로 주문해 보셨어요?',
    c: [['처음이에요', '아주 자세히', (p) => (p.experience = 'first')], ['가끔 해요', '알맞게', (p) => (p.experience = 'some')], ['자주 해요', '짧게', (p) => (p.experience = 'often')]],
  },
  {
    q: '점수 모으기(적립)를 하세요?', sub: '안 하시면 그 화면은 건너뛰라고 알려 드려요.', speak: '포인트 적립, 그러니까 점수 모으기를 하세요?',
    c: [['안 해요', '건너뛰기', (p) => (p.skipPoints = true)], ['해요', '', (p) => (p.skipPoints = false)]],
  },
  {
    q: '"더 사세요" 권유는 어떻게 할까요?', sub: '세트로 바꾸기, 후식 추가 같은 창이에요.', speak: '더 사라는 권유 창이 나오면 어떻게 할까요?',
    c: [['바로 거절하기', '', (p) => (p.noUpsell = true)], ['물어봐 주세요', '', (p) => (p.noUpsell = false)]],
  },
];
let setupIdx = 0, draft = null;
function enterSetup() { setupIdx = 0; draft = { ...(app.profile || P.DEFAULT) }; showQ(); }
function showQ() {
  const q = QUESTIONS[setupIdx];
  $('#setup-n').textContent = setupIdx + 1; $('#setup-of').textContent = QUESTIONS.length;
  $('#setup-q').textContent = q.q; $('#setup-sub').textContent = q.sub;
  const box = $('#setup-c'); box.innerHTML = '';
  q.c.forEach(([label, small, fn], i) => {
    const b = document.createElement('button');
    b.className = 'blk ' + ['y', 'w', 'w'][i];
    b.innerHTML = `${label}${small ? `<small>${small}</small>` : ''}`;
    b.onclick = async () => {
      V.unlock(); fn(draft); applyDraft();
      if (q.retry && i !== 1) { await V.say('이 정도는 어떠세요?'); return; } // 빠르기는 들어 보고 다시 고르게
      next();
    };
    box.appendChild(b);
  });
  V.say(q.speak);
}
function applyDraft() { V.setRate(draft.rate); document.documentElement.classList.toggle('low', draft.vision === 'low'); }
function next() {
  setupIdx++;
  if (setupIdx < QUESTIONS.length) return showQ();
  app.profile = draft; P.save(draft); applyProfile();
  V.say('내 방식을 저장했어요. 이 설정은 QR로도 만들 수 있어요.');
  go('qr');
}
$('#setup-replay').onclick = () => V.say(QUESTIONS[setupIdx].speak);

// ---------- QR ----------
function enterQr() {
  const p = app.profile || P.DEFAULT;
  $('#qr-tags').innerHTML = P.describe(p).map((t) => `<li>${t}</li>`).join('');
  const url = P.shareUrl(p);
  const q = window.qrcode(0, 'M'); q.addData(url); q.make();
  const c = $('#qr-c'), ctx = c.getContext('2d'), n = q.getModuleCount(), s = c.width / (n + 6);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#111';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) ctx.fillRect(Math.floor((x + 3) * s), Math.floor((y + 3) * s), Math.ceil(s), Math.ceil(s));
  $('#qr-copy').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('주소를 복사했어요.'); } catch { prompt('이 주소를 복사하세요', url); } };
}

// ---------- 목표 ----------
const CHIPS = ['차가운 아메리카노 한 잔 가져갈게', '따뜻한 카페라떼 한 잔 먹고 갈게', '김치찌개 하나 먹고 갈게', '돌솥비빔밥 하나 포장'];
function enterGoal() {
  $('#goal-heard').textContent = '';
  $('#goal-chips').innerHTML = CHIPS.map((c) => `<button>${c}</button>`).join('');
  $('#goal-chips').querySelectorAll('button').forEach((b) => (b.onclick = () => submitGoal(b.textContent)));
  $('#goal-mic').style.display = V.canListen() ? '' : 'none';
  V.say('무엇을 주문하실 거예요? 가운데 파란 동그라미를 누르고 말씀하세요.');
}
$('#goal-mic').onclick = async () => {
  V.unlock();
  const m = $('#goal-mic'); m.classList.add('on'); $('#goal-heard').textContent = '듣고 있어요…';
  const t = await V.listen({ timeoutMs: 9000 });
  m.classList.remove('on');
  if (!t) { $('#goal-heard').textContent = '잘 못 들었어요. 다시 눌러 주세요.'; V.say('잘 못 들었어요. 다시 눌러 주세요.'); return; }
  const first = t.split(' | ')[0];
  $('#goal-heard').textContent = `"${first}"`;
  submitGoal(first);
};
$('#goal-send').onclick = () => { const v = $('#goal-text').value.trim(); if (v) submitGoal(v); };
$('#goal-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#goal-send').click(); });

async function submitGoal(text) {
  V.unlock();
  let r;
  try { r = app.demo?.active ? await app.demo.goal(text) : await api.goal(text); }
  catch { toast('서버에 연결이 안 돼요. 잠시 뒤 다시 해 주세요.'); return; }
  app.goal = r.goal;
  go('confirm');
  const say = r.ask && !r.goal.place ? r.confirm.replace(/\s*맞아요\?$/, '') + ' ' + r.ask : r.confirm;
  $('#confirm-say').textContent = say;
  const box = $('#confirm-c'); box.innerHTML = '';
  const choices = r.ask && !r.goal.place
    ? [['여기서 먹기', () => { app.goal.place = 'eatin'; startGuide(); }], ['가지고 가기', () => { app.goal.place = 'takeout'; startGuide(); }], ['다시 말할래요', () => go('goal')]]
    : [['네, 맞아요', startGuide], ['다시 말할래요', () => go('goal')]];
  choices.forEach(([label, fn], i) => { const b = document.createElement('button'); b.className = 'blk ' + ['y', 'w', 'w'][i]; b.textContent = label; b.onclick = fn; box.appendChild(b); });
  V.say(say);
}

// ---------- 찍고 듣기 ----------
function startGuide() {
  app.gstate = { goal: app.goal };
  app.last = null;
  go('guide');
}
async function enterGuide() {
  setInstr('키오스크 화면을 비추고<br>아래 노란 버튼을 누르세요', '화면 전체가 나오게 찍어 주세요.');
  $('#pay-row').hidden = true;
  document.querySelector('.viewport').classList.remove('frozen');
  $('#hl').classList.remove('on');
  if (app.demo?.active) { await app.demo.enterGuide(); }
  else {
    try { await Cam.start($('#video')); } catch (e) { setInstr('카메라를 켤 수 없어요', e.message, 'warn'); }
  }
  if (app.kioskId) linkKiosk(app.kioskId, qs.get('api'));
  else V.say('키오스크 화면을 비추고, 아래 노란 버튼을 누르세요.');
}

function setInstr(big, small = '', cls = '') {
  $('#instr-big').innerHTML = big; $('#instr-sub').textContent = small;
  $('#instr').className = 'instr ' + cls;
}

$('#shutter').onclick = () => { V.unlock(); shoot(); };

async function shoot() {
  if (app.busy) return;
  const vp = document.querySelector('.viewport');
  let shot = null;
  if (app.demo?.active) shot = await app.demo.capture();
  else if (!app.kioskId || !linked) shot = Cam.capture($('#video'));
  if (!app.kioskId && !shot) { V.say('카메라가 아직 준비되지 않았어요.'); return; }
  V.beep();

  if (shot) {
    // 찍은 사진을 멈춰 보여 주고, 그 위에 누를 곳을 그린다
    const c = $('#shot'); c.width = shot.canvas.width; c.height = shot.canvas.height;
    c.getContext('2d').drawImage(shot.canvas, 0, 0);
    vp.classList.add('frozen');
    // 연동 QR이 보이면 연동 모드로
    if (!app.kioskId) {
      const q = Cam.findKioskQr(shot.canvas);
      if (q) { await linkKiosk(q.kioskId, q.api); return; }
    }
    if (!linked && shot.quality.dark) { sayRes({ action: 'retake', say: '너무 어두워요. 화면 쪽으로 다시 찍어 주세요.', display: { big: '다시 찍어 주세요', sub: '너무 어두워요' } }); return; }
  }
  await step(shot);
}

async function step(shot, { auto = false } = {}) {
  app.busy = true; $('#busy').hidden = false; $('#shutter').disabled = true;
  const waitTalk = setTimeout(() => V.quick('보고 있어요.'), 700);
  let r;
  try {
    const body = { goal: app.goal, state: app.gstate, profile: app.profile || P.DEFAULT };
    if (linked && app.kioskId) body.kioskId = app.kioskId; else body.image = shot?.dataUrl;
    r = app.demo?.active ? await app.demo.step(body) : await api.step(body);
  } catch (e) {
    r = { action: 'error', say: '연결이 잠시 끊겼어요. 다시 눌러 주세요.', display: { big: '다시 눌러 주세요', sub: '연결이 끊겼어요' } };
  } finally {
    clearTimeout(waitTalk);
    app.busy = false; $('#busy').hidden = true; $('#shutter').disabled = false;
  }
  if (r.error) r = { action: 'error', say: r.mock ? '카메라 안내는 아직 준비 중이에요. 키오스크의 내 방식 QR을 찍어 주세요.' : r.error, display: { big: '다시 찍어 주세요', sub: r.error } };
  // 자동(화면 바뀜 감지)일 때 '그대로예요'는 말하지 않는다 — 사용자가 아직 안 눌렀을 수 있음
  if (auto && (r.action === 'stuck' || r.action === 'error')) return;
  if (r.state) app.gstate = r.state;
  app.last = r;
  sayRes(r, shot);
}

function sayRes(r, shot) {
  const d = r.display || {};
  $('#pay-row').hidden = r.action !== 'confirm_pay';
  const cls = r.action === 'confirm_pay' ? 'pay' : ['retake', 'unsure', 'error', 'stuck'].includes(r.action) ? 'warn' : '';
  setInstr(escapeHtml(d.big || ''), d.sub || '', cls);
  drawTarget(r, shot);
  if (r.action === 'done') { V.say(r.say).then(() => {}); showDone(r); return; }
  if (r.action === 'help') { V.say(r.say); showHelp(); return; }
  V.say(r.say);
}

// 누를 곳 표시: 사진 모드는 사진 위에, 연동 모드는 키오스크 그림 위에
function drawTarget(r, shot) {
  const hl = $('#hl'); hl.classList.remove('on');
  const box = r.target?.box;
  const vp = document.querySelector('.viewport');
  if (!box) return;
  const c = $('#shot');
  const sketch = linked && !shot;
  vp.classList.toggle('sketch', sketch);
  if (sketch) { drawKioskSketch(r, c); vp.classList.add('frozen'); }
  // object-fit 보정 (사진: cover, 키오스크 그림: contain)
  const vw = vp.clientWidth, vh = vp.clientHeight, iw = c.width, ih = c.height;
  const s = sketch ? Math.min(vw / iw, vh / ih) : Math.max(vw / iw, vh / ih), ox = (vw - iw * s) / 2, oy = (vh - ih * s) / 2;
  const x1 = ox + (box[0] / 1000) * iw * s, y1 = oy + (box[1] / 1000) * ih * s;
  const x2 = ox + (box[2] / 1000) * iw * s, y2 = oy + (box[3] / 1000) * ih * s;
  Object.assign(hl.style, { left: x1 - 6 + 'px', top: y1 - 6 + 'px', width: x2 - x1 + 12 + 'px', height: y2 - y1 + 12 + 'px' });
  void hl.offsetWidth; hl.classList.add('on');
}
function drawKioskSketch(r, c) {
  // 키오스크 화면 비율(9:16)로 버튼 네모들을 그린다
  c.width = 540; c.height = 960;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f0e6'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(3, 3, c.width - 6, c.height - 6);
  for (const e of r.screen?.els || []) {
    const [x1, y1, x2, y2] = e.box.map((v, i) => (v / 1000) * (i % 2 ? c.height : c.width));
    g.fillStyle = e.id === r.target?.id ? '#f5c518' : '#fff';
    g.fillRect(x1, y1, x2 - x1, y2 - y1); g.lineWidth = 2; g.strokeRect(x1, y1, x2 - x1, y2 - y1);
    if (x2 - x1 > 60) { g.fillStyle = '#111'; g.font = 'bold 20px SUIT, sans-serif'; g.fillText(String(e.r || e.t).slice(0, 10), x1 + 6, y1 + 26); }
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// 결제 확인
$('#pay-yes').onclick = () => confirmPay(true);
$('#pay-no').onclick = () => confirmPay(false);
function confirmPay(ok) {
  $('#pay-row').hidden = true;
  if (ok) {
    app.gstate.payConfirmed = true;
    if (linked) V.say('네, 알겠어요.').then(() => step(null));
    else { setInstr('다시 한 번 찍어 주세요', '누를 곳을 알려 드릴게요.'); V.say('네, 알겠어요. 다시 한 번 찍어 주세요.'); }
  }
  else { V.say('알겠어요. 화면 왼쪽 위 처음으로를 누르거나, 직원에게 도움을 받으세요.'); }
}

// 도구 버튼
$('#t-again').onclick = () => V.say(V.lastSaid() || '키오스크 화면을 비추고 노란 버튼을 누르세요.');
$('#t-slow').onclick = () => {
  const p = app.profile || { ...P.DEFAULT };
  p.rate = Math.max(0.6, +(p.rate - 0.1).toFixed(2)); app.profile = p; P.save(p); V.setRate(p.rate);
  V.say(V.lastSaid() || '천천히 말할게요.');
};
$('#t-what').onclick = async () => {
  const t = app.last?.target;
  if (!t) return V.say('먼저 화면을 찍어 주세요.');
  if (app.last.display?.gloss) return V.say(`'${t.r || t.t}'는 ${app.last.display.gloss}라는 뜻이에요.`);
  try { const r = app.demo?.active ? { text: `'${t.r || t.t}'를 누르면 다음으로 넘어가요.` } : await api.explain(t.t); V.say(r.text); } catch { V.say('지금은 뜻을 찾을 수 없어요.'); }
};
$('#t-help').onclick = showHelp;
$('#t-talk').onclick = async () => {
  V.unlock();
  setInstr('말씀하세요…', '다시 · 천천히 · 뭐야 · 모르겠어 · 네 · 다음');
  const t = await V.listen({ timeoutMs: 7000 });
  const cmd = V.command(t);
  const map = { again: '#t-again', slow: '#t-slow', what: '#t-what', help: '#t-help', next: '#shutter', yes: '#pay-yes', no: '#pay-no' };
  if (cmd && map[cmd]) { if ((cmd === 'yes' || cmd === 'no') && $('#pay-row').hidden) return V.say('지금은 고를 것이 없어요.'); $(map[cmd]).click(); }
  else { setInstr(escapeHtml(app.last?.display?.big || '다시 해 주세요'), ''); V.say('잘 못 들었어요. 버튼을 눌러 주세요.'); }
};

function showHelp() {
  const g = app.goal;
  const items = (g?.items || []).map((i) => `${i.temp === 'ice' ? '차가운 ' : i.temp === 'hot' ? '따뜻한 ' : ''}${i.name} ${i.qty}${i.unit || '개'}`).join(', ');
  $('#help-goal').textContent = items ? `${items}${g.place === 'takeout' ? ' · 포장' : g.place === 'eatin' ? ' · 매장' : ''}` : '주문을 도와주세요';
  go('help');
  V.say('폰 화면을 직원에게 보여 주세요.');
}
function showDone(r) {
  $('#done-no').textContent = r.screen?.no ? `${r.screen.no}번` : '';
  setTimeout(() => go('done'), 400);
}

// ---------- 연동 모드 ----------
let linked = false, pollGen = 0, unwatch = null;
async function linkKiosk(id, apiBase) {
  if (apiBase && !api.base()) api.setBase(apiBase);
  app.kioskId = id; linked = true;
  const L = $('#linked'); L.hidden = false; L.textContent = '연동됨 · 폰을 내려놓으셔도 돼요';
  try { if (app.demo?.active) app.demo.sendProfile(app.profile || P.DEFAULT); else await api.sendProfile(id, app.profile || P.DEFAULT); } catch {}
  V.beep(660, 120);
  await V.say('키오스크와 연결됐어요. 키오스크 화면이 내 방식으로 바뀌었어요.');
  await step(null);
  if (app.demo?.active) { unwatch?.(); unwatch = app.demo.watch(() => { if (!app.busy && document.querySelector('#v-guide.on')) step(null, { auto: true }); }); }
  else watchKiosk(++pollGen);
}
async function watchKiosk(gen) {
  let since = 0;
  while (linked && gen === pollGen) {
    try {
      const j = await api.kioskState(app.kioskId, since, 20);
      if (gen !== pollGen) return;
      if (since && j.version !== since && !app.busy && document.querySelector('#v-guide.on')) {
        await new Promise((r) => setTimeout(r, 500)); // 화면이 다 바뀔 때까지 잠깐
        await step(null, { auto: true });
      }
      since = j.version;
    } catch { await new Promise((r) => setTimeout(r, 3000)); }
  }
}

const ENTER = { setup: enterSetup, qr: enterQr, goal: enterGoal, guide: enterGuide };

// ---------- 시작 ----------
async function boot() {
  applyProfile();
  // PC로 처음 들어오면 시연 페이지로 (폰·키오스크 QR·체험 모드는 그대로)
  if (window.innerWidth >= 900 && !qs.has('demo') && !qs.has('k') && !qs.has('app') && !location.hash) { location.replace('demo.html'); return; }
  const h = qs.get('demo') === '1' ? null : await api.health();
  const srv = $('#srv');
  if (!h) {
    const d = await import('./demo.js').catch((e) => { console.warn(e); return null; });
    if (d) { app.demo = d.provider(app); app.demo.on(); }
    srv.innerHTML = '체험 모드예요. 같은 화면의 목업 키오스크와 연결돼요. 실제 카메라 안내는 AI 서버를 켜야 해요. <a href="demo.html">시연 페이지</a>';
  } else {
    srv.textContent = h.mock ? '서버 연결됨 · AI 키 없음 (연동 키오스크만 안내)' : `서버 연결됨 · ${h.vision}`;
  }
  if (app.profile?.imported) { toast('가족이 보낸 내 방식을 넣었어요.'); }
  if (!app.profile) go('setup');
  else if (app.kioskId) { app.goal = app.goal || null; go('goal'); }
  else go('home');
}
boot();
