import re, json, importlib.util, sys, html
SRC=open('business.html').read()
seg=json.load(open('tools/i18n/seg.json'))  # EN strings; if you change business.html copy, add the new strings here and to each tr_*.py
URL={'en':'/business.html','fr':'/fr/business.html','es':'/es/business.html','de':'/de/business.html','cs':'/cs/pro-firmy.html'}
LBL={'en':'EN','fr':'FR','es':'ES','de':'DE','cs':'CS'}
OLD_SW='· <a href="/cs/pro-firmy.html" style="color:#fff;opacity:.7;font-weight:500">Čeština</a>'
def switcher(cur):
    out=[]
    for l in ['en','fr','es','de','cs']:
        if l==cur: out.append(f'<b style="color:#fff">{LBL[l]}</b>')
        else: out.append(f'<a href="{URL[l]}" hreflang="{l}" style="color:#fff;opacity:.65;font-weight:500;text-decoration:none">{LBL[l]}</a>')
    return '<span style="white-space:nowrap">· '+' '.join(out)+'</span>'
HREF=''.join(f'<link rel="alternate" hreflang="{l}" href="https://gatherwall.com{u}">\n' for l,u in URL.items())+'<link rel="alternate" hreflang="x-default" href="https://gatherwall.com/business.html">\n'
def build(lang):
    s=SRC
    # business.html (EN) is the source; it may already carry the switcher and hreflang block from a previous build
    if OLD_SW in s: s=s.replace(OLD_SW,switcher(lang))
    else: s=re.sub(r'<span style="white-space:nowrap">· .*?</span>',lambda m_:switcher(lang),s,count=1)
    s=re.sub(r'<link rel="alternate" hreflang=[^>]*>\n','',s)
    s=s.replace('<link rel="canonical" href="https://gatherwall.com/business.html">\n',f'<link rel="canonical" href="https://gatherwall.com{URL[lang]}">\n'+HREF)
    if lang=='en': return s
    spec=importlib.util.spec_from_file_location('t',f'tools/i18n/tr_{lang}.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    T={seg[i]:v for i,v in m.T.items()}
    T[seg[3].rstrip(' ·')]=m.T[3].rstrip(' ·')
    T={k:html.escape(v,quote=False) for k,v in T.items()}
    # split out script/style
    parts=re.split(r'(<script\b.*?</script>|<style\b.*?</style>)',s,flags=re.S)
    miss=set(T)
    for i,p in enumerate(parts):
        if p.startswith('<script') or p.startswith('<style'): continue
        def tn(mm):
            raw=mm.group(1); st=html.unescape(raw.strip())
            if st in T:
                miss.discard(st); lead=raw[:len(raw)-len(raw.lstrip())]; trail=raw[len(raw.rstrip()):]
                return '>'+lead+T[st]+trail+'<'
            return mm.group(0)
        p=re.sub(r'>([^<>]+)<',tn,p)
        def at(mm):
            v=html.unescape(mm.group(2))
            if v in T: miss.discard(v); return f'{mm.group(1)}="{T[v].replace(chr(34),"&quot;")}"'
            return mm.group(0)
        p=re.sub(r'\b(alt|placeholder|content)="([^"]*)"',at,p)
        parts[i]=p
    s=''.join(parts)
    for a,b in sorted(m.JS.items(),key=lambda x:-len(x[0])):
        assert a in s,(lang,a); s=s.replace(a,b.replace("'","\\'"))
    s=s.replace("toLocaleString('en-US')",f"toLocaleString('{m.NUM}')").replace("const d={op:'apply',lang:'en',page:'business'}",f"const d={{op:'apply',lang:'{lang}',page:'business'}}")
    s=s.replace('<html lang="en">',f'<html lang="{lang}">')
    if miss: print(lang,'UNUSED',[x[:40] for x in miss])
    return s
for l in ['en','fr','es','de','cs']:
    out=build(l); open(URL[l].lstrip('/'),'w').write(out); print(l,len(out))
