// yep, it's code rotted — Frutiger Aero, который гниёт. Один файл, без зависимостей.
'use strict';

const $ = (sel) => document.querySelector(sel);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- печенька: сначала посмотри ---------- */
const cookie = $('#cookie');
const looked = localStorage.getItem('rot.looked') === '1';
if (looked) $('#look').textContent = 'Посмотрел ещё раз';
let audioStarted = false;
$('#look').addEventListener('click', () => {
  localStorage.setItem('rot.looked', '1');
  cookie.classList.add('hidden');
  document.body.classList.remove('pre');
  startAudio();
});
$('#later').addEventListener('click', () => {
  const msgs = ['Пчёлка ждёт.', 'Она так хочет эту печеньку.', 'Посмотри на печеньку.', 'Печенька никуда не денется. Ты тоже.'];
  $('#cookie p').textContent = msgs[Math.floor(Math.random() * msgs.length)];
  document.querySelector('.cookie').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15) rotate(8deg)' }, { transform: 'scale(1)' }], { duration: 500 });
});

/* ---------- установка (PWA) ---------- */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice.catch(() => null);
  deferredInstall = null;
  $('#installBtn').hidden = true;
});
if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) $('#installHint').textContent = 'Установлено. Работает офлайн.';
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

/* ---------- часы: 6 часов, ямс ---------- */
(() => {
  const ticks = $('.ticks');
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const r1 = i % 3 === 0 ? 78 : 84;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', (100 + Math.sin(a) * r1).toFixed(1));
    line.setAttribute('y1', (100 - Math.cos(a) * r1).toFixed(1));
    line.setAttribute('x2', (100 + Math.sin(a) * 90).toFixed(1));
    line.setAttribute('y2', (100 - Math.cos(a) * 90).toFixed(1));
    ticks.appendChild(line);
  }
  const digital = $('#digital');
  const glyphs = ['06:00', '06:00', '06:00', '0б:00', '06:0▯', '6:00 ', '06:00'];
  setInterval(() => {
    digital.textContent = document.body.classList.contains('rot') ? glyphs[Math.floor(Math.random() * glyphs.length)] : '06:00';
  }, 400);
})();

/* ---------- плеер losercore (WebAudio, slowed + reverb) ---------- */
const TRACKS = [
  ['никому не нужен (slowed)', 251],
  ['misery.wav — 6 часов вечера', 199],
  ['frutiger funeral (reverb)', 312],
  ['он так хочет эту печеньку', 178],
  ['yams at 6 o’clock (code rot mix)', 287],
];
let ctx = null;
let master = null;
let playing = false;
let trackIndex = 0;
let pos = 0;
let nodes = [];

function startAudio() {
  if (audioStarted) return;
  audioStarted = true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.0001;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 900;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.45;
    delay.connect(fb).connect(delay);
    master.connect(low);
    low.connect(ctx.destination);
    low.connect(delay);
    delay.connect(ctx.destination);
    play();
  } catch {
    /* звука не будет — и ладно */
  }
}

function chord(root, when, len) {
  // мрачный минорный аккорд, слегка расстроенный, с плывущей высотой (slowed)
  const freqs = [root, root * 1.1892, root * 1.4983, root * 2];
  for (const f of freqs) {
    for (const det of [-6, 5]) {
      const osc = ctx.createOscillator();
      osc.type = det < 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(f, when);
      osc.frequency.linearRampToValueAtTime(f * 0.985, when + len);
      osc.detune.value = det;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.09, when + len * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, when + len);
      osc.connect(g).connect(master);
      osc.start(when);
      osc.stop(when + len + 0.1);
      nodes.push(osc);
    }
  }
}

let seqTimer = null;
function play() {
  if (!ctx) return;
  playing = true;
  $('#playBtn').textContent = '❚❚';
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 2);
  const roots = [110, 87.31, 98, 73.42]; // A2 · F2 · G2 · D2 — грустно и медленно
  let step = 0;
  const schedule = () => {
    const t = ctx.currentTime + 0.05;
    chord(roots[step % roots.length] * (document.body.classList.contains('rot-hard') ? 0.94 : 1), t, 5.5);
    step++;
  };
  schedule();
  seqTimer = setInterval(schedule, 5000);
}
function pause() {
  playing = false;
  $('#playBtn').textContent = '▶';
  clearInterval(seqTimer);
  if (master) master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
}
$('#playBtn').addEventListener('click', () => {
  if (!audioStarted) startAudio();
  else if (playing) pause();
  else play();
});

(() => {
  const list = $('#tracks');
  TRACKS.forEach(([name], i) => {
    const li = document.createElement('li');
    li.textContent = name;
    if (i === 0) li.classList.add('on');
    li.addEventListener('click', () => selectTrack(i));
    list.appendChild(li);
  });
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function selectTrack(i) {
    trackIndex = i;
    pos = 0;
    [...list.children].forEach((el, k) => el.classList.toggle('on', k === i));
    $('#trackTitle').textContent = TRACKS[i][0];
    $('#tdur').textContent = fmt(TRACKS[i][1]);
  }
  selectTrack(0);
  setInterval(() => {
    if (!playing) return;
    const dur = TRACKS[trackIndex][1];
    // code rot: прогресс иногда идёт назад или замирает
    const r = Math.random();
    pos += r < 0.08 ? -3 : r < 0.16 ? 0 : 1;
    pos = Math.max(0, pos);
    if (pos >= dur) selectTrack((trackIndex + 1) % TRACKS.length);
    $('#fill').style.width = `${(pos / dur) * 100}%`;
    $('#tcur').textContent = fmt(pos);
  }, 1000);
})();

/* ---------- паровой котёл ---------- */
(() => {
  let pressure = 2.4;
  setInterval(() => {
    pressure = Math.max(0, Math.min(8, pressure + (Math.random() - 0.45) * 1.2));
    const angle = -90 + (pressure / 8) * 180;
    $('#needle').style.transform = `rotate(${angle + 45}deg)`;
    const hot = pressure > 6.2;
    $('#steamNote').textContent = `давление ${pressure.toFixed(1)} атм · ${hot ? 'пар рвётся наружу' : 'пар идёт'}`;
    steamRate = hot ? 3 : 1;
  }, 1400);
})();

/* ---------- misery.exe ---------- */
(() => {
  let minutes = 1;
  const text = $('#miseryText');
  setInterval(() => {
    minutes = minutes < 10 ? minutes + 1 : [1, 6, 6, 47, 999, 6][Math.floor(Math.random() * 6)];
    text.textContent = `Осталось: ${minutes} ${minutes === 1 ? 'минута' : minutes < 5 ? 'минуты' : 'минут'}`;
  }, 3000);
})();

/* ---------- гниение: события ---------- */
const errorBox = $('#errorBox');
const closeErr = () => {
  errorBox.hidden = true;
};
$('#errClose').addEventListener('click', closeErr);
$('#errOk').addEventListener('click', closeErr);
let steamRate = 1;
let missingUntil = 0;
let tearUntil = 0;
let freezeUntil = 0;
const titles = ['yep, it’s code rotted', 'yep, it’s code rotted (не отвечает)', 'yep, it’s code rotted', 'y̶e̶p̶, it’s code rotted'];
function rotEvent() {
  if (reduced) return;
  const roll = Math.random();
  const now = performance.now();
  if (roll < 0.42) {
    document.body.classList.add('rot');
    setTimeout(() => document.body.classList.remove('rot'), 350 + Math.random() * 700);
    tearUntil = now + 600;
  } else if (roll < 0.62) {
    document.body.classList.add('rot-hard');
    setTimeout(() => document.body.classList.remove('rot-hard'), 500 + Math.random() * 900);
  } else if (roll < 0.76) {
    missingUntil = now + 1200;
    document.body.classList.add('missing');
    setTimeout(() => document.body.classList.remove('missing'), 1200);
  } else if (roll < 0.86) {
    // «не отвечает»: всё замирает на секунду
    document.body.classList.add('frozen');
    freezeUntil = now + 900;
    setTimeout(() => document.body.classList.remove('frozen'), 900);
  } else if (roll < 0.94) {
    errorBox.hidden = false;
  }
  document.title = titles[Math.floor(Math.random() * titles.length)];
}
(function scheduleRot() {
  setTimeout(() => {
    rotEvent();
    scheduleRot();
  }, 4000 + Math.random() * 7000);
})();

/* ---------- canvas: вода, пузыри, пар, разрывы ---------- */
const canvas = $('#sky');
const g = canvas.getContext('2d', { alpha: true });
let W = 0;
let H = 0;
let dpr = 1;
const bubbles = [];
const steam = [];
function resize() {
  W = innerWidth;
  H = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();
for (let i = 0; i < 26; i++) bubbles.push(newBubble(true));
function newBubble(anywhere) {
  return { x: Math.random() * W, y: anywhere ? Math.random() * H : H + 20, r: 4 + Math.random() * 16, v: 12 + Math.random() * 26, wob: Math.random() * 6.28 };
}
function drawBubble(b) {
  g.beginPath();
  g.arc(b.x, b.y, b.r, 0, 6.28);
  g.fillStyle = 'rgba(190, 235, 255, 0.18)';
  g.fill();
  g.lineWidth = 1.2;
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.stroke();
  g.beginPath();
  g.arc(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.28, 0, 6.28);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fill();
}
let last = 0;
let t = 0;
let skip = 0;
function frame(now) {
  if (!reduced) requestAnimationFrame(frame);
  if (freezeUntil > now) return;
  // code rot: иногда кадры просто выпадают
  if (skip > 0) {
    skip--;
    return;
  }
  if (Math.random() < 0.01) skip = 4 + Math.floor(Math.random() * 10);
  const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
  last = now;
  t += dt;
  g.clearRect(0, 0, W, H);
  // вода внизу: глянцевые волны Aero
  const waterTop = H * 0.72;
  const grad = g.createLinearGradient(0, waterTop, 0, H);
  grad.addColorStop(0, 'rgba(120, 220, 255, 0.55)');
  grad.addColorStop(0.5, 'rgba(30, 120, 200, 0.6)');
  grad.addColorStop(1, 'rgba(5, 30, 70, 0.9)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 12) {
    g.lineTo(x, waterTop + Math.sin(x / 70 + t * 1.2) * 6 + Math.sin(x / 23 - t * 2.1) * 2.5);
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  // блики
  g.strokeStyle = 'rgba(255,255,255,0.45)';
  g.lineWidth = 1.5;
  g.beginPath();
  for (let x = 0; x <= W; x += 12) {
    const y = waterTop + Math.sin(x / 70 + t * 1.2) * 6 + Math.sin(x / 23 - t * 2.1) * 2.5;
    x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke();
  // пузыри
  for (const b of bubbles) {
    b.y -= b.v * dt;
    b.x += Math.sin(t * 1.3 + b.wob) * 0.4;
    if (b.y < -30) Object.assign(b, newBubble(false));
    drawBubble(b);
  }
  // пар из котла: снизу-справа
  if (Math.random() < 0.25 * steamRate) steam.push({ x: W * (0.72 + Math.random() * 0.2), y: H * 0.74, r: 8 + Math.random() * 14, a: 0.5, vy: 24 + Math.random() * 20 });
  for (let i = steam.length - 1; i >= 0; i--) {
    const s = steam[i];
    s.y -= s.vy * dt;
    s.x += Math.sin(t * 2 + s.y / 30) * 0.6;
    s.r += 14 * dt;
    s.a -= 0.16 * dt;
    if (s.a <= 0) {
      steam.splice(i, 1);
      continue;
    }
    g.beginPath();
    g.arc(s.x, s.y, s.r, 0, 6.28);
    g.fillStyle = `rgba(235, 240, 245, ${s.a.toFixed(3)})`;
    g.fill();
  }
  // разрывы текстур: сдвигаем полосы кадра
  if (tearUntil > now) {
    for (let k = 0; k < 6; k++) {
      const y = Math.random() * H;
      const h = 6 + Math.random() * 40;
      const dx = (Math.random() - 0.5) * 80;
      g.drawImage(canvas, 0, y * dpr, canvas.width, h * dpr, dx, y, W, h);
    }
    g.fillStyle = 'rgba(255, 43, 214, 0.18)';
    g.fillRect(0, Math.random() * H, W, 3);
  }
  // пропавшая текстура: розово-чёрная шахматка
  if (missingUntil > now) {
    const s = 24;
    const x0 = Math.floor(W * 0.1);
    const y0 = Math.floor(H * 0.2);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 7; x++) {
        g.fillStyle = (x + y) % 2 ? '#ff00ff' : '#000';
        g.fillRect(x0 + x * s, y0 + y * s, s, s);
      }
    }
  }
}
if (!reduced) requestAnimationFrame(frame);
else {
  last = performance.now();
  frame(performance.now());
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) pause();
});
