# 지면의 자동 넘김과 경제 지표 Swiper 14.4.0

IT 브리핑, 이슈 추적, 700px 이하의 최근 변경 목록은 한 번에 한 건씩 표시합니다. 기사나 이슈가 두 건 이상이고 영역이 화면 안에 있을 때 8초마다 다음 항목을 보여 줍니다. 마지막 다음은 첫 번째이고 첫 번째 이전은 마지막입니다. 마우스를 올리거나 키보드 포커스가 들어오면 잠시 멈추고, 독자가 직접 넘기거나 자동 넘김을 끄면 다시 켤 때까지 멈춥니다. 동작 줄이기를 선택한 기기에서는 수동으로 시작합니다.

이슈 요약의 제목·단계·건수를 확인한 뒤 상세 링크에서 진행 기록과 관련 보도를 읽습니다. 상세에서 뒤로 가면 보던 요약으로 돌아옵니다. 넓은 화면의 최근 변경은 링크를 나란히 제공합니다. [자동 넘김과 입력 처리](../../../frontend-vanilla-js/src/components/track/carousel.js)

경제 지표는 지면 근처에서 같은 출처의 Swiper를 불러옵니다. 지표가 두 건 이상이면 화면 폭에 맞게 표시 수를 정하고 순환합니다. 라이브러리를 받지 못하면 전체 목록에서 지표와 상세를 읽을 수 있습니다. [공용 로더](../../../frontend-vanilla-js/src/core/swiper.js) · [경제 지표](../../../frontend-vanilla-js/src/components/economy/economy.js)

## 보관한 원본

[공식 npm 패키지](https://registry.npmjs.org/swiper/-/swiper-14.4.0.tgz)의 파일을 내용 변경 없이 보관했습니다. JS는 모든 모듈이 든 압축본, CSS는 슬라이드 배치에 필요한 core 압축본입니다. 실행에 필요하지 않은 소스맵은 보관하지 않습니다.

| 저장 파일 | npm 원본 파일 |
| --- | --- |
| [swiper-14.4.0.min.js](../../../frontend-vanilla-js/assets/vendor/swiper/swiper-14.4.0.min.js) | `swiper-bundle.min.js` |
| [swiper-14.4.0.min.css](../../../frontend-vanilla-js/assets/vendor/swiper/swiper-14.4.0.min.css) | `swiper.min.css` |

라이선스는 MIT이며 원문을 [LICENSE](../../../frontend-vanilla-js/assets/vendor/swiper/LICENSE)에 보관합니다. 사용법은 [공식 API 문서](https://swiperjs.com/swiper-api), 버전 기록은 [공식 변경 이력](https://swiperjs.com/changelog)을 참조합니다.

## 파일 무결성

| 파일 | SHA-256 |
| --- | --- |
| swiper-14.4.0.min.js | `2ec62f21a16674b6b3eb3e3509b6307af6b7dc5eb1d48c81708a9e62c4926c7a` |
| swiper-14.4.0.min.css | `8f947870cc023adad6b38c45c96806debc41f8552bcf74eb27f0f6b1dbc69427` |

버전을 갱신할 때는 원본·라이선스·파일명·해시를 함께 기록하고, 순환·키보드·자동 넘김 정지·격자 목록 복구를 브라우저 검사로 확인합니다.
