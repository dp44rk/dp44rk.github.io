// 카메라: 뒤 카메라 켜기, 한 장 찍기, 밝기·흔들림 간이 검사, 키오스크 QR 찾기
let stream = null;

export async function start(video) {
  if (stream) { video.srcObject = stream; return true; }
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('이 브라우저는 카메라를 쓸 수 없어요. 주소가 https인지 확인해 주세요.');
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  video.srcObject = stream;
  await video.play().catch(() => {});
  return true;
}
export function stop() { stream?.getTracks().forEach((t) => t.stop()); stream = null; }

/** 비디오 → { dataUrl(긴 변 maxSide), canvas, quality } */
export function capture(video, maxSide = 1024) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw) return null;
  const s = Math.min(1, maxSide / Math.max(vw, vh));
  const c = document.createElement('canvas');
  c.width = Math.round(vw * s); c.height = Math.round(vh * s);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, c.width, c.height);
  return { canvas: c, dataUrl: c.toDataURL('image/jpeg', 0.82), quality: quality(c) };
}

/** 이미지 파일(평가·시연용) → 같은 형태 */
export async function fromImage(src, maxSide = 1024) {
  const img = new Image(); img.crossOrigin = 'anonymous'; img.src = src;
  await img.decode();
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, dataUrl: c.toDataURL('image/jpeg', 0.82), quality: quality(c) };
}

/** 작은 흑백으로 줄여 밝기 평균과 라플라시안 분산(선명도) */
export function quality(canvas) {
  const w = 160, h = Math.round((canvas.height / canvas.width) * 160);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) { g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; sum += g[i]; }
  const mean = sum / (w * h);
  let lsum = 0, lsq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    lsum += l; lsq += l * l; n++;
  }
  const sharp = lsq / n - (lsum / n) ** 2;
  return { brightness: Math.round(mean), sharpness: Math.round(sharp), dark: mean < 35, blurry: sharp < 25 };
}

/** 사진 안에서 「내 방식 QR」 찾기 → { kioskId, api } */
export function findKioskQr(canvas) {
  if (!window.jsQR) return null;
  const tries = [1, 0.6]; // 원본, 축소
  for (const s of tries) {
    const w = Math.round(canvas.width * s), h = Math.round(canvas.height * s);
    let data;
    if (s === 1) data = canvas.getContext('2d').getImageData(0, 0, w, h);
    else { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(canvas, 0, 0, w, h); data = c.getContext('2d').getImageData(0, 0, w, h); }
    const r = window.jsQR(data.data, w, h, { inversionAttempts: 'dontInvert' });
    if (r?.data) {
      try {
        const u = new URL(r.data);
        const k = u.searchParams.get('k');
        if (k) return { kioskId: k, api: u.searchParams.get('api') || null, raw: r.data };
      } catch {}
    }
  }
  return null;
}
