// Etulia Photos — app principale (v1 : connexion, albums, album, visionneuse, partage)
export const APP_VERSION = '1';
const SUPABASE_URL = 'https://qczdkpigbngksztjezbm.supabase.co';
const SUPABASE_ANON = 'sb_publishable_fGScTPMheymoIscX4GIc_g_uKVZGVzV';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true } });
const $app = document.getElementById('app');
const state = { session: null, profile: null, albums: [], items: {}, q: '', sel: null, lb: null };

// ── utilitaires ──────────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastT = null;
export function toast(msg, err) {
  const el = document.getElementById('toast'); el.textContent = msg; el.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { el.className = 'toast'; }, 2600);
}
const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('fr-FR'); };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const isDir = () => !!(state.profile && Array.isArray(state.profile.roles) && state.profile.roles.includes('direction'));
const canAccess = () => !!(state.profile && (state.profile.app_access_photos === true || isDir()));
const initials = () => { const n = (state.profile && state.profile.name) || (state.session && state.session.user.email) || '?'; return n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join(''); };
const go = (hash) => { location.hash = hash; };

// ── données ──────────────────────────────────────────────────────────────────
async function loadProfile() {
  const uid = state.session.user.id;
  const { data } = await sb.from('profiles').select('id, name, roles, app_access_photos, active').eq('id', uid).maybeSingle();
  state.profile = data || { id: uid, name: state.session.user.email, roles: [], app_access_photos: false };
}
async function loadAlbums() {
  const { data, error } = await sb.from('photo_albums_v').select('*').eq('archive', false).order('ordre').order('titre');
  if (error) { toast('Albums : ' + error.message, true); return; }
  state.albums = data || [];
}
async function loadItems(albumId, force) {
  if (state.items[albumId] && !force) return state.items[albumId];
  const { data, error } = await sb.from('photo_items').select('id, album_id, fichier, type, source, web_url, thumb_url, orig_url, largeur, hauteur, pris_le, legende, ajoute_par, synced_nas, created_at')
    .eq('album_id', albumId).order('pris_le', { ascending: false, nullsFirst: false }).order('fichier');
  if (error) { toast('Photos : ' + error.message, true); return []; }
  state.items[albumId] = data || [];
  return state.items[albumId];
}
const albumById = (id) => state.albums.find((a) => a.id === id);
const children = (id) => state.albums.filter((a) => a.parent_id === id);

// ── rendu : connexion ────────────────────────────────────────────────────────
function renderLogin(msg) {
  $app.innerHTML = `
    <div class="login"><form class="card" id="login-form">
      <h1>📸 Etulia Photos</h1><p>Albums produits et réalisations — compte Etulia</p>
      <label>E-mail</label><input type="email" id="lg-email" autocomplete="username" required>
      <label>Mot de passe</label><input type="password" id="lg-pw" autocomplete="current-password" required>
      <button class="btn" type="submit">Se connecter</button>
      <div class="err" id="lg-err">${esc(msg || '')}</div>
    </form></div>`;
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button'); b.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: document.getElementById('lg-email').value.trim(), password: document.getElementById('lg-pw').value });
    b.disabled = false;
    if (error) document.getElementById('lg-err').textContent = 'Connexion refusée : ' + error.message;
  };
}
function renderNoAccess() {
  $app.innerHTML = `<div class="top"><div class="t">📸 Etulia Photos</div><button class="ic" id="logout" title="Se déconnecter">⎋</button></div>
    <div class="empty-state"><div class="big">🔒</div>Ton compte n'a pas accès à Etulia Photos.<br>Demande à la direction d'activer « Etulia Photos » dans ta fiche utilisateur du CRM.</div>`;
  document.getElementById('logout').onclick = () => sb.auth.signOut();
}

// ── rendu : liste des albums ─────────────────────────────────────────────────
function albumCard(a, small) {
  const nb = Number(a.nb_total || a.nb_items || 0);
  return `<button class="album" data-id="${a.id}">
    <div class="cov">${a.cover_url ? `<img src="${esc(a.cover_url)}" loading="lazy" alt="">` : '<div class="empty">🖼</div>'}
      ${a.nb_sub > 0 ? `<span class="sub">${a.nb_sub} sous-album${a.nb_sub > 1 ? 's' : ''}</span>` : ''}
      <span class="n">${nb}</span></div>
    <div class="nm">${esc(a.titre)}</div>
    ${small ? '' : `<div class="ds">${esc(a.description || (a.tags || []).join(' · '))}</div>`}
  </button>`;
}
function renderAlbums() {
  const q = norm(state.q);
  let list = state.albums.filter((a) => !a.parent_id);
  if (q) list = state.albums.filter((a) => norm(a.titre + ' ' + (a.description || '') + ' ' + (a.tags || []).join(' ')).includes(q));
  $app.innerHTML = `
    <div class="top"><div class="t">📸 Etulia Photos</div><button class="ic av" id="me" title="${esc((state.profile && state.profile.name) || '')}">${esc(initials())}</button></div>
    <div class="body">
      <div class="search">🔎 <input id="q" type="search" placeholder="Rechercher un album, un tag…" value="${esc(state.q)}"></div>
      <div class="sec"><span>${q ? 'Résultats' : 'Albums'} · ${list.length}</span></div>
      ${list.length ? `<div class="grid-albums">${list.map((a) => albumCard(a)).join('')}</div>`
        : `<div class="empty-state"><div class="big">📭</div>${q ? 'Aucun album ne correspond.' : 'Aucun album pour l\'instant.<br>Lance la synchronisation depuis le Mac pour indexer les dossiers du NAS.'}</div>`}
    </div>`;
  const qi = document.getElementById('q');
  qi.oninput = () => { state.q = qi.value; const pos = qi.selectionStart; renderAlbums(); const q2 = document.getElementById('q'); q2.focus(); q2.setSelectionRange(pos, pos); };
  $app.querySelectorAll('.album').forEach((b) => { b.onclick = () => go('#/album/' + b.dataset.id); });
  document.getElementById('me').onclick = () => sheet(`<h4>${esc((state.profile && state.profile.name) || state.session.user.email)}</h4>
    <div class="hint">${esc(state.session.user.email)} · ${isDir() ? 'direction' : 'utilisateur'} · Etulia Photos v${APP_VERSION}</div>
    <button class="opt" id="sh-logout" style="margin-top:12px">⎋ Se déconnecter</button>`, (box) => { box.querySelector('#sh-logout').onclick = () => { closeSheet(); sb.auth.signOut(); }; });
}

// ── rendu : un album ─────────────────────────────────────────────────────────
async function renderAlbum(id) {
  const a = albumById(id);
  if (!a) { go('#/'); return; }
  const subs = children(id);
  $app.innerHTML = `
    <div class="top"><button class="ic" id="back">‹</button><div class="t">${esc(a.titre)} <small>· …</small></div><button class="ic" id="more">⋯</button></div>
    <div class="body" id="album-body"><div class="empty-state">⏳ Chargement…</div></div>`;
  document.getElementById('back').onclick = () => go(a.parent_id ? '#/album/' + a.parent_id : '#/');
  document.getElementById('more').onclick = () => albumMenu(a);
  const items = await loadItems(id);
  if (location.hash !== '#/album/' + id && !location.hash.startsWith('#/album/' + id + '/')) return;
  const t = $app.querySelector('.top .t small'); if (t) t.textContent = '· ' + items.length + ' photo' + (items.length > 1 ? 's' : '');
  const sel = state.sel && state.sel.album === id ? state.sel : null;
  document.getElementById('album-body').innerHTML = `
    ${a.description ? `<div style="font-size:12px;color:var(--text2);margin:4px 0 2px">${esc(a.description)}</div>` : ''}
    ${(a.tags || []).length ? `<div style="margin:4px 0">${a.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : ''}
    ${subs.length ? `<div class="sec"><span>Sous-albums · ${subs.length}</span></div><div class="subrow">${subs.map((s) => albumCard(s, true)).join('')}</div>` : ''}
    <div class="sec"><span>Photos · ${items.length}</span>${items.length ? `<button id="selbtn">${sel ? 'Annuler' : 'Sélectionner'}</button>` : ''}</div>
    ${items.length ? `<div class="grid-ph">${items.map((it) => `<button class="ph${sel && sel.ids.has(it.id) ? ' sel' : ''}" data-id="${it.id}">
        <img data-src="${esc(it.thumb_url || it.web_url || '')}" alt="">
        ${it.type === 'video' ? '<span class="vid">▶ vidéo</span>' : ''}
        ${a.cover_item === it.id ? '<span class="cover-badge" title="Couverture">⭐</span>' : ''}
        ${sel ? '<span class="chk"></span>' : ''}</button>`).join('')}</div>`
      : `<div class="empty-state"><div class="big">🖼</div>Aucune photo dans cet album${subs.length ? ' (voir les sous-albums)' : ''}.</div>`}
    ${sel ? `<div class="selbar"><span style="font-weight:800;padding:6px 0">${sel.ids.size} sélectionnée${sel.ids.size > 1 ? 's' : ''}</span>
        <button id="sel-share" ${sel.ids.size ? '' : 'disabled'}>📤 Partager</button>
        <button id="sel-dl" ${sel.ids.size ? '' : 'disabled'}>⬇ Télécharger</button></div>` : ''}`;
  lazyImages();
  $app.querySelectorAll('.subrow .album').forEach((b) => { b.onclick = () => go('#/album/' + b.dataset.id); });
  $app.querySelectorAll('.ph').forEach((b) => {
    b.onclick = () => {
      if (state.sel && state.sel.album === id) { const s = state.sel.ids; s.has(b.dataset.id) ? s.delete(b.dataset.id) : s.add(b.dataset.id); renderAlbum(id); return; }
      go('#/album/' + id + '/photo/' + b.dataset.id);
    };
  });
  const sb_ = document.getElementById('selbtn');
  if (sb_) sb_.onclick = () => { state.sel = (state.sel && state.sel.album === id) ? null : { album: id, ids: new Set() }; renderAlbum(id); };
  const sh = document.getElementById('sel-share'); if (sh) sh.onclick = () => shareItems(items.filter((it) => state.sel.ids.has(it.id)));
  const dl = document.getElementById('sel-dl'); if (dl) dl.onclick = () => downloadItems(items.filter((it) => state.sel.ids.has(it.id)));
}
function lazyImages() {
  const imgs = [...$app.querySelectorAll('img[data-src]')];
  const show = (img) => { img.src = img.dataset.src; img.onload = () => img.classList.add('ok'); img.onerror = () => { img.closest('.ph, .cov')?.insertAdjacentHTML('beforeend', '<div class="empty" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text3);text-align:center;padding:6px">vignette non encore synchronisée</div>'); }; img.removeAttribute('data-src'); };
  if (!('IntersectionObserver' in window)) { imgs.forEach(show); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } }), { rootMargin: '300px' });
  imgs.forEach((i) => io.observe(i));
}
function albumMenu(a) {
  sheet(`<h4>${esc(a.titre)}</h4>
    <div class="hint">${esc(a.slug)} · ${Number(a.nb_total || 0)} photo(s)${a.nb_sub ? ' · ' + a.nb_sub + ' sous-album(s)' : ''}</div>
    <button class="opt" id="m-copy" style="margin-top:12px">🔗 Copier le lien de l'album</button>
    ${isDir() ? '<div class="hint">Renommer, description, tags, couverture, archiver : à venir (étape 4).</div>' : ''}`,
    (box) => { box.querySelector('#m-copy').onclick = async () => { try { await navigator.clipboard.writeText(location.origin + location.pathname + '#/album/' + a.id); toast('Lien copié'); } catch (_) { toast('Copie impossible', true); } closeSheet(); }; });
}

// ── partage / téléchargement ─────────────────────────────────────────────────
async function fetchAsFile(it) {
  const url = it.web_url || it.orig_url; if (!url) return null;
  const r = await fetch(url, { mode: 'cors' }); if (!r.ok) throw new Error('HTTP ' + r.status);
  const blob = await r.blob();
  const name = (it.fichier || 'photo').replace(/\.[^.]+$/, '') + (blob.type === 'image/png' ? '.png' : '.jpg');
  return new File([blob], name, { type: blob.type || 'image/jpeg' });
}
async function shareItems(list) {
  if (!list.length) return;
  if (!navigator.share) { toast('Partage indisponible sur cet appareil — utilise Télécharger.', true); return; }
  toast(`Préparation de ${list.length} photo${list.length > 1 ? 's' : ''}…`);
  try {
    const files = []; for (const it of list.slice(0, 20)) { try { const f = await fetchAsFile(it); if (f) files.push(f); } catch (e) { console.warn('fetch', it.fichier, e); } }
    if (files.length && (!navigator.canShare || navigator.canShare({ files }))) { await navigator.share({ files, title: 'Etulia Photos' }); return; }
    // Repli : liens
    await navigator.share({ title: 'Etulia Photos', text: list.map((it) => it.web_url || it.orig_url).filter(Boolean).join('\n') });
  } catch (e) { if (e && e.name === 'AbortError') return; toast('Partage : ' + (e.message || e), true); }
}
function downloadItems(list) {
  list.slice(0, 20).forEach((it, i) => setTimeout(() => { const a = document.createElement('a'); a.href = it.orig_url || it.web_url; a.download = it.fichier || 'photo.jpg'; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }, i * 400));
  if (list.length > 20) toast('20 photos maximum à la fois');
}

// ── visionneuse ──────────────────────────────────────────────────────────────
async function renderLightbox(albumId, itemId) {
  const a = albumById(albumId); if (!a) { go('#/'); return; }
  const items = await loadItems(albumId);
  let idx = items.findIndex((it) => it.id === itemId); if (idx < 0) { go('#/album/' + albumId); return; }
  if (!document.querySelector('.lb')) await renderAlbum(albumId);
  let lb = document.querySelector('.lb');
  if (!lb) { lb = document.createElement('div'); lb.className = 'lb'; document.body.appendChild(lb); }
  const draw = () => {
    const it = items[idx];
    const media = it.type === 'video'
      ? `<video src="${esc(it.web_url || it.orig_url)}" controls playsinline preload="metadata"></video>`
      : `<img src="${esc(it.web_url || it.thumb_url)}" alt="" draggable="false">`;
    lb.innerHTML = `
      <div class="ltop"><button id="lb-back">‹ Retour</button><span>${idx + 1} / ${items.length}</span><button id="lb-more">⋯</button></div>
      <div class="stage"><div class="slide">${media}</div><button class="nav l" id="lb-prev">‹</button><button class="nav r" id="lb-next">›</button></div>
      <div class="lbot"><b>${esc(it.legende || it.fichier)}</b><div class="m">${fmtDate(it.pris_le || it.created_at)} · ${esc(a.titre)}${it.source === 'app' && !it.synced_nas ? ' · ⏳ pas encore sur le NAS' : ''}</div></div>
      <div class="acts">
        <button id="lb-share"><span>📤</span>Partager</button>
        <button id="lb-orig" ${it.orig_url || it.web_url ? '' : 'disabled'}><span>⬇</span>Original</button>
        <button id="lb-copy"><span>🔗</span>Lien</button>
      </div>`;
    history.replaceState(null, '', '#/album/' + albumId + '/photo/' + it.id);
    lb.querySelector('#lb-back').onclick = close;
    lb.querySelector('#lb-prev').onclick = () => step(-1); lb.querySelector('#lb-next').onclick = () => step(1);
    lb.querySelector('#lb-share').onclick = () => shareItems([it]);
    lb.querySelector('#lb-orig').onclick = () => window.open(it.orig_url || it.web_url, '_blank', 'noopener');
    lb.querySelector('#lb-copy').onclick = async () => { try { await navigator.clipboard.writeText(it.orig_url || it.web_url); toast('Lien copié'); } catch (_) { toast('Copie impossible', true); } };
    lb.querySelector('#lb-more').onclick = () => sheet(`<h4>${esc(it.fichier)}</h4><div class="hint">${it.largeur && it.hauteur ? it.largeur + ' × ' + it.hauteur + ' px · ' : ''}${it.taille ? Math.round(it.taille / 1024) + ' Ko · ' : ''}source ${it.source === 'app' ? 'téléphone' : 'NAS'}${it.pris_le ? ' · prise le ' + fmtDate(it.pris_le) : ''}</div>${isDir() ? '<div class="hint">Légende, couverture, suppression : à venir (étape 4).</div>' : ''}`);
    const img = lb.querySelector('img'); if (img) img.ondblclick = () => img.classList.toggle('zoom');
    // balayage tactile
    const st = lb.querySelector('.stage'); let x0 = null, y0 = null;
    st.ontouchstart = (e) => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } };
    st.ontouchend = (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null; if (Math.abs(dx) > 50 && Math.abs(dy) < 80 && !(img && img.classList.contains('zoom'))) step(dx < 0 ? 1 : -1); };
    // précharge voisins
    [idx - 1, idx + 1].forEach((j) => { const n = items[j]; if (n && n.type !== 'video' && n.web_url) { const p = new Image(); p.src = n.web_url; } });
  };
  const step = (d) => { idx = (idx + d + items.length) % items.length; draw(); };
  const close = () => { lb.remove(); document.onkeydown = null; go('#/album/' + albumId); };
  document.onkeydown = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); };
  draw();
}

// ── feuille (menu bas) ───────────────────────────────────────────────────────
export function sheet(html, init) {
  closeSheet();
  const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet';
  bg.innerHTML = `<div class="sheet">${html}</div>`;
  bg.onclick = (e) => { if (e.target === bg) closeSheet(); };
  document.body.appendChild(bg);
  if (init) init(bg.querySelector('.sheet'));
}
export function closeSheet() { const s = document.getElementById('sheet'); if (s) s.remove(); }

// ── routeur ──────────────────────────────────────────────────────────────────
async function route() {
  if (!state.session) { renderLogin(); return; }
  if (!canAccess()) { renderNoAccess(); return; }
  if (!state.albums.length) await loadAlbums();
  const h = location.hash || '#/';
  let m;
  if ((m = h.match(/^#\/album\/([^/]+)\/photo\/([^/]+)$/))) { await renderLightbox(m[1], m[2]); return; }
  const lb = document.querySelector('.lb'); if (lb) lb.remove();
  if ((m = h.match(/^#\/album\/([^/]+)$/))) { await renderAlbum(m[1]); return; }
  renderAlbums();
}
window.addEventListener('hashchange', route);

// ── démarrage ────────────────────────────────────────────────────────────────
(async () => {
  const { data } = await sb.auth.getSession();
  state.session = data.session;
  if (state.session) await loadProfile();
  sb.auth.onAuthStateChange(async (ev, session) => {
    const had = !!state.session; state.session = session;
    if (session && (!had || ev === 'SIGNED_IN')) { await loadProfile(); state.albums = []; state.items = {}; }
    if (!session) { state.profile = null; state.albums = []; state.items = {}; }
    if (ev !== 'TOKEN_REFRESHED') route();
  });
  route();
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
