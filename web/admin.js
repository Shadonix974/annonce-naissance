const API = {
  async login(password) {
    const r = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!r.ok) throw new Error('login_failed');
  },
  async logout() { await fetch('/api/admin/logout', { method: 'POST' }); },
  async me() { const r = await fetch('/api/admin/me'); return r.ok; },
};

const TWEAK_LABELS = {
  babyName: "Prénom",
  babyMiddle: "Second prénom",
  dateLong: "Date (long)",
  dateShort: "Date (court)",
  timeBirth: "Heure",
  weight: "Poids (kg)",
  height: "Taille (cm)",
  city: "Ville",
  maternity: "Maternité",
  father: "Père",
  mother: "Mère",
  paternalGP: "Grands-parents paternels",
  maternalGP: "Grands-parents maternels",
};
const ACCENT_COLORS = { gold: "#c9a66b", sage: "#8cae95", rose: "#d79898", azure: "#8fb0d9" };

async function loadState() {
  const r = await fetch('/api/state', { headers: { 'X-Access-Token': CURRENT_TOKEN } });
  return r.json();
}

const debounceTimers = new Map();
function patchTweak(key, value) {
  clearTimeout(debounceTimers.get(key));
  debounceTimers.set(key, setTimeout(async () => {
    await fetch('/api/admin/tweaks', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    document.getElementById('previewFrame').contentWindow.postMessage(
      { type: '__edit_mode_set_keys', edits: { [key]: value } }, '*',
    );
  }, 500));
}

function show(id, on = true) { document.getElementById(id).hidden = !on; }
function $(sel) { return document.querySelector(sel); }

async function bootstrap() {
  if (await API.me()) return enterAdmin();
  show('loginPanel', true); show('adminPanel', false);
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#loginError');
    err.hidden = true;
    try {
      await API.login(e.target.password.value);
      enterAdmin();
    } catch {
      err.textContent = 'Mot de passe invalide.';
      err.hidden = false;
    }
  });
  $('#logoutBtn').addEventListener('click', async () => { await API.logout(); location.reload(); });
}

async function enterAdmin() {
  show('loginPanel', false); show('adminPanel', true);
  setupTabs();
  await loadAccessLink();
  setPreviewSrc();
}

function setupTabs() {
  const handlers = {
    tweaks: renderTweaksTab,
    photos: renderPhotosTab,
    gifts: renderGiftsTab,
    timeline: renderTimelineTab,
    link: renderLinkTab,
    security: renderSecurityTab,
  };
  const shown = new Set();
  for (const btn of document.querySelectorAll('.sidebar nav button')) {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.sidebar nav button').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab').forEach((t) => t.hidden = t.id !== `tab-${btn.dataset.tab}`);
      if (!shown.has(btn.dataset.tab)) { shown.add(btn.dataset.tab); await handlers[btn.dataset.tab](); }
    });
  }
  renderTweaksTab();
  shown.add('tweaks');
}

let CURRENT_TOKEN = '';
async function loadAccessLink() {
  const r = await fetch('/api/admin/access-token/link');
  const j = await r.json();
  CURRENT_TOKEN = j.token;
}

function setPreviewSrc() {
  $('#previewFrame').src = `/?k=${encodeURIComponent(CURRENT_TOKEN)}`;
}

// Stubs — filled by Tasks 36-39
async function renderTweaksTab() {
  const tab = $('#tab-tweaks');
  tab.innerHTML = '';
  const data = await loadState();

  for (const [key, label] of Object.entries(TWEAK_LABELS)) {
    const group = document.createElement('label');
    const input = document.createElement('input');
    input.dataset.key = key;
    input.value = data.tweaks[key] ?? '';
    group.textContent = label + ' ';
    group.appendChild(input);
    tab.appendChild(group);
  }

  // Accent swatches
  const accent = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Accent';
  accent.appendChild(title);
  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  for (const [key, col] of Object.entries(ACCENT_COLORS)) {
    const sw = document.createElement('div');
    sw.className = 'swatch' + (data.tweaks.accent === key ? ' active' : '');
    sw.style.background = col;
    sw.dataset.accent = key;
    sw.title = key;
    sw.addEventListener('click', () => {
      swatches.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s === sw));
      patchTweak('accent', key);
    });
    swatches.appendChild(sw);
  }
  accent.appendChild(swatches);
  tab.appendChild(accent);

  tab.addEventListener('input', (e) => {
    const target = e.target;
    const key = target && target.dataset && target.dataset.key;
    if (key) patchTweak(key, target.value);
  });
}
async function renderPhotosTab()   { $('#tab-photos').innerHTML = '<p>… Task 37</p>'; }
async function renderGiftsTab()    { $('#tab-gifts').innerHTML = '<p>… Task 38</p>'; }
async function renderTimelineTab() { $('#tab-timeline').innerHTML = '<p>… Task 38</p>'; }
async function renderLinkTab()     { $('#tab-link').innerHTML = '<p>… Task 39</p>'; }
async function renderSecurityTab() { $('#tab-security').innerHTML = '<p>… Task 39</p>'; }

bootstrap();
