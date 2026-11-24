/* GatherWall shared header — one premium top bar on every public page.
   Include right after <body>:  <script src="/gw-header.js"></script>
   It hides the page's own top bar (body > nav.nav, body > header.nav, .gw-old) and
   moves any language picker from that bar into the shared header. */
(function () {
  if (window.__gwHeader) return; window.__gwHeader = true;
  try { var gt = document.createElement('script'); gt.src = '/gw-track.js'; gt.async = true; (document.head || document.documentElement).appendChild(gt); } catch (e) {}
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
  var st = document.createElement('style'); st.textContent = css + '#gwh .ln a{white-space:nowrap}'; (document.head || document.documentElement).appendChild(st);

  var p = location.pathname.replace(/^.*\//, '') || 'index.html';
  function on(names) { return names.indexOf(p) > -1 ? ' class="on"' : ''; }
  var links =
    '<a href="/index.html#family"' + on(['digital-guestbook.html','wedding-wall.html','live.html','memorial-page.html','wall-of-love.html']) + '>Tribute Walls</a>' +
    '<a href="/keepsake-preview.html"' + on(['keepsake-preview.html','keepsake-song.html','birthday-song.html','song-of-your-night.html','free-song-lyrics-preview.html','affordable-personalised-song.html','keepsake-song-vs-songfinch.html','create-song.html']) + '>Songs</a>' +
    '<a href="/celebration.html"' + on(['celebration.html','wedding-keepsake.html','story-form.html']) + '>Made for you</a>' +
    '<a href="/examples.html"' + on(['examples.html','samples.html','anthem.html','ode.html']) + '>Our work</a><a href="/business.html"' + on(['business.html','pro-firmy.html','partner.html']) + '>For business</a>';
  // GatherWall Business pages get their own header: logo goes to the business home, B2B links only, in the page's language.
  var biz = ['business.html','business-old.html','for-djs.html','for-photographers.html','for-venues.html','pro-firmy.html','partner.html'].indexOf(p) > -1;
  var home = '/index.html', brand = 'GatherWall';
  if (biz) {
    var m = location.pathname.match(/^\/(fr|es|de|cs)\//), bl = m ? m[1] : 'en';
    var pre = bl === 'en' ? '/' : '/' + bl + '/';
    var bhome = function (l) { return l === 'cs' ? '/cs/pro-firmy.html' : (l === 'en' ? '/' : '/' + l + '/') + 'business.html'; };
    var BT = {
      en: ['DJs & MCs', 'Photographers', 'Venues & planners', 'Log in', 'Become a partner', 'Families ›'],
      fr: ['DJ & animateurs', 'Photographes', 'Lieux & organisateurs', 'Connexion', 'Devenir partenaire', 'Familles ›'],
      es: ['DJ y presentadores', 'Fotógrafos', 'Espacios y organizadores', 'Entrar', 'Hazte socio', 'Familias ›'],
      de: ['DJs & Moderatoren', 'Fotografen', 'Locations & Planer', 'Anmelden', 'Partner werden', 'Familien ›'],
      cs: ['DJové a moderátoři', 'Fotografové', 'Místa a plánovači', 'Přihlásit', 'Stát se partnerem', 'Rodiny ›']
    }[bl];
    home = bhome(bl); brand = 'GatherWall <span style="font-family:Inter,sans-serif;font-weight:600;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8a6d2b;margin-left:4px">Business</span>';
    var fam = bl === 'en' ? '/index.html' : '/' + bl + '/index.html';
    links = '<a href="' + pre + 'for-djs.html"' + on(['for-djs.html']) + '>' + BT[0] + '</a>' +
      '<a href="' + pre + 'for-photographers.html"' + on(['for-photographers.html']) + '>' + BT[1] + '</a>' +
      '<a href="' + pre + 'for-venues.html"' + on(['for-venues.html']) + '>' + BT[2] + '</a>' +
      '<a href="/partner.html">' + BT[3] + '</a>' +
      '<a href="' + home + '#apply" style="color:#2E7D5B;font-weight:600">' + BT[4] + '</a>' +
      '<a href="' + fam + '" style="opacity:.6">' + BT[5] + '</a>';
    // language switcher: same page in each language (business home in Czech is pro-firmy.html)
    var page = (p === 'pro-firmy.html') ? 'business.html' : p;
    if (page !== 'partner.html' && page !== 'business-old.html') {
      var sw = ['en','fr','es','de','cs'].map(function (l) {
        var u = page === 'business.html' ? bhome(l) : (l === 'en' ? '/' : '/' + l + '/') + page;
        return l === bl ? '<b style="color:#1d1d1f;font-size:12px">' + l.toUpperCase() + '</b>' : '<a href="' + u + location.search + location.hash + '" hreflang="' + l + '" style="font-size:12px;opacity:.7">' + l.toUpperCase() + '</a>';
      }).join(' ');
      links += '<span style="display:flex;gap:8px;align-items:center">' + sw + '</span>';
    }
  }
  var h = document.createElement('header'); h.id = 'gwh';
  h.innerHTML = '<div class="in"><a class="lg" href="' + home + '"><i></i>' + brand + '</a>' +
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
