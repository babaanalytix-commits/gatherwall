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
  const out = { slug: '', tier: '', ev: '', order: '' };
  if (!ref) return out;
  const [slug, tier, target] = String(ref).split('__');
  out.slug = slug || '';
  out.tier = tier && tier !== 'x' ? tier : '';
  if (target && target.startsWith('ev-')) out.ev = target.slice(3);
  if (target && target.startsWith('or-')) out.order = target.slice(3);
  return out;
}

const BESPOKE = new Set(['story-film', 'wedding-keepsake', 'wedding-keepsake-signature', 'signature-celebration']);
const SONGS = new Set(['animated-keepsake-story', 'song-of-your-night']);

// ================= HOST GATEWAY (/host) =================
// Every control-panel action goes through here. The wall's private key lives in
// hostkeys/<ev> (never readable by browsers); we check it, then write with the admin secret.
const HOST_ORIGINS = ['https://gatherwall.com', 'https://www.gatherwall.com'];
const PROTECTED_EVENT_FIELDS = new Set(['published', 'paidAt', 'paidTier', 'saleId', 'amount', 'currency', 'manageKey', 'id']);
const TRIB_HOST_FIELDS = new Set(['approved', 'pinned', 'msg', 'name', 'editedAt']);
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
    const patch = { msg, name, editedAt: Date.now() };
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
  if (op === 'trib.delete') {
    if (!okId(rid)) return hostCors(request, json({ ok: false, error: 'bad message id' }, 400));
    const r = await fbDelete(`tributes/${ev}/${rid}`, AUTH); await fbDelete(`editkeys/${ev}/${rid}`, AUTH);
    return hostCors(request, json({ ok: r.ok }));
  }
  return hostCors(request, json({ ok: false, error: 'unknown op' }, 400));
}

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/host') return handleHost(request, env);
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

        // Keepsake songs: mark the order paid so create-song.html unlocks.
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

        // ---- Alert the owner about every paid order ----
        const name = NAMES[ref.slug] || ref.slug || 'Unknown product';
        const money = obj.amount_total != null ? (obj.amount_total/100).toFixed(2)+' '+String(obj.currency||'').toUpperCase() : '?';
        const action = MANUAL.has(ref.slug) ? 'ACTION NEEDED: reply to the customer within 1 working day.' : 'Automatic — nothing to do unless they get in touch.';
        result.alert = await notify(env, (MANUAL.has(ref.slug)?'🔔 ACTION: ':'✅ ')+name+' — '+money, [
          'New GatherWall order', '', 'Product: '+name, 'Paid: '+money, 'Customer: '+(email||'(no email)'),
          (obj.customer_details||{}).name ? 'Name: '+obj.customer_details.name : '',
          (obj.customer_details||{}).phone ? 'Phone / WhatsApp: '+obj.customer_details.phone : '',
          ref.ev ? 'Wall: https://gatherwall.com/index.html#wall?ev='+ref.ev : '',
          ref.order ? 'Order: '+ref.order : '', 'Stripe session: '+obj.id, '', action, '',
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
