'use strict';

let swiperRequest = null;

// 지면에 가까워진 첫 캐러셀이 같은 출처의 JS와 CSS를 한 번만 요청한다
function loadLocalSwiper() {
  if (swiperRequest) return swiperRequest;
  const load = (kind, url) => new Promise((resolve) => {
    const node = kind === 'script' ? document.createElement('script') : document.createElement('link');
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 8000);
    if (kind === 'script') { node.src = url; node.async = true; }
    else { node.rel = 'stylesheet'; node.href = url; }
    node.onload = () => finish(true);
    node.onerror = () => finish(false);
    document.head.append(node);
  });
  swiperRequest = Promise.all([
    load('style', 'assets/vendor/swiper/swiper-14.4.0.min.css'),
    load('script', 'assets/vendor/swiper/swiper-14.4.0.min.js')
  ]).then((loaded) => loaded.every(Boolean) && typeof window.Swiper === 'function');
  return swiperRequest;
}
