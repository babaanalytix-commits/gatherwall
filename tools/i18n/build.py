"""Build the FR/ES/DE/CS copies of the GatherWall Business pages from the English originals.

    python3 tools/i18n/build.py

English pages are the source of truth. Translations live in tools/i18n/<lang>.json:
  "text": {English string: translation}   (visible text, alt/placeholder/meta content)
  "js":   {English string: translation}   (strings inside the page's <script>)
If you change English copy, add the new English string and its translation to every <lang>.json,
then rebuild. The script prints any visible English text it could not translate.
Never edit the generated /fr/ /es/ /de/ /cs/ copies by hand.
"""
import re, json, html, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LANGS = ['en', 'fr', 'es', 'de', 'cs']
PAGES = ['business.html', 'for-djs.html', 'for-venues.html', 'for-photographers.html']
SKIP = {'EN', 'FR', 'ES', 'DE', 'CS', 'DJ', 'Míra & Domča', 'Mira & Domča', '"Naše místo"', 'Song of Your Night', 'Email', 'Hotel', 'Free'}

def url(lang, page):
    if lang == 'cs' and page == 'business.html': return '/cs/pro-firmy.html'
    return ('/' if lang == 'en' else f'/{lang}/') + page

def out_path(lang, page): return os.path.join(ROOT, url(lang, page).lstrip('/'))

OLD_SW = '· <a href="/cs/pro-firmy.html" style="color:#fff;opacity:.7;font-weight:500">Čeština</a>'
def hero_switcher(cur):
    out = []
    for l in LANGS:
        if l == cur: out.append(f'<b style="color:#fff">{l.upper()}</b>')
        else: out.append(f'<a href="{url(l,"business.html")}" hreflang="{l}" style="color:#fff;opacity:.65;font-weight:500;text-decoration:none">{l.upper()}</a>')
    return '<span style="white-space:nowrap">· ' + ' '.join(out) + '</span>'

def head_links(s, lang, page):
    s = re.sub(r'<link rel="alternate" hreflang=[^>]*>\n', '', s)
    alts = ''.join(f'<link rel="alternate" hreflang="{l}" href="https://gatherwall.com{url(l,page)}">\n' for l in LANGS)
    alts += f'<link rel="alternate" hreflang="x-default" href="https://gatherwall.com{url("en",page)}">\n'
    s, n = re.subn(r'<link rel="canonical" href="[^"]*">\n', f'<link rel="canonical" href="https://gatherwall.com{url(lang,page)}">\n' + alts, s, count=1)
    assert n == 1, page + ': no canonical tag'
    return s

def localise_links(s, lang):
    for p in PAGES:
        s = re.sub(r'href="/' + re.escape(p) + r'(?=[#"?])', 'href="' + url(lang, p), s)
    return s

def build(lang, page, D):
    s = open(os.path.join(ROOT, page)).read()
    if page == 'business.html':
        if OLD_SW in s: s = s.replace(OLD_SW, hero_switcher(lang))
        else: s = re.sub(r'<span style="white-space:nowrap">· .*?</span>', lambda m: hero_switcher(lang), s, count=1)
    s = head_links(s, lang, page)
    if lang == 'en': return s, []
    T = {k: html.escape(v, quote=False) for k, v in D['text'].items()}
    T['For wedding DJs, photographers and venues'] = html.escape(D['text']['For wedding DJs, photographers and venues ·'].rstrip(' ·'), quote=False)
    parts = re.split(r'(<script\b.*?</script>|<style\b.*?</style>)', s, flags=re.S)
    missing = []
    for i, p in enumerate(parts):
        if p.startswith('<script') or p.startswith('<style'): continue
        def tn(m):
            raw = m.group(1); st = html.unescape(raw.strip())
            if st in T:
                lead = raw[:len(raw) - len(raw.lstrip())]; trail = raw[len(raw.rstrip()):]
                return '>' + lead + T[st] + trail + '<'
            if st and any(c.isalpha() for c in st) and st not in SKIP and not st.startswith('<'): missing.append(st)
            return m.group(0)
        p = re.sub(r'>([^<>]+)<', tn, p)
        def at(m):
            v = html.unescape(m.group(2))
            if v in D['text']: return f'{m.group(1)}="' + html.escape(D['text'][v], quote=True) + '"'
            return m.group(0)
        p = re.sub(r'\b(alt|placeholder|content)="([^"]*)"', at, p)
        parts[i] = p
    s = ''.join(parts)
    for a, b in sorted(D['js'].items(), key=lambda x: -len(x[0])):
        s = s.replace(a, b.replace("'", "\\'"))
    s = s.replace("toLocaleString('en-US')", f"toLocaleString('{D['num']}')")
    s = re.sub(r"(const d=\{op:'apply',lang:)'en'", rf"\1'{lang}'", s)
    s = s.replace('<html lang="en">', f'<html lang="{lang}">')
    s = localise_links(s, lang)
    return s, missing

if __name__ == '__main__':
    ok = True
    for lang in LANGS:
        D = json.load(open(os.path.join(ROOT, 'tools/i18n', lang + '.json'))) if lang != 'en' else None
        for page in PAGES:
            s, miss = build(lang, page, D)
            os.makedirs(os.path.dirname(out_path(lang, page)), exist_ok=True)
            open(out_path(lang, page), 'w').write(s)
            if miss: ok = False; print(f'{lang} {page}: UNTRANSLATED', miss[:8])
    print('done' if ok else 'done, with untranslated strings above')
