"""Add/refresh link-preview (Open Graph + Twitter) tags on the business pages and their short links.
Run after tools/i18n/build.py: python3 tools/og_tags.py
Title/description come from each page's own <title> and meta description, so translations stay translated.
Short links (pro/, dj/, photo/, venues/, planners/ and their fr|es|de|cs copies) copy the tags of the page they open."""
import re, html, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = 'https://gatherwall.com/'
IMG = SITE + 'biz/og-business.jpg'
PAGES = {'en': 'business.html', 'fr': 'fr/business.html', 'es': 'es/business.html', 'de': 'de/business.html', 'cs': 'cs/pro-firmy.html'}
LOCALE = {'en': 'en_GB', 'fr': 'fr_FR', 'es': 'es_ES', 'de': 'de_DE', 'cs': 'cs_CZ'}
SLUGS = ['pro', 'dj', 'photo', 'venues', 'planners']
MARK_A, MARK_B = '<!-- og:start -->', '<!-- og:end -->'

def meta_of(src):
    t = re.search(r'<title>(.*?)</title>', src, re.S).group(1).strip()
    d = re.search(r'<meta name="description" content="(.*?)"', src, re.S)
    return html.unescape(t), html.unescape(d.group(1)) if d else ''

def block(title, desc, url, lang):
    e = lambda s: html.escape(s, quote=True)
    return '\n'.join([MARK_A,
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="GatherWall">',
        f'<meta property="og:locale" content="{LOCALE[lang]}">',
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:description" content="{e(desc)}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{IMG}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{e(title)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{e(title)}">',
        f'<meta name="twitter:description" content="{e(desc)}">',
        f'<meta name="twitter:image" content="{IMG}">',
        MARK_B])

def put(path, blk):
    s = path.read_text(encoding='utf-8')
    s = re.sub(re.escape(MARK_A) + r'.*?' + re.escape(MARK_B) + r'\n?', '', s, flags=re.S)
    s = s.replace('</title>', '</title>\n' + blk, 1)
    path.write_text(s, encoding='utf-8')
    print('ok', path.relative_to(ROOT))

meta = {}
for lang, rel in PAGES.items():
    t, d = meta_of((ROOT / rel).read_text(encoding='utf-8'))
    meta[lang] = (t, d)
    put(ROOT / rel, block(t, d, SITE + rel, lang))
for slug in SLUGS:
    for lang in PAGES:
        rel = (slug if lang == 'en' else lang + '/' + slug) + '/index.html'
        p = ROOT / rel
        if not p.exists(): continue
        t, d = meta[lang]
        put(p, block(t, d, SITE + rel.replace('index.html', ''), lang))
