/* GatherWall song picker: tap to choose a real song instead of typing it.
   It enhances <input id="tSong">. Search runs through Apple's free iTunes Search API (no key, CORS open).
   window.gwSongPick.get() returns {id,title,artist,art,preview} or null; .clear() resets it. */
(function () {
  var inp, box, chosen = null, timer, audio, q0 = '';
  var POPULAR = ['Burna Boy Last Last', 'Wizkid Essence', 'Rema Calm Down', 'Asake Lonely at the Top', 'Tems Free Mind',
    'Davido Unavailable', "Stevie Wonder Isn't She Lovely", 'Kool & The Gang Celebration', 'ABBA Dancing Queen',
    'Earth Wind & Fire September', 'Whitney Houston I Wanna Dance with Somebody', 'Ed Sheeran Perfect'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var css = '.gwsp{position:relative}.gwsp-box{margin-top:6px;border:1px solid #e6dccb;border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.08)}' +
    '.gwsp-row{display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;border-bottom:1px solid #f2ece1}.gwsp-row:last-child{border-bottom:0}.gwsp-row:hover{background:#fbf6ec}' +
    '.gwsp-row img{width:44px;height:44px;border-radius:8px;flex:none;object-fit:cover;background:#eee}.gwsp-t{flex:1;min-width:0}.gwsp-t b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#1c2027}' +
    '.gwsp-t span{font-size:12.5px;color:#777}.gwsp-play{border:0;background:#f3ead8;border-radius:999px;width:34px;height:34px;font-size:13px;cursor:pointer;flex:none;color:#1c2027}' +
    '.gwsp-chips{display:flex;flex-wrap:wrap;gap:6px;padding:10px}.gwsp-chips button{border:1px solid #e6dccb;background:#fffaf1;border-radius:999px;padding:6px 11px;font-size:13px;cursor:pointer;color:#1c2027}' +
    '.gwsp-hd{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#a08445;padding:10px 12px 0}' +
    '.gwsp-pick{display:flex;align-items:center;gap:12px;border:1.5px solid #c9a54c;background:#fffaf0;border-radius:14px;padding:10px;margin-top:6px}' +
    '.gwsp-pick img{width:56px;height:56px;border-radius:10px;object-fit:cover}.gwsp-pick .x{margin-left:auto;border:0;background:none;color:#888;font-size:13px;cursor:pointer;text-decoration:underline}';
  function addCss() { var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
  function art(u, n) { return (u || '').replace(/\/\d+x\d+bb\./, '/' + (n || 200) + 'x' + (n || 200) + 'bb.'); }
  function stop() { if (audio) { audio.pause(); audio = null; } box.querySelectorAll('.gwsp-play').forEach(function (b) { b.textContent = '▶'; }); }
  function search(q, autoPick) {
    q0 = q; var cc = (navigator.language || 'en-GB').split('-')[1] || 'GB';
    return fetch('https://itunes.apple.com/search?entity=song&limit=7&country=' + cc + '&term=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); }).then(function (d) {
        if (q !== q0) return; var res = (d && d.results) || [];
        if (autoPick && res[0]) return pick(res[0]);
        list(res);
      }).catch(function () { box.innerHTML = '<div class="gwsp-hd">Search is offline. Just type the song and artist.</div>'; });
  }
  function list(res) {
    if (!res.length) { box.innerHTML = '<div class="gwsp-hd">No match. Keep typing, or just send it as typed.</div>'; box.style.display = 'block'; return; }
    box.innerHTML = res.map(function (r, i) {
      return '<div class="gwsp-row" data-i="' + i + '"><img src="' + esc(art(r.artworkUrl100, 100)) + '" alt=""><div class="gwsp-t"><b>' + esc(r.trackName) + '</b><span>' + esc(r.artistName) + '</span></div>' +
        (r.previewUrl ? '<button type="button" class="gwsp-play" data-p="' + i + '" aria-label="Preview">▶</button>' : '') + '</div>';
    }).join('');
    box.style.display = 'block';
    box.querySelectorAll('.gwsp-row').forEach(function (row) {
      row.onclick = function (e) {
        var r = res[+row.getAttribute('data-i')];
        if (e.target.classList.contains('gwsp-play')) { e.stopPropagation(); var on = e.target.textContent === '❚❚'; stop(); if (!on) { audio = new Audio(r.previewUrl); audio.play(); e.target.textContent = '❚❚'; } return; }
        pick(r);
      };
    });
  }
  function chips() {
    box.innerHTML = '<div class="gwsp-hd">Tap a favourite, or search any song</div><div class="gwsp-chips">' +
      POPULAR.map(function (p) { return '<button type="button">' + esc(p) + '</button>'; }).join('') + '</div>';
    box.style.display = 'block';
    box.querySelectorAll('.gwsp-chips button').forEach(function (b) { b.onclick = function () { search(b.textContent, true); }; });
  }
  function pick(r) {
    stop();
    chosen = { id: String(r.trackId), title: r.trackName, artist: r.artistName, art: art(r.artworkUrl100, 300), preview: r.previewUrl || '' };
    inp.value = r.trackName + ' — ' + r.artistName; inp.style.display = 'none';
    box.innerHTML = '<div class="gwsp-pick"><img src="' + esc(art(r.artworkUrl100, 120)) + '" alt=""><div class="gwsp-t"><b>' + esc(r.trackName) + '</b><span>' + esc(r.artistName) + '</span></div><button type="button" class="x">Change</button></div>';
    box.style.display = 'block';
    box.querySelector('.x').onclick = function () { clear(); inp.focus(); };
  }
  function clear() { stop(); chosen = null; if (inp) { inp.value = ''; inp.style.display = ''; } if (box) { box.innerHTML = ''; box.style.display = 'none'; } }
  function init() {
    inp = document.getElementById('tSong'); if (!inp || inp._gwsp) return; inp._gwsp = 1; addCss();
    inp.setAttribute('placeholder', '🔎 Search a song or artist'); inp.setAttribute('autocomplete', 'off');
    box = document.createElement('div'); box.className = 'gwsp-box'; box.style.display = 'none'; inp.insertAdjacentElement('afterend', box);
    inp.addEventListener('focus', function () { if (!inp.value.trim() && !chosen) chips(); });
    inp.addEventListener('input', function () {
      chosen = null; clearTimeout(timer); var q = inp.value.trim();
      if (q.length < 2) { chips(); return; }
      timer = setTimeout(function () { search(q); }, 280);
    });
  }
  window.gwSongPick = { get: function () { return chosen; }, clear: clear, init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
