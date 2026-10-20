(async function () {
  const bookEl = document.getElementById('book');
  const pageIndicator = document.getElementById('pageIndicator');
  const tocList = document.getElementById('tocList');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const tocBtn = document.getElementById('tocBtn');
  const tocCloseBtn = document.getElementById('tocCloseBtn');
  const tocOverlay = document.getElementById('tocOverlay');
  const fsBtn = document.getElementById('fsBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomLevelEl = document.getElementById('zoomLevel');

  const params = new URLSearchParams(location.search);
  const book = params.get('book') || 'sme-booklet';
  const prefix = `books/${book}/`;

  const [pagesConfig, toc] = await Promise.all([
    fetch(prefix + 'pages.json').then(r => r.json()),
    fetch(prefix + 'toc.json').then(r => r.json())
  ]);

  const isMobile = window.innerWidth < 768;
  const base = pagesConfig.desktopBase
    ? (isMobile ? pagesConfig.mobileBase : pagesConfig.desktopBase)
    : pagesConfig.base;

  const urls = [];
  for (let i = 1; i <= pagesConfig.total; i++) {
    urls.push(`${prefix}${base}${i}.${pagesConfig.ext}`);
  }

  // 페이지 비율 (A4 기준, 책마다 거의 동일)
  const PAGE_RATIO = 906 / 1280;

  // 한 페이지 기준 크기 계산. spread=true면 두 페이지가 나란히 들어가도록 폭을 맞춤
  function computeSize(spread) {
    const stage = document.getElementById('stage');
    const availW = (stage.clientWidth || 960) - 120;
    const availH = (stage.clientHeight || 720) - 20;
    const widthFactor = spread ? 2 : 1;
    let h = Math.max(availH, 200);
    let w = h * PAGE_RATIO;
    if (w * widthFactor > availW) {
      w = Math.max(availW / widthFactor, 150);
      h = w / PAGE_RATIO;
    }
    return { w: Math.floor(w), h: Math.floor(h) };
  }

  let pageFlip = null;

  function buildBook() {
    bookEl.innerHTML = '';
    const spread = !isMobile; // 데스크톱/태블릿은 두 페이지 보기, 모바일은 한 페이지
    const size = computeSize(spread);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // bookEl: 화면에 보이는 실제 크기(클리핑 박스) - 스프레드면 폭 2배
    const boxW = spread ? size.w * 2 : size.w;
    bookEl.style.width = boxW + 'px';
    bookEl.style.height = size.h + 'px';
    bookEl.style.overflow = 'hidden';
    bookEl.style.position = 'relative';

    // inner: dpr배 해상도로 그린 뒤 CSS transform으로 축소 (고해상도 렌더 + 선명한 축소)
    const inner = document.createElement('div');
    inner.style.position = 'absolute';
    inner.style.top = '0';
    inner.style.left = '0';
    inner.style.transformOrigin = 'top left';
    inner.style.transform = `scale(${1 / dpr})`;
    bookEl.appendChild(inner);

    pageFlip = new St.PageFlip(inner, {
      width: Math.round(size.w * dpr),
      height: Math.round(size.h * dpr),
      size: 'fixed',
      showCover: false,
      mobileScrollSupport: true,
      usePortrait: !spread,
      maxShadowOpacity: 0.5
    });
    pageFlip.loadFromImages(urls);
    pageFlip.on('flip', updateIndicator);
    pageFlip.on('init', updateIndicator);
  }

  buildBook();

  function updateIndicator() {
    const idx = pageFlip.getCurrentPageIndex();
    pageIndicator.textContent = `${idx + 1} / ${pagesConfig.total}`;
    highlightActiveToc(idx + 1);
  }

  prevBtn.addEventListener('click', () => pageFlip.flipPrev());
  nextBtn.addEventListener('click', () => pageFlip.flipNext());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') pageFlip.flipPrev();
    if (e.key === 'ArrowRight') pageFlip.flipNext();
  });

  // ---- 목차 (카테고리 + 하위 기업명) ----
  const tocItems = []; // [{el, page}] in page order

  function gotoPage(page) {
    pageFlip.flip(Number(page) - 1);
    closeToc();
  }

  toc.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'tocCategory';

    const catRow = document.createElement('div');
    catRow.className = 'tocCategoryRow';
    catRow.textContent = item.caption;
    catRow.addEventListener('click', () => gotoPage(item.page));
    li.appendChild(catRow);
    tocItems.push({ el: catRow, page: Number(item.page) });

    if (Array.isArray(item.children) && item.children.length) {
      const childUl = document.createElement('ul');
      childUl.className = 'tocChildren';
      item.children.forEach((child) => {
        const cli = document.createElement('li');
        cli.textContent = child.caption;
        cli.addEventListener('click', (e) => {
          e.stopPropagation();
          gotoPage(child.page);
        });
        childUl.appendChild(cli);
        tocItems.push({ el: cli, page: Number(child.page) });
      });
      li.appendChild(childUl);
    }

    tocList.appendChild(li);
  });

  function highlightActiveToc(currentPage) {
    let activeEl = null;
    tocItems.forEach(({ el, page }) => {
      if (currentPage >= page) activeEl = el;
    });
    tocItems.forEach(({ el }) => el.classList.toggle('active', el === activeEl));
  }

  function openToc() { document.body.classList.add('tocOpen'); }
  function closeToc() { document.body.classList.remove('tocOpen'); }

  tocBtn.addEventListener('click', openToc);
  tocCloseBtn.addEventListener('click', closeToc);
  tocOverlay.addEventListener('click', closeToc);

  // ---- 확대/축소 ----
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 0.25;
  let zoomLevel = 1;

  function applyZoom() {
    bookEl.style.transform = `scale(${zoomLevel})`;
    zoomLevelEl.textContent = `${Math.round(zoomLevel * 100)}%`;
    zoomInBtn.disabled = zoomLevel >= ZOOM_MAX;
    zoomOutBtn.disabled = zoomLevel <= ZOOM_MIN;
  }

  zoomInBtn.addEventListener('click', () => {
    zoomLevel = Math.min(ZOOM_MAX, +(zoomLevel + ZOOM_STEP).toFixed(2));
    applyZoom();
  });
  zoomOutBtn.addEventListener('click', () => {
    zoomLevel = Math.max(ZOOM_MIN, +(zoomLevel - ZOOM_STEP).toFixed(2));
    applyZoom();
  });
  applyZoom();

  // ---- 전체화면 ----
  fsBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  });

  // ---- 리사이즈 대응 (간단 버전: 디바운스 후 재생성) ----
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const currentPage = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
      buildBook();
      pageFlip.turnToPage(currentPage);
      zoomLevel = 1;
      applyZoom();
    }, 250);
  });
})();
