"""첫 화면과 고정 기록 페이지에서 같은 읽기·RSS 안내를 제공한다."""
from __future__ import annotations

import html


def markup(site: str, contained: bool = False) -> str:
    feed = html.escape(site.rstrip('/') + '/feed.xml', quote=True)
    classes = 'reader-tools' if contained else 'reader-tools kj-wrap'
    return f'''<aside class="{classes}" data-reader-tools aria-label="이어서 읽기와 새 호 받아보기">
  <div class="reader-tools__inner">
    <div><p class="reader-tools__lead">이슈의 흐름과 숫자의 기준을 함께.</p><nav class="reader-tools__links" aria-label="기록으로 바로 읽기"><a href="/topics/" data-reader-action="topic_open">이슈 진행 기록</a><a href="/indicators/" data-reader-action="indicator_open">경제 숫자와 기준일</a></nav></div>
    <details class="reader-tools__subscribe" id="readerSubscribe"><summary>매일 아침 새 호 받아보기</summary><div class="reader-tools__rss">
      <p>RSS 리더에 아래 주소를 추가하면 새 호가 발행됐을 때 확인할 수 있습니다. 이메일이나 회원가입 없이 이용합니다.</p>
      <label for="readerFeed">RSS 주소</label><div class="reader-tools__copy"><input type="url" id="readerFeed" value="{feed}" readonly><button class="kj-btn kj-btn--secondary" type="button" id="readerFeedCopy" disabled>주소 복사</button></div>
      <p class="reader-tools__status" id="readerFeedStatus" role="status"></p><a href="/feed.xml" target="_blank" rel="noopener" data-reader-action="feed_open">RSS 직접 열기</a>
      <noscript><p>주소를 직접 복사해 사용하거나 RSS 직접 열기를 선택해 주세요.</p></noscript>
    </div></details>
  </div>
</aside>'''
