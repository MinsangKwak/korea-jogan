"""공개 지면과 편집국에 같은 제호와 지면 색인을 발행한다."""
import re
from html import escape

SECTIONS = (
    ("it", "/#itBriefing", "IT 브리핑"),
    ("national", "/#home", "종합 뉴스"),
    ("topics", "/topics/", "이슈 추적"),
    ("indicators", "/indicators/", "경제 지표"),
    ("law", "/law/", "판례·입법"),
    ("archive", "/archive/", "지난 호"),
)
SHELL = re.compile(r'<!-- site-header -->.*?<!-- /site-header -->', re.S)


def switch(kind, control_id, label):
    return (f'<button type="button" id="{control_id}" role="switch" aria-checked="false" '
            f'data-{kind}-toggle disabled><span class="paper-switch" aria-hidden="true"></span>'
            f'<span>{label}</span><span class="paper-state" data-{kind}-state aria-hidden="true">끔</span></button>')


def utility(label, edition=False, subscribe_here=False):
    share_icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>'
    menu_icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
    subscribe = 'href="#readerSubscribe" data-reader-subscribe' if subscribe_here or edition else 'href="/feed.xml"'
    if edition:
        menu = f'<button class="paper-action" id="menuBtn" type="button" aria-controls="drawer" aria-expanded="false" aria-haspopup="dialog">{menu_icon}지면 목차</button>'
    else:
        entries = "".join(f'<a href="{href}">{name}</a>' for _, href, name in SECTIONS)
        menu = f'<details class="paper-directory"><summary class="paper-action">{menu_icon}지면 목차</summary><nav aria-label="지면 목차">{entries}</nav></details>'
    return f'''<div class="paper-tools paper-width">
  <div class="paper-location"><a href="/">대한민국 조간</a><span aria-hidden="true">/</span><span id="paperSection">{escape(label)}</span></div>
  <div class="paper-actions"><a class="paper-action paper-subscribe" {subscribe}>새 호 구독</a><button class="paper-action" id="shareBtn" type="button" hidden>{share_icon}공유</button>{menu}</div>
</div>'''


def markup(section="", *, edition=False, label="", subscribe_here=False):
    links = []
    for key, href, label in SECTIONS:
        state = ' aria-current="page"' if key == section else ''
        if edition and key in ("it", "national"):
            href = href[1:]
            state += f' data-view-tab="{key}"'
        links.append(f'<li><a href="{href}"{state}>{label}</a></li>')
    big = switch("big", "bigBtn" if edition else "discoveryBig", "글자 크게")
    theme = switch("theme", "themeToggle" if edition else "discoveryTheme", "어두운 화면")
    return f'''<!-- site-header -->
<header class="paper-header" id="top">
  <div class="paper-mast paper-width">
    <a class="paper-brand kj-mast__logo" href="/"><img src="/assets/images/jogan-symbol.svg" width="42" height="42" alt=""><span>대한민국 조간</span></a>
    <div class="paper-settings" role="group" aria-label="읽기 설정">{big}{theme}</div>
  </div>
  <nav id="cats" class="paper-index" aria-label="주요 지면"><ul id="catNav" class="paper-width">
    {"".join(links)}
  </ul></nav>
</header>
{utility(label or ("IT 브리핑" if edition else "편집국"), edition, subscribe_here)}
<!-- /site-header -->'''


def apply(page, section="", *, edition=False, label=""):
    return SHELL.sub(lambda _: markup(section, edition=edition, label=label), page, count=1)
