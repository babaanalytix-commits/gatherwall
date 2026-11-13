/* GatherWall campaign tracking (anonymous, no cookies, no personal data).
   Links shared from the admin "Grow" tab carry ?from=<channel>&c=<campaign>.
   We remember the source on this device for 30 days, count the visit once per session,
   and window.gwTrack('plans'|'checkouts'|'sales', slug) records conversions with that source. */
(function () {
  if (window.gwTrack) return;
  var DB = 'https://tributewall-27c75-default-rtdb.europe-west1.firebasedatabase.app';
  var clean = function (s, n) { return String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, n); };
  function post(kind, body) {
    try { fetch(DB + '/track/' + kind + '.json', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) {}
  }
  function src() {
    try { var s = JSON.parse(localStorage.getItem('gw_src') || 'null'); if (s && Date.now() - s.t < 30 * 864e5) return s; } catch (e) {}
    return { from: 'direct', c: '' };
  }
  try {
    var q = new URLSearchParams(location.search), from = clean(q.get('from'), 30), c = clean(q.get('c'), 40);
    if (from) {
      try { localStorage.setItem('gw_src', JSON.stringify({ from: from, c: c, t: Date.now() })); } catch (e) {}
      var k = 'gw_src_v_' + from + '_' + c;
      if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); post('visits', { from: from, c: c, p: location.pathname.slice(0, 80), ts: { '.sv': 'timestamp' } }); }
    }
  } catch (e) {}
  window.gwTrack = function (kind, slug) {
    if (['plans', 'checkouts', 'sales'].indexOf(kind) < 0) return;
    var s = src();
    post(kind, { from: s.from, c: s.c || '', slug: clean(slug, 40), ts: { '.sv': 'timestamp' } });
  };
})();
