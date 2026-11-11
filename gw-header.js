/* GatherWall shared header — one premium top bar on every public page.
   Include right after <body>:  <script src="/gw-header.js"></script>
   It hides the page's own top bar (body > nav.nav, body > header.nav, .gw-old) and
   moves any language picker from that bar into the shared header. */
(function () {
  if (window.__gwHeader) return; window.__gwHeader = true;
  var css = '' +
    'body>nav.nav,body>header.nav,body>.gw-old{display:none!important}' +
    '#gwh{position:sticky;top:0;z-index:999;background:rgba(251,251,253,.86);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid rgba(0,0,0,.07);font-family:Inter,-apple-system,BlinkMacSystemFont,system-ui,sans-serif}' +
    '#gwh .in{max-width:1080px;margin:0 auto;height:52px;display:flex;align-items:center;gap:24px;padding:0 20px;font-size:13.5px}' +
    '#gwh a{text-decoration:none;color:#424245}#gwh a:hover{color:#1d1d1f}' +
    '#gwh .lg{display:flex;align-items:center;gap:7px;font-family:Fraunces,Georgia,serif;font-weight:600;font-size:18px;color:#1d1d1f!important}' +
    '#gwh .lg i{width:20px;height:19px;background:url(/favicon.svg) center/contain no-repeat;display:inline-block}' +
    '#gwh .ln{display:flex;gap:22px;margin-left:auto;align-items:center}' +
    '#gwh .ln a.on{color:#2E7D5B;font-weight:600}' +
    '#gwh .ex{display:flex;align-items:center;gap:10px}#gwh .ex select{font:inherit;font-size:13px;border:1px solid #e3e3e8;border-radius:8px;padding:4px 6px;background:#fff;color:#424245}' +
    '#gwh .lang-switcher{display:flex;gap:2px}#gwh .lang-switcher .lang-btn{font:500 11.5px Inter,sans-serif!important;padding:4px 6px!important;border-radius:6px!important;border:0!important;background:transparent!important;color:#6e6e73!important;cursor:pointer;min-width:0!important;height:auto!important}#gwh .lang-switcher .lang-btn.active,#gwh .lang-switcher .lang-btn[aria-pressed=true]{background:#e8e8ed!important;color:#1d1d1f!important}' +
    '#gwh .mb{display:none;margin-left:auto;background:none;border:0;font:600 14px Inter,sans-serif;color:#1d1d1f;cursor:pointer;padding:8px}' +
    '@media(max-width:720px){#gwh .ln{display:none;position:absolute;top:52px;left:0;right:0;flex-direction:column;align-items:flex-start;gap:0;background:#fbfbfd;border-bottom:1px solid #e8e8ed;padding:6px 20px 14px}' +
      '#gwh .ln.open{display:flex}#gwh .ln a{padding:11px 0;width:100%;border-bottom:1px solid #f0f0f3;font-size:16px}#gwh .mb{display:block}#gwh .ex{margin-left:0}}';
  var st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);

  var p = location.pathname.replace(/^.*\//, '') || 'index.html';
  function on(names) { return names.indexOf(p) > -1 ? ' class="on"' : ''; }
  var links =
    '<a href="/index.html#family"' + on(['digital-guestbook.html','wedding-wall.html','live.html','memorial-page.html','wall-of-love.html']) + '>Tribute Walls</a>' +
    '<a href="/keepsake-preview.html"' + on(['keepsake-preview.html','keepsake-song.html','birthday-song.html','song-of-your-night.html','free-song-lyrics-preview.html','affordable-personalised-song.html','keepsake-song-vs-songfinch.html','create-song.html']) + '>Songs</a>' +
    '<a href="/celebration.html"' + on(['celebration.html','wedding-keepsake.html','story-form.html']) + '>Made for you</a>' +
    '<a href="/examples.html"' + on(['examples.html','samples.html','anthem.html','ode.html']) + '>Our work</a>';
  var h = document.createElement('header'); h.id = 'gwh';
  h.innerHTML = '<div class="in"><a class="lg" href="/index.html"><i></i>GatherWall</a>' +
    '<button class="mb" aria-label="Menu" onclick="this.nextElementSibling.classList.toggle(\'open\')">Menu ☰</button>' +
    '<nav class="ln">' + links + '<span class="ex" id="gwhx"></span></nav></div>';

  function mount() {
    if (!document.body) return setTimeout(mount, 0);
    if (!document.getElementById('gwh')) document.body.insertBefore(h, document.body.firstChild);
    // Bring the old bar's language picker (and any select) across, so nothing is lost.
    var old = document.querySelector('body>nav.nav, body>header.nav, body>.gw-old');
    if (old) { old.querySelectorAll('select, .lang-switcher').forEach(function (s) { document.getElementById('gwhx').appendChild(s); }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  mount();
})();
