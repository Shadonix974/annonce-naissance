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
async function renderTweaksTab()   { $('#tab-tweaks').innerHTML = '<p>… Task 36</p>'; }
async function renderPhotosTab()   { $('#tab-photos').innerHTML = '<p>… Task 37</p>'; }
async function renderGiftsTab()    { $('#tab-gifts').innerHTML = '<p>… Task 38</p>'; }
async function renderTimelineTab() { $('#tab-timeline').innerHTML = '<p>… Task 38</p>'; }
async function renderLinkTab()     { $('#tab-link').innerHTML = '<p>… Task 39</p>'; }
async function renderSecurityTab() { $('#tab-security').innerHTML = '<p>… Task 39</p>'; }

bootstrap();
