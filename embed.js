/* GatherWall embed: put GatherWall inside any website.
   <div class="gatherwall" data-partner="your-page"></div>   your branded page with offers and the enquiry form
   <div class="gatherwall" data-guest="EVENT_CODE"></div>     the guest form for one event (messages and photos)
   <div class="gatherwall" data-wall="EVENT_CODE"></div>      the live wall for one event
   <script src="https://gatherwall.com/embed.js" async></script>
   Optional: data-lang="cs|en|de", data-height="700" (wall only). */
(function () {
  var ORIGIN = 'https://gatherwall.com';
  function build(el) {
    if (el.getAttribute('data-gw-ready')) return; el.setAttribute('data-gw-ready', '1');
    var lang = el.getAttribute('data-lang') || '', q = 'embed=1' + (lang ? '&lang=' + encodeURIComponent(lang) : '');
    var src, h = 640, id = 'gw' + Math.random().toString(36).slice(2, 8);
    var p = el.getAttribute('data-partner'), g = el.getAttribute('data-guest'), w = el.getAttribute('data-wall');
    if (p) src = ORIGIN + '/p/' + encodeURIComponent(p) + '?' + q + '&fid=' + id;
    else if (g) src = ORIGIN + '/index.html?' + q + '&fid=' + id + '#guest?ev=' + encodeURIComponent(g);
    else if (w) { src = ORIGIN + '/index.html?' + q + '&fid=' + id + '#wall?ev=' + encodeURIComponent(w); h = parseInt(el.getAttribute('data-height'), 10) || 640; }
    else return;
    var f = document.createElement('iframe');
    f.src = src; f.id = id; f.title = 'GatherWall'; f.loading = 'lazy'; f.allow = 'camera; microphone; clipboard-write; fullscreen';
    f.style.cssText = 'width:100%;border:0;display:block;border-radius:' + (el.getAttribute('data-radius') || '16') + 'px;height:' + h + 'px;background:transparent';
    if (w) f.setAttribute('data-fixed', '1');
    el.innerHTML = ''; el.appendChild(f);
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || !e.data.gwH || !e.data.fid) return;
    var f = document.getElementById(e.data.fid); if (f && !f.getAttribute('data-fixed')) f.style.height = Math.max(300, Math.min(20000, e.data.gwH)) + 'px';
  });
  function run() { var n = document.querySelectorAll('.gatherwall'); for (var i = 0; i < n.length; i++) build(n[i]); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
