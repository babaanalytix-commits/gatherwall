/* GatherWall admin — "Grow" tab: tracked links, share buttons, launch kit, outreach scripts, calendar, channel results. */
(function () {
  const SITE = 'https://gatherwall.com/';
  const PAGES = [
    { id: 'gift', path: 'gift-for-parents-in-nigeria.html', name: 'Gift for parents in Nigeria (from abroad)' },
    { id: '70th', path: 'nigerian-70th-birthday-ideas.html', name: '70th birthday ideas' },
    { id: 'yoruba', path: 'yoruba-birthday-song.html', name: 'Yoruba / Igbo birthday song' },
    { id: 'owambe', path: 'owambe-tribute-wall.html', name: 'Owambe live tribute wall' },
    { id: 'memorial', path: 'nigerian-burial-memorial-page.html', name: 'Burial / remembrance memorial page' },
    { id: 'wedding', path: 'nigerian-wedding-keepsake.html', name: 'Nigerian wedding keepsakes' },
    { id: 'dad', path: 'keepsake.html?order=ks_qwqageg2', name: 'A song for Dad (real example)' },
    { id: 'lyrics', path: 'keepsake-preview.html', name: '$39 song: free lyrics preview' },
    { id: 'madeforyou', path: 'celebration.html', name: 'Made for you (film, from $74.50)' },
    { id: 'home', path: '', name: 'Homepage' },
    { id: 'examples', path: 'examples.html', name: 'Examples of our work' }
  ];
  const CHANNELS = [
    { id: 'wa-status', n: 'WhatsApp status' }, { id: 'wa-group', n: 'WhatsApp group' }, { id: 'facebook', n: 'Facebook' },
    { id: 'fb-group', n: 'Facebook group' }, { id: 'instagram', n: 'Instagram' }, { id: 'tiktok', n: 'TikTok' },
    { id: 'x', n: 'X / Twitter' }, { id: 'linkedin', n: 'LinkedIn' }, { id: 'telegram', n: 'Telegram' },
    { id: 'church', n: 'Church group' }, { id: 'association', n: 'Hometown / alumni assoc.' }, { id: 'planner', n: 'Event planner / MC' },
    { id: 'email', n: 'Email' }, { id: 'ads-meta', n: 'Meta ad (paid)' }
  ];
  // Ready-to-use messages, written in Yomi's voice. {link} is replaced with the tracked link.
  const MSG = {
    gift: "Living abroad and can't be home for Mum or Dad's big day? You can still be in the room. GatherWall turns their life story into an original song (with Yoruba, Igbo or Pidgin if you like), or gathers the whole family's messages on one wall for the party. Read the lyrics free first. 💛\n{link}",
    '70th': "Planning a 70th for Mummy or Daddy? Beyond the aso-ebi and cake, here are ideas that put their life story at the centre: a song written about them, a wall of messages from family worldwide, and a film for the big screen.\n{link}",
    yoruba: "Imagine Mummy hearing her name, her hometown and her favourite saying in a song made just for her, in English with Yoruba (or Igbo) woven in. You read the lyrics free before paying, and it's ready in minutes. 🎶\n{link}",
    owambe: "Planning an owambe? Let every guest's love show up on the big screen. Guests scan a code, post a message or photo, and it appears live, no app needed. Family abroad can post too. 🎉\n{link}",
    memorial: "When we lose someone, the family is everywhere: Lagos, London, Houston. A memorial page lets everyone share memories, light a candle and read their life story in one place, before and after the burial. Free to build.\n{link}",
    wedding: "For the couple who has everything: a song about how they met, a live wall for guests' wishes at the reception, and a film of their story. Perfect from family abroad who can't make it home. 💍\n{link}",
    dad: "For Dad's 3-year remembrance, my siblings and I gave him a song made from his life, with his photos. Hearing it brought all of us to tears. This is why I built GatherWall. Have a listen. 🕊️\n{link}",
    lyrics: "Tell us about someone you love and read the lyrics of their own song, free, in about a minute. If they give you goosebumps, the full song is $39 and ready in minutes. 🎶\n{link}",
    madeforyou: "For the milestone that deserves everything: we write their song with you, gather the family's photos and make a film for the big screen. See your plan and dates free before you pay. 50% off until 31 December.\n{link}",
    home: "GatherWall: songs, tribute walls and films that bring the whole family together, at home and abroad. 💛\n{link}",
    examples: "See what families have made with GatherWall: songs, films and tribute walls.\n{link}"
  };
  const SHORT = { // short captions for Instagram/TikTok/X
    gift: "Abroad and can't be home for their big day? Send a song made from their life. 💛 Link in bio: {link}",
    '70th': "70th birthday ideas that make the whole room go quiet. ✨ {link}",
    yoruba: "Her name. Her hometown. Her favourite saying. In a song. 🎶 {link}",
    owambe: "Every guest's love, live on the big screen at your owambe. 🎉 {link}",
    memorial: "One place for the whole family to remember, wherever they are. 🕯️ {link}",
    wedding: "Your love story, sung, shared and kept. 💍 {link}",
    dad: "We gave Dad a song for his 3-year remembrance. 🕊️ {link}",
    lyrics: "Read the lyrics of their song free in 60 seconds. 🎶 {link}",
    madeforyou: "Their life, as a film. 50% off until 31 Dec. 🎬 {link}",
    home: "Celebrate the people you love. 💛 {link}",
    examples: "Real keepsakes made with GatherWall. {link}"
  };
  const OUTREACH = [
    { t: 'Event planners, MCs, DJs', from: 'planner', page: 'owambe', m: "Hello {name}, I'm Yomi, founder of GatherWall. We make live tribute walls (guests post messages and photos from their phones and it shows on the big screen) and personalised songs for celebrants. I'd love to offer you a free wall for one of your upcoming events so you can see it in action, and a thank-you on every client you refer. Here's how it works: {link}" },
    { t: 'Church welfare / events team', from: 'church', page: 'memorial', m: "Good day {name}. I'm Yomi, founder of GatherWall. We help families celebrate and remember: memorial pages where everyone can share memories and light a candle, and tribute walls for thanksgivings and birthdays. I'd be glad to set one up free for the church's next celebration or a family in need of it. More here: {link}" },
    { t: 'Hometown union / alumni association', from: 'association', page: '70th', m: "Hello {name}. I'm Yomi, founder of GatherWall. Our associations celebrate so many 60ths, 70ths and send-offs, and members abroad often miss them. GatherWall lets everyone add messages and photos to one wall shown on the day, or turns the celebrant's story into a song. Happy to set up a free wall for your next event: {link}" },
    { t: 'Friends to forward (warm intro)', from: 'wa-group', page: 'dad', m: "Hi {name}, small favour 🙏🏾 I've launched GatherWall, keepsake songs and tribute walls for family celebrations. Could you forward this to one family group where someone has a big birthday, wedding or remembrance coming up? It would mean a lot. {link}" }
  ];
  const WEEK = [
    { d: 'Day 1', ch: 'wa-status', page: 'dad', tip: 'Start personal: post Dad\'s song on your WhatsApp status.' },
    { d: 'Day 2', ch: 'wa-group', page: 'gift', tip: 'Send the friends-to-forward note to 5 close friends.' },
    { d: 'Day 3', ch: 'facebook', page: 'gift', tip: 'Post on your Facebook profile; share into 2 diaspora groups.' },
    { d: 'Day 4', ch: 'instagram', page: 'yoruba', tip: 'Reel: 20-sec screen recording of the free lyrics preview.' },
    { d: 'Day 5', ch: 'planner', page: 'owambe', tip: 'Message 3 event planners / MCs with the outreach script.' },
    { d: 'Day 6', ch: 'church', page: '70th', tip: 'Message your church events/welfare team; offer a free wall.' },
    { d: 'Day 7', ch: 'tiktok', page: 'madeforyou', tip: 'Video: "I live abroad, here\'s what I sent my parents." Mention 50% off ends 31 Dec.' }
  ];
  const CAL = [
    ['2026-12-01', 'December push begins', 'Gift page + 50% offer (ends 31 Dec)', 'gift'],
    ['2026-12-20', 'Travel home / Christmas reunions', 'Owambe wall, family walls', 'owambe'],
    ['2026-12-31', 'Launch offer ends', 'Last call: made for you at 50% off', 'madeforyou'],
    ['2027-01-10', 'New Year thanksgivings', '70th ideas, Yoruba song', '70th'],
    ['2027-02-14', "Valentine's Day", 'Wedding keepsakes, $39 song', 'wedding'],
    ['2027-03-07', 'Mothering Sunday (UK & Nigeria)', '$39 song for Mum', 'yoruba'],
    ['2027-05-09', "Mother's Day (US & Canada)", '$39 song for Mum', 'yoruba'],
    ['2027-06-20', "Father's Day (UK, US)", 'Song for Dad', 'dad'],
    ['2027-07-01', 'Summer owambe & wedding season', 'Owambe wall to planners', 'owambe'],
    ['2027-10-01', 'Nigerian Independence Day', 'Diaspora gift page', 'gift']
  ];

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const linkFor = (pageId, ch, camp) => { const p = PAGES.find(x => x.id === pageId) || PAGES[0]; const base = SITE + p.path; return base + (base.includes('?') ? '&' : '?') + 'from=' + encodeURIComponent(ch) + (camp ? '&c=' + encodeURIComponent(camp) : ''); };
  const copy = (txt, btn) => { (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => { if (btn) { const o = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(() => btn.textContent = o, 1400); } }).catch(() => prompt('Copy this:', txt)); };

  function shareButtons(link, text) {
    const t = encodeURIComponent(text), u = encodeURIComponent(link);
    return [
      ['WhatsApp', 'https://wa.me/?text=' + t], ['Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + u],
      ['X', 'https://twitter.com/intent/tweet?text=' + t], ['LinkedIn', 'https://www.linkedin.com/sharing/share-offsite/?url=' + u],
      ['Telegram', 'https://t.me/share/url?url=' + u + '&text=' + encodeURIComponent(text.replace(link, '').trim())],
      ['Email', 'mailto:?subject=' + encodeURIComponent('Something special for the family') + '&body=' + t]
    ].map(([n, h]) => `<a class="btn ghost sm" href="${esc(h)}" target="_blank" rel="noopener">${n}</a>`).join('');
  }

  function render(container, data) {
    const camp0 = 'launch-' + new Date().toISOString().slice(0, 7);
    container.innerHTML = `
    <div class="card"><h2>Results by channel</h2><p class="sub">From links shared with this tab (last 30 days). A “plan” is a free lyrics preview or a made-for-you plan started. Direct means no tracked link.</p><div class="scroll" id="gResults"></div></div>
    <div class="grid">
      <div class="card"><h2>Share a page</h2><p class="sub">Pick a page and where you're posting. The link is tracked, so results show up above.</p>
        <label class="gl">Page</label><select id="gPage">${PAGES.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <label class="gl">Where</label><div class="chips" id="gCh">${CHANNELS.map((c, i) => `<button class="chip${i === 0 ? ' on' : ''}" data-ch="${c.id}">${esc(c.n)}</button>`).join('')}</div>
        <label class="gl">Campaign name <span class="note">(optional, e.g. dec-launch)</span></label><input type="text" id="gCamp" value="${camp0}">
        <label class="gl">Link</label><div class="row"><input type="text" id="gLink" readonly><button class="btn sm" id="gCopyLink">Copy link</button></div>
        <label class="gl">Message <span class="note">(edit freely)</span></label><textarea id="gMsg" rows="6"></textarea>
        <div class="row" style="flex-wrap:wrap;gap:8px;margin-top:8px"><button class="btn sm" id="gCopyMsg">Copy message</button><span id="gShare" style="display:contents"></span></div>
        <p class="note" id="gHint"></p>
      </div>
      <div>
        <div class="card"><h2>Your first 7 days</h2><p class="sub">One small action a day. Click “Use” to load it into the share box.</p><div id="gWeek"></div></div>
        <div class="card"><h2>Outreach messages</h2><p class="sub">Personal messages to people who reach many families. Replace {name}.</p><div id="gOut"></div></div>
      </div>
    </div>
    <div class="card"><h2>Moments calendar</h2><p class="sub">When families are already thinking about gifts. Start posting 2–3 weeks before each.</p><div class="scroll"><table id="gCal"></table></div></div>
    <div class="card"><h2>Reel ideas</h2><p class="sub">Short vertical videos (20–40 sec) for Instagram, TikTok and Facebook. Real beats polished.</p>
      <ol style="margin-left:20px;font-size:14.5px;line-height:1.7">
        <li><b>“I couldn't be home for Dad.”</b> Photos of Dad, then the song's chorus playing, ending on the gift page. Link: Dad's song.</li>
        <li><b>“Watch the lyrics appear.”</b> Screen-record the free lyrics preview for a made-up “Mama Bisi, 70”. Link: free lyrics.</li>
        <li><b>“From London to Lagos.”</b> Map pin animation + a WhatsApp message being sent with the song. Link: gift page.</li>
        <li><b>“The owambe screen.”</b> Phone posting a message → it appears on a laptop/TV. Link: owambe wall.</li>
        <li><b>“Say their name.”</b> Text on screen: a list of names (Mummy, Iya, Nne, Baba…), each ending with “...deserves a song.” Link: Yoruba song page.</li>
      </ol></div>`;

    const state = { ch: CHANNELS[0].id };
    function update() {
      const pid = $('gPage').value, camp = $('gCamp').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const link = linkFor(pid, state.ch, camp);
      $('gLink').value = link;
      const short = ['instagram', 'tiktok', 'x'].includes(state.ch);
      $('gMsg').value = (short ? SHORT[pid] : MSG[pid]).replace('{link}', link);
      $('gShare').innerHTML = shareButtons(link, $('gMsg').value);
      $('gHint').textContent = state.ch === 'instagram' || state.ch === 'tiktok' ? 'Instagram and TikTok don\'t accept web links in posts: copy the caption, put the link in your bio or story link sticker.' : state.ch === 'wa-status' ? 'Tap WhatsApp, then choose “My status”, or copy the message and paste it into a status.' : state.ch === 'ads-meta' ? 'Use this link as the ad\'s website URL so ad results appear separately.' : '';
    }
    $('gPage').onchange = update; $('gCamp').oninput = update;
    $('gMsg').oninput = () => { $('gShare').innerHTML = shareButtons($('gLink').value, $('gMsg').value); };
    document.querySelectorAll('#gCh .chip').forEach(b => b.onclick = () => { document.querySelectorAll('#gCh .chip').forEach(x => x.classList.toggle('on', x === b)); state.ch = b.dataset.ch; update(); });
    $('gCopyLink').onclick = e => copy($('gLink').value, e.target);
    $('gCopyMsg').onclick = e => copy($('gMsg').value, e.target);
    const use = (pid, ch) => { $('gPage').value = pid; state.ch = ch; document.querySelectorAll('#gCh .chip').forEach(x => x.classList.toggle('on', x.dataset.ch === ch)); update(); $('gPage').scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    $('gWeek').innerHTML = WEEK.map((w, i) => `<div class="task"><span class="dot g"></span><div><div class="t">${esc(w.d)} · ${esc((CHANNELS.find(c => c.id === w.ch) || {}).n)}</div><div class="m">${esc(w.tip)}</div></div><a class="go" href="#" data-w="${i}">Use ›</a></div>`).join('');
    document.querySelectorAll('[data-w]').forEach(a => a.onclick = e => { e.preventDefault(); const w = WEEK[+a.dataset.w]; use(w.page, w.ch); });
    $('gOut').innerHTML = OUTREACH.map((o, i) => `<div class="task"><span class="dot n"></span><div style="flex:1"><div class="t">${esc(o.t)}</div><div class="m">${esc(o.m.slice(0, 110))}…</div></div><a class="go" href="#" data-o="${i}">Copy ›</a></div>`).join('');
    document.querySelectorAll('[data-o]').forEach(a => a.onclick = e => { e.preventDefault(); const o = OUTREACH[+a.dataset.o]; const link = linkFor(o.page, o.from, $('gCamp').value.trim()); copy(o.m.replace('{link}', link), a); });
    const today = new Date().toISOString().slice(0, 10);
    $('gCal').innerHTML = '<tr><th>Date</th><th>Moment</th><th>What to push</th><th></th></tr>' + CAL.filter(c => c[0] >= today).map(c => `<tr><td>${new Date(c[0] + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td><td><b>${esc(c[1])}</b></td><td>${esc(c[2])}</td><td><a href="#" data-cal="${c[3]}">Share ›</a></td></tr>`).join('');
    document.querySelectorAll('[data-cal]').forEach(a => a.onclick = e => { e.preventDefault(); use(a.dataset.cal, 'wa-status'); });
    update();
    renderResults(data);
  }

  function renderResults(T) {
    const since = Date.now() - 30 * 864e5, by = {};
    const add = (kind, rows) => Object.values(rows || {}).forEach(r => { if (!r || (r.ts || 0) < since) return; const k = r.from || 'direct'; by[k] = by[k] || { visits: 0, plans: 0, checkouts: 0, sales: 0, camps: {} }; by[k][kind]++; if (r.c) by[k].camps[r.c] = (by[k].camps[r.c] || 0) + 1; });
    ['visits', 'plans', 'checkouts', 'sales'].forEach(k => add(k, (T || {})[k]));
    const rows = Object.entries(by).sort((a, b) => (b[1].sales - a[1].sales) || (b[1].visits - a[1].visits));
    const name = id => (CHANNELS.find(c => c.id === id) || { n: id === 'direct' ? 'Direct / untracked' : id }).n;
    $('gResults').innerHTML = rows.length ? '<table><tr><th>Channel</th><th>Visits</th><th>Plans / previews</th><th>Checkouts</th><th>Sales</th><th>Campaigns</th></tr>' + rows.map(([k, v]) => `<tr><td><b>${esc(name(k))}</b></td><td>${v.visits}</td><td>${v.plans}</td><td>${v.checkouts}</td><td>${v.sales ? '<b>' + v.sales + '</b>' : 0}</td><td class="note">${esc(Object.keys(v.camps).join(', '))}</td></tr>`).join('') + '</table>' : '<p class="empty">No tracked activity yet. Share your first link below and it will appear here.</p>';
  }

  window.renderGrow = render;
})();
