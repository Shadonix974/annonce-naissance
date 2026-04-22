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

/* ============================================================
   Lazy-load vendor UMD bundles. These are classic scripts
   (not ES modules), so we inject a <script> tag rather than
   using dynamic import() — import() on a non-module URL fails.
   ============================================================ */
const _loadedScripts = new Map();
function loadScript(url) {
  if (_loadedScripts.has(url)) return _loadedScripts.get(url);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${url}`));
    document.head.appendChild(s);
  });
  _loadedScripts.set(url, p);
  return p;
}
let _cropperCtor = null;
async function loadCropper() {
  if (_cropperCtor) return _cropperCtor;
  await loadScript('/vendor/cropper.min.js');
  _cropperCtor = window.Cropper;
  return _cropperCtor;
}
let _sortableCtor = null;
async function loadSortable() {
  if (_sortableCtor) return _sortableCtor;
  await loadScript('/vendor/sortable.min.js');
  _sortableCtor = window.Sortable;
  return _sortableCtor;
}

/* ============================================================
   Toast
   ============================================================ */
let toastTimer = 0;
function showToast(message) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

/* ============================================================
   Client-side downscale to protect iOS memory before cropping.
   maxSide is the longest edge in the output; returns a Blob.
   ============================================================ */
async function downscaleForCrop(source, maxSide = 2400) {
  const bmp = await createImageBitmap(source);
  const ratio = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * ratio));
  const h = Math.max(1, Math.round(bmp.height * ratio));
  if ('OffscreenCanvas' in window) {
    const canvas = new OffscreenCanvas(w, h);
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95));
}

/* ============================================================
   Crop modal
     openCropModal({ source, section, initialAlt, queueHint })
     - source: Blob | string URL for the Cropper image
     - section: 'triptych' | 'gallery' (drives default ratio)
     - initialAlt: optional string to prefill the alt field
     - queueHint: optional string shown below the alt field
   Returns { blob, alt, ratio } on confirm, or null on cancel.
   ============================================================ */
const RATIOS_BY_SECTION = {
  triptych: [{ label: '4:5', value: 4 / 5 }],
  gallery:  [
    { label: '1:1',  value: 1 },
    { label: '4:5',  value: 4 / 5 },
    { label: '3:4',  value: 3 / 4 },
    { label: '16:9', value: 16 / 9 },
  ],
};

async function openCropModal({ source, section, initialAlt = '', queueHint = '' }) {
  const Cropper = await loadCropper();
  const dlg = document.getElementById('cropModal');
  const img = document.getElementById('cropImage');
  const altInput = document.getElementById('cropAlt');
  const ratioBar = document.getElementById('cropRatios');
  const confirmBtn = document.getElementById('cropConfirm');
  const cancelBtn = document.getElementById('cropCancel');
  const queueHintEl = document.getElementById('cropQueueHint');

  altInput.value = initialAlt;
  queueHintEl.textContent = queueHint;
  confirmBtn.disabled = !altInput.value.trim();

  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  img.src = url;

  const ratios = RATIOS_BY_SECTION[section];
  ratioBar.innerHTML = '';
  let activeRatio = ratios[0].value;
  const ratioButtons = ratios.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r.label;
    b.className = i === 0 ? 'active' : '';
    b.addEventListener('click', () => {
      ratioButtons.forEach((bb) => bb.classList.remove('active'));
      b.classList.add('active');
      activeRatio = r.value;
      cropper.setAspectRatio(activeRatio);
    });
    ratioBar.appendChild(b);
    return b;
  });

  await new Promise((r) => img.addEventListener('load', r, { once: true }));
  const cropper = new Cropper(img, {
    aspectRatio: activeRatio,
    viewMode: 1,
    autoCropArea: 1,
    responsive: true,
    restore: true,
    checkOrientation: true,
    background: false,
    movable: true,
    zoomable: true,
    rotatable: false,
    scalable: false,
  });

  return new Promise((resolve) => {
    const cleanup = () => {
      cropper.destroy();
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      dlg.close();
      altInput.removeEventListener('input', onInput);
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
    };
    const onInput = () => { confirmBtn.disabled = !altInput.value.trim(); };
    const onConfirm = async () => {
      if (!altInput.value.trim()) return;
      const canvas = cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' });
      canvas.toBlob((blob) => {
        cleanup();
        resolve({ blob, alt: altInput.value.trim(), ratio: activeRatio, data: cropper.getData(true) });
      }, 'image/jpeg', 0.92);
    };
    const onCancel = () => { cleanup(); resolve(null); };

    altInput.addEventListener('input', onInput);
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    dlg.showModal();
  });
}

/* ============================================================
   Recrop modal — sends back raw pixel data {x,y,width,height}
   on the original image (not a blob, not downscaled).
   ============================================================ */
async function openRecropModal({ sourceUrl, section, initialAlt = '' }) {
  const Cropper = await loadCropper();
  const dlg = document.getElementById('cropModal');
  const img = document.getElementById('cropImage');
  const altInput = document.getElementById('cropAlt');
  const ratioBar = document.getElementById('cropRatios');
  const confirmBtn = document.getElementById('cropConfirm');
  const cancelBtn = document.getElementById('cropCancel');
  const queueHintEl = document.getElementById('cropQueueHint');

  altInput.value = initialAlt;
  queueHintEl.textContent = '';
  confirmBtn.disabled = false;

  img.src = sourceUrl;
  const ratios = RATIOS_BY_SECTION[section];
  ratioBar.innerHTML = '';
  let activeRatio = ratios[0].value;
  const ratioButtons = ratios.map((r, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = r.label;
    b.className = i === 0 ? 'active' : '';
    b.addEventListener('click', () => {
      ratioButtons.forEach((bb) => bb.classList.remove('active'));
      b.classList.add('active');
      activeRatio = r.value;
      cropper.setAspectRatio(activeRatio);
    });
    ratioBar.appendChild(b);
    return b;
  });

  await new Promise((r) => img.addEventListener('load', r, { once: true }));
  const cropper = new Cropper(img, {
    aspectRatio: activeRatio,
    viewMode: 1,
    autoCropArea: 1,
    responsive: true,
    restore: true,
    checkOrientation: false, // the original was already EXIF-rotated server-side
    background: false,
  });

  return new Promise((resolve) => {
    const cleanup = () => {
      cropper.destroy();
      dlg.close();
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
    };
    const onConfirm = () => {
      const data = cropper.getData(true); // { x, y, width, height } in source pixels
      cleanup();
      resolve({ x: Math.round(data.x), y: Math.round(data.y), width: Math.round(data.width), height: Math.round(data.height), alt: altInput.value.trim() });
    };
    const onCancel = () => { cleanup(); resolve(null); };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    dlg.showModal();
  });
}

/* ============================================================
   Delete modal — returns true on confirm, false on cancel.
   ============================================================ */
function openDeleteModal() {
  const dlg = document.getElementById('deleteModal');
  const confirmBtn = document.getElementById('deleteConfirm');
  const cancelBtn = document.getElementById('deleteCancel');
  return new Promise((resolve) => {
    const cleanup = () => {
      dlg.close();
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
    };
    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel  = () => { cleanup(); resolve(false); };
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    dlg.showModal();
  });
}

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
  try {
    await loadAccessLink();
  } catch {
    alert('Impossible de charger le lien privé. Rechargez la page.');
    return;
  }
  setPreviewSrc();
  setupTabs();
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
  if (!r.ok) {
    // eslint-disable-next-line no-console
    console.error('Failed to load access link:', r.status);
    throw new Error('access_link_failed');
  }
  const j = await r.json();
  CURRENT_TOKEN = j.token;
}

function setPreviewSrc() {
  $('#previewFrame').src = `/?k=${encodeURIComponent(CURRENT_TOKEN)}`;
}

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
async function renderPhotosTab() {
  const tab = $('#tab-photos');
  tab.innerHTML = `
    <div class="section-title">Ajouter une photo</div>
    <form id="photoUpload">
      <label>Fichier <input type="file" name="file" accept="image/*" required></label>
      <label>Section
        <select name="section">
          <option value="triptych">Triptyque (scène 03)</option>
          <option value="gallery">Galerie (scène 07)</option>
        </select>
      </label>
      <label>Alt (description pour a11y, obligatoire)
        <input name="alt" required maxlength="300">
      </label>
      <label>Position <input name="position" type="number" value="0" min="0"></label>
      <button type="submit">Uploader</button>
      <p id="photoUploadStatus"></p>
    </form>
    <div class="section-title">Existantes</div>
    <div id="photoList"></div>
  `;

  const form = $('#photoUpload');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.alt.value.trim()) return;
    const fd = new FormData(form);
    $('#photoUploadStatus').textContent = 'Upload et traitement…';
    const r = await fetch('/api/admin/photos', { method: 'POST', body: fd });
    if (!r.ok) { $('#photoUploadStatus').textContent = 'Erreur ' + r.status; return; }
    $('#photoUploadStatus').textContent = 'OK.';
    form.reset();
    await refreshPhotoList();
    // Reload iframe preview to show the new photo
    $('#previewFrame').contentWindow.location.reload();
  });

  await refreshPhotoList();
}

async function refreshPhotoList() {
  const data = await loadState();
  const list = $('#photoList');
  list.innerHTML = '';
  for (const p of data.photos) {
    const el = document.createElement('div');
    el.className = 'item';
    const img = document.createElement('img');
    img.src = `/photos/${p.id}/thumb.jpg`;
    img.width = 120;
    img.style.float = 'left';
    img.style.marginRight = '12px';
    el.appendChild(img);

    const meta = document.createElement('div');
    meta.innerHTML = `<b></b> — <span></span> — pos <span></span><br><small></small>`;
    meta.querySelector('b').textContent = p.section;
    meta.querySelector('span:nth-of-type(1)').textContent = `${p.width}×${p.height}`;
    meta.querySelector('span:nth-of-type(2)').textContent = String(p.position);
    meta.querySelector('small').textContent = p.alt || '(sans alt)';
    el.appendChild(meta);

    const actions = document.createElement('div');
    actions.style.marginTop = '8px';
    actions.style.clear = 'both';
    const editBtn = document.createElement('button');
    editBtn.className = 'secondary';
    editBtn.textContent = 'Éditer alt/pos';
    editBtn.addEventListener('click', async () => {
      const alt = prompt('Alt text', p.alt) ?? p.alt;
      const positionStr = prompt('Position', String(p.position)) ?? String(p.position);
      const position = Number(positionStr);
      await fetch(`/api/admin/photos/${p.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alt, position: Number.isFinite(position) ? position : p.position }),
      });
      await refreshPhotoList();
      $('#previewFrame').contentWindow.location.reload();
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Supprimer';
    delBtn.style.marginLeft = '8px';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette photo ?')) return;
      await fetch(`/api/admin/photos/${p.id}`, { method: 'DELETE' });
      await refreshPhotoList();
      $('#previewFrame').contentWindow.location.reload();
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    el.appendChild(actions);

    list.appendChild(el);
  }
}
async function renderGiftsTab() {
  const tab = $('#tab-gifts');
  tab.innerHTML = `
    <form id="giftAdd">
      <div class="row">
        <label>Nom <input name="name" required maxlength="160"></label>
        <label>Fourchette <input name="rangeText" placeholder="30–50 €" required maxlength="40"></label>
      </div>
      <label>URL (optionnel) <input name="url" type="url"></label>
      <label>Position <input name="position" type="number" value="0" min="0"></label>
      <button>Ajouter</button>
    </form>
    <div class="section-title">Liste</div>
    <div id="giftList"></div>
  `;
  $('#giftAdd').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    await fetch('/api/admin/gifts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: f.name.value,
        rangeText: f.rangeText.value,
        url: f.url.value || undefined,
        position: Number(f.position.value),
      }),
    });
    f.reset();
    await refreshGiftList();
  });
  await refreshGiftList();
}

async function refreshGiftList() {
  const data = await loadState();
  const list = $('#giftList');
  list.innerHTML = '';
  for (const g of data.gifts) {
    const el = document.createElement('div');
    el.className = 'item';

    const head = document.createElement('div');
    const b = document.createElement('b'); b.textContent = g.name;
    head.appendChild(b);
    head.appendChild(document.createTextNode(` — ${g.rangeText} — pos ${g.position}`));
    el.appendChild(head);

    const status = document.createElement('small');
    status.style.display = 'block';
    if (g.takenBy) {
      status.textContent = `Pris par ${g.takenBy}${g.takenNote ? ' — « ' + g.takenNote + ' »' : ''}`;
    } else {
      status.textContent = 'disponible';
    }
    el.appendChild(status);

    const actions = document.createElement('div');
    actions.style.marginTop = '8px';
    const editBtn = document.createElement('button');
    editBtn.className = 'secondary';
    editBtn.textContent = 'Éditer';
    editBtn.addEventListener('click', async () => {
      const name = prompt('Nom', g.name) ?? g.name;
      const rangeText = prompt('Fourchette', g.rangeText) ?? g.rangeText;
      const positionStr = prompt('Position', String(g.position)) ?? String(g.position);
      const position = Number(positionStr);
      await fetch(`/api/admin/gifts/${g.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, rangeText, position: Number.isFinite(position) ? position : g.position }),
      });
      await refreshGiftList();
    });
    actions.appendChild(editBtn);

    if (g.takenBy) {
      const force = document.createElement('button');
      force.className = 'secondary';
      force.textContent = 'Forcer libre';
      force.style.marginLeft = '8px';
      force.addEventListener('click', async () => {
        await fetch(`/api/admin/gifts/${g.id}/force-unreserve`, { method: 'POST' });
        await refreshGiftList();
      });
      actions.appendChild(force);
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Supprimer';
    delBtn.style.marginLeft = '8px';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Supprimer ?')) return;
      await fetch(`/api/admin/gifts/${g.id}`, { method: 'DELETE' });
      await refreshGiftList();
    });
    actions.appendChild(delBtn);
    el.appendChild(actions);

    list.appendChild(el);
  }
}
async function renderTimelineTab() {
  const tab = $('#tab-timeline');
  tab.innerHTML = `
    <form id="tlAdd">
      <label>Date (libre) <input name="dateLabel" required maxlength="80"></label>
      <label>Texte <textarea name="text" required maxlength="400"></textarea></label>
      <label>Position <input name="position" type="number" value="0" min="0"></label>
      <label><input type="checkbox" name="isNow"> Marquer "maintenant"</label>
      <button>Ajouter</button>
    </form>
    <div class="section-title">Événements</div>
    <div id="tlList"></div>
  `;
  $('#tlAdd').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    await fetch('/api/admin/timeline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dateLabel: f.dateLabel.value,
        text: f.text.value,
        position: Number(f.position.value),
        isNow: f.isNow.checked,
      }),
    });
    f.reset();
    await refreshTimelineList();
  });
  await refreshTimelineList();
}

async function refreshTimelineList() {
  const data = await loadState();
  const list = $('#tlList');
  list.innerHTML = '';
  for (const ev of data.timeline) {
    const el = document.createElement('div');
    el.className = 'item';

    const b = document.createElement('b');
    b.textContent = ev.dateLabel;
    el.appendChild(b);
    el.appendChild(document.createTextNode(`${ev.isNow ? ' · now' : ''} — pos ${ev.position}`));
    el.appendChild(document.createElement('br'));
    const small = document.createElement('small');
    small.textContent = ev.text;
    el.appendChild(small);

    const actions = document.createElement('div');
    actions.style.marginTop = '8px';

    const editBtn = document.createElement('button');
    editBtn.className = 'secondary';
    editBtn.textContent = 'Éditer';
    editBtn.addEventListener('click', async () => {
      const dateLabel = prompt('Date (libre)', ev.dateLabel) ?? ev.dateLabel;
      const text = prompt('Texte', ev.text) ?? ev.text;
      const positionStr = prompt('Position', String(ev.position)) ?? String(ev.position);
      const position = Number(positionStr);
      await fetch(`/api/admin/timeline/${ev.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dateLabel, text, position: Number.isFinite(position) ? position : ev.position }),
      });
      await refreshTimelineList();
    });
    actions.appendChild(editBtn);

    const nowBtn = document.createElement('button');
    nowBtn.className = 'secondary';
    nowBtn.textContent = ev.isNow ? '✓ Maintenant' : 'Marquer maintenant';
    nowBtn.style.marginLeft = '8px';
    nowBtn.addEventListener('click', async () => {
      const newIsNow = !ev.isNow;
      if (newIsNow) {
        const currentData = await loadState();
        for (const other of currentData.timeline) {
          if (other.id !== ev.id && other.isNow) {
            await fetch(`/api/admin/timeline/${other.id}`, {
              method: 'PATCH', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ isNow: false }),
            });
          }
        }
      }
      await fetch(`/api/admin/timeline/${ev.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isNow: newIsNow }),
      });
      await refreshTimelineList();
    });
    actions.appendChild(nowBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'danger';
    delBtn.textContent = 'Supprimer';
    delBtn.style.marginLeft = '8px';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Supprimer ?')) return;
      await fetch(`/api/admin/timeline/${ev.id}`, { method: 'DELETE' });
      await refreshTimelineList();
    });
    actions.appendChild(delBtn);
    el.appendChild(actions);

    list.appendChild(el);
  }
}
async function renderLinkTab() {
  const tab = $('#tab-link');
  const r = await fetch('/api/admin/access-token/link');
  const j = await r.json();

  tab.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Lien privé actuel';
  tab.appendChild(title);

  const item = document.createElement('div');
  item.className = 'item';
  const linkInput = document.createElement('input');
  linkInput.id = 'linkOutput';
  linkInput.readOnly = true;
  linkInput.value = j.link;
  item.appendChild(linkInput);

  const actions = document.createElement('div');
  actions.style.marginTop = '8px';
  const copyBtn = document.createElement('button');
  copyBtn.id = 'copyLink';
  copyBtn.className = 'secondary';
  copyBtn.textContent = 'Copier';
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(linkInput.value);
    copyBtn.textContent = 'Copié ✓';
    setTimeout(() => { copyBtn.textContent = 'Copier'; }, 1500);
  });
  const rotateBtn = document.createElement('button');
  rotateBtn.className = 'danger';
  rotateBtn.textContent = 'Régénérer';
  rotateBtn.style.marginLeft = '8px';
  rotateBtn.addEventListener('click', async () => {
    if (!confirm('Confirmer la régénération ? Les anciens liens ne fonctionneront plus.')) return;
    const r2 = await fetch('/api/admin/access-token/rotate', { method: 'POST' });
    const j2 = await r2.json();
    linkInput.value = j2.link;
    CURRENT_TOKEN = j2.token;
    setPreviewSrc();
  });
  actions.appendChild(copyBtn);
  actions.appendChild(rotateBtn);
  item.appendChild(actions);

  const warning = document.createElement('p');
  warning.style.marginTop = '12px';
  warning.style.fontSize = '13px';
  warning.style.color = 'var(--muted)';
  warning.textContent = '⚠ Régénérer invalide tous les liens déjà distribués. Les visiteurs en cours seront déconnectés à la prochaine requête.';
  item.appendChild(warning);

  tab.appendChild(item);
}
async function renderSecurityTab() {
  const tab = $('#tab-security');
  tab.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Sessions';
  tab.appendChild(title);

  const item = document.createElement('div');
  item.className = 'item';
  const p = document.createElement('p');
  p.textContent = 'Toutes les sessions admin ouvertes (y compris la vôtre) seront fermées.';
  item.appendChild(p);

  const killBtn = document.createElement('button');
  killBtn.className = 'danger';
  killBtn.textContent = 'Déconnecter toutes les sessions';
  killBtn.addEventListener('click', async () => {
    if (!confirm('Déconnecter tout le monde ?')) return;
    await fetch('/api/admin/destroy-all-sessions', { method: 'POST' });
    location.reload();
  });
  item.appendChild(killBtn);

  tab.appendChild(item);
}

bootstrap();
