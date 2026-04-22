/* =============================================================
   Annonce-naissance — print page runtime
   Loads minimal state from /api/print/state and renders. The
   print token comes from the `?k=` URL parameter (or stored in
   sessionStorage after the first load so reload doesn't lose it).
   ============================================================= */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function getPrintToken() {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('k');
  if (fromUrl) {
    sessionStorage.setItem('printAccessToken', fromUrl);
    url.searchParams.delete('k');
    history.replaceState(null, '', url.toString());
    return fromUrl;
  }
  return sessionStorage.getItem('printAccessToken');
}

async function fetchState(token) {
  const r = await fetch('/api/print/state', { headers: { 'X-Print-Access-Token': token } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('state_fetch_failed');
  return r.json();
}

function applyTweaks(tweaks) {
  $$('[data-t]').forEach((el) => {
    const key = el.dataset.t;
    if (tweaks[key] !== undefined) el.textContent = tweaks[key];
  });
}

function applyCover(cover, token) {
  const img = $('#coverPhoto');
  if (!cover) {
    // Leave the placeholder visible.
    return;
  }
  img.onload = () => img.removeAttribute('data-hidden');
  img.src = `/api/print/cover.jpg?k=${encodeURIComponent(token)}&v=${cover.version}`;
  img.alt = `Photo de ${$('[data-t="babyName"]')?.textContent ?? ''}`;
}

function renderPrivateLanding() {
  document.body.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;padding:2rem;text-align:center;
                 background:oklch(0.95 0.01 85);color:#1a1a1a;font-family:'Cormorant Garamond',serif;">
      <div style="max-width:420px;">
        <p style="font-size:14px;letter-spacing:.35em;text-transform:uppercase;opacity:.6;">Introuvable</p>
        <p style="font-size:22px;margin-top:12px;font-style:italic;">Ce lien n'est plus valide.</p>
      </div>
    </main>
  `;
}

async function init() {
  const token = getPrintToken();
  if (!token) return renderPrivateLanding();

  let data;
  try { data = await fetchState(token); }
  catch { return renderPrivateLanding(); }
  if (!data) return renderPrivateLanding();

  applyTweaks(data.tweaks);
  applyCover(data.cover, token);

  $('#printBtn').addEventListener('click', () => window.print());
}

document.addEventListener('DOMContentLoaded', init);
