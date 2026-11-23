/* "What you'll receive": shows the standard GatherWall delivery format on marketing pages.
   Usage: <div data-gw-package data-lang="en|cs"></div><script src="/gw-package.js" defer></script> */
(function () {
  var T = {
    en: {
      h: "What you'll receive", sub: "Every keepsake arrives the same way: one private link that opens like a present.",
      items: [
        ["🎁", "Open your gift", "A private link that opens like a present, on any phone or TV."],
        ["🎬", "The film", "Watch it, and download it in TV and phone sizes."],
        ["🎵", "Your songs", "Play them, and download the MP3s."],
        ["🎤", "Sing-along lyrics", "The words light up with the music. Printable lyrics too."],
        ["💌", "Everyone's words", "Messages and photos from family and guests."],
        ["⬇️", "Download everything", "Keep your own copy. The page stays online 12 months, renewed free."]
      ],
      note: "The $19 song comes with the song, sing-along lyrics and keepsake page. The film and family sections come with made-for-you.",
      cta: "Open a sample keepsake ›", href: "/sample-keepsake.html",
      cta2: "See a real one (preview) ›", href2: "/mirodomca-preview.html?lang=en"
    },
    cs: {
      h: "Co dostanete", sub: "Každý dárek přijde stejně: jeden soukromý odkaz, který se otevře jako dárek.",
      items: [
        ["🎁", "Otevřete dárek", "Soukromý odkaz, který se otevře jako dárek, na telefonu i v televizi."],
        ["🎬", "Film", "Ke zhlédnutí i ke stažení, ve velikosti pro televizi i telefon."],
        ["🎵", "Vaše písně", "K poslechu i ke stažení v MP3."],
        ["🎤", "Texty ke zpívání", "Slova se rozsvěcují s hudbou. Text i k vytištění."],
        ["💌", "Slova všech blízkých", "Vzkazy a fotky od rodiny a hostů."],
        ["⬇️", "Stáhněte si vše", "Vlastní kopie navždy. Stránka je online 12 měsíců, prodloužení zdarma."]
      ],
      note: "Píseň za 19 $ obsahuje píseň, text ke zpívání a vzpomínkovou stránku. Film a části od rodiny jsou součástí balíčku na míru.",
      cta: "Prohlédnout ukázku Miry a Domči ›", href: "/mirodomca-preview.html?lang=cs",
      cta2: "Anglická ukázka (Tom & Priya) ›", href2: "/sample-keepsake.html"
    }
  };
  var css = '.gwp{background:#fffdf9;border:1px solid #ece4d6;border-radius:20px;padding:22px 20px;margin:26px 0;font-family:Inter,system-ui,sans-serif}' +
    '.gwp h3{font-family:Fraunces,Georgia,serif;font-size:24px;font-weight:600;margin:0 0 4px;color:#1d1d1f}' +
    '.gwp .s{color:#6b6b70;font-size:15px;margin:0 0 14px}' +
    '.gwp .g{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}' +
    '@media(max-width:640px){.gwp .g{grid-template-columns:1fr 1fr}}' +
    '.gwp .i{background:#fff;border:1px solid #efe8dc;border-radius:14px;padding:12px}' +
    '.gwp .i span{font-size:22px}.gwp .i b{display:block;font-size:14.5px;margin:4px 0 2px;color:#1d1d1f}.gwp .i small{font-size:13px;color:#6b6b70;line-height:1.4;display:block}' +
    '.gwp .n{font-size:12.5px;color:#8a8a90;margin:12px 0 0}' +
    '.gwp .b{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}' +
    '.gwp .b a{border-radius:999px;padding:11px 18px;font-weight:600;font-size:14.5px;text-decoration:none}' +
    '.gwp .b a.p{background:#1c2027;color:#fff}.gwp .b a.q{border:1.5px solid #1c2027;color:#1c2027}';
  function render() {
    var nodes = document.querySelectorAll('[data-gw-package]');
    if (!nodes.length) return;
    if (!document.getElementById('gwp-css')) { var st = document.createElement('style'); st.id = 'gwp-css'; st.textContent = css; document.head.appendChild(st); }
    nodes.forEach(function (n) {
      var t = T[n.getAttribute('data-lang')] || T.en;
      n.innerHTML = '<div class="gwp"><h3>' + t.h + '</h3><p class="s">' + t.sub + '</p><div class="g">' +
        t.items.map(function (x) { return '<div class="i"><span>' + x[0] + '</span><b>' + x[1] + '</b><small>' + x[2] + '</small></div>'; }).join('') +
        '</div><p class="n">' + t.note + '</p><div class="b"><a class="p" href="' + t.href + '">' + t.cta + '</a><a class="q" href="' + t.href2 + '">' + t.cta2 + '</a></div></div>';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
