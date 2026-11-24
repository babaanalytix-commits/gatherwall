/**
 * GatherWall — Stripe webhook → Firebase unlock Worker
 * =================================================================
 * Replaces polar-webhook-worker.js (Polar declined the account, Oct 2026).
 *
 * WHAT IT DOES
 *   Stripe POSTs an event when a Payment Link checkout completes. This Worker
 *   verifies the Stripe-Signature header, reads the client_reference_id that
 *   gatherwall.com/checkout.html adds to every payment link, and writes:
 *
 *     • Wall / Memory Wall / Memorial  → events/<id>.published = true
 *     • Keepsake song ($39)            → orders/<orderId>.paid = true
 *     • Wall Pro subscription          → pro/<email>.active = true
 *     • Pro subscription cancelled     → pro/<email>.active = false
 *     • Bespoke tiers (film/wedding)   → paid/<sessionId> record (for your records)
 *
 *   client_reference_id format (set by checkout.html):
 *     <slug>__<tier|x>__<ev-ID | or-ID | x>
 *
 * SETUP (Cloudflare → Workers & Pages → this Worker → Settings → Variables and Secrets)
 *   STRIPE_WEBHOOK_SECRET  (Secret) — Stripe → Developers → Webhooks → your
 *                                     endpoint → Signing secret (whsec_...)
 *   FIREBASE_DB_SECRET     (Secret) — optional; Firebase database secret, used
 *                                     for pro/ and paid/ writes if rules require auth.
 *
 * STRIPE ENDPOINT
 *   URL    : https://<this-worker>.workers.dev
 *   Events : checkout.session.completed, customer.subscription.deleted
 *
 * Fails CLOSED: no secret or a bad signature → request rejected, nothing written.
 */

import { EmailMessage } from 'cloudflare:email';

// ---- Order alerts: every paid order emails the owner (binding: SEND_EMAIL) ----
const ALERT_FROM = 'orders@gatherwall.com';
const ALERT_TO = 'baba.analytix@gmail.com';
const NAMES = {
  'live-tribute-wall':'Live Tribute Wall','memory-wall':'Memory Wall reveal','memorial-eulogy':'Memorial page',
  'animated-keepsake-story':'Keepsake Song ($39) + animated keepsake','song-of-your-night':'Song of Your Night ($39)',
  'story-film':'STORY FILM — made for you','wedding-keepsake':'WEDDING KEEPSAKE — made for you',
  'wedding-keepsake-signature':'WEDDING KEEPSAKE SIGNATURE — made for you','signature-celebration':'SIGNATURE CELEBRATION — made for you','wall-pro':'Wall Pro (monthly)'
};
const MANUAL = new Set(['story-film','wedding-keepsake','wedding-keepsake-signature','signature-celebration','wall-pro']);
async function notify(env, subject, lines){
  try{
    if(!env || !env.SEND_EMAIL) { console.log('ALERT (no SEND_EMAIL binding):', subject); return 'no-binding'; }
    const body = lines.join('\r\n');
    // Newer Email Service API: send({from,to,subject,text}). Fall back to raw MIME (EmailMessage) if unsupported.
    try { await env.SEND_EMAIL.send({ from: { email: ALERT_FROM, name: 'GatherWall Orders' }, to: ALERT_TO, subject, text: body }); return 'sent'; }
    catch(e1){ console.log('object send failed, trying raw MIME:', String(e1 && e1.message || e1)); }
    const raw = ['From: GatherWall Orders <'+ALERT_FROM+'>','To: '+ALERT_TO,'Subject: =?UTF-8?B?'+btoa(unescape(encodeURIComponent(subject)))+'?=',
      'Message-ID: <'+Date.now()+'.'+Math.random().toString(36).slice(2)+'@gatherwall.com>','Date: '+new Date().toUTCString(),
      'MIME-Version: 1.0','Content-Type: text/plain; charset=utf-8','', body].join('\r\n');
    await env.SEND_EMAIL.send(new EmailMessage(ALERT_FROM, ALERT_TO, raw));
    return 'sent';
  }catch(e){ console.log('ALERT FAILED', String(e && e.message || e)); return 'failed'; }
}

const FIREBASE_DB = 'https://tributewall-27c75-default-rtdb.europe-west1.firebasedatabase.app';
const TOLERANCE_SECONDS = 5 * 60;

function sanitizeKey(s) { return String(s).replace(/[.@#$[\]/]/g, '_'); }

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}

function fbUrl(path, auth) {
  let url = `${FIREBASE_DB}/${path}.json`;
  if (auth) url += `?auth=${encodeURIComponent(auth)}`;
  return url;
}

async function patchFirebase(path, data, auth) {
  const res = await fetch(fbUrl(path, auth), {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

async function getFirebase(path, auth) {
  const res = await fetch(fbUrl(path, auth));
  return res.ok ? res.json() : null;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Verify Stripe-Signature: "t=<ts>,v1=<hex>[,v1=<hex>...]" over "<ts>.<raw body>". */
async function verifyStripe(rawBody, header, secret) {
  if (!header) return { ok: false, reason: 'missing Stripe-Signature' };
  let ts = null; const sigs = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') ts = v;
    if (k === 'v1') sigs.push(v);
  }
  if (!ts || !sigs.length) return { ok: false, reason: 'malformed Stripe-Signature' };
  const tsNum = parseInt(ts, 10);
  if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp outside tolerance' };
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${rawBody}`));
  const expected = toHex(mac);
  return sigs.some((s) => safeEqual(s, expected)) ? { ok: true } : { ok: false, reason: 'no matching signature' };
}

/** "<slug>__<tier>__<ev-ID|or-ID|x>" → { slug, tier, ev, order } */
function parseRef(ref) {
  const out = { slug: '', tier: '', ev: '', order: '', from: '', c: '' };
  if (!ref) return out;
  const [slug, tier, target] = String(ref).split('__');
  out.slug = slug || '';
  out.tier = tier && tier !== 'x' ? tier : '';
  if (target && target.startsWith('ev-')) out.ev = target.slice(3);
  if (target && target.startsWith('or-')) out.order = target.slice(3);
  for (const p of String(ref).split('__').slice(3)) { if (p.startsWith('f-')) out.from = p.slice(2); if (p.startsWith('c-') && p !== 'c-x') out.c = p.slice(2); }
  return out;
}

const BESPOKE = new Set(['story-film', 'wedding-keepsake', 'wedding-keepsake-signature', 'signature-celebration']);
const SONGS = new Set(['animated-keepsake-story', 'song-of-your-night']);

// ================= HOST GATEWAY (/host) =================
// Every control-panel action goes through here. The wall's private key lives in
// hostkeys/<ev> (never readable by browsers); we check it, then write with the admin secret.
const HOST_ORIGINS = ['https://gatherwall.com', 'https://www.gatherwall.com'];
const PROTECTED_EVENT_FIELDS = new Set(['published', 'paidAt', 'paidTier', 'saleId', 'amount', 'currency', 'manageKey', 'id']);
const TRIB_HOST_FIELDS = new Set(['approved', 'pinned', 'msg', 'name', 'editedAt', 'photo']);
function hostCors(request, resp) {
  const o = request.headers.get('Origin') || '';
  const h = new Headers(resp.headers);
  h.set('Access-Control-Allow-Origin', HOST_ORIGINS.includes(o) ? o : HOST_ORIGINS[0]);
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(resp.body, { status: resp.status, headers: h });
}
const okId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{2,80}$/.test(s);
async function fbDelete(path, auth) { const r = await fetch(fbUrl(path, auth), { method: 'DELETE' }); return { ok: r.ok, status: r.status }; }
async function handleHost(request, env) {
  if (request.method === 'OPTIONS') return hostCors(request, new Response(null, { status: 204 }));
  const AUTH = env && env.FIREBASE_DB_SECRET;
  if (!AUTH) return hostCors(request, json({ ok: false, error: 'not configured' }, 500));
  let b; try { b = await request.json(); } catch (e) { return hostCors(request, json({ ok: false, error: 'bad json' }, 400)); }
  const op = String(b.op || ''), ev = b.ev, rid = b.rid;
  if (!okId(ev)) return hostCors(request, json({ ok: false, error: 'bad wall id' }, 400));

  // Guest editing their own message: checked against editkeys/<ev>/<rid>.
  if (op === 'guest.edit') {
    if (!okId(rid) || typeof b.ek !== 'string') return hostCors(request, json({ ok: false, error: 'bad request' }, 400));
    const ek = await getFirebase(`editkeys/${ev}/${rid}`, AUTH);
    if (!ek || ek !== b.ek) return hostCors(request, json({ ok: false, error: 'This edit link is not valid' }, 403));
    const t = await getFirebase(`tributes/${ev}/${rid}`, AUTH);
    if (!t) return hostCors(request, json({ ok: false, error: 'Message not found' }, 404));
    const e = await getFirebase(`events/${ev}`, AUTH) || {};
    const msg = String(b.msg == null ? (t.msg || '') : b.msg).slice(0, 4000), name = String(b.name || t.name || 'A guest').slice(0, 120);
    const patch = { msg, name, editedAt: Date.now() }; if (b.photo === null || (typeof b.photo === 'string' && b.photo.startsWith('https://media.gatherwall.com/') && b.photo.length < 200) || (typeof b.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(b.photo) && b.photo.length < 1500000)) { patch.photo = b.photo; if (e.opts && e.opts.moderation) patch.approved = false; }
    if (e.opts && e.opts.moderation && msg !== (t.msg || '')) patch.approved = false;
    const r = await patchFirebase(`tributes/${ev}/${rid}`, patch, AUTH);
    return hostCors(request, json({ ok: r.ok, approved: patch.approved !== false }));
  }

  // Everything else needs the wall's private control-panel key.
  const key = await getFirebase(`hostkeys/${ev}`, AUTH);
  if (!key || typeof b.key !== 'string' || !safeEqual(b.key, key)) return hostCors(request, json({ ok: false, error: 'Invalid control-panel link' }, 403));
  if (op === 'verify') return hostCors(request, json({ ok: true }));
  if (op === 'event.update') {
    const f = {}; Object.keys(b.fields || {}).forEach(k => { if (!PROTECTED_EVENT_FIELDS.has(k) && /^[A-Za-z0-9_]{1,40}$/.test(k)) f[k] = b.fields[k]; });
    const r = await patchFirebase(`events/${ev}`, f, AUTH); return hostCors(request, json({ ok: r.ok }));
  }
  if (op === 'trib.update') {
    if (!okId(rid)) return hostCors(request, json({ ok: false, error: 'bad message id' }, 400));
    const f = {}; Object.keys(b.fields || {}).forEach(k => { if (TRIB_HOST_FIELDS.has(k)) f[k] = b.fields[k]; });
    const r = await patchFirebase(`tributes/${ev}/${rid}`, f, AUTH); return hostCors(request, json({ ok: r.ok }));
  }
  // Wall of Love moderation (key stored at hostkeys/love).
  if (op === 'love.approve' || op === 'love.delete') {
    if (ev !== 'love' || !okId(rid)) return hostCors(request, json({ ok: false, error: 'bad request' }, 400));
    const r = op === 'love.delete' ? await fbDelete(`love/messages/${rid}`, AUTH)
      : await patchFirebase(`love/messages/${rid}`, { approved: b.val !== false }, AUTH);
    return hostCors(request, json({ ok: r.ok }));
  }
  if (op === 'admin.get' || op === 'admin.analytics') { if (ev !== 'admin') return hostCors(request, json({ ok: false, error: 'bad request' }, 400)); if (op === 'admin.get') { const path = String(b.path || ''); if (!/^(projects|orders|events|love\/messages|mail|admin|paid|track)(\/[A-Za-z0-9_-]+)*$/.test(path)) return hostCors(request, json({ ok: false, error: 'bad path' }, 400)); const r = await fetch(FIREBASE_DB + '/' + path + '.json?auth=' + encodeURIComponent(AUTH) + (b.shallow ? '&shallow=true' : '')); return hostCors(request, json({ ok: r.ok, data: r.ok ? await r.json() : null })); } if (!env.CF_API_TOKEN) return hostCors(request, json({ ok: false, error: 'no-token' })); const days = Math.min(Math.max(parseInt(b.days, 10) || 30, 1), 90); const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10); const gq = 'query($a:String!,$s:Date!){viewer{accounts(filter:{accountTag:$a}){byDate:rumPageloadEventsAdaptiveGroups(limit:100,filter:{date_geq:$s,requestHost_in:["gatherwall.com","www.gatherwall.com"]},orderBy:[date_ASC]){count sum{visits} dimensions{date}} byCountry:rumPageloadEventsAdaptiveGroups(limit:15,filter:{date_geq:$s,requestHost_in:["gatherwall.com","www.gatherwall.com"]},orderBy:[sum_visits_DESC]){count sum{visits} dimensions{countryName}} byPath:rumPageloadEventsAdaptiveGroups(limit:15,filter:{date_geq:$s,requestHost_in:["gatherwall.com","www.gatherwall.com"]},orderBy:[count_DESC]){count dimensions{requestPath}} byRef:rumPageloadEventsAdaptiveGroups(limit:10,filter:{date_geq:$s,requestHost_in:["gatherwall.com","www.gatherwall.com"]},orderBy:[sum_visits_DESC]){count sum{visits} dimensions{refererHost}} byDevice:rumPageloadEventsAdaptiveGroups(limit:5,filter:{date_geq:$s,requestHost_in:["gatherwall.com","www.gatherwall.com"]},orderBy:[count_DESC]){count dimensions{deviceType}}}}}'; const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.CF_API_TOKEN }, body: JSON.stringify({ query: gq, variables: { a: '1eba586a4e9fa089814ee8d3c7e29ca4', s: since } }) }); const d = await r.json().catch(() => ({})); return hostCors(request, json({ ok: r.ok && !d.errors, data: d.data || null, errors: d.errors || null })); } if (op === 'admin.patch') { if (ev !== 'admin' || typeof b.pid !== 'string' || !/^p[a-z0-9]{6}--[a-z0-9]{16}$/.test(b.pid) || ['drafts/lyrics', 'drafts/song', 'drafts/film', 'meta', 'final'].indexOf(b.sub) < 0 || !b.fields || typeof b.fields !== 'object') return hostCors(request, json({ ok: false, error: 'bad request' }, 400)); const r = await patchFirebase('projects/' + b.pid + '/' + b.sub, b.fields, AUTH); return hostCors(request, json({ ok: r.ok })); } 
  if (op === 'admin.love') { if (ev !== 'admin' || !okId(rid)) return hostCors(request, json({ ok: false, error: 'bad request' }, 400)); const r = b.val === 'delete' ? await fbDelete('love/messages/' + rid, AUTH) : await patchFirebase('love/messages/' + rid, { approved: b.val !== false }, AUTH); return hostCors(request, json({ ok: r.ok })); } if (op === 'admin.mail') { if (ev !== 'admin') return hostCors(request, json({ ok: false, error: 'bad request' }, 400)); const to = String(b.to || '').trim(), subject = String(b.subject || '').slice(0, 200), text = String(b.text || '').slice(0, 20000), fromName = String(b.fromName || 'GatherWall').replace(/[<>"\r\n]/g, '').slice(0, 60); if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(to) || !subject || !text) return hostCors(request, json({ ok: false, error: 'Add a valid email, a subject and a message' }, 400)); if (!env.SEND_EMAIL) return hostCors(request, json({ ok: false, error: 'email not configured' }, 500)); try { await env.SEND_EMAIL.send({ from: { email: 'hello@gatherwall.com', name: fromName }, to, subject, text }); await patchFirebase('admin/sent/' + Date.now(), { to, subject, at: Date.now() }, AUTH); return hostCors(request, json({ ok: true })); } catch (e) { return hostCors(request, json({ ok: false, error: String((e && e.message) || e) }, 502)); } } if (op === 'trib.delete') {
    if (!okId(rid)) return hostCors(request, json({ ok: false, error: 'bad message id' }, 400));
    const r = await fbDelete(`tributes/${ev}/${rid}`, AUTH); await fbDelete(`editkeys/${ev}/${rid}`, AUTH);
    return hostCors(request, json({ ok: r.ok }));
  }
  return hostCors(request, json({ ok: false, error: 'unknown op' }, 400));
}

// ================= MEDIA (/media) — guest photos + partner logos → R2 (binding: MEDIA) =================
const MEDIA_BASE = 'https://media.gatherwall.com/';
const SITE_URL = 'https://gatherwall.com/';
const rnd = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return [...a].map(x => 'abcdefghijkmnpqrstuvwxyz23456789'[x % 32]).join(''); };
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, n);
const okEmail = (s) => typeof s === 'string' && /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]{2,}$/.test(s);
const okColor = (s) => (typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)) ? s : '';
const okSlug = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s);
const okMediaUrl = (s) => typeof s === 'string' && s.length < 200 && s.startsWith(MEDIA_BASE) && /^[A-Za-z0-9_\/.-]+$/.test(s.slice(MEDIA_BASE.length));
const eh = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const IMG_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
async function handleMedia(request, env) {
  if (request.method === 'OPTIONS') return hostCors(request, new Response(null, { status: 204 }));
  if (request.method !== 'POST') return hostCors(request, json({ ok: false }, 405));
  const AUTH = env && env.FIREBASE_DB_SECRET;
  if (!env.MEDIA || !AUTH) return hostCors(request, json({ ok: false, error: 'storage not configured' }, 500));
  const u = new URL(request.url), ev = u.searchParams.get('ev') || '', scope = u.searchParams.get('scope') || 'wall';
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim();
  if (!IMG_TYPES[type]) return hostCors(request, json({ ok: false, error: 'images only' }, 415));
  let key;
  if (scope === 'logo') {
    const k = await getFirebase('partnerkeys/' + ev, AUTH);
    if (!okId(ev) || !k || !safeEqual(String(u.searchParams.get('key') || ''), k)) return hostCors(request, json({ ok: false, error: 'not allowed' }, 403));
    key = 'p/' + ev + '/logo-' + rnd(6) + '.' + IMG_TYPES[type];
  } else {
    if (!okId(ev) || !(await getFirebase('events/' + ev + '/name', AUTH))) return hostCors(request, json({ ok: false, error: 'wall not found' }, 404));
    key = 'w/' + ev + '/' + Date.now().toString(36) + rnd(6) + '.' + IMG_TYPES[type];
  }
  const buf = await request.arrayBuffer();
  if (buf.byteLength < 100 || buf.byteLength > 2500000) return hostCors(request, json({ ok: false, error: 'photo too large' }, 413));
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
  return hostCors(request, json({ ok: true, url: MEDIA_BASE + key }));
}

// ================= GATHERWALL BUSINESS (/biz) =================
// partners/<pid>          private record (admin secret only)
// partnerkeys/<pid>       the partner's dashboard key (admin secret only)
// partnerpub/<slug>       public branding for the hosted page (served through this worker)
// usage/<pid>/<ev>        one line per activated event (the usage ledger)
const PTYPES = ['dj', 'mc', 'venue', 'hotel', 'planner', 'photographer', 'memorial', 'other'];
const PUB_FIELDS = ['name', 'type', 'logo', 'color', 'accent', 'tagline', 'about', 'website', 'phone', 'city', 'offers', 'lang', 'tr'];
function pubOf(p) { const o = { slug: p.slug }; PUB_FIELDS.forEach(k => { if (p[k] != null && p[k] !== '') o[k] = p[k]; }); return o; }
function brandOf(p) { return { name: p.name || '', logo: p.logo || '', color: p.color || '', website: p.website || '', slug: p.slug || '' }; }
function dashLink(pid, key) { return SITE_URL + 'partner.html#pid=' + pid + '&key=' + key; }
function evLinks(id, mk) { return { guest: SITE_URL + 'index.html#guest?ev=' + id, screen: SITE_URL + 'index.html#wall?ev=' + id, manage: SITE_URL + 'index.html#manage?ev=' + id + '&key=' + mk, keepsake: SITE_URL + 'keepsake-wall.html?ev=' + id }; }
async function queueMail(AUTH, to, subject, intro, rows, note) {
  if (!okEmail(to)) return null;
  return patchFirebase('mail/biz_' + Date.now() + '_' + rnd(4), { kind: 'custom', to, subject, intro, rows: rows || [], note: note || '', ts: Date.now(), sent: false }, AUTH);
}
async function handleBiz(request, env) {
  if (request.method === 'OPTIONS') return hostCors(request, new Response(null, { status: 204 }));
  const AUTH = env && env.FIREBASE_DB_SECRET;
  if (!AUTH) return hostCors(request, json({ ok: false, error: 'not configured' }, 500));
  let b; try { b = await request.json(); } catch (e) { return hostCors(request, json({ ok: false, error: 'bad json' }, 400)); }
  const op = String(b.op || ''), R = (o, s) => hostCors(request, json(o, s));

  // ---------- public ----------
  if (op === 'apply') {
    if (b.hp) return R({ ok: true });
    const email = clip(b.email, 120).toLowerCase(), name = clip(b.name, 80);
    if (!name || !okEmail(email)) return R({ ok: false, error: 'Please add your business name and a valid email.' }, 400);
    const ek = sanitizeKey(email);
    if (await getFirebase('partneremails/' + ek, AUTH)) return R({ ok: true, again: true });
    const pid = 'pt' + rnd(10);
    const p = { pid, name, email, type: PTYPES.indexOf(b.type) > -1 ? b.type : 'other', contact: clip(b.contact, 80), city: clip(b.city, 60), website: clip(b.website, 160), phone: clip(b.phone, 40), note: clip(b.note, 600), lang: b.lang === 'cs' ? 'cs' : 'en', from: clip(b.from, 30), c: clip(b.c, 40), status: 'pending', founding: true, createdAt: Date.now() };
    await patchFirebase('partners/' + pid, p, AUTH); await patchFirebase('partneremails', { [ek]: pid }, AUTH);
    await notify(env, '🤝 New partner application: ' + name, ['Business: ' + name, 'Type: ' + p.type, 'Contact: ' + (p.contact || '-'), 'Email: ' + email, 'Phone: ' + (p.phone || '-'), 'City: ' + (p.city || '-'), 'Website: ' + (p.website || '-'), 'Note: ' + (p.note || '-'), 'Source: ' + (p.from || 'direct') + (p.c ? ' / ' + p.c : ''), '', 'Approve it in admin → Partners: ' + SITE_URL + 'admin.html']);
    return R({ ok: true });
  }
  if (op === 'pub.get') {
    if (!okSlug(b.slug)) return R({ ok: false }, 404);
    const p = await getFirebase('partnerpub/' + b.slug, AUTH);
    if (!p || p.off) return R({ ok: false }, 404);
    delete p.pid; return R({ ok: true, p });
  }
  if (op === 'fb.post') {
    if (b.hp) return R({ ok: true });
    const ev = b.ev; if (!okId(ev)) return R({ ok: false }, 400);
    const e = await getFirebase('events/' + ev, AUTH);
    if (!e || e.bizKind !== 'feedback') return R({ ok: false, error: 'not found' }, 404);
    const msg = clip(b.msg, 3000); if (!msg && !b.photo) return R({ ok: false, error: 'Please write a few words.' }, 400);
    const rec = { msg, name: clip(b.name, 80) || 'A guest', ts: Date.now() }; if (okMediaUrl(b.photo)) rec.photo = b.photo;
    await patchFirebase('feedback/' + ev + '/f' + Date.now().toString(36) + rnd(4), rec, AUTH);
    return R({ ok: true });
  }
  if (op === 'pub.request') {
    if (b.hp) return R({ ok: true });
    if (!okSlug(b.slug)) return R({ ok: false }, 404);
    const pub = await getFirebase('partnerpub/' + b.slug, AUTH);
    if (!pub || pub.off || !pub.pid) return R({ ok: false }, 404);
    const email = clip(b.email, 120), name = clip(b.name, 80);
    if (!name || !okEmail(email)) return R({ ok: false, error: 'Please add your name and a valid email.' }, 400);
    const rq = { name, email, phone: clip(b.phone, 40), date: clip(b.date, 20), what: clip(b.what, 120), guests: clip(b.guests, 10), note: clip(b.note, 800), ts: Date.now(), status: 'new' };
    await patchFirebase('partners/' + pub.pid + '/requests/r' + Date.now().toString(36) + rnd(4), rq, AUTH);
    const p = await getFirebase('partners/' + pub.pid, AUTH) || {};
    await queueMail(AUTH, p.email, 'New request from your page: ' + name, eh(name) + ' sent a request through your GatherWall page.<br><br><b>What:</b> ' + eh(rq.what) + '<br><b>Date:</b> ' + eh(rq.date || '-') + '<br><b>Guests:</b> ' + eh(rq.guests || '-') + '<br><b>Email:</b> ' + eh(email) + '<br><b>Phone:</b> ' + eh(rq.phone || '-') + '<br><b>Message:</b> ' + eh(rq.note || '-'), [], 'Open your dashboard to create their event when you are ready.');
    await notify(env, '📩 Partner page request → ' + (p.name || b.slug), ['Partner: ' + (p.name || b.slug), 'From: ' + name + ' <' + email + '>', 'What: ' + rq.what, 'Date: ' + rq.date]);
    return R({ ok: true });
  }

  // ---------- admin (hostkeys/admin) ----------
  if (op.startsWith('admin.')) {
    const ak = await getFirebase('hostkeys/admin', AUTH);
    if (!ak || typeof b.key !== 'string' || !safeEqual(b.key, ak)) return R({ ok: false, error: 'not allowed' }, 403);
    if (op === 'admin.list') {
      const ps = await getFirebase('partners', AUTH) || {}, us = await getFirebase('usage', AUTH) || {};
      Object.keys(ps).forEach(id => { const u = us[id] || {}; ps[id].eventCount = Object.keys(u).length; ps[id].billable = Object.values(u).filter(x => x && x.billable).length; if (ps[id].events) ps[id].events = Object.keys(ps[id].events).length; if (ps[id].requests) ps[id].requests = Object.keys(ps[id].requests).length; });
      return R({ ok: true, partners: ps });
    }
    const pid = b.pid, p = okId(pid) ? await getFirebase('partners/' + pid, AUTH) : null;
    if (!p) return R({ ok: false, error: 'partner not found' }, 404);
    if (op === 'admin.approve') {
      const slug = String(b.slug || '').toLowerCase();
      if (!okSlug(slug)) return R({ ok: false, error: 'Page address: 3–40 lowercase letters, numbers or dashes' }, 400);
      const taken = await getFirebase('partnerpub/' + slug, AUTH);
      if (taken && taken.pid !== pid) return R({ ok: false, error: 'That page address is taken' }, 409);
      let key = await getFirebase('partnerkeys/' + pid, AUTH);
      if (!key) { key = rnd(28); await patchFirebase('partnerkeys', { [pid]: key }, AUTH); }
      if (p.slug && p.slug !== slug) await fbDelete('partnerpub/' + p.slug, AUTH);
      Object.assign(p, { slug, status: 'active', approvedAt: Date.now() });
      await patchFirebase('partners/' + pid, { slug, status: 'active', approvedAt: p.approvedAt }, AUTH);
      await patchFirebase('partnerpub/' + slug, Object.assign(pubOf(p), { pid, off: null }), AUTH);
      const link = dashLink(pid, key);
      if (b.email !== false) await queueMail(AUTH, p.email, 'Welcome to GatherWall Business: your dashboard', 'Your partner account for <b>' + eh(p.name) + '</b> is ready. This private link is your login. Keep it safe and do not share it publicly.', [['Your partner dashboard', link, 'Open my dashboard'], ['Your page for customers', SITE_URL + 'p/' + slug, 'View my page']], 'Your first event is on us (Founding Partner). Reply to this email any time.');
      return R({ ok: true, link, page: SITE_URL + 'p/' + slug });
    }
    if (op === 'admin.link') { const key = await getFirebase('partnerkeys/' + pid, AUTH); return R({ ok: !!key, link: key ? dashLink(pid, key) : '' }); }
    if (op === 'admin.status') {
      const st = ['active', 'suspended', 'pending', 'declined'].indexOf(b.val) > -1 ? b.val : 'suspended';
      await patchFirebase('partners/' + pid, { status: st }, AUTH);
      if (p.slug) await patchFirebase('partnerpub/' + p.slug, { off: st === 'active' ? null : true }, AUTH);
      return R({ ok: true });
    }
    return R({ ok: false, error: 'unknown op' }, 400);
  }

  // ---------- partner (partnerkeys/<pid>) ----------
  const pid = b.pid;
  const pk = okId(pid) ? await getFirebase('partnerkeys/' + pid, AUTH) : null;
  if (!pk || typeof b.key !== 'string' || !safeEqual(b.key, pk)) return R({ ok: false, error: 'This dashboard link is not valid' }, 403);
  const p = await getFirebase('partners/' + pid, AUTH);
  if (!p || p.status !== 'active') return R({ ok: false, error: 'This partner account is not active. Please contact hello@gatherwall.com.' }, 403);

  if (op === 'me') {
    const evs = p.events || {}, ids = Object.keys(evs).sort((a, x) => (evs[x].createdAt || 0) - (evs[a].createdAt || 0)).slice(0, 40);
    await Promise.all(ids.map(async id => { const t = await fetch(FIREBASE_DB + '/' + (evs[id].kind === 'feedback' ? 'feedback' : 'tributes') + '/' + id + '.json?shallow=true&auth=' + encodeURIComponent(AUTH)).then(x => x.ok ? x.json() : null).catch(() => null); evs[id].posts = t ? Object.keys(t).length : 0; evs[id].links = evLinks(id, evs[id].mk || ''); delete evs[id].mk; }));
    const out = Object.assign({}, p); out.events = ids.map(id => Object.assign({ id }, evs[id]));
    out.requests = Object.entries(p.requests || {}).map(([id, r]) => Object.assign({ id }, r)).sort((a, x) => x.ts - a.ts).slice(0, 50);
    out.page = SITE_URL + 'p/' + p.slug;
    return R({ ok: true, p: out });
  }
  if (op === 'brand.save') {
    const f = b.fields || {}, up = {};
    if (f.name != null) up.name = clip(f.name, 80) || p.name;
    ['tagline', 'city', 'phone'].forEach(k => { if (f[k] != null) up[k] = clip(f[k], k === 'tagline' ? 140 : 60); });
    if (f.website != null) up.website = /^https?:\/\//.test(f.website) ? clip(f.website, 160) : (f.website ? 'https://' + clip(f.website, 150) : '');
    if (f.about != null) up.about = clip(f.about, 900);
    if (f.color != null) up.color = okColor(f.color) || '#2E7D5B';
    if (f.accent != null) up.accent = okColor(f.accent) || '#C9A54C';
    if (f.logo != null) up.logo = f.logo === '' ? '' : (okMediaUrl(f.logo) ? f.logo : p.logo || '');
    if (f.lang != null) up.lang = f.lang === 'cs' ? 'cs' : 'en';
    if (f.tr && typeof f.tr === 'object') { up.tr = {}; ['en', 'cs', 'de', 'fr', 'es'].forEach(L => { const x = f.tr[L]; if (!x || typeof x !== 'object') return; const o = { tagline: clip(x.tagline, 140), about: clip(x.about, 900) }; if (Array.isArray(x.offers)) o.offers = x.offers.slice(0, 8).map(q => ({ t: clip(q && q.t, 80), d: clip(q && q.d, 300), price: clip(q && q.price, 40) })); if (o.tagline || o.about || (o.offers && o.offers.some(q => q.t))) up.tr[L] = o; }); }
    if (Array.isArray(f.offers)) up.offers = f.offers.slice(0, 8).map(o => ({ t: clip(o && o.t, 80), d: clip(o && o.d, 300), price: clip(o && o.price, 40) })).filter(o => o.t);
    await patchFirebase('partners/' + pid, up, AUTH);
    const np = Object.assign({}, p, up);
    await patchFirebase('partnerpub/' + p.slug, Object.assign(pubOf(np), { pid }), AUTH);
    const br = brandOf(np);
    await Promise.all(Object.keys(p.events || {}).map(id => patchFirebase('events/' + id, { brand: br, color: np.color || '#2E7D5B' }, AUTH)));
    return R({ ok: true });
  }
  if (op === 'event.create') {
    const name = clip(b.name, 90);
    if (!name) return R({ ok: false, error: 'Add the event name, e.g. "Anna & Tom" or "Grandma Jo, 1938–2026"' }, 400);
    const kind = ['wedding', 'celebration', 'memorial', 'corporate', 'feedback', 'community'].indexOf(b.kind) > -1 ? b.kind : 'celebration';
    const vibe = { wedding: 'wedding', celebration: 'celebration', memorial: 'memorial', corporate: 'celebration', feedback: 'celebration', community: 'celebration' }[kind];
    const id = 'b' + rnd(9), mk = rnd(24), now = Date.now();
    // Sales demos: an admin can pre-load a demo event on a prospect's account without using their free event or billing them.
    let demo = false; if (b.demo === true && typeof b.ak === 'string') { const ak = await getFirebase('hostkeys/admin', AUTH); demo = !!ak && safeEqual(b.ak, ak); }
    const free = !demo && !!(p.founding && !p.freeUsed);
    const opts = { music: 'off', compose: 'ai', photos: true, video: false, voice: false, dedications: kind === 'wedding' || kind === 'celebration', moderation: b.moderation !== false };
    const ev = { id, name, kind: kind === 'memorial' ? 'family' : 'live', vibe, color: p.color || '#2E7D5B', host: clip(b.host, 80) || p.name, hostLink: p.website || '', date: clip(b.date, 20), mode: b.mode === 'before' ? 'before' : 'live', tier: 'unlimited', opts, published: true, paidAt: now, paidTier: 'partner', partner: pid, brand: brandOf(p), bizKind: kind, createdAt: now };
    let r = await patchFirebase('hostkeys', { [id]: mk }, AUTH); if (!r.ok) return R({ ok: false, error: 'Could not create the event' }, 500);
    r = await patchFirebase('events/' + id, ev, AUTH); if (!r.ok) return R({ ok: false, error: 'Could not create the event' }, 500);
    const cust = { name: clip(b.customerName, 80), email: okEmail(clip(b.customerEmail, 120)) ? clip(b.customerEmail, 120) : '' };
    await patchFirebase('partners/' + pid + '/events/' + id, { name, kind, date: ev.date, createdAt: now, mk, customer: cust, handedOver: false, free }, AUTH);
    if (demo) { ev.demo = true; await patchFirebase('events/' + id, { demo: true }, AUTH); }
    await patchFirebase('partners/' + pid + '/events/' + id, demo ? { demo: true } : {}, AUTH);
    if (!demo) await patchFirebase('usage/' + pid + '/' + id, { ts: now, kind, billable: !free, founding: free }, AUTH);
    if (free) await patchFirebase('partners/' + pid, { freeUsed: true }, AUTH);
    if (b.requestId && okId(b.requestId)) await patchFirebase('partners/' + pid + '/requests/' + b.requestId, { status: 'created', ev: id }, AUTH);
    await notify(env, '🎟️ Partner event: ' + p.name + ' → ' + name, ['Partner: ' + p.name, 'Event: ' + name + ' (' + kind + ')', 'Date: ' + (ev.date || '-'), free ? 'Founding Partner free event' : 'Billable event (pilot: record only)', 'Wall: ' + SITE_URL + 'index.html#wall?ev=' + id]);
    return R({ ok: true, id, links: evLinks(id, mk), free });
  }
  if (op === 'event.handover') {
    const id = b.ev, rec = okId(id) && p.events && p.events[id];
    if (!rec) return R({ ok: false, error: 'Event not found' }, 404);
    const email = clip(b.email, 120), name = clip(b.name, 80) || (rec.customer && rec.customer.name) || '';
    if (!okEmail(email)) return R({ ok: false, error: 'Add a valid email' }, 400);
    const L = evLinks(id, rec.mk);
    const rowsH = [['Share with guests (QR or link)', L.guest, 'Open the guest page'], ['Big screen', L.screen, 'Open the big screen'], ['Your control panel (keep private)', L.manage, 'Open control panel'], ['Your keepsake (every message and photo, to keep)', L.keepsake, 'Open your keepsake']];
    await queueMail(AUTH, email, '“' + rec.name + '”: your GatherWall links from ' + p.name, '<b>' + eh(p.name) + '</b> has set up your GatherWall for <b>' + eh(rec.name) + '</b>. These links are yours to keep. The wall and everything guests share stay available to you, even after the event.', rowsH, 'From the control panel you can approve messages, download photos and keep everything. Questions? Reply to this email.');
    await patchFirebase('partners/' + pid + '/events/' + id, { customer: { name, email }, handedOver: { email, at: Date.now() } }, AUTH);
    return R({ ok: true });
  }
  if (op === 'fb.list') {
    if (!okId(b.ev) || !(p.events && p.events[b.ev])) return R({ ok: false }, 404);
    const f = await getFirebase('feedback/' + b.ev, AUTH) || {};
    return R({ ok: true, items: Object.entries(f).map(([id, x]) => Object.assign({ id }, x)).sort((a, c) => c.ts - a.ts) });
  }
  if (op === 'request.update') {
    if (!okId(b.rid) || !(p.requests && p.requests[b.rid])) return R({ ok: false }, 404);
    await patchFirebase('partners/' + pid + '/requests/' + b.rid, { status: ['new', 'contacted', 'created', 'closed'].indexOf(b.val) > -1 ? b.val : 'closed' }, AUTH);
    return R({ ok: true });
  }
  return R({ ok: false, error: 'unknown op' }, 400);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/media') return handleMedia(request, env);
    if (path === '/biz') return handleBiz(request, env);
    if (path === '/host') return handleHost(request, env);
    if (request.method === 'GET') return new Response('ok', { status: 200 });
    if (request.method !== 'POST') return json({ ignored: true }, 200);

    const rawBody = await request.text();
    const secret = env && env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.log('REJECTED: STRIPE_WEBHOOK_SECRET not set');
      return json({ ok: false, error: 'webhook secret not configured' }, 500);
    }
    const v = await verifyStripe(rawBody, request.headers.get('stripe-signature'), secret);
    if (!v.ok) {
      console.log('REJECTED:', v.reason);
      return json({ ok: false, error: 'invalid signature' }, 401);
    }

    let event;
    try { event = JSON.parse(rawBody); } catch (_e) { return json({ ok: false, error: 'invalid JSON' }, 400); }

    const AUTH = (env && env.FIREBASE_DB_SECRET) || '';
    const type = String(event.type || '');
    const obj = (event.data && event.data.object) || {};
    const result = { ok: true, type, handled: [] };

    try {
      if (type === 'checkout.session.completed') {
        const paid = obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required';
        if (!paid) {
          result.note = 'session not paid yet (' + obj.payment_status + ')';
          return json(result, 200);
        }
        const ref = parseRef(obj.client_reference_id);
        const email = (obj.customer_details && obj.customer_details.email) || obj.customer_email || '';
        const stamp = { paidAt: Date.now(), saleId: obj.id, amount: obj.amount_total, currency: obj.currency };
        result.ref = ref;

        // Walls + memorial pages: publish the event.
        if (ref.ev || (ref.slug === 'memorial-eulogy' && ref.order)) {
          const id = ref.ev || ref.order;
          const patch = Object.assign({ published: true }, stamp);
          if (ref.tier) patch.paidTier = ref.tier;
          const r = await patchFirebase(`events/${id}`, patch, AUTH);
          result.published = id; result.fb = r.status; result.handled.push('wall');
          if (!r.ok) console.log('EVENT WRITE FAILED', id, r.status, r.body);
        }

        if (BESPOKE.has(ref.slug) && ref.order && /^p[a-z0-9]{6}--[a-z0-9]{16}$/.test(ref.order)) { const pr = await patchFirebase('projects/' + ref.order, Object.assign({ paid: true, stage: 'lyrics' }, stamp), AUTH); result.project = ref.order; result.handled.push('project'); if (!pr.ok) console.log('PROJECT WRITE FAILED', ref.order, pr.status); } // Keepsake songs: mark the order paid so create-song.html unlocks.
        if (SONGS.has(ref.slug) && ref.order) {
          const r = await patchFirebase(`orders/${ref.order}`, Object.assign({ paid: true, email: email || null }, stamp), AUTH);
          result.orderPaid = ref.order; result.orderFb = r.status; result.handled.push('order');
          if (!r.ok) console.log('ORDER WRITE FAILED', ref.order, r.status, r.body);
        }

        // Pro subscription: activate by email, and remember subscription → key.
        if (obj.mode === 'subscription' || ref.slug === 'wall-pro') {
          const key = sanitizeKey(email || obj.customer || obj.id);
          const sub = obj.subscription || '';
          const r = await patchFirebase(`pro/${key}`,
            { active: true, email: email || null, subscriptionId: sub, updatedAt: Date.now() }, AUTH);
          if (sub) await patchFirebase(`subs/${sub}`, { key }, AUTH);
          result.pro = key; result.proFb = r.status; result.handled.push('pro:on');
          if (!r.ok) console.log('PRO WRITE FAILED', key, r.status, r.body);
        }

        // Made-to-order tiers: keep a record so nothing is missed.
        if (BESPOKE.has(ref.slug)) {
          const r = await patchFirebase(`paid/${sanitizeKey(obj.id)}`,
            Object.assign({ slug: ref.slug, email: email || null, status: 'awaiting story form' }, stamp), AUTH);
          result.bespoke = ref.slug; result.paidFb = r.status; result.handled.push('bespoke');
        }

        // ---- Queue the customer's confirmation email (sent by the Google Apps Script mailer) ----
        // mail/ is not in the public rules, so only the admin secret can read/write it.
        if (email) {
          const cd = obj.customer_details || {};
          const q = await patchFirebase(`mail/${sanitizeKey(obj.id)}`, {
            to: email, name: cd.name || null, phone: cd.phone || null,
            slug: ref.slug || '', tier: ref.tier || '', ev: ref.ev || '', order: ref.order || '',
            amount: obj.amount_total, currency: obj.currency || '', ts: Date.now(), sent: false,
          }, AUTH);
          result.mailQueued = q.status;
        }

        // ---- Campaign source → track/sales (server-side, so every paid order is counted once) ----
        try { await patchFirebase(`track/sales/${sanitizeKey(obj.id)}`, { from: (ref.from||'direct').slice(0,30), c: (ref.c||'').slice(0,40), slug: (ref.slug||'').slice(0,40), ts: { '.sv': 'timestamp' } }, AUTH); } catch (e) {}

        // ---- Alert the owner about every paid order ----
        const name = NAMES[ref.slug] || ref.slug || 'Unknown product';
        const money = obj.amount_total != null ? (obj.amount_total/100).toFixed(2)+' '+String(obj.currency||'').toUpperCase() : '?';
        const action = MANUAL.has(ref.slug) ? 'ACTION NEEDED: reply to the customer within 1 working day.' : 'Automatic — nothing to do unless they get in touch.';
        result.alert = await notify(env, (MANUAL.has(ref.slug)?'🔔 ACTION: ':'✅ ')+name+' — '+money, [
          'New GatherWall order', '', 'Product: '+name, 'Paid: '+money, 'Customer: '+(email||'(no email)'),
          (obj.customer_details||{}).name ? 'Name: '+obj.customer_details.name : '',
          (obj.customer_details||{}).phone ? 'Phone / WhatsApp: '+obj.customer_details.phone : '',
          ref.ev ? 'Wall: https://gatherwall.com/index.html#wall?ev='+ref.ev : '',
          ref.order ? 'Order: '+ref.order : '', 'Source: '+(ref.from||'direct')+(ref.c?' / '+ref.c:''), 'Stripe session: '+obj.id, '', action, '',
          'Stripe dashboard: https://dashboard.stripe.com/payments'
        ].filter(x=>x!==''));
      }

      if (type === 'customer.subscription.deleted') {
        const sub = obj.id || '';
        const map = sub ? await getFirebase(`subs/${sub}`, AUTH) : null;
        const key = map && map.key;
        if (key) {
          const r = await patchFirebase(`pro/${key}`, { active: false, endedAt: Date.now(), updatedAt: Date.now() }, AUTH);
          result.proOff = key; result.proFb = r.status; result.handled.push('pro:off');
        } else {
          result.note = 'no pro mapping for subscription ' + sub;
        }
      }

      if (!result.handled.length && !result.note) result.note = 'nothing to do for ' + type;
      console.log(JSON.stringify(result));
      return json(result, 200);
    } catch (err) {
      console.log('Worker error:', err && err.stack ? err.stack : String(err));
      return json({ ok: false, error: String((err && err.message) || err) }, 500); // Stripe retries
    }
  },
};
