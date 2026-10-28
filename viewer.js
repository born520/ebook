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

  // 업체소개 페이지 QR코드 클릭 영역용. applyZoom()이 아직 정의되지 않은
  // 시점에도 안전하게 참조할 수 있도록 여기서 미리 선언해둔다.
  let qrHotspot = null;
  let qrMap = {};
  let spreadMode = true;

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
    spreadMode = spread;
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
    // 현재 페이지가 단독으로 보이는 페이지(표지=1페이지, 짝이 없는 마지막 페이지)인지
    // 직접 계산해서 클리핑 박스 폭을 맞춘다. (캔버스 실측 폭을 되읽어 맞추면
    // 라이브러리의 자체 반응형 판단과 서로 영향을 주고받아 불안정해짐)
    function isSingleIndex(idx) {
      if (!spread) return true; // 모바일은 항상 한 페이지
      if (idx === 0) return true; // 표지
      if (idx === pagesConfig.total - 1 && pagesConfig.total % 2 === 0) return true; // 마지막 홀로 남는 페이지
      return false;
    }
    function syncBookWidth() {
      const idx = pageFlip.getCurrentPageIndex();
      const single = isSingleIndex(idx);
      bookEl.style.width = (single ? size.w : size.w * 2) + 'px';
      // 스프레드 모드에서는 단독 페이지(표지/뒤표지)도 캔버스 내부적으로는
      // 2페이지 폭 그대로 그려진다. 표지(첫 페이지)는 오른쪽 절반에,
      // 뒤표지(마지막 홀로 남는 페이지)는 왼쪽 절반에 실제 내용이 위치하므로
      // 보이는 구간을 내용이 있는 쪽으로 밀어줘야 한다.
      const isLastSingle = idx === pagesConfig.total - 1 && pagesConfig.total % 2 === 0;
      inner.style.left = (spread && single && !isLastSingle ? -size.w : 0) + 'px';
    }

    pageFlip.loadFromImages(urls);
    pageFlip.on('flip', updateIndicator);
    pageFlip.on('init', updateIndicator);
    pageFlip.on('flip', playFlipSound);
    pageFlip.on('flip', syncBookWidth);
    pageFlip.on('init', syncBookWidth);
    pageFlip.on('flip', updateQrHotspot);
    pageFlip.on('init', updateQrHotspot);
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
    updateQrHotspot();
  }

  // 버튼 확대/축소도 핀치와 동일하게 "현재 화면 중앙" 기준으로 확대해서,
  // 가장자리를 보고 있다가 눌러도 보던 위치에서 더/덜 확대되게 한다.
  function stageCenter() {
    const r = stageEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  zoomInBtn.addEventListener('click', () => {
    const c = stageCenter();
    setZoomAroundPoint(zoomLevel + ZOOM_STEP, c.x, c.y);
  });
  zoomOutBtn.addEventListener('click', () => {
    const c = stageCenter();
    setZoomAroundPoint(zoomLevel - ZOOM_STEP, c.x, c.y);
  });
  applyZoom();

  // ---- 확대 상태에서 드래그로 이동(패닝) ----
  let isPanning = false;
  let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };

  function panTo(clientX, clientY) {
    stageEl.scrollLeft = panStart.scrollLeft - (clientX - panStart.x);
    stageEl.scrollTop = panStart.scrollTop - (clientY - panStart.y);
    updateQrHotspot();
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

  // ---- 핀치 줌 (두 손가락으로 확대/축소하면서 원하는 지점으로 이동) ----
  // 확대 전(zoomLevel===1)에도 동작해야 하므로 dragLayer(확대 중에만 보임)가
  // 아니라 항상 존재하는 #stage에 캡처 단계로 건다. 손가락이 1개일 때는
  // 그대로 흘려보내 기존 페이지 넘기기/패닝 동작과 겹치지 않게 한다.
  let pinchActive = false;
  let pinchStartDist = 1;
  let pinchStartZoom = 1;

  function touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy) || 1;
  }
  function touchMid(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  // 핀치 중심점이 화면상 같은 자리에 머물도록, 확대 전/후 bookEl의 실제
  // 렌더링 좌표를 비교해서 스크롤 위치를 보정한다(핀치한 지점 기준 확대).
  function setZoomAroundPoint(newZoom, clientX, clientY) {
    newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
    const before = bookEl.getBoundingClientRect();
    if (!before.width || !before.height) {
      zoomLevel = newZoom;
      applyZoom();
      return;
    }
    const relX = (clientX - before.left) / before.width;
    const relY = (clientY - before.top) / before.height;
    zoomLevel = newZoom;
    applyZoom();
    const after = bookEl.getBoundingClientRect();
    stageEl.scrollLeft += (after.left + relX * after.width) - clientX;
    stageEl.scrollTop += (after.top + relY * after.height) - clientY;
  }

  stageEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    stopAutoplay();
    isPanning = false;
    pinchActive = true;
    pinchStartDist = touchDist(e.touches);
    pinchStartZoom = zoomLevel;
    bookEl.classList.add('noTransition');
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true, passive: false });

  stageEl.addEventListener('touchmove', (e) => {
    if (!pinchActive || e.touches.length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    const dist = touchDist(e.touches);
    const mid = touchMid(e.touches);
    setZoomAroundPoint(pinchStartZoom * (dist / pinchStartDist), mid.x, mid.y);
  }, { capture: true, passive: false });

  function endPinch(e) {
    if (!pinchActive) return;
    if (e && e.touches && e.touches.length >= 2) return;
    pinchActive = false;
    bookEl.classList.remove('noTransition');
    zoomLevel = +zoomLevel.toFixed(2);
    applyZoom();
  }
  stageEl.addEventListener('touchend', endPinch, { capture: true });
  stageEl.addEventListener('touchcancel', endPinch, { capture: true });

  // ---- 업체소개 페이지 QR코드 클릭 -> 홈페이지 링크 열기 ----
  fetch(prefix + 'qrlinks.json')
    .then((r) => (r.ok ? r.json() : {}))
    .then((d) => { qrMap = d || {}; updateQrHotspot(); })
    .catch(() => {});

  qrHotspot = document.createElement('a');
  qrHotspot.id = 'qrHotspot';
  qrHotspot.target = '_blank';
  qrHotspot.rel = 'noopener noreferrer';
  qrHotspot.addEventListener('click', (e) => e.stopPropagation());
  document.body.appendChild(qrHotspot);

  // showCover 짝짓기 규칙과 동일하게, 현재 페이지 인덱스(0-based)로부터
  // 지금 화면에 보이는 페이지 번호(1-based)들을 계산한다.
  function pagesInCurrentSpread(idx0) {
    if (!spreadMode) return [idx0 + 1];
    if (idx0 === 0) return [1];
    if (idx0 === pagesConfig.total - 1 && pagesConfig.total % 2 === 0) return [pagesConfig.total];
    const k = Math.floor((idx0 - 1) / 2);
    return [2 + 2 * k, 3 + 2 * k];
  }

  function updateQrHotspot() {
    if (!qrHotspot || !pageFlip) return;
    const pagesShown = pagesInCurrentSpread(pageFlip.getCurrentPageIndex());
    const qrPage = pagesShown.find((p) => qrMap[p]);
    const data = qrPage ? qrMap[qrPage] : null;
    if (!data) { qrHotspot.style.display = 'none'; return; }

    const rect = bookEl.getBoundingClientRect();
    const slotWidth = rect.width / pagesShown.length;
    const slotLeft = rect.left + pagesShown.indexOf(qrPage) * slotWidth;

    // 정확한 QR 픽셀 영역보다 살짝 여유를 둬서 탭하기 쉽게 한다.
    const padX = data.w * 0.15;
    const padY = data.h * 0.15;
    const x = Math.max(0, data.x - padX);
    const y = Math.max(0, data.y - padY);
    const w = Math.min(1 - x, data.w + padX * 2);
    const h = Math.min(1 - y, data.h + padY * 2);

    qrHotspot.style.display = 'block';
    qrHotspot.style.left = (slotLeft + x * slotWidth) + 'px';
    qrHotspot.style.top = (rect.top + y * rect.height) + 'px';
    qrHotspot.style.width = (w * slotWidth) + 'px';
    qrHotspot.style.height = (h * rect.height) + 'px';
    qrHotspot.href = data.url;
  }

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

  // 실제 종이 넘김은 매끄러운 '쉭' 한번이 아니라, 수십 개의 불규칙한
  // 바스락 알갱이(crinkle grain)가 겹쳐 들리는 질감에 가깝다. 중저역 바탕음
  // 위에 짧은 노이즈 알갱이를 흩뿌리고, 마지막에 종이가 내려앉는 '톡' 소리
  // (저음 쿵 + 고음 탁)를 더해 합성한다. 매번 랜덤화해 기계적 반복감을 줄인다.
  function noiseGrain(ctx, master, startAt, length, peakGain, freqLo, freqHi, attack) {
    const size = Math.max(1, Math.floor(ctx.sampleRate * length));
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = freqLo;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = freqHi;
    const g = ctx.createGain();
    const a = Math.max(0.002, Math.min(attack, length * 0.4));
    g.gain.setValueAtTime(0.0001, startAt);
    g.gain.exponentialRampToValueAtTime(peakGain, startAt + a);
    g.gain.exponentialRampToValueAtTime(0.0001, startAt + length);
    src.connect(hp).connect(lp).connect(g).connect(master);
    src.start(startAt);
    src.stop(startAt + length + 0.01);
  }

  function playFlipSound() {
    if (!soundOn) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const dur = 0.34 + Math.random() * 0.1;

      const master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);

      // 1) 페이지가 넘어가는 동안 깔리는 중저역 바탕음 (서서히 커졌다 잦아듦)
      noiseGrain(ctx, master, now, dur, 0.22, 500, 5000, dur * 0.35);

      // 2) 결을 따라 팔랑이는 불규칙한 바스락 알갱이들
      const grainCount = 10 + Math.floor(Math.random() * 6);
      for (let i = 0; i < grainCount; i++) {
        const tpos = now + dur * (0.05 + 0.75 * (i / grainCount) + (Math.random() - 0.5) * 0.04);
        const glen = 0.012 + Math.random() * 0.02;
        const gpeak = 0.1 + Math.random() * 0.16;
        const loF = 900 + Math.random() * 1200;
        const hiF = loF + 1200 + Math.random() * 1800;
        noiseGrain(ctx, master, Math.max(now, tpos), glen, gpeak, loF, hiF, glen * 0.3);
      }

      // 3) 종이가 내려앉는 순간의 '톡' - 저음 쿵 + 고음 탁을 함께 섞는다
      const tapAt = now + dur * 0.9;
      noiseGrain(ctx, master, tapAt, 0.025, 0.2, 3500, 9000, 0.004);

      const thump = ctx.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(220, tapAt);
      thump.frequency.exponentialRampToValueAtTime(90, tapAt + 0.08);
      const thumpGain = ctx.createGain();
      thumpGain.gain.setValueAtTime(0.0001, tapAt);
      thumpGain.gain.exponentialRampToValueAtTime(0.12, tapAt + 0.006);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, tapAt + 0.09);
      thump.connect(thumpGain).connect(master);
      thump.start(tapAt);
      thump.stop(tapAt + 0.1);
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
