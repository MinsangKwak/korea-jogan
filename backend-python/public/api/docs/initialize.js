'use strict';

function sameOriginRead(request) {
  const url = new URL(request.url, window.location.href);
  const allowed = /^\/api\/(?:openapi\.json|v1\/(?:index\.json|editions\/\d{4}-\d{2}-\d{2}\.json|articles\/[a-f0-9]{32}\.json))$/;
  if (url.origin !== window.location.origin || url.username || url.password || url.search || !allowed.test(url.pathname) || (request.method || 'GET').toUpperCase() !== 'GET') {
    throw new Error('이 문서에서는 공개 기사 API의 조회 요청만 실행할 수 있습니다.');
  }
  request.credentials = 'same-origin';
  request.redirect = 'error';
  return request;
}

SwaggerUIBundle({
  dom_id: '#swagger-ui',
  url: '/api/openapi.json',
  layout: 'BaseLayout',
  presets: [SwaggerUIBundle.presets.apis],
  supportedSubmitMethods: ['get'],
  validatorUrl: null,
  persistAuthorization: false,
  queryConfigEnabled: false,
  withCredentials: false,
  requestInterceptor: sameOriginRead,
  defaultModelsExpandDepth: -1,
  docExpansion: 'list',
  displayRequestDuration: true
});
