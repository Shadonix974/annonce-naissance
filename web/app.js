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

/* ---------- Scene tracking ----------
   IntersectionObserver is used instead of a scroll listener because the
   scroll container differs by viewport: on desktop the horizontal `.rail`
   scrolls, on mobile the rail becomes `height:auto` and the window scrolls.
   IO doesn't care which container moves — whichever scene crosses 50%
   visible becomes `.is-active`, which triggers the reveal animations. */
function setActiveScene(idx) {
  idx = Math.max(0, Math.min(state.scenes.length - 1, idx));
  state.scenes.forEach((s, i) => s.classList.toggle('is-active', i === idx));
  if (idx !== state.sceneIdx) { state.sceneIdx = idx; syncSceneChrome(); }
}

function initSceneTracking() {
  // Desktop: horizontal rail scrolls, each scene is viewport-width.
  // Mobile:  page scrolls, scenes can be taller than viewport.
  // Instead of relying on IO thresholds (which break when a scene is taller
  // than the viewport and never reaches ratio >= 0.5), compute the scene
  // whose rect overlaps the viewport centre point on each IO callback.
  function pickActive() {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    for (let i = 0; i < state.scenes.length; i++) {
      const r = state.scenes[i].getBoundingClientRect();
      if (r.left <= cx && cx <= r.right && r.top <= cy && cy <= r.bottom) {
        setActiveScene(i);
        return;
      }
    }
  }
  const io = new IntersectionObserver(pickActive, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  state.scenes.forEach(s => io.observe(s));
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
  state.scenes[idx].scrollIntoView({ block: 'start', inline: 'start', behavior: 'smooth' });
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
      <div class="ph" data-label="cadeau · photo"></div>
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

/* ---------- Ambient music (HTMLAudioElement, real file) ----------
   The audio file is served at /music.mp3 (dropped into web/music.mp3).
   The <audio> element in index.html preloads metadata only; the body
   is streamed when the user toggles playback. Fade in/out is driven
   by rAF on .volume for a gentle start/stop. */
const MUSIC_TARGET_VOLUME = 0.5;
let musicFadeRaf = 0;

function fadeMusic(audio, from, to, durationMs, done) {
  if (musicFadeRaf) cancelAnimationFrame(musicFadeRaf);
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / durationMs);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * p));
    if (p < 1) musicFadeRaf = requestAnimationFrame(tick);
    else { musicFadeRaf = 0; if (done) done(); }
  }
  musicFadeRaf = requestAnimationFrame(tick);
}

function startMusic() {
  const audio = document.getElementById('bgMusic');
  if (!audio) return;
  audio.volume = 0;
  const p = audio.play();
  // Autoplay policies: if the promise rejects (e.g. no user gesture, file
  // missing), flip the state back off so the UI stays consistent.
  if (p && typeof p.then === 'function') {
    p.then(() => fadeMusic(audio, 0, MUSIC_TARGET_VOLUME, 1500))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('Music playback failed:', err);
        state.musicPlaying = false;
        const btn = $('#musicBtn');
        if (btn) {
          btn.classList.remove('playing');
          btn.querySelector('.label').textContent = 'Musique · off';
        }
      });
  } else {
    fadeMusic(audio, 0, MUSIC_TARGET_VOLUME, 1500);
  }
}

function stopMusic() {
  const audio = document.getElementById('bgMusic');
  if (!audio) return;
  fadeMusic(audio, audio.volume, 0, 800, () => {
    audio.pause();
    audio.currentTime = 0;
  });
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
const TRIPTYCH_PLACEHOLDERS = ['photo · main du bébé', 'photo · portrait', 'photo · avec maman'];
const GALLERY_PLACEHOLDERS = [
  'photo · portrait 01', 'photo · détail main', 'photo · famille',
  'photo · sommeil', 'photo · premier sourire',
];

function renderPhotos() {
  const grids = [
    { el: document.getElementById('triptychGrid'), section: 'triptych', placeholders: TRIPTYCH_PLACEHOLDERS, masonry: false },
    { el: document.getElementById('galleryGrid'),  section: 'gallery',  placeholders: GALLERY_PLACEHOLDERS,  masonry: true  },
  ];
  for (const { el, section, placeholders, masonry } of grids) {
    if (!el) continue;
    el.innerHTML = '';
    const items = state.photos.filter((p) => p.section === section);
    // No uploads yet? Fall back to the original design placeholders so the
    // scene still holds visually before the parents upload anything.
    if (items.length === 0) {
      for (const label of placeholders) {
        const ph = document.createElement('div');
        ph.className = 'ph';
        ph.dataset.label = label;
        el.appendChild(ph);
      }
      continue;
    }
    for (const p of items) {
      const v = p.version || 1;
      const pic = document.createElement('picture');
      pic.className = 'ph';
      const sizesAttr = section === 'triptych' ? '(max-width: 820px) 100vw, 33vw' : '(max-width: 820px) 50vw, 33vw';
      pic.style.aspectRatio = `${p.width} / ${p.height}`;
      pic.innerHTML = `
        <source type="image/avif" srcset="/photos/${p.id}/thumb.avif?v=${v} 400w, /photos/${p.id}/medium.avif?v=${v} 1200w, /photos/${p.id}/full.avif?v=${v} 2000w" sizes="${sizesAttr}">
        <source type="image/webp" srcset="/photos/${p.id}/thumb.webp?v=${v} 400w, /photos/${p.id}/medium.webp?v=${v} 1200w, /photos/${p.id}/full.webp?v=${v} 2000w" sizes="${sizesAttr}">
        <img src="/photos/${p.id}/medium.jpg?v=${v}"
             srcset="/photos/${p.id}/thumb.jpg?v=${v} 400w, /photos/${p.id}/medium.jpg?v=${v} 1200w, /photos/${p.id}/full.jpg?v=${v} 2000w"
             sizes="${sizesAttr}"
             width="${p.width}" height="${p.height}"
             alt="${String(p.alt || '').replace(/"/g, '&quot;')}"
             loading="lazy" decoding="async">
      `;
      el.appendChild(pic);
    }
    if (masonry) bootstrapMasonry(el);
  }
}

// Load a classic (non-ESM) script once and resolve when it's attached to window.
function _loadVendorScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${url}`));
    document.head.appendChild(s);
  });
}

let _masonryReady = null;
async function bootstrapMasonry(grid) {
  if (!_masonryReady) {
    // imagesLoaded is NOT bundled inside masonry.pkgd.min.js (contrary to popular
    // belief — the "pkgd" bundle only includes jquery-bridget/get-size/ev-emitter
    // /fizzy-ui-utils/outlayer, not imagesloaded). Load both UMD bundles.
    _masonryReady = Promise.all([
      _loadVendorScript('/vendor/imagesloaded.pkgd.min.js'),
      _loadVendorScript('/vendor/masonry.pkgd.min.js'),
    ]).catch((err) => { _masonryReady = null; throw err; });
  }
  await _masonryReady;
  window.imagesLoaded(grid, () => {
    if (grid._masonry) grid._masonry.destroy();
    grid._masonry = new window.Masonry(grid, {
      itemSelector: '.ph',
      columnWidth: '.ph',
      percentPosition: true,
      gutter: 12,
      transitionDuration: 0,
    });
  });
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

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

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
  // Add Secure when served over HTTPS; keep it off in local http dev.
  const secureFlag = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `_k=${encodeURIComponent(token)}; Path=/; SameSite=Strict; Max-Age=31536000${secureFlag}`;

  state.rail = $('#rail');
  state.scenes = $$('.scene');
  syncSceneChrome();
  setActiveScene(0);
  initSceneTracking();

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
