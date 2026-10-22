(async function () {
  const stageEl = document.getElementById('stage');
  const bookEl = document.getElementById('book');
  const dragLayer = document.getElementById('dragLayer');
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
  const thumbBtn = document.getElementById('thumbBtn');
  const thumbCloseBtn = document.getElementById('thumbCloseBtn');
  const thumbOverlay = document.getElementById('thumbOverlay');
  const thumbGrid = document.getElementById('thumbGrid');
  const firstBtn = document.getElementById('firstBtn');
  const lastBtn = document.getElementById('lastBtn');
  const moreBtn = document.getElementById('moreBtn');
  const moreMenu = document.getElementById('moreMenu');
  const bookmarkBtn = document.getElementById('bookmarkBtn');
  const soundBtn = document.getElementById('soundBtn');
  const autoplayBtn = document.getElementById('autoplayBtn');

  const params = new URLSearchParams(location.search);
  const book = params.get('book') || 'sme-booklet';
  const prefix = `books/${book}/`;
  const bookKey = book || 'default';

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

  // ---- 썸네일 그리드 (책에서 이미 받은 이미지를 재사용, 추가 다운로드 없음) ----
  const thumbItems = [];
  urls.forEach((url, idx) => {
    const item = document.createElement('div');
    item.className = 'thumbItem';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = url;
    img.alt = String(idx + 1);
    const num = document.createElement('span');
    num.className = 'thumbNum';
    num.textContent = idx + 1;
    item.appendChild(img);
    item.appendChild(num);
    item.addEventListener('click', () => {
      gotoPage(idx + 1);
      closeThumb();
    });
    thumbGrid.appendChild(item);
    thumbItems.push(item);
  });

  function openThumb() { document.body.classList.add('thumbOpen'); }
  function closeThumb() { document.body.classList.remove('thumbOpen'); }
  thumbBtn.addEventListener('click', openThumb);
  thumbCloseBtn.addEventListener('click', closeThumb);
  thumbOverlay.addEventListener('click', closeThumb);

  // 페이지 비율 (A4 기준, 책마다 거의 동일)
  const PAGE_RATIO = 906 / 1280;

  // 확대 범위 (캔버스 해상도 계산에도 쓰이므로 최상단에 선언)
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 0.25;

  // 한 페이지 기준 크기 계산. spread=true면 두 페이지가 나란히 들어가도록 폭을 맞춤
  function computeSize(spread) {
    const stage = document.getElementById('stage');
    // 모바일은 내비 버튼이 이미지 위에 떠있는 형태라 여백을 최소화해서 꽉 차게 표시
    // 세로 여백은 하단 플로팅 툴바/페이지 표시 pill과 겹치지 않도록 확보
    const marginW = isMobile ? 8 : 100;
    const marginH = isMobile ? 100 : 110;
    const availW = (stage.clientWidth || 960) - marginW;
    const availH = (stage.clientHeight || 720) - marginH;
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
    // 확대 버튼으로 최대 ZOOM_MAX배까지 커질 수 있으므로, 캔버스 자체를
    // 그만큼 더 높은 해상도로 그려둬야 확대해도 흐려지지 않는다.
    const renderScale = dpr * ZOOM_MAX;

    // bookEl: 화면에 보이는 실제 크기(클리핑 박스) - 스프레드면 폭 2배
    const boxW = spread ? size.w * 2 : size.w;
    bookEl.style.width = boxW + 'px';
    bookEl.style.height = size.h + 'px';
    bookEl.style.overflow = 'hidden';
    bookEl.style.position = 'relative';

    // inner: renderScale배 해상도로 그린 뒤 CSS transform으로 축소 (고해상도 렌더 + 선명한 축소)
    const inner = document.createElement('div');
    inner.style.position = 'absolute';
    inner.style.top = '0';
    inner.style.left = '0';
    inner.style.transformOrigin = 'top left';
    inner.style.transform = `scale(${1 / renderScale})`;
    bookEl.appendChild(inner);

    pageFlip = new St.PageFlip(inner, {
      width: Math.round(size.w * renderScale),
      height: Math.round(size.h * renderScale),
      size: 'fixed',
      // 1페이지(표지)는 단독으로 보여주고, 그 다음부터 2-3, 4-5... 식으로 짝을
      // 지어야 업체 소개(짝수 시작)가 스프레드 하나에 온전히 들어온다.
      showCover: true,
      mobileScrollSupport: true,
      usePortrait: !spread,
      maxShadowOpacity: 0.5
    });
    pageFlip.loadFromImages(urls);
    pageFlip.on('flip', updateIndicator);
    pageFlip.on('init', updateIndicator);
    pageFlip.on('flip', playFlipSound);
  }

  buildBook();

  function updateIndicator() {
    const idx = pageFlip.getCurrentPageIndex();
    pageIndicator.textContent = `${idx + 1} / ${pagesConfig.total}`;
    highlightActiveToc(idx + 1);
    thumbItems.forEach((el, i) => el.classList.toggle('active', i === idx));
    updateBookmarkBtn(idx + 1);
    firstBtn.disabled = idx === 0;
    lastBtn.disabled = idx === pagesConfig.total - 1;
  }

  prevBtn.addEventListener('click', () => { stopAutoplay(); pageFlip.flipPrev(); });
  nextBtn.addEventListener('click', () => { stopAutoplay(); pageFlip.flipNext(); });
  firstBtn.addEventListener('click', () => { stopAutoplay(); pageFlip.turnToPage(0); });
  lastBtn.addEventListener('click', () => { stopAutoplay(); pageFlip.turnToPage(pagesConfig.total - 1); });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') pageFlip.flipPrev();
    if (e.key === 'ArrowRight') pageFlip.flipNext();
  });

  // ---- 목차 (카테고리 + 하위 기업명) ----
  const tocItems = []; // [{el, page}] in page order

  function gotoPage(page) {
    stopAutoplay();
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
  let zoomLevel = 1;

  function applyZoom() {
    bookEl.style.transform = `scale(${zoomLevel})`;
    zoomInBtn.disabled = zoomLevel >= ZOOM_MAX;
    zoomOutBtn.disabled = zoomLevel <= ZOOM_MIN;
    document.body.classList.toggle('zoomed', zoomLevel > 1);
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

  // ---- 확대 상태에서 드래그로 이동(패닝) ----
  let isPanning = false;
  let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };

  function panTo(clientX, clientY) {
    stageEl.scrollLeft = panStart.scrollLeft - (clientX - panStart.x);
    stageEl.scrollTop = panStart.scrollTop - (clientY - panStart.y);
  }

  dragLayer.addEventListener('mousedown', (e) => {
    isPanning = true;
    dragLayer.classList.add('dragging');
    panStart = { x: e.clientX, y: e.clientY, scrollLeft: stageEl.scrollLeft, scrollTop: stageEl.scrollTop };
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    panTo(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => {
    isPanning = false;
    dragLayer.classList.remove('dragging');
  });

  dragLayer.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    isPanning = true;
    panStart = { x: t.clientX, y: t.clientY, scrollLeft: stageEl.scrollLeft, scrollTop: stageEl.scrollTop };
  }, { passive: true });
  dragLayer.addEventListener('touchmove', (e) => {
    if (!isPanning) return;
    const t = e.touches[0];
    panTo(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', () => { isPanning = false; });

  // ---- 더보기 팝업 ----
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.body.classList.toggle('moreOpen');
  });
  document.addEventListener('click', (e) => {
    if (document.body.classList.contains('moreOpen') &&
        !e.target.closest('#moreMenu') && !e.target.closest('#moreBtn')) {
      document.body.classList.remove('moreOpen');
    }
  });

  // ---- 북마크 (이 브라우저에만 저장됨) ----
  const BOOKMARK_KEY = `ebook_bookmarks_${bookKey}`;
  let bookmarks = new Set();
  try { bookmarks = new Set(JSON.parse(localStorage.getItem(BOOKMARK_KEY) || '[]')); } catch (e) {}

  function saveBookmarks() {
    try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...bookmarks])); } catch (e) {}
  }
  function updateBookmarkBtn(currentPage) {
    bookmarkBtn.classList.toggle('active', bookmarks.has(currentPage));
  }
  bookmarkBtn.addEventListener('click', () => {
    const page = pageFlip.getCurrentPageIndex() + 1;
    if (bookmarks.has(page)) bookmarks.delete(page);
    else bookmarks.add(page);
    saveBookmarks();
    updateBookmarkBtn(page);
    if (thumbItems[page - 1]) thumbItems[page - 1].classList.toggle('bookmarked', bookmarks.has(page));
  });
  thumbItems.forEach((el, i) => { if (bookmarks.has(i + 1)) el.classList.add('bookmarked'); });

  // ---- 소리 (페이지 넘길 때 효과음, 외부 음원 없이 합성) ----
  const SOUND_KEY = `ebook_sound_${bookKey}`;
  let soundOn = localStorage.getItem(SOUND_KEY) === 'on';
  let audioCtx = null;

  function ensureAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function playFlipSound() {
    if (!soundOn) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const dur = 0.18;
      const bufferSize = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(500, now + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      noise.connect(filter).connect(gain).connect(ctx.destination);
      noise.start(now);
      noise.stop(now + dur);
    } catch (e) {}
  }

  function updateSoundBtn() { soundBtn.classList.toggle('active', soundOn); }
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) {}
    updateSoundBtn();
    if (soundOn) { ensureAudioCtx(); playFlipSound(); }
  });
  updateSoundBtn();

  // ---- 자동 넘김 ----
  let autoplayTimer = null;
  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
    autoplayBtn.classList.remove('active');
  }
  function startAutoplay() {
    autoplayTimer = setInterval(() => {
      const idx = pageFlip.getCurrentPageIndex();
      if (idx >= pagesConfig.total - 1) pageFlip.turnToPage(0);
      else pageFlip.flipNext();
    }, 3500);
    autoplayBtn.classList.add('active');
  }
  autoplayBtn.addEventListener('click', () => {
    if (autoplayTimer) stopAutoplay();
    else startAutoplay();
  });
  dragLayer.addEventListener('mousedown', stopAutoplay);

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
