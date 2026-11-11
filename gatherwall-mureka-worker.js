/**
 * GatherWall — Mureka Auto-Song Worker  (gatherwall-mureka)
 * =================================================================
 * WHAT IT DOES
 *   The "Create your song" page (create-song.html) calls this Worker.
 *   - action "generate": checks the order is PAID and under the cap, sends the
 *     lyrics+style to Mureka, stores the Mureka job id on the order, returns it.
 *   - action "status": polls Mureka for that job; when ready, stores the 2 song
 *     URLs ("takes") on the order and returns them. The client hears 2, picks 1.
 *   - action "pick": saves the client's chosen take + flips status so YOU get it
 *     to finish (animation + QA) and deliver.
 *
 *   One Mureka generation = 2 songs. Cap = 2 generations per order (one "try
 *   again"), enforced here. Generation is gated by a PAID order id so nobody can
 *   burn credits without paying.
 *
 * ─────────────────────────────────────────────────────────────────
 * ⚠️ BEFORE THIS WORKS — DO THESE (see WAKE-UP checklist):
 *   1. Add a Secret:  Settings → Variables → MUREKA_API_KEY = <your Mureka key>.
 *   2. VERIFY the 4 Mureka constants below against https://platform.mureka.ai/docs
 *      (exact base URL, generate path, query/poll path, auth header, and the
 *      request/response field names). They're best-guess from the public docs.
 *   3. Add `orders` to the Firebase rules (read/write) — same open-rule pattern
 *      as events/tributes for v1.
 * ─────────────────────────────────────────────────────────────────
 */

const FIREBASE_DB = 'https://tributewall-27c75-default-rtdb.europe-west1.firebasedatabase.app';
const ALLOW_ORIGIN = '*';
const MAX_GENERATIONS = 2; // one "try again"

// ── VERIFY these against platform.mureka.ai/docs ──────────────────
const MUREKA_BASE     = 'https://api.mureka.ai';
const GENERATE_PATH   = '/v1/song/generate';        // POST  {lyrics, model, prompt}
const QUERY_PATH      = '/v1/song/query/';          // GET   /v1/song/query/{id}
const MUREKA_MODEL    = 'auto';                      // 'auto' | 'mureka-v9' | 'mureka-o2' ...
const AUTH_HEADER     = (key) => ({ 'Authorization': 'Bearer ' + key });
// ──────────────────────────────────────────────────────────────────

function cors(resp){
  const h=new Headers(resp.headers);
  h.set('Access-Control-Allow-Origin',ALLOW_ORIGIN);
  h.set('Access-Control-Allow-Methods','POST, OPTIONS');
  h.set('Access-Control-Allow-Headers','Content-Type');
  return new Response(resp.body,{status:resp.status,headers:h});
}
const j=(o,s)=>cors(Response.json(o,{status:s||200}));

async function fbGet(path){ const r=await fetch(`${FIREBASE_DB}/${path}.json`); return r.ok?r.json():null; }
async function fbPatch(path,data){ return fetch(`${FIREBASE_DB}/${path}.json`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); }

// Pull the 2 song URLs out of Mureka's response. Mureka returns choices[] (the
// generated songs) when status === 'succeeded'. We read the audio url per choice,
// with a defensive fallback walk for any audio URL.
function extractTakes(obj){
  const urls=[];
  const choices = obj && (obj.choices || (obj.data && obj.data.choices));
  if (Array.isArray(choices)) {
    for (const c of choices) {
      const u = c && (c.url || c.mp3_url || c.audio_url || c.song_url || c.flac_url || c.stream_url);
      if (typeof u === 'string' && /^https?:\/\//.test(u)) urls.push(u);
    }
  }
  if (!urls.length) { // fallback: walk for any audio-looking URL
    const walk=(o)=>{ if(!o||typeof o!=='object')return;
      for(const k in o){ const v=o[k];
        if(typeof v==='string' && /^https?:\/\/\S+\.(mp3|wav|m4a|flac|ogg)(\?|$)/i.test(v)) urls.push(v);
        else if(v&&typeof v==='object') walk(v);
      }};
    walk(obj);
  }
  return [...new Set(urls)].slice(0,2);
}

// Per-line timings, when the song service provides them (choices[].lyrics_sections[].lines[{start,end,text}]).
function extractTakeLines(obj){
  const choices = obj && (obj.choices || (obj.data && obj.data.choices));
  if (!Array.isArray(choices)) return null;
  const out = choices.slice(0,2).map(c => {
    const secs = (c && (c.lyrics_sections || c.lyricsSections)) || [];
    const lines = [];
    (Array.isArray(secs)?secs:[]).forEach(s => (s && Array.isArray(s.lines) ? s.lines : []).forEach(l => {
      if (l && typeof l.text === 'string' && l.text.trim() && typeof l.start === 'number') lines.push({ t: l.start > 1000 ? l.start/1000 : l.start, text: l.text.trim() });
    }));
    return lines;
  });
  return out.some(a => a.length) ? out : null;
}
// Match our lyric lines (same filter as the gift page) to the timed lines, in order.
function alignTimes(lyrics, timed){
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9' ]/g,'').split(/\s+/).filter(Boolean);
  const ours = String(lyrics||'').split(/\n/).map(l=>l.trim()).filter(l => l && l[0] !== '[' && l[0] !== '(');
  const times = new Array(ours.length).fill(null); let ptr = 0, hit = 0;
  ours.forEach((line, i) => {
    const a = norm(line);
    for (let j = ptr; j < Math.min(timed.length, ptr + 12); j++) {
      const b = new Set(norm(timed[j].text)); const common = a.filter(w => b.has(w)).length;
      if (a.length && common / a.length >= 0.5) { times[i] = Math.round(timed[j].t*100)/100; ptr = j + 1; hit++; break; }
    }
  });
  if (!ours.length || hit / ours.length < 0.6) return null;
  for (let i = 0; i < times.length; i++) if (times[i] === null) {   // fill gaps
    let a = i - 1; while (a >= 0 && times[a] === null) a--;
    let b = i + 1; while (b < times.length && times[b] === null) b++;
    const ta = a >= 0 ? times[a] : null, tb = b < times.length ? times[b] : null;
    times[i] = ta !== null && tb !== null ? Math.round((ta + (tb - ta) * (i - a) / (b - a))*100)/100 : (ta !== null ? ta + 3 : Math.max(0, (tb||3) - 3));
  }
  return times;
}
function readStatus(obj){
  const s=(obj && (obj.status||obj.state||(obj.data&&obj.data.status))||'').toString().toLowerCase();
  return s;
}

export default {
  async fetch(request, env){
    if(request.method==='OPTIONS') return cors(new Response(null,{status:204}));
    if(request.method==='GET') return cors(new Response('ok',{status:200}));
    if(request.method!=='POST') return j({error:'POST only'},405);
    if(!env || !env.MUREKA_API_KEY) return j({error:'Server not configured: missing MUREKA_API_KEY.'},200);

    let body; try{ body=await request.json(); }catch(e){ return j({error:'bad json'},400); }
    const order=(body.order||'').toString().trim();
    const action=(body.action||'generate').toString();
    if(!order) return j({error:'Missing order id.'},400);

    const rec=await fbGet('orders/'+order);
    if(!rec) return j({error:'Order not found.'},404);
    if(rec.paid!==true) return j({error:'This order is not paid yet.'},402);

    try{
      // ---- PICK: save the client's chosen take ----
      if(action==='pick'){
        const url=(body.url||'').toString();
        if(!url) return j({error:'No take chosen.'},400);
        const upd={ chosen:url, status:'song_chosen', chosenAt:Date.now() };
        const idx=(rec.takes||[]).indexOf(url);
        if(idx>-1 && rec.takeLines && rec.takeLines[idx] && rec.takeLines[idx].length){ const lt=alignTimes(rec.lyrics, rec.takeLines[idx]); if(lt) upd.lyricTimes=lt; }
        await fbPatch('orders/'+order,upd);
        return j({ok:true, status:'song_chosen'});
      }

      // ---- STATUS: poll Mureka for an in-flight job ----
      if(action==='status'){
        const jobId=rec.jobId;
        if(!jobId) return j({status:'idle'});
        const r=await fetch(MUREKA_BASE+QUERY_PATH+encodeURIComponent(jobId),{headers:AUTH_HEADER(env.MUREKA_API_KEY)});
        const d=await r.json().catch(()=>({}));
        const takes=extractTakes(d);
        if(takes.length){ const tl=extractTakeLines(d); const up={ takes }; if(rec.status!=='song_chosen') up.status='takes_ready'; if(tl) up.takeLines=tl;
          await fbPatch('orders/'+order,up); return j({status:'ready', takes, timed: !!tl}); }
        const st=readStatus(d);
        if(/fail|error/.test(st)) return j({status:'failed', detail:st||'unknown'});
        return j({status:'generating'});
      }

      // ---- GENERATE: start a Mureka job (cap-enforced) ----
      const gens=Number(rec.generations||0);
      if(gens>=MAX_GENERATIONS) return j({error:'No more tries left for this order.', cap:true},200);

      const payload={ lyrics: rec.lyrics||'', model: MUREKA_MODEL, prompt: rec.style||'warm soulful pop, heartfelt vocal' };
      const r=await fetch(MUREKA_BASE+GENERATE_PATH,{ method:'POST',
        headers:{ 'Content-Type':'application/json', ...AUTH_HEADER(env.MUREKA_API_KEY) },
        body:JSON.stringify(payload) });
      const d=await r.json().catch(()=>({}));
      if(!r.ok) return j({error:'Mureka error '+r.status, detail:JSON.stringify(d).slice(0,300)},200);

      // Some plans return the 2 songs immediately; others return a job id to poll.
      const immediate=extractTakes(d);
      const jobId=(d.id||d.task_id||d.job_id||(d.data&&(d.data.id||d.data.task_id))||'').toString();
      const patch={ generations: gens+1, lastGenAt: Date.now() };
      if(immediate.length){ patch.takes=immediate; patch.status='takes_ready'; { const tl=extractTakeLines(d); if(tl) patch.takeLines=tl; } await fbPatch('orders/'+order,patch); return j({status:'ready', takes:immediate, generationsUsed:gens+1}); }
      if(jobId){ patch.jobId=jobId; patch.status='generating'; await fbPatch('orders/'+order,patch); return j({status:'generating', jobId, generationsUsed:gens+1}); }
      return j({error:'Unexpected Mureka response — verify field names in docs.', detail:JSON.stringify(d).slice(0,300)},200);

    }catch(err){
      return j({error:'Worker error: '+(err&&err.message?err.message:String(err))},200);
    }
  },
};
