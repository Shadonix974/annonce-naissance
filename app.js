/* =============================================================
   Annonce-naissance — runtime
   ============================================================= */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "babyName": "Léonard",
  "babyMiddle": "Augustin",
  "dateLong": "14 avril 2026",
  "dateShort": "14.04.2026",
  "timeBirth": "04h27",
  "weight": "3,42",
  "height": "51",
  "city": "Paris",
  "maternity": "Maternité des Lilas",
  "father": "Julien",
  "mother": "Camille",
  "paternalGP": "Pierre & Hélène",
  "maternalGP": "Antoine & Marie",
  "accent": "gold"
}/*EDITMODE-END*/;

const ACCENTS = {
  gold:    { "--gold": "oklch(0.72 0.08 80)",  "--gold-soft": "oklch(0.82 0.05 85)"  },
  sage:    { "--gold": "oklch(0.72 0.06 150)", "--gold-soft": "oklch(0.82 0.04 150)" },
  rose:    { "--gold": "oklch(0.76 0.08 25)",  "--gold-soft": "oklch(0.85 0.05 25)"  },
  azure:   { "--gold": "oklch(0.78 0.08 230)", "--gold-soft": "oklch(0.86 0.05 230)" }
};

const state = {
  tweaks: { ...TWEAK_DEFAULTS },
  sceneIdx: 0,
  scenes: [],
  rail: null,
  music: null,
  musicPlaying: false,
  messages: [
    { name: "Grand-mère Hélène", date: "15 avril 2026", body: "Le monde est plus doux depuis ce matin. Bienvenue mon petit prince, tu es déjà tant aimé." },
    { name: "Tante Sophie", date: "15 avril 2026", body: "Un immense bonheur pour toute la famille. Hâte de rencontrer ce petit bout de vous deux." },
    { name: "Oncle Marc", date: "16 avril 2026", body: "Félicitations à vous trois. Les nuits vont être courtes mais les souvenirs seront immenses." },
    { name: "Claire & Paul", date: "17 avril 2026", body: "Plein de tendresse pour vous quatre. On vous embrasse fort et on a hâte de le voir." }
  ],
  gifts: [
    { name: "Doudou en lin", range: "25–40 €", taken: false },
    { name: "Mobile musical en bois", range: "60–80 €", taken: true },
    { name: "Gigoteuse coton bio", range: "45 €", taken: false },
    { name: "Livre d'éveil tissu", range: "18 €", taken: false },
    { name: "Chaussons en cuir souple", range: "32 €", taken: true },
    { name: "Tapis d'éveil en laine", range: "90 €", taken: false }
  ]
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
  const idx = Math.round(rail.scrollLeft / window.innerWidth);
  if (idx !== state.sceneIdx) {
    state.sceneIdx = idx;
    syncSceneChrome();
  }
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
  state.rail.scrollTo({ left: idx * window.innerWidth, behavior: 'smooth' });
}

/* ---------- Guestbook ---------- */
function renderMessages() {
  const list = $('#msgList');
  list.innerHTML = '';
  state.messages.forEach(m => {
    const el = document.createElement('div');
    el.className = 'msg';
    el.innerHTML = `
      <div class="msg-head">
        <div class="msg-name"></div>
        <div class="msg-date"></div>
      </div>
      <div class="msg-body"></div>
    `;
    el.querySelector('.msg-name').textContent = m.name;
    el.querySelector('.msg-date').textContent = m.date;
    el.querySelector('.msg-body').textContent = `« ${m.body} »`;
    list.appendChild(el);
  });
}

function handleGuestSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const name = form.querySelector('[name=name]').value.trim();
  const body = form.querySelector('[name=body]').value.trim();
  if (!name || !body) return;
  const today = new Date();
  const dateStr = today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  state.messages.unshift({ name, date: dateStr, body });
  form.reset();
  renderMessages();
}

/* ---------- Gift registry ---------- */
function renderGifts() {
  const grid = $('#regGrid');
  grid.innerHTML = '';
  state.gifts.forEach((g, i) => {
    const el = document.createElement('div');
    el.className = 'gift' + (g.taken ? ' taken' : '');
    el.innerHTML = `
      <div class="ph" data-label="cadeau · photo"></div>
      <div class="g-name"></div>
      <div class="g-meta">
        <span class="g-range"></span>
        <span class="g-status"></span>
      </div>
    `;
    el.querySelector('.g-name').textContent = g.name;
    el.querySelector('.g-range').textContent = g.range;
    el.querySelector('.g-status').textContent = g.taken ? '✓ Réservé' : '○ Disponible';
    el.addEventListener('click', () => {
      state.gifts[i].taken = !state.gifts[i].taken;
      renderGifts();
    });
    grid.appendChild(el);
  });
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

  const loopStart = ctx.currentTime + 0.1;
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

/* ---------- Tweaks (edit mode integration) ---------- */
function buildTweaksPanel() {
  const panel = $('#tweaks');
  panel.innerHTML = `
    <h4>Tweaks</h4>
    <div class="group">
      <label>Prénom</label>
      <input type="text" data-tweak="babyName" value="${state.tweaks.babyName}"
             style="background:transparent;border:0;border-bottom:1px solid oklch(0.96 0.015 85 / 0.25);color:var(--cream);font-family:var(--serif);font-size:16px;padding:6px 2px;width:100%;">
    </div>
    <div class="group">
      <label>Date</label>
      <input type="text" data-tweak="dateLong" value="${state.tweaks.dateLong}"
             style="background:transparent;border:0;border-bottom:1px solid oklch(0.96 0.015 85 / 0.25);color:var(--cream);font-family:var(--serif);font-size:16px;padding:6px 2px;width:100%;">
    </div>
    <div class="group">
      <label>Accent doré</label>
      <div class="swatches">
        ${Object.entries(ACCENTS).map(([k, v]) =>
          `<div class="sw ${state.tweaks.accent === k ? 'active' : ''}"
                data-accent="${k}"
                style="background:${v['--gold']};" title="${k}"></div>`
        ).join('')}
      </div>
    </div>
    <div class="group" style="font-family:var(--serif);font-style:italic;font-size:12px;opacity:0.55;line-height:1.5;margin-top:18px;">
      Modifiez aussi les autres champs dans le code :
      prénom(2), heure, poids, parents, grands-parents, ville, maternité.
    </div>
  `;

  panel.querySelectorAll('input[data-tweak]').forEach(inp => {
    inp.addEventListener('input', () => {
      state.tweaks[inp.dataset.tweak] = inp.value;
      applyTweaks();
      postTweaks({ [inp.dataset.tweak]: inp.value });
    });
  });
  panel.querySelectorAll('.sw').forEach(sw => {
    sw.addEventListener('click', () => {
      state.tweaks.accent = sw.dataset.accent;
      panel.querySelectorAll('.sw').forEach(s => s.classList.toggle('active', s === sw));
      applyTweaks();
      postTweaks({ accent: sw.dataset.accent });
    });
  });
}

function postTweaks(edits) {
  try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*'); } catch (e) {}
}

window.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === '__activate_edit_mode') $('#tweaks').classList.add('open');
  if (d.type === '__deactivate_edit_mode') $('#tweaks').classList.remove('open');
});

/* ---------- Boot ---------- */
function init() {
  state.rail = $('#rail');
  state.scenes = $$('.scene');
  syncSceneChrome();
  updateActiveScene();

  state.rail.addEventListener('scroll', () => {
    requestAnimationFrame(updateActiveScene);
  });

  $('#prevBtn').addEventListener('click', () => goTo(state.sceneIdx - 1));
  $('#nextBtn').addEventListener('click', () => goTo(state.sceneIdx + 1));
  $$('#progress .seg').forEach((el, i) =>
    el.addEventListener('click', () => goTo(i))
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goTo(state.sceneIdx + 1); }
    if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   { e.preventDefault(); goTo(state.sceneIdx - 1); }
  });

  // Translate vertical wheel into horizontal scroll on the rail
  state.rail.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      state.rail.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  $('#musicBtn').addEventListener('click', toggleMusic);
  $('#guestForm').addEventListener('submit', handleGuestSubmit);

  renderMessages();
  renderGifts();
  applyTweaks();
  buildTweaksPanel();

  // Announce tweak availability to host
  try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (e) {}
}

document.addEventListener('DOMContentLoaded', init);
