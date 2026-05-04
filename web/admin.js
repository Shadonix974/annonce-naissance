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
  'print-cover': [{ label: '4:5', value: 4 / 5 }],
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
  // Bébé
  babyName: "Prénom",
  babyMiddle: "Second prénom",
  dateLong: "Date (long)",
  dateShort: "Date (court)",
  timeBirth: "Heure",
  weight: "Poids (kg)",
  height: "Taille (cm)",
  city: "Ville",
  // Famille
  father: "Père",
  mother: "Mère",
  paternalGP: "Grands-parents paternels",
  maternalGP: "Grands-parents maternels",
  // Mot des parents
  parentsNote: "Mot des parents",
  // Maternité
  maternity: "Maternité",
  addressLine: "Adresse",
  roomNumber: "Chambre / étage",
  // Infos pratiques
  visitHours: "Horaires de visite",
  visitNote: "Note sur les visites",
  returnDate: "Retour à la maison",
  returnNote: "Note sur le retour",
  phone: "Téléphone",
  phoneNote: "Note sur le téléphone",
};
// Section headers rendered above each group.
const TWEAK_SECTIONS = [
  { title: "Bébé",              keys: ["babyName", "babyMiddle", "dateLong", "dateShort", "timeBirth", "weight", "height", "city"] },
  { title: "Famille",           keys: ["father", "mother", "paternalGP", "maternalGP"] },
  { title: "Mot des parents",   keys: ["parentsNote"] },
  { title: "Maternité",         keys: ["maternity", "addressLine", "roomNumber"] },
  { title: "Infos pratiques",   keys: ["visitHours", "visitNote", "returnDate", "returnNote", "phone", "phoneNote"] },
];
// Keys that render as <textarea> (multi-line prose, optional line breaks).
const TWEAK_MULTILINE = new Set(["parentsNote", "visitNote", "returnNote", "phoneNote"]);
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
    print: renderPrintTab,
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

  for (const section of TWEAK_SECTIONS) {
    const h = document.createElement('div');
    h.className = 'section-title';
    h.textContent = section.title;
    tab.appendChild(h);

    for (const key of section.keys) {
      const label = TWEAK_LABELS[key];
      if (!label) continue;
      const group = document.createElement('label');
      const field = TWEAK_MULTILINE.has(key)
        ? document.createElement('textarea')
        : document.createElement('input');
      field.dataset.key = key;
      field.value = data.tweaks[key] ?? '';
      if (field.tagName === 'TEXTAREA') field.rows = key === 'parentsNote' ? 5 : 2;
      group.textContent = label + ' ';
      group.appendChild(field);
      tab.appendChild(group);
    }
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
    <div class="section-title">Ajouter des photos</div>
    <label class="dropzone" id="photoDropzone">
      <div>
        <div>📸 Glissez-déposez ou cliquez pour sélectionner</div>
        <div class="hint">Plusieurs fichiers acceptés. Cadrez chaque photo avant envoi.</div>
      </div>
      <input id="photoInput" type="file" accept="image/*" multiple>
    </label>
    <div class="row">
      <label>Section par défaut
        <select id="photoDefaultSection">
          <option value="gallery">Galerie (scène 07)</option>
          <option value="triptych">Triptyque (scène 03)</option>
          <option value="print-cover">Cover d'impression (page print)</option>
        </select>
      </label>
    </div>
    <div class="section-title">Triptyque</div>
    <div id="photosGridTriptych" class="photos-grid"></div>
    <div class="section-title" style="margin-top:16px;">Galerie</div>
    <div id="photosGridGallery" class="photos-grid"></div>
    <div class="section-title" style="margin-top:16px;">Cover impression</div>
    <div id="photosGridPrintCover" class="photos-grid"></div>
  `;

  const dz = document.getElementById('photoDropzone');
  const input = document.getElementById('photoInput');

  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('is-drop'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('is-drop'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('is-drop');
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) enqueueUploads(files);
  });
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) enqueueUploads(files);
    input.value = '';
  });

  await refreshPhotoGrid();
}

let _uploadQueueActive = false;
async function enqueueUploads(files) {
  if (_uploadQueueActive) return; // Guard against double-open of the crop modal.
  _uploadQueueActive = true;
  try {
    const section = document.getElementById('photoDefaultSection').value;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const queueHint = files.length > 1 ? `Photo ${i + 1}/${files.length}` : '';
      const downscaled = await downscaleForCrop(file);
      const res = await openCropModal({ source: downscaled, section, queueHint });
      if (!res) { showToast('Envoi annulé.'); break; }
      const fd = new FormData();
      fd.append('file', res.blob, 'crop.jpg');
      fd.append('section', section);
      fd.append('alt', res.alt);
      fd.append('cropped', '1');
      // Strictly increasing position so batch uploads preserve their order in
      // the admin grid; the user can drag to reorder afterwards. Epoch SECONDS
      // (not ms) to stay within PostgreSQL int32 — photos.position is integer,
      // max 2,147,483,647; Date.now() in ms is ~1.77e12 and would overflow.
      const position = Math.floor(Date.now() / 1000) + i;
      fd.append('position', String(position));
      // Toast shown AFTER the modal closes (else it's occluded by the dialog).
      showToast(`Envoi ${i + 1}/${files.length}…`);
      const r = await fetch('/api/admin/photos', { method: 'POST', body: fd });
      if (!r.ok) { showToast(`Erreur ${r.status}`); break; }
    }
  } finally {
    _uploadQueueActive = false;
  }
  await refreshPhotoGrid();
  document.getElementById('previewFrame').contentWindow.location.reload();
}

async function refreshPhotoGrid() {
  const data = await loadState();
  const Sortable = await loadSortable();
  const grids = [
    { id: 'photosGridTriptych', section: 'triptych' },
    { id: 'photosGridGallery',  section: 'gallery'  },
    { id: 'photosGridPrintCover', section: 'print-cover' },
  ];
  for (const { id, section } of grids) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.innerHTML = '';
    const items = data.photos.filter((p) => p.section === section).sort((a, b) => a.position - b.position);
    for (const p of items) {
      el.appendChild(photoCard(p));
    }
    Sortable.create(el, {
      group: { name: 'photos', pull: true, put: true },
      animation: 150,
      delay: 200,
      delayOnTouchOnly: true,
      onEnd: () => persistOrder(),
    });
  }
}

function photoCard(p) {
  const card = document.createElement('div');
  card.className = 'photo-card';
  card.dataset.id = p.id;

  const img = document.createElement('img');
  img.className = 'thumb';
  img.src = `/photos/${p.id}/thumb.jpg?v=${p.version}`;
  img.alt = p.alt || '';
  card.appendChild(img);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const altInput = document.createElement('input');
  altInput.value = p.alt || '';
  altInput.placeholder = 'alt (a11y)';
  altInput.maxLength = 300;
  altInput.addEventListener('change', async () => {
    if (!altInput.value.trim()) { altInput.value = p.alt || ''; return; }
    const r = await fetch(`/api/admin/photos/${p.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alt: altInput.value.trim() }),
    });
    if (r.ok) {
      p.alt = altInput.value.trim();
      showToast('Alt mis à jour.');
    } else {
      altInput.value = p.alt || '';
      showToast(`Erreur ${r.status}`);
    }
  });
  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.textContent = `${p.width}×${p.height} · v${p.version}`;
  meta.appendChild(altInput);
  meta.appendChild(badge);
  card.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const cropBtn = document.createElement('button');
  cropBtn.className = 'secondary';
  cropBtn.textContent = '✂ Recadrer';
  cropBtn.addEventListener('click', async () => {
    if (_uploadQueueActive) return;
    _uploadQueueActive = true;
    try {
      const res = await openRecropModal({
        sourceUrl: `/api/admin/photos/${p.id}/original`,
        section: p.section,
        initialAlt: p.alt || '',
      });
      if (!res) return;
      showToast('Recadrage…');
      const r = await fetch(`/api/admin/photos/${p.id}/recrop`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ x: res.x, y: res.y, width: res.width, height: res.height }),
      });
      if (!r.ok) { showToast(`Erreur ${r.status}`); return; }
      // Persist alt separately if the user edited it in the modal (the recrop
      // endpoint only updates dims + version + blurhash).
      if (res.alt && res.alt !== (p.alt || '')) {
        const altRes = await fetch(`/api/admin/photos/${p.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ alt: res.alt }),
        });
        if (altRes.ok) p.alt = res.alt;
      }
      showToast('Recadré ✓');
      await refreshPhotoGrid();
      document.getElementById('previewFrame').contentWindow.location.reload();
    } finally {
      _uploadQueueActive = false;
    }
  });
  const delBtn = document.createElement('button');
  delBtn.className = 'danger';
  delBtn.textContent = '🗑';
  delBtn.addEventListener('click', async () => {
    if (!(await openDeleteModal())) return;
    const r = await fetch(`/api/admin/photos/${p.id}`, { method: 'DELETE' });
    if (!r.ok) { showToast(`Erreur ${r.status}`); return; }
    showToast('Supprimé ✓');
    await refreshPhotoGrid();
    document.getElementById('previewFrame').contentWindow.location.reload();
  });
  actions.appendChild(cropBtn);
  actions.appendChild(delBtn);
  card.appendChild(actions);

  return card;
}

async function persistOrder() {
  const order = [];
  for (const { id, section } of [
    { id: 'photosGridTriptych', section: 'triptych' },
    { id: 'photosGridGallery',  section: 'gallery'  },
    { id: 'photosGridPrintCover', section: 'print-cover' },
  ]) {
    const el = document.getElementById(id);
    if (!el) continue;
    Array.from(el.children).forEach((card, position) => {
      order.push({ id: card.dataset.id, section, position });
    });
  }
  const r = await fetch('/api/admin/photos/reorder', {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ order }),
  });
  if (!r.ok) { showToast(`Erreur ${r.status}`); return; }
  document.getElementById('previewFrame').contentWindow.location.reload();
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
async function renderPrintTab() {
  const tab = $('#tab-print');
  const r = await fetch('/api/admin/print/link');
  const j = await r.json();

  tab.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = 'Lien print (faire-part imprimable)';
  tab.appendChild(title);

  const item = document.createElement('div');
  item.className = 'item';
  const linkInput = document.createElement('input');
  linkInput.readOnly = true;
  linkInput.value = j.link;
  item.appendChild(linkInput);

  const actions = document.createElement('div');
  actions.style.marginTop = '8px';

  const copyBtn = document.createElement('button');
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
    if (!confirm('Régénérer le lien print ? Les anciens liens ne fonctionneront plus.')) return;
    const r2 = await fetch('/api/admin/print/rotate', { method: 'POST' });
    const j2 = await r2.json();
    linkInput.value = j2.link;
  });

  actions.appendChild(copyBtn);
  actions.appendChild(rotateBtn);
  item.appendChild(actions);

  const note = document.createElement('p');
  note.style.marginTop = '12px';
  note.style.fontSize = '13px';
  note.style.color = 'var(--muted)';
  note.textContent = 'Ce lien donne accès UNIQUEMENT à la page imprimable (photo + infos essentielles). Indépendant du lien privé principal.';
  item.appendChild(note);

  tab.appendChild(item);

  // Image download
  const imgTitle = document.createElement('div');
  imgTitle.className = 'section-title';
  imgTitle.textContent = "Télécharger l'image";
  tab.appendChild(imgTitle);

  const imgItem = document.createElement('div');
  imgItem.className = 'item';
  const imgActions = document.createElement('div');

  const imgBtn = document.createElement('button');
  imgBtn.textContent = "Télécharger l'image (PNG)";
  imgBtn.addEventListener('click', () => downloadImage(imgBtn));

  imgActions.appendChild(imgBtn);
  imgItem.appendChild(imgActions);

  const imgNote = document.createElement('p');
  imgNote.style.marginTop = '12px';
  imgNote.style.fontSize = '13px';
  imgNote.style.color = 'var(--muted)';
  imgNote.textContent = "Image PNG haute résolution (1500×1875). Idéale pour partage WhatsApp, SMS, ou impression à la maison.";
  imgItem.appendChild(imgNote);

  tab.appendChild(imgItem);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadImage(btn) {
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Génération…';
  try {
    const r = await fetch('/api/admin/print/image');
    if (!r.ok) {
      btn.textContent = `Erreur ${r.status}`;
      setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
      return;
    }
    // Extract the filename from Content-Disposition (server provides slugged name).
    let filename = 'annonce-naissance.png';
    const cd = r.headers.get('content-disposition') || '';
    const m = cd.match(/filename="([^"]+)"/);
    if (m) filename = m[1];

    const blob = await r.blob();
    // Restore the button BEFORE opening the modal — the modal owns the next step
    // of the user flow, the button has done its job.
    btn.textContent = originalText;
    btn.disabled = false;
    await openImageDownloadModal(blob, filename);
  } catch (err) {
    btn.textContent = 'Erreur';
    setTimeout(() => { btn.textContent = originalText; btn.disabled = false; }, 2000);
  }
}

/* ============================================================
   Image download modal — Cropper.js with 4 ratio presets.
   Default = Original (4:5) ratio + autoCropArea: 1, so a direct
   "Télécharger" click yields the full polaroid (no regression).
   ============================================================ */
const IMAGE_DOWNLOAD_RATIOS = [
  { label: 'Original', value: 4 / 5 },
  { label: 'Carré',    value: 1 },
  { label: 'Story',    value: 9 / 16 },
  { label: 'Libre',    value: NaN },
];

async function openImageDownloadModal(blob, filename) {
  const Cropper = await loadCropper();
  const dlg = document.getElementById('imageDownloadModal');
  const img = document.getElementById('imageDownloadPreview');
  const ratioBar = document.getElementById('imageDownloadRatios');
  const confirmBtn = document.getElementById('imageDownloadConfirm');
  const cancelBtn = document.getElementById('imageDownloadCancel');
  const closeBtn = document.getElementById('imageDownloadClose');

  const objectUrl = URL.createObjectURL(blob);
  img.src = objectUrl;

  ratioBar.innerHTML = '';
  let activeRatio = IMAGE_DOWNLOAD_RATIOS[0].value;
  const ratioButtons = IMAGE_DOWNLOAD_RATIOS.map((r, i) => {
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
    background: false,
    movable: true,
    zoomable: true,
    rotatable: false,
    scalable: false,
  });

  return new Promise((resolve) => {
    const cleanup = () => {
      cropper.destroy();
      URL.revokeObjectURL(objectUrl);
      dlg.close();
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      dlg.removeEventListener('cancel', onCancel);
    };
    const onConfirm = () => {
      const canvas = cropper.getCroppedCanvas({ imageSmoothingQuality: 'high' });
      canvas.toBlob((croppedBlob) => {
        if (croppedBlob) triggerDownload(croppedBlob, filename);
        cleanup();
        resolve();
      }, 'image/png');
    };
    const onCancel = (e) => {
      // The native <dialog> 'cancel' event (Escape) calls this with an event
      // object; the button handlers call it with no arg. Both paths run cleanup.
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      cleanup();
      resolve();
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
    dlg.addEventListener('cancel', onCancel);
    dlg.showModal();
  });
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
