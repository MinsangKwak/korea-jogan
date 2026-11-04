'use strict';
// 정적 본문은 스크립트 없이 읽히고 측정은 기존 내부 접속 제외 기준을 따른다
setupMetrics();
trackView('', false);
track('discovery_open', metaContent('kj-page-kind'));
