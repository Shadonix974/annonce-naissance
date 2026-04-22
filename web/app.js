/* =============================================================
   Annonce-naissance — runtime
   ============================================================= */

const state = {
  tweaks: {},
  photos: [],
  gifts: [],
  timeline: [],
  sceneIdx: 0,
  scenes: [],
  rail: null,
  musicPlaying: false,
  reservedGiftIds: new Set(JSON.parse(localStorage.getItem('reservedGiftIds') || '[]')),
};

const ACCENTS = {
  gold:  { "--gold": "oklch(0.72 0.08 80)",  "--gold-soft": "oklch(0.82 0.05 85)"  },
  sage:  { "--gold": "oklch(0.72 0.06 150)", "--gold-soft": "oklch(0.82 0.04 150)" },
  rose:  { "--gold": "oklch(0.76 0.08 25)",  "--gold-soft": "oklch(0.85 0.05 25)"  },
  azure: { "--gold": "oklch(0.78 0.08 230)", "--gold-soft": "oklch(0.86 0.05 230)" },
};

/* ---------- DOM helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- Populate content from tweaks ---------- */
function applyTweaks() {
  const t = state.tweaks;
  // Accent
  const accent = ACCENTS[t.accent] || ACCENTS.gold;
  Object.entries(accent).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));

  // Text substitutions via data-t attribute
  $$('[data-t]').forEach(el => {
    const key = el.dataset.t;
    if (t[key] !== undefined) el.textContent = t[key];
  });
}

/* ---------- Scene tracking ---------- */
function updateActiveScene() {
  const rail = state.rail;
  const vertical = getComputedStyle(rail).flexDirection === 'column';
  const idx = vertical
    ? Math.round(rail.scrollTop / window.innerHeight)
    : Math.round(rail.scrollLeft / window.innerWidth);
  if (idx !== state.sceneIdx) { state.sceneIdx = idx; syncSceneChrome(); }
  state.scenes.forEach((s, i) => s.classList.toggle('is-active', i === idx));
}

function syncSceneChrome() {
  const idx = state.sceneIdx;
  const total = state.scenes.length;
  $('#sceneCount').textContent = `${String(idx + 1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`;
  $$('#progress .seg').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
    el.classList.toggle('done', i < idx);
  });
  $('#prevBtn').disabled = idx === 0;
  $('#nextBtn').disabled = idx === total - 1;
  // Post to parent for speaker notes sync (harmless if no parent)
  try { window.parent.postMessage({ slideIndexChanged: idx }, '*'); } catch (e) {}
}

function goTo(idx) {
  idx = Math.max(0, Math.min(state.scenes.length - 1, idx));
  const vertical = getComputedStyle(state.rail).flexDirection === 'column';
  state.rail.scrollTo(
    vertical ? { top: idx * window.innerHeight, behavior: 'smooth' }
             : { left: idx * window.innerWidth, behavior: 'smooth' },
  );
}

/* ---------- Gift registry ---------- */
function renderGifts() {
  const grid = document.getElementById('regGrid');
  grid.innerHTML = '';
  for (const g of state.gifts) {
    const el = document.createElement('div');
    el.className = 'gift' + (g.takenBy ? ' taken' : '');
    el.dataset.id = g.id;
    const mineFlag = state.reservedGiftIds.has(g.id) ? ' (réservé par vous)' : '';
    el.innerHTML = `
      <div class="ph"></div>
      <div class="g-name"></div>
      <div class="g-meta">
        <span class="g-range"></span>
        <span class="g-status"></span>
      </div>
    `;
    el.querySelector('.g-name').textContent = g.name;
    el.querySelector('.g-range').textContent = g.rangeText;
    el.querySelector('.g-status').textContent = g.takenBy
      ? `✓ Pris par ${g.takenBy}${mineFlag}`
      : '○ Disponible';
    el.addEventListener('click', () => openGiftModal(g));
    grid.appendChild(el);
  }
}

function openGiftModal(gift) {
  const dlg = document.getElementById('giftModal');
  const form = dlg.querySelector('form');
  document.getElementById('giftModalTitle').textContent = gift.name;
  document.getElementById('giftModalRange').textContent = gift.rangeText;
  form.name.value = '';
  form.note.value = '';
  const err = document.getElementById('giftModalError');
  err.hidden = true;
  err.textContent = '';

  const mine = state.reservedGiftIds.has(gift.id);
  const alreadyTaken = !!gift.takenBy;
  const confirmBtn = form.querySelector('button[value=confirm]');

  if (alreadyTaken && !mine) {
    err.hidden = false;
    err.textContent = `Déjà réservé par ${gift.takenBy}. Les parents peuvent annuler si besoin.`;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Je le prends';
  } else if (mine) {
    confirmBtn.textContent = 'Annuler ma réservation';
    confirmBtn.disabled = false;
  } else {
    confirmBtn.textContent = 'Je le prends';
    confirmBtn.disabled = false;
  }

  const handler = async (e) => {
    const btn = e.submitter;
    if (!btn || btn.value !== 'confirm') return;
    e.preventDefault();
    const token = localStorage.getItem('accessToken');
    try {
      if (mine) {
        const r = await fetch(`/api/gifts/${gift.id}/unreserve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Access-Token': token },
          body: JSON.stringify({ name: gift.takenBy }),
        });
        if (!r.ok) throw new Error();
        state.reservedGiftIds.delete(gift.id);
      } else {
        const name = form.name.value.trim();
        if (!name) { err.hidden = false; err.textContent = 'Prénom requis.'; return; }
        const r = await fetch(`/api/gifts/${gift.id}/reserve`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Access-Token': token },
          body: JSON.stringify({ name, note: form.note.value || undefined }),
        });
        if (r.status === 409) { err.hidden = false; err.textContent = 'Déjà réservé.'; return; }
        if (!r.ok) throw new Error();
        state.reservedGiftIds.add(gift.id);
      }
      localStorage.setItem('reservedGiftIds', JSON.stringify([...state.reservedGiftIds]));
      dlg.close();
    } catch {
      err.hidden = false;
      err.textContent = 'Une erreur est survenue. Réessayez.';
    }
  };

  form.addEventListener('submit', handler, { once: true });
  dlg.showModal();
}

/* ---------- Ambient music (Web Audio, subtle) ---------- */
let audioCtx = null;
let audioNodes = [];

function startMusic() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const ctx = audioCtx;
  if (ctx.state === 'suspended') ctx.resume();

  // A gentle four-note loop reminiscent of a lullaby: D4, F#4, A4, E4
  const notes = [293.66, 369.99, 440.00, 329.63];
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 1.5);
  master.connect(ctx.destination);

  const reverb = ctx.createGain();
  reverb.gain.value = 0.3;
  reverb.connect(master);

  const step = 1.6;

  const interval = setInterval(() => {
    if (!state.musicPlaying) { clearInterval(interval); return; }
    const now = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * step;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.4, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.001, t + step * 0.9);
      osc.connect(g); g.connect(reverb);
      osc.start(t);
      osc.stop(t + step);
    });
  }, step * notes.length * 1000);

  audioNodes.push({ master, interval });
}

function stopMusic() {
  audioNodes.forEach(({ master, interval }) => {
    if (interval) clearInterval(interval);
    if (master && audioCtx) {
      master.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
    }
  });
  audioNodes = [];
}

function toggleMusic() {
  const btn = $('#musicBtn');
  state.musicPlaying = !state.musicPlaying;
  btn.classList.toggle('playing', state.musicPlaying);
  btn.querySelector('.label').textContent = state.musicPlaying ? 'Musique · on' : 'Musique · off';
  if (state.musicPlaying) startMusic(); else stopMusic();
}

/* ---------- Token bootstrap ---------- */
function getAccessToken() {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('k');
  if (fromUrl) {
    localStorage.setItem('accessToken', fromUrl);
    url.searchParams.delete('k');
    history.replaceState(null, '', url.toString());
    return fromUrl;
  }
  return localStorage.getItem('accessToken');
}

async function fetchState(token) {
  const r = await fetch('/api/state', { headers: { 'X-Access-Token': token } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('state_fetch_failed');
  return r.json();
}

function showPrivateLanding() {
  document.body.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:2rem;text-align:center;
                 background:oklch(0.22 0.045 255);color:oklch(0.965 0.015 85);font-family:'Cormorant Garamond',serif;">
      <div style="max-width:420px;">
        <p style="font-size:14px;letter-spacing:.35em;text-transform:uppercase;opacity:.6;">Introuvable</p>
        <h1 style="font-weight:300;font-size:36px;margin:12px 0 16px;">Ce faire-part n'existe pas ou plus.</h1>
        <p style="opacity:.7;">Vérifiez le lien reçu par les parents.</p>
      </div>
    </main>
  `;
}

function applyTimeline() {
  const list = document.getElementById('timelineList');
  if (!list) return;
  list.innerHTML = '';
  for (const e of state.timeline) {
    const el = document.createElement('div');
    el.className = 'tick' + (e.isNow ? ' now' : '');
    const d = document.createElement('div'); d.className = 'date'; d.textContent = e.dateLabel;
    const l = document.createElement('div'); l.className = 'label'; l.textContent = e.text;
    el.append(d, l);
    list.appendChild(el);
  }
}
function renderPhotos() {
  const grids = [
    { el: document.getElementById('triptychGrid'), section: 'triptych' },
    { el: document.getElementById('galleryGrid'),  section: 'gallery' },
  ];
  for (const { el, section } of grids) {
    if (!el) continue;
    el.innerHTML = '';
    const items = state.photos.filter((p) => p.section === section);
    for (const p of items) {
      const pic = document.createElement('picture');
      pic.className = 'ph';
      const sizesAttr = section === 'triptych' ? '(max-width: 820px) 100vw, 33vw' : '(max-width: 820px) 100vw, 50vw';
      pic.innerHTML = `
        <source type="image/avif" srcset="/photos/${p.id}/thumb.avif 400w, /photos/${p.id}/medium.avif 1200w, /photos/${p.id}/full.avif 2000w" sizes="${sizesAttr}">
        <source type="image/webp" srcset="/photos/${p.id}/thumb.webp 400w, /photos/${p.id}/medium.webp 1200w, /photos/${p.id}/full.webp 2000w" sizes="${sizesAttr}">
        <img src="/photos/${p.id}/medium.jpg"
             srcset="/photos/${p.id}/thumb.jpg 400w, /photos/${p.id}/medium.jpg 1200w, /photos/${p.id}/full.jpg 2000w"
             sizes="${sizesAttr}"
             width="${p.width}" height="${p.height}"
             alt="${String(p.alt || '').replace(/"/g, '&quot;')}"
             loading="lazy" decoding="async">
      `;
      el.appendChild(pic);
    }
  }
}
function subscribeSSE(token) {
  const es = new EventSource(`/api/stream?k=${encodeURIComponent(token)}`);
  es.addEventListener('gift.reserved',   (e) => applyGiftPatch(JSON.parse(e.data)));
  es.addEventListener('gift.unreserved', (e) => applyGiftPatch(JSON.parse(e.data)));
  es.addEventListener('gift.created',    (e) => applyGiftCreated(JSON.parse(e.data).gift));
  es.addEventListener('gift.updated',    (e) => applyGiftCreated(JSON.parse(e.data).gift));
  es.addEventListener('gift.deleted',    (e) => applyGiftDeleted(JSON.parse(e.data).id));
  // `ping` events are silently ignored (no listener registered).
}

function applyGiftPatch(evt) {
  const g = state.gifts.find((x) => x.id === evt.id);
  if (!g) return;
  if (evt.type === 'gift.reserved') {
    g.takenBy = evt.taken_by;
    g.takenNote = evt.taken_note;
    g.takenAt = evt.taken_at;
  } else {
    g.takenBy = null;
    g.takenNote = null;
    g.takenAt = null;
  }
  renderGifts();
}

function applyGiftCreated(gift) {
  const idx = state.gifts.findIndex((x) => x.id === gift.id);
  if (idx >= 0) state.gifts[idx] = gift; else state.gifts.push(gift);
  state.gifts.sort((a, b) => a.position - b.position);
  renderGifts();
}

function applyGiftDeleted(id) {
  state.gifts = state.gifts.filter((x) => x.id !== id);
  state.reservedGiftIds.delete(id);
  localStorage.setItem('reservedGiftIds', JSON.stringify([...state.reservedGiftIds]));
  renderGifts();
}

function registerServiceWorker() { /* implemented in Task 34 */ }

/* ---------- Edit mode integration ---------- */
window.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === '__edit_mode_set_keys' && d.edits) {
    Object.assign(state.tweaks, d.edits);
    applyTweaks();
  }
});

/* ---------- Boot ---------- */
async function init() {
  const token = getAccessToken();
  if (!token) { showPrivateLanding(); return; }

  let data;
  try { data = await fetchState(token); }
  catch { showPrivateLanding(); return; }
  if (!data) { showPrivateLanding(); return; }

  Object.assign(state, data);

  // Set _k cookie so <img src="/photos/..."> requests carry the token.
  document.cookie = `_k=${encodeURIComponent(token)}; Path=/; SameSite=Strict; Max-Age=31536000`;

  state.rail = $('#rail');
  state.scenes = $$('.scene');
  syncSceneChrome();
  updateActiveScene();

  state.rail.addEventListener('scroll', () => requestAnimationFrame(updateActiveScene));

  $('#prevBtn').addEventListener('click', () => goTo(state.sceneIdx - 1));
  $('#nextBtn').addEventListener('click', () => goTo(state.sceneIdx + 1));
  $$('#progress .seg').forEach((el, i) => el.addEventListener('click', () => goTo(i)));

  document.addEventListener('keydown', (e) => {
    const vertical = getComputedStyle(state.rail).flexDirection === 'column';
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (vertical && e.key === 'ArrowDown'))
      { e.preventDefault(); goTo(state.sceneIdx + 1); }
    if (e.key === 'ArrowLeft'  || e.key === 'PageUp' || (vertical && e.key === 'ArrowUp'))
      { e.preventDefault(); goTo(state.sceneIdx - 1); }
  });

  state.rail.addEventListener('wheel', (e) => {
    const vertical = getComputedStyle(state.rail).flexDirection === 'column';
    if (vertical) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      state.rail.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  $('#musicBtn').addEventListener('click', toggleMusic);

  applyTweaks();
  applyTimeline();
  renderPhotos();
  renderGifts();
  subscribeSSE(token);
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', init);
