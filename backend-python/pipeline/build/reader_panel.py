"""첫 화면과 고정 기록 페이지에서 같은 읽기·이메일·RSS 안내를 제공한다.

이메일 구독은 Buttondown 가입 폼으로 받는다. 배포 환경변수 NEWSLETTER_USERNAME(Buttondown 사용자 이름)이
있을 때만 폼을 넣고, 없으면 지금처럼 RSS 안내만 둔다.
무료 플랜이 구독자 100명까지라 NEWSLETTER_FULL=1이면 폼 대신 마감 안내를 둔다(배포만 다시 하면 바뀜).
"""
from __future__ import annotations

import html
import os
import re

SUBSCRIBE = "https://buttondown.com/api/emails/embed-subscribe/"
# 국내 독자가 많이 쓰는 메일 서비스 순서. 마지막 빈 값은 도메인 직접 입력
DOMAINS = (
    ("naver.com", "네이버"), ("gmail.com", "Gmail"), ("daum.net", "다음"), ("hanmail.net", "한메일"),
    ("kakao.com", "카카오"), ("nate.com", "네이트"), ("outlook.com", "Outlook"), ("hotmail.com", "Hotmail"),
    ("icloud.com", "iCloud"), ("yahoo.com", "Yahoo"),
)


def newsletter_name(env=None) -> str:
    """Buttondown 사용자 이름. 형식이 이상하면 폼을 넣지 않도록 빈 문자열."""
    name = (os.environ if env is None else env).get("NEWSLETTER_USERNAME", "").strip()
    return name if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", name) else ""


def newsletter_full(env=None) -> bool:
    """선착순 100명이 찼는지. 저장소 변수 NEWSLETTER_FULL이 1/true면 마감."""
    return (os.environ if env is None else env).get("NEWSLETTER_FULL", "").strip().lower() in ("1", "true")


def email_form(name: str, full: bool = False) -> str:
    if not name:
        return ""
    if full:
        return '<p class="reader-tools__email" id="readerEmailFull"><strong>메일 구독은 선착순 100명이 모두 찼습니다.</strong> 자리가 나면 다시 열게요. 그동안은 아래 RSS로 새 호를 받아볼 수 있습니다.</p>'
    action = html.escape(SUBSCRIBE + name, quote=True)
    domains = "".join(f'<option value="{d}">{d} ({label})</option>' for d, label in DOMAINS) + '<option value="">직접 입력</option>'
    return f'''<form class="reader-tools__email" id="readerEmail" action="{action}" method="post" target="_blank">
      <p><strong>지금 선착순 100명까지 무료로 받아보세요!</strong> 매일 아침 6시, 새 호를 메일로 보내 드립니다.</p>
      <div class="reader-tools__whole" id="readerEmailWhole"><label for="readerEmailInput">이메일 주소</label><input type="email" id="readerEmailInput" name="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="name@example.com" required></div>
      <fieldset class="reader-tools__split" id="readerEmailSplit" hidden><legend>이메일 주소</legend>
        <div class="reader-tools__parts"><label class="reader-tools__sr" for="readerEmailLocal">아이디</label><input type="text" id="readerEmailLocal" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="아이디" aria-describedby="readerEmailHint"><span aria-hidden="true">@</span><label class="reader-tools__sr" for="readerEmailDomain">메일 서비스</label><select id="readerEmailDomain">{domains}</select></div>
        <label class="reader-tools__sr" for="readerEmailCustom">도메인 직접 입력</label><input type="text" id="readerEmailCustom" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="example.com" hidden>
        <p class="reader-tools__note" id="readerEmailHint">아이디만 적고 메일 서비스를 고르세요. 목록에 없으면 직접 입력을 고르면 됩니다.</p>
      </fieldset>
      <button class="kj-btn kj-btn--primary reader-tools__submit" type="submit">메일로 받기</button>
      <input type="hidden" name="tag" value="site"><input type="hidden" name="embed" value="1">
      <p class="reader-tools__status" id="readerEmailStatus" role="status"></p>
      <p class="reader-tools__note">확인 메일의 링크를 눌러야 가입이 끝나며, 메일 아래 링크로 언제든 해지할 수 있습니다.</p>
    </form>
      '''


def markup(site: str, contained: bool = False, newsletter: str | None = None, full: bool | None = None) -> str:
    feed = html.escape(site.rstrip('/') + '/feed.xml', quote=True)
    email = email_form(newsletter_name() if newsletter is None else newsletter, newsletter_full() if full is None else full)
    rss_intro = 'RSS 리더를 쓴다면 아래 주소를 추가해도 됩니다.' if email else 'RSS 리더에 아래 주소를 추가하면 새 호가 발행됐을 때 확인할 수 있습니다. 이메일이나 회원가입 없이 이용합니다.'
    classes = 'reader-tools' if contained else 'reader-tools kj-wrap'
    return f'''<aside class="{classes}" data-reader-tools aria-label="이어서 읽기와 새 호 받아보기">
  <div class="reader-tools__inner">
    <div><p class="reader-tools__lead">이슈의 흐름과 숫자의 기준을 함께.</p><nav class="reader-tools__links" aria-label="기록으로 바로 읽기"><a href="/topics/" data-reader-action="topic_open">이슈 진행 기록</a><a href="/indicators/" data-reader-action="indicator_open">경제 숫자와 기준일</a></nav></div>
    <details class="reader-tools__subscribe" id="readerSubscribe"><summary>매일 아침 새 호 받아보기</summary><div class="reader-tools__rss">
      {email}<p>{rss_intro}</p>
      <label for="readerFeed">RSS 주소</label><div class="reader-tools__copy"><input type="url" id="readerFeed" value="{feed}" readonly><button class="kj-btn kj-btn--secondary" type="button" id="readerFeedCopy" disabled>주소 복사</button></div>
      <p class="reader-tools__status" id="readerFeedStatus" role="status"></p><a href="/feed.xml" target="_blank" rel="noopener" data-reader-action="feed_open">RSS 직접 열기</a>
      <noscript><p>주소를 직접 복사해 사용하거나 RSS 직접 열기를 선택해 주세요.</p></noscript>
    </div></details>
  </div>
</aside>'''
