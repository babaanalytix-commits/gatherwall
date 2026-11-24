/* "Try it live": QR to a demo guest page + a live mini screen that updates as people post.
   Usage: <div data-gw-try></div><script src="/gw-try.js" defer></script> */
(function () {
  var EV = 'bgftnwib88', DB = 'https://tributewall-27c75-default-rtdb.europe-west1.firebasedatabase.app';
  var GUEST = 'https://gatherwall.com/index.html#guest?ev=' + EV, SCREEN = 'https://gatherwall.com/index.html#wall?ev=' + EV;
  var css = '.gwt{display:grid;grid-template-columns:300px 1fr;gap:18px;align-items:stretch}@media(max-width:820px){.gwt{grid-template-columns:1fr}}' +
    '.gwt .a{background:#fff;border:1px solid #ece6da;border-radius:20px;padding:22px;text-align:center}.gwt .a h3{font-family:Fraunces,serif;font-size:22px;margin-bottom:4px}.gwt .a p{color:#6b6b70;font-size:14.5px}' +
    '.gwt #gwtQr{display:flex;justify-content:center;margin:14px 0}.gwt .a a{display:inline-block;margin-top:6px;font-weight:600;color:#1d1d1f}' +
    '.gwt .b{background:#16201b;border-radius:20px;padding:18px;color:#fff;min-height:320px;position:relative;overflow:hidden}.gwt .b .hd{display:flex;align-items:center;gap:8px;font-weight:600;margin-bottom:12px}' +
    '.gwt .dot{width:9px;height:9px;border-radius:50%;background:#3ddc84;box-shadow:0 0 0 0 rgba(61,220,132,.7);animation:gwp 1.6s infinite}@keyframes gwp{70%{box-shadow:0 0 0 9px rgba(61,220,132,0)}100%{box-shadow:0 0 0 0 rgba(61,220,132,0)}}' +
    '.gwt .feed{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:560px){.gwt .feed{grid-template-columns:1fr}}' +
    '.gwt .it{background:#22302a;border-radius:14px;padding:12px;animation:gwin .5s ease}.gwt .it img{width:100%;max-height:150px;object-fit:cover;border-radius:10px;margin-bottom:8px}.gwt .it p{font-family:Fraunces,serif;font-size:16px;line-height:1.4;white-space:pre-line}.gwt .it b{display:block;color:#7fd4a8;font-size:12.5px;margin-top:6px}' +
    '@keyframes gwin{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}.gwt .b .open{position:absolute;right:16px;top:44px;color:#cfe;font-size:13px}';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var last = '';
  function poll(box) {
    fetch(DB + '/tributes/' + EV + '.json').then(function (r) { return r.json(); }).then(function (d) {
      var arr = Object.keys(d || {}).map(function (k) { return d[k]; }).filter(function (x) { return x.approved !== false; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }).slice(0, 6);
      var sig = arr.map(function (x) { return x.ts; }).join(','); if (sig === last) return; last = sig;
      box.innerHTML = arr.map(function (x) { return '<div class="it">' + (x.photo ? '<img src="' + esc(x.photo) + '" alt="">' : '') + (x.msg ? '<p>' + esc(x.msg) + '</p>' : '') + '<b>— ' + esc(x.name || 'A guest') + '</b></div>'; }).join('');
    }).catch(function () {});
  }
  function render() {
    var n = document.querySelector('[data-gw-try]'); if (!n) return;
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    n.innerHTML = '<div class="gwt"><div class="a"><div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8a6d2b;font-weight:600">1 · What your guests see</div><h3>Scan and post</h3><p>Scan with your phone and post a message or photo, just as a guest would. This demo wall is cleared every day.</p><div id="gwtQr"></div><a href="' + GUEST + '" target="_blank">Or open the guest page ›</a></div>' +
      '<div class="b"><div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#c9a54c;font-weight:600;margin-bottom:6px">2 · What everyone sees on the big screen</div><div class="hd"><span class="dot"></span>Live now</div><a class="open" href="' + SCREEN + '" target="_blank">Open full screen ›</a><div class="feed" id="gwtFeed"></div></div></div>';
    var go = function () { if (window.QRCode) new QRCode(document.getElementById('gwtQr'), { text: GUEST, width: 180, height: 180 }); };
    if (window.QRCode) go(); else { var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = go; document.head.appendChild(s); }
    var f = document.getElementById('gwtFeed'); poll(f); setInterval(function () { poll(f); }, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
