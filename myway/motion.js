// 소개·시연 페이지 움직임 — anime.js v4 (MIT, https://github.com/juliangarnier/anime)
// 원칙: 짧고(0.4~0.9초) 한 방향으로만, 내용이 먼저 읽히게. 움직임 줄이기 설정이면 아무것도 하지 않는다.
// 자바스크립트가 실패해도 내용은 보인다: 숨김은 <html class="motion">이 붙은 뒤에만 적용된다.
import { animate, stagger, createTimeline, utils } from './vendor/anime/anime.esm.min.js';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const EASE = 'outExpo';

window.__motionReady = true;
if (reduce) document.documentElement.classList.remove('motion');
else {
  document.documentElement.classList.add('motion');
  try { intro(); } catch (e) { console.warn(e); }
  try { reveals(); } catch (e) { console.warn(e); }
  try { faq(); } catch (e) { console.warn(e); }
  try { demo(); } catch (e) { console.warn(e); }
  // 안전장치: 어떤 이유로든 2.5초 뒤에도 숨어 있는 첫 화면 요소는 그냥 보이게
  setTimeout(() => $$('.hero [data-a]').forEach((el) => { if (getComputedStyle(el).opacity === '0') utils.set(el, { opacity: 1, translateY: 0, translateX: 0 }); }), 2500);
}

// ---------- 첫 화면 ----------
function intro() {
  const hero = $('.hero');
  const tl = createTimeline({ defaults: { ease: EASE, duration: 800 } });
  // 머리 표지: 원·네모·세모가 차례로 튀어나옴
  tl.add('.nav .marks i', { scale: [0, 1], rotate: [-90, 0], opacity: [0, 1], duration: 600, ease: 'outBack(1.8)', delay: stagger(90) }, 0);
  if (!hero) return;
  tl.add('.hero .eyebrow', { opacity: [0, 1], translateX: [-16, 0], duration: 600 }, 120)
    .add('.hero h1 .ln > span', { translateY: ['105%', '0%'], duration: 900, delay: stagger(120) }, 200)
    .add('.hero h1 em', { backgroundSize: ['0% 100%', '100% 100%'], duration: 700, ease: 'inOutQuart' }, 700)
    .add('.hero .lead', { opacity: [0, 1], translateY: [16, 0] }, 650)
    .add('.hero .cta .btn', { opacity: [0, 1], translateY: [16, 0], delay: stagger(90) }, 800)
    .add('.hero-art', { opacity: [0, 1], translateX: [48, 0], '--o': ['0px', '12px'], duration: 1000 }, 350)
    .add('.say', { opacity: [0, 1], translateY: [24, 0] }, 1000);
  // 스피커 소리 물결: 은은하게 반복
  animate('.say .ear .w', { opacity: [0.25, 1], delay: stagger(220), duration: 700, loop: true, alternate: true, ease: 'inOutSine' });
}

// ---------- 스크롤하면 나타나기 ----------
function reveals() {
  // 한 묶음(그리드)의 카드들은 왼쪽부터 차례로
  // 묶음 안의 [data-a]는 묶음이 한꺼번에, 나머지는 하나씩 (첫 화면은 intro가 맡음)
  const groups = $$('[data-a-group]');
  const singles = $$('[data-a]').filter((el) => !el.closest('.hero, .top, .stage') && !el.parentElement.closest('[data-a-group]'));
  const counted = $$('.card .num[data-count]');
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      const el = en.target;
      if (el.hasAttribute('data-a-group')) {
        const kids = $$('[data-a]', el).filter((k) => k.parentElement.closest('[data-a-group]') === el);
        animate(kids, { opacity: [0, 1], translateY: [32, 0], duration: 800, ease: EASE, delay: stagger(90) });
        $$('.shot img', el).forEach((img, i) => animate(img, { translateY: [40, 0], duration: 900, ease: EASE, delay: 200 + i * 90 }));
        $$('.item', el).forEach((it, i) => animate(it, { borderLeftWidth: ['0px', '8px'], duration: 600, ease: EASE, delay: 150 + i * 90 }));
      } else if (el.matches('.num[data-count]')) {
        countUp(el);
      } else {
        const from = el.dataset.from || 'up';
        const t = from === 'left' ? { translateX: [-40, 0] } : from === 'right' ? { translateX: [40, 0] } : { translateY: [32, 0] };
        animate(el, { opacity: [0, 1], ...t, duration: 800, ease: EASE });
        if (el.matches('.convert-art, .cta-block')) animate(el, { '--o': ['0px', '12px'], duration: 900, ease: EASE, delay: 150 });
      }
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  [...singles, ...groups, ...counted].forEach((el) => io.observe(el));
}

// 64.2% · 2.4배 · 100% 같은 숫자는 0부터 세어 올라감 (원래 글자 형식 유지)
function countUp(el) {
  const m = el.dataset.count.match(/^([\d.]+)(.*)$/);
  if (!m) return;
  const target = parseFloat(m[1]), dec = (m[1].split('.')[1] || '').length, tail = m[2];
  const o = { v: 0 };
  animate(o, { v: target, duration: 1400, ease: 'outQuart', onUpdate: () => { el.textContent = o.v.toFixed(dec) + tail; }, onComplete: () => { el.textContent = el.dataset.count; } });
}

// ---------- 자주 묻는 질문: 부드럽게 펼치고 접기 ----------
function faq() {
  for (const d of $$('.faq-item')) {
    const sum = $('summary', d), body = $('p', d);
    sum.addEventListener('click', (e) => {
      e.preventDefault();
      if (d.dataset.busy) return;
      d.dataset.busy = '1';
      const icon = sum;
      if (!d.open) {
        d.open = true;
        const h = body.scrollHeight;
        animate(body, { height: [0, h], opacity: [0, 1], paddingTop: [0, 20], paddingBottom: [0, 24], duration: 450, ease: 'outQuart',
          onComplete: () => { body.style.height = ''; body.style.paddingTop = ''; body.style.paddingBottom = ''; delete d.dataset.busy; } });
      } else {
        const h = body.offsetHeight;
        animate(body, { height: [h, 0], opacity: [1, 0], paddingTop: [20, 0], paddingBottom: [24, 0], duration: 320, ease: 'inQuart',
          onComplete: () => { d.open = false; body.style.cssText = ''; delete d.dataset.busy; } });
      }
      animate(icon, { '--r': d.open ? ['0deg', '180deg'] : ['180deg', '0deg'], duration: 400, ease: EASE });
    });
  }
}

// ---------- 시연 페이지 ----------
function demo() {
  if (!$('.stage')) return;
  createTimeline({ defaults: { ease: EASE, duration: 800 } })
    .add('.top .eyebrow, .top h1', { opacity: [0, 1], translateY: [20, 0], delay: stagger(100) }, 0)
    .add('.steps li', { opacity: [0, 1], translateY: [24, 0], delay: stagger(80) }, 200)
    .add('.bar', { opacity: [0, 1] }, 500)
    .add('.dev.k', { opacity: [0, 1], translateY: [40, 0], duration: 1000 }, 450)
    .add('.dev.p', { opacity: [0, 1], translateY: [40, 0], duration: 1000 }, 600);
}
