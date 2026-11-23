/* "Send it as a gift" for any GatherWall keepsake page.
   1. Put <div data-gw-gift data-to="Brother Sam" data-from-hint="Biola"></div> where the sender should see the gift box.
   2. The recipient opens the gift link (?gift=1&from=..&msg=..). The page's #welcome reveal then shows who it's from and their message,
      and the gift box is hidden from them.
   Works with any page that has a #welcome reveal containing a .to line and an h1. */
(function () {
  var q = new URLSearchParams(location.search);
  var isGift = q.get('gift') === '1';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var css = '.gwg{background:linear-gradient(135deg,#fff8ea,#fff);border:1.5px solid #e8cf9c;border-radius:20px;padding:22px 20px;margin:0 0 22px}' +
    '.gwg h2{font-family:Fraunces,Georgia,serif;font-size:24px;margin:0 0 4px;color:#1c2027}.gwg p{color:#6b6b70;margin:0 0 12px;line-height:1.5}' +
    '.gwg label{display:block;font-size:13px;font-weight:600;margin:10px 0 5px;color:#333}.gwg input,.gwg textarea{width:100%;font:15px Inter,system-ui,sans-serif;padding:11px 12px;border:1px solid #d9cdb3;border-radius:12px;background:#fff;box-sizing:border-box}' +
    '.gwg textarea{min-height:90px;resize:vertical}.gwg .b{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
    '.gwg button,.gwg a.x{border:0;border-radius:999px;padding:11px 18px;font:600 14.5px Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:6px}' +
    '.gwg .p{background:#1c2027;color:#fff}.gwg .g{background:#fff;color:#1c2027;border:1.5px solid #1c2027}.gwg .w{background:#25D366;color:#fff}' +
    '.gwg .out{display:none;margin-top:14px;background:#fff;border:1px dashed #c9a54c;border-radius:14px;padding:12px}.gwg code{word-break:break-all;font-size:12.5px}' +
    '.gw-giftmsg{max-width:520px;margin:14px auto 0;font-family:Fraunces,Georgia,serif;font-style:italic;font-size:18px;line-height:1.5;white-space:pre-line;opacity:.95}' +
    '.gw-giftmsg b{display:block;font-family:Inter,sans-serif;font-style:normal;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#e4c77a;margin-top:8px}';
  function addCss() { if (document.getElementById('gwg-css')) return; var s = document.createElement('style'); s.id = 'gwg-css'; s.textContent = css; document.head.appendChild(s); }
  function giftMode() {
    var from = (q.get('from') || '').slice(0, 80), msg = (q.get('msg') || '').slice(0, 1200), to = (q.get('to') || '').slice(0, 80);
    var w = document.getElementById('welcome'); if (!w) return;
    var t = w.querySelector('.to'); if (t) t.textContent = 'A gift for ' + (to || 'you') + (from ? ' · from ' + from : '');
    if (msg) { var m = document.createElement('div'); m.className = 'gw-giftmsg'; m.innerHTML = '“' + esc(msg) + '”' + (from ? '<b>' + esc(from) + '</b>' : ''); var h = w.querySelector('h1'); (h && h.nextSibling) ? w.insertBefore(m, h.nextSibling) : w.appendChild(m); }
    var b = w.querySelector('button'); if (b && /keepsake/i.test(b.textContent)) b.textContent = 'Open your gift ✨';
    document.querySelectorAll('[data-gw-gift],[data-gw-owner]').forEach(function (n) { n.style.display = 'none'; });
  }
  function box(n) {
    var to = n.getAttribute('data-to') || 'them', hint = n.getAttribute('data-from-hint') || '';
    n.innerHTML = '<div class="gwg"><h2>🎁 Send it to ' + esc(to) + ' as a gift</h2>' +
      '<p>Make a gift link: when ' + esc(to) + ' opens it, the keepsake unwraps with your name and your message first. Send it by WhatsApp or email, or open it together on the TV.</p>' +
      '<label>From</label><input id="gwgFrom" value="' + esc(hint) + '" placeholder="e.g. Biola, Folakemi, Ayobami and Ayotunde">' +
      '<label>Your message (optional)</label><textarea id="gwgMsg" placeholder="Happy 70th birthday, my darling…"></textarea>' +
      '<div class="b"><button class="p" id="gwgMake">Create the gift link</button></div>' +
      '<div class="out" id="gwgOut"><b>Your gift link</b><br><code id="gwgLink"></code><div class="b">' +
      '<button class="g" id="gwgCopy">Copy link</button><a class="x w" id="gwgWa" target="_blank" rel="noopener">Send on WhatsApp</a><a class="x g" id="gwgMail">Email</a><a class="x g" id="gwgPrev" target="_blank" rel="noopener">Preview as ' + esc(to) + '</a></div></div></div>';
    n.querySelector('#gwgMake').onclick = function () {
      var from = n.querySelector('#gwgFrom').value.trim(), msg = n.querySelector('#gwgMsg').value.trim();
      var u = location.origin + location.pathname + '?gift=1&to=' + encodeURIComponent(to) + (from ? '&from=' + encodeURIComponent(from) : '') + (msg ? '&msg=' + encodeURIComponent(msg) : '');
      n.querySelector('#gwgLink').textContent = u; n.querySelector('#gwgOut').style.display = 'block';
      var text = (from ? from + ' has' : 'Someone has') + ' a gift for you 🎁 ' + u;
      n.querySelector('#gwgWa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
      n.querySelector('#gwgMail').href = 'mailto:?subject=' + encodeURIComponent('A gift for you 🎁') + '&body=' + encodeURIComponent(text);
      n.querySelector('#gwgPrev').href = u;
      n.querySelector('#gwgCopy').onclick = function () { navigator.clipboard.writeText(u).then(function () { n.querySelector('#gwgCopy').textContent = 'Copied ✓'; }); };
    };
  }
  window.gwGiftBox = function () { if (!isGift) { addCss(); document.querySelectorAll('[data-gw-gift]').forEach(box); } };
  function run() { addCss(); if (isGift) giftMode(); else document.querySelectorAll('[data-gw-gift]').forEach(box); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
