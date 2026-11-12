"""조사 초안이 없을 때 실제 RSS 메타데이터로 범위를 밝힌 보조 호를 만든다."""
from __future__ import annotations

import copy
import datetime as dt
import json
from pathlib import Path
import re
import urllib.parse

import fetch_rss

REGIONS = ('서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주')
REGION_WORDS = {'경기': ('경기도', '경기관광', '수원', '성남', '용인'), '강원': ('강원', '춘천', '강릉', '원주'), '충북': ('충북', '청주', '충주'), '충남': ('충남', '천안', '서산', '당진'), '전북': ('전북', '전주', '익산', '군산'), '전남': ('전남', '목포', '여수', '순천'), '경북': ('경북', '포항', '구미', '안동'), '경남': ('경남', '창원', '김해', '진주')}
CATEGORIES = (('사건·안전', ('화재', '가스', '사고', '경찰', '누출', '수사')), ('날씨·재난', ('날씨', '기온', '한파', '폭설', '태풍')), ('안보·외교', ('국방', '외교', '미사일', '한미', '북한')), ('국제', ('미국', '중국', '이란', '우크라', '유럽', '에볼라')), ('과학·IT', ('AI', '반도체', '인공지능', '디지털', '과학')), ('생활·물가', ('물가', '고용', '취업', '수출', '코스피', '철도', '주택')), ('문화·스포츠', ('축구', '야구', '공연', '문화', '스포츠')))


def category(title: str) -> str:
    return next((label for label, words in CATEGORIES if any(word in title for word in words)), '사회')


def prepare_items(report: dict, day: str) -> list[dict]:
    start, end = fetch_rss.window(dt.date.fromisoformat(day))
    seen, items = set(), []
    for item in report.get('items', []):
        when = fetch_rss.parse_date(item.get('published'))
        url = urllib.parse.urlsplit(item.get('url', ''))
        title = str(item.get('title', '')).strip()
        if not when or not start <= when < end or url.scheme != 'https' or not url.netloc or not title:
            continue
        if re.search(r'운세|부고|인사\]|기자수첩|논설|칼럼|논단|사설|할인전|신규 지점', title):
            continue
        clean_url = urllib.parse.urlunsplit((url.scheme, url.netloc, url.path, urllib.parse.urlencode([(k, v) for k, v in urllib.parse.parse_qsl(url.query) if not k.startswith('utm_')]), ''))
        if clean_url in seen:
            continue
        seen.add(clean_url)
        items.append({'cat': category(title), 'title': title, 'outlet': item['outlet'], 'url': clean_url, 'date': when.date().isoformat(), 'body_read': False, 'summary': f"{item['outlet']}가 {when:%m월 %d일} RSS에 제공한 기사입니다. 제목·주소·게시 시각만 확인했으며 본문 내용은 원문에서 확인해 주세요.", 'figures': []})
    return items


def compose(template: dict, report: dict, day: str, now: dt.datetime | None = None) -> dict:
    when = (now or dt.datetime.now(fetch_rss.KST)).astimezone(fetch_rss.KST)
    if when.date().isoformat() != day:
        raise ValueError('자동 수집은 한국 시간 오늘 호만 생성합니다')
    issue = copy.deepcopy(template)
    for field in ('review', 'late', 'recovery'):
        issue.pop(field, None)
    articles = prepare_items(report, day)
    picked, counts, seen = [], {}, set()
    for cat, _words in CATEGORIES + (('사회', ()),):
        for item in [row for row in articles if row['cat'] == cat]:
            if sum(row['cat'] == cat for row in picked) >= 3:
                break
            if counts.get(item['outlet'], 0) >= 6:
                continue
            picked.append(item); seen.add(item['url']); counts[item['outlet']] = counts.get(item['outlet'], 0) + 1
    regional, summaries = [], {}
    for region in REGIONS:
        found = []
        for item in articles:
            if len(found) >= 2:
                break
            words = REGION_WORDS.get(region, (region,))
            if any(word in item['title'] for word in words) and item['url'] not in seen and counts.get(item['outlet'], 0) < 8:
                found.append({**item, 'region': region}); seen.add(item['url']); counts[item['outlet']] = counts.get(item['outlet'], 0) + 1
        regional.extend(found)
        summaries[region] = f'RSS 기사 {len(found)}건 · 본문 미확인' if found else '이번 자동 수집에서 해당 지역의 기사를 확보하지 못했습니다.'
    if not picked:
        picked = [{'cat': '사회', 'title': '새 자료 수집 지연 안내', 'outlet': '대한민국 조간', 'url': 'https://korea-jogan.com/' + day, 'date': day, 'body_read': True, 'summary': '새 기사 자료를 확보하지 못했습니다. 당일 기사로 이전 보도를 재사용하지 않으며 기존 확정 지표의 기준일을 유지합니다.', 'figures': []}]
    cutoff = (dt.datetime.combine(dt.date.fromisoformat(day), dt.time(), fetch_rss.KST) - dt.timedelta(seconds=1)).isoformat()
    note = '별도 조사 초안이 없어 RSS 제목·주소·게시 시각을 자동 수집한 보조 호입니다. 기사 본문 요약이나 사람의 원문 확인을 완료한 호가 아닙니다.'
    issue.update(date=day, collectedAt=when.isoformat(timespec='seconds'), status='draft', topic='자동 수집 · 기사 목록', headline=f'{day} 조간 · RSS 기사 목록과 기준일별 확정 지표', notes=note)
    issue['lead'] = {'kicker': '자동 수집 · 범위 안내', 'headline': issue['headline'], 'standfirst': note + ' 전국·지역 목록의 열람 여부를 표시하고 이전 지표는 원래 출처와 기준일을 유지합니다.', 'facts': [{'t': '전국 목록', 'v': str(len(picked)) + '건', 'm': 'RSS 메타데이터 선별'}, {'t': '지역 목록', 'v': str(len(regional)) + '건', 'm': '미확보 지역 별도 표시'}, {'t': '본문 확인', 'v': '미확인', 'm': '자동 제목 목록 · 원문 링크 제공'}], 'meta': '자료 기준 ' + cutoff}
    issue['national'] = {'flow': ['새 자료는 전날 게시된 RSS에서 선별했습니다.', '기사 본문을 확인하지 않은 항목은 원문 링크와 함께 표시합니다.', '이전 확정 지표는 기준일을 유지하며 오늘 수치로 바꾸지 않습니다.'], 'items': picked}
    issue['regions'] = {'summary': summaries, 'items': regional}
    issue['themes'] = [{'id': 'rss-national', 'title': '전국 기사 목록 · 본문 미확인', 'keywords': ['전국', 'RSS', '기사'], 'period': cutoff[:10] + ' 게시 자료', 'summary': [note], 'diffs': [{'q': '자동 목록과 원문 확인의 범위', 'a': '본문을 읽지 않은 자료의 상세 내용이나 원인을 추정하지 않습니다.', 'cols': ['구분', '확인 범위'], 'rows': [['RSS', '제목·링크·시각'], ['원문', '본문 미확인']]}], 'articles': [{'outlet': item['outlet'], 'region': '국내', 'title': item['title'], 'url': item['url'], 'date': item['date'], 'read': False} for item in picked[:12]]}]
    issue['briefs'] = [{'k': '자료 확인 범위', 'm': note, 'href': 'https://korea-jogan.com/' + day}]
    issue['agenda'] = []
    issue['agendaSrc'] = '이번 보조 호에서는 새 일정을 원문 대조하지 않아 일정을 추가하지 않았습니다.'
    issue['limits'] = [note, '날짜가 없는 자료, 당일 이후 자료, HTTP 전용 주소와 접근을 막은 피드는 제외합니다.', '전국·지역별 편집 목표에 미달한 범위는 목록과 지역 안내에 공개합니다.', '상설 지표와 경제 숫자는 새 원문 대조를 하지 않아 이전 출처·기준일을 유지합니다. 오늘 종가나 오늘 확인한 수치가 아닙니다.']
    if when.time() >= dt.time(6):
        issue['late'] = {'reason': '자동 수집·발행 복구로 늦게 준비한 호입니다.', 'cutoff': cutoff}
    return issue


def write_today(root: Path, day: str) -> Path:
    directory = root / 'dev/web/data/issues'
    index = json.loads((directory / 'index.json').read_text())
    if (directory / (day + '.json')).exists():
        raise ValueError('이미 있는 오늘 호를 자동 덮어쓰지 않습니다')
    template = json.loads((directory / (index['latest'] + '.json')).read_text())
    feeds = json.loads((root / 'dev/pipeline/collect/feeds.json').read_text())['feeds']
    report = fetch_rss.run(feeds, dt.date.fromisoformat(day))
    issue = compose(template, report, day)
    target = directory / (day + '.json')
    target.write_text(json.dumps(issue, ensure_ascii=False, indent=2) + '\n')
    index.update(latest=day, issues=sorted(set(index['issues']) | {day}, reverse=True))
    (directory / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
    return target
