"""공개 지면과 편집국에 같은 제호와 지면 색인을 발행한다."""
import re

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


def markup(section="", *, edition=False):
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
<!-- /site-header -->'''


def apply(page, section="", *, edition=False):
    return SHELL.sub(lambda _: markup(section, edition=edition), page, count=1)
