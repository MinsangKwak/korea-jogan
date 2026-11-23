"""파기환송 해설에 실을 판결문 읽기 문제를 만든다."""


def render_recall(slug: str) -> str:
    if slug != "reversal-and-remand":
        return ""
    return '''<section class="question-recall" data-question-recall aria-labelledby="recall-title">
  <h2 id="recall-title">판결문 한 문장 읽기</h2>
  <blockquote>원심판결을 파기하고, 사건을 서울고등법원에 환송한다.</blockquote>
  <fieldset>
    <legend>이 주문에 따르면, 다음 재판은 어디에서 맡을까요?</legend>
    <div data-recall-controls hidden>
      <label><input type="radio" name="recall-court" value="supreme" autocomplete="off"> 대법원에서 다시 심리한다.</label>
      <label><input type="radio" name="recall-court" value="seoul-high" autocomplete="off" data-correct> 서울고등법원에서 다시 심리한다.</label>
      <button type="button" data-recall-check>답 확인하기</button>
    </div>
  </fieldset>
  <p data-recall-status role="status"></p>
  <details>
    <summary>해설과 판결문 보기</summary>
    <p>다음 재판을 맡는 곳은 서울고등법원입니다. ‘파기’는 앞선 판결을 깬다는 뜻이고, ‘환송’은 사건을 원래 판단했던 법원으로 돌려보낸다는 뜻입니다.</p>
    <a href="https://www.law.go.kr/LSW/precInfoP.do?precSeq=605971">대법원 2025도4697 판결문 원문</a>
  </details>
</section>'''
