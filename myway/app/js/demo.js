// 체험 모드: 서버 없이 같은 브라우저 안의 목업 키오스크(hub=local)와 연결해 안내한다.
// 안내 엔진(engine.js)은 서버와 같은 코드를 그대로 쓴다. (카메라 사진 모드는 AI 서버가 있어야 함)
import { fromKioskState, runStep } from '../../lib/engine.js';
import { parseGoalRule, confirmText } from '../../lib/goal-rules.js';

export function provider(app) {
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel('myway-hub') : null;
  let latest = null, version = 0, lastProfile = null, lastSent = 0;
  const watchers = new Set();
  chan && (chan.onmessage = (e) => {
    const m = e.data || {};
    if (m.type !== 'state' || (app.kioskId && m.id !== app.kioskId)) return;
    latest = m.screen; version = m.version;
    // 키오스크가 나중에 켜졌거나 새로 고쳐져서 프로필을 못 받았으면 다시 보낸다
    if (lastProfile && !m.screen.converted && Date.now() - lastSent > 1500) { lastSent = Date.now(); chan.postMessage({ type: 'profile', id: app.kioskId, profile: lastProfile }); }
    watchers.forEach((f) => f(version));
  });

  return {
    active: false,
    on() {
      this.active = true;
      app.kioskId = app.kioskId || new URLSearchParams(location.search).get('k') || 'cafe-01';
      chan?.postMessage({ type: 'hello', id: app.kioskId });
      document.documentElement.classList.add('demo');
    },
    async goal(text) {
      const goal = parseGoalRule(text);
      return { goal, confirm: confirmText(goal), ask: !goal.place && goal.items.length ? '여기서 드세요, 가지고 가세요?' : null, source: 'rule' };
    },
    async enterGuide() {
      document.querySelector('#video').style.display = 'none';
      chan?.postMessage({ type: 'hello', id: app.kioskId });
    },
    async capture() { return null; },
    async step(body) {
      if (!latest) {
        chan?.postMessage({ type: 'hello', id: app.kioskId });
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!latest) return { action: 'error', say: '키오스크 화면이 아직 안 보여요. 왼쪽 키오스크가 켜져 있는지 봐 주세요.', display: { big: '키오스크를 찾는 중', sub: '시연 페이지에서 열어 주세요' } };
      const screen = fromKioskState(latest, body.goal, body.state || {});
      return runStep({ screen, goal: body.goal, state: body.state || {}, profile: body.profile || {}, source: 'linked' });
    },
    sendProfile(profile) { lastProfile = profile; lastSent = Date.now(); chan?.postMessage({ type: 'profile', id: app.kioskId, profile }); },
    watch(cb) {
      let t = null;
      const f = () => { clearTimeout(t); t = setTimeout(cb, 500); };
      watchers.add(f);
      return () => watchers.delete(f);
    },
  };
}
