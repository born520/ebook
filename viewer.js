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

  let spreadMode = true;

  const params = new URLSearchParams(location.search);
  // 주소 뒤에 ?book= 이 없으면 기본 책자를 바로 연다 (ebook.shorttime.co.kr 만으로 접속 가능)
  const book = params.get('book') || 'sme-booklet';
  const prefix = book ? `books/${book}/` : '';
  const bookKey = book || 'default';

  const [pagesConfig, toc] = await Promise.all([
    fetch(prefix + 'pages.json', { cache: 'no-cache' }).then(r => r.json()),
    fetch(prefix + 'toc.json', { cache: 'no-cache' }).then(r => r.json())
  ]);

  // 휴대폰 여부는 화면 방향과 관계없이 짧은 변 기준으로 판단한다(이미지 해상도 선택용).
  // 실제 한 페이지/두 페이지 보기는 wantSpread()가 방향에 따라 매번 다시 정한다.
  const isMobile = Math.min(window.innerWidth, window.innerHeight) < 768;
  // 폭이 넓거나(PC/태블릿) 휴대폰을 가로로 눕혔으면 두 페이지 펼침 보기
  function wantSpread() {
    return window.innerWidth >= 768 || window.innerWidth > window.innerHeight;
  }
  // 휴대폰에서는 처음 참고했던 이북처럼 툴바를 숨겨두고 화면을 톡 치면 보이게 한다
  let uiShown = !isMobile;
  document.body.classList.toggle('mobileUi', isMobile);
  document.body.classList.toggle('uiShown', uiShown);
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
    // 휴대폰 가로는 화면 높이가 낮아서 상하 여백을 줄여 페이지를 최대한 크게 보여준다
    const phoneLandscape = isMobile && spread;
    const marginW = isMobile && !spread ? 8 : (phoneLandscape ? 90 : 100);
    // 휴대폰 가로: 툴바가 보일 땐 #stage 아래에 툴바 자리(패딩)를 비우고 그 위에만 책을 놓고,
    // 툴바가 숨겨져 있으면 화면 높이를 거의 다 쓴다
    const marginH = phoneLandscape ? (uiShown ? 100 : 16) : (isMobile ? 100 : 110);
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

  // 확대 중에는 넘김을 일으키는 경로를 전부 막는다: flipNext/flipPrev/flip은
  // 빠른 스와이프가 직접 호출하는 경로, userMove는 손가락을 따라 페이지가
  // 서서히 넘어가는 모습을 그리는 경로다(새어 들어온 터치로 이게 돌면
  // 실제로는 안 넘어가도 애니메이션만 보여서 넘어간 것처럼 착각하게 된다).
  // userStop까지 감싸면 showCover 모드의 표지 전환 애니메이션 내부 로직이
  // 깨지는 부작용이 있어 그건 손대지 않고, 그 경로로 혹시 완료돼버리는
  // 경우는 아래 enforceNoFlipWhileZoomed가 별도로 되돌린다. TOC/썸네일로
  // 직접 이동할 때는 gotoPage()가 먼저 확대를 풀고 호출하므로 영향 없다.
  //
  // [2026-11-06 보완] userMove만 막으면 라이브러리의 isUserMove가 false로 남아,
  // 손을 떼는 순간 userStop()이 그 터치를 "모서리 탭"으로 보고
  // flipController.flip()(클릭 넘김 애니메이션)을 실행한다. 확대한 채 가장자리를
  // 보다 손을 떼면 넘김 애니메이션이 뜨던 원인이다(페이지는 위 안전망이 되돌림).
  // 그래서 확대/핀치 중에는 터치의 시작(startUserTouch)과 끝(userStop)도
  // 라이브러리에 전달하지 않고, 확대가 시작되는 순간 이미 기록된 터치는
  // cancelLibraryTouch()로 지운다. 확대가 아닐 때는 원래 동작 그대로라
  // showCover 표지 전환 등에는 영향이 없다.
  function zoomOrPinch() {
    return zoomLevel > 1 || pinchActive;
  }
  function guardFlipWhileZoomed(pf) {
    ['flipNext', 'flipPrev', 'flip', 'userMove', 'startUserTouch'].forEach((name) => {
      const orig = pf[name];
      if (typeof orig !== 'function') return;
      pf[name] = function (...args) {
        if (zoomOrPinch()) return undefined;
        return orig.apply(pf, args);
      };
    });
    const origStop = pf.userStop;
    if (typeof origStop === 'function') {
      pf.userStop = function (...args) {
        if (zoomOrPinch()) { cancelLibraryTouch(); return undefined; }
        return origStop.apply(pf, args);
      };
    }
  }
  // 라이브러리에 남아 있는 진행 중 터치를 애니메이션 없이 지운다.
  // 확대 전에 이미 페이지를 조금 끌어 접힌 상태였다면 제자리로 되돌린다.
  function cancelLibraryTouch() {
    if (!pageFlip) return;
    if (pageFlip.isUserMove && pageFlip.flipController && typeof pageFlip.flipController.stopMove === 'function') {
      pageFlip.flipController.stopMove();
    }
    pageFlip.isUserTouch = false;
    pageFlip.isUserMove = false;
  }

  // 위 메서드 감싸기로 막을 수 없는 경로(터치/마우스 호환 이벤트가 라이브러리
  // 내부로 새어 들어가 드래그를 서서히 끝까지 끌고 가 완료되는 경우 등)에
  // 대한 최종 안전망. 확대된 상태에서 페이지가 바뀐 걸 감지하면 원래
  // 보고 있던 페이지로 즉시 되돌린다 - 원인이 무엇이든 결과적으로 "확대
  // 중엔 페이지가 안 넘어간다"를 보장한다.
  let lastSafePageIndex = 0;
  function enforceNoFlipWhileZoomed() {
    const idx = pageFlip.getCurrentPageIndex();
    if (zoomLevel > 1 && idx !== lastSafePageIndex) {
      pageFlip.turnToPage(lastSafePageIndex);
      return;
    }
    lastSafePageIndex = idx;
  }

  function buildBook() {
    bookEl.innerHTML = '';
    const spread = wantSpread(); // PC/태블릿/휴대폰 가로는 두 페이지, 휴대폰 세로는 한 페이지
    // 휴대폰 가로는 화면 높이가 낮아 하단 툴바가 페이지를 가리므로, 툴바 위 영역에만 책을 놓는다
    document.body.classList.toggle('phoneLandscape', isMobile && spread);
    document.body.classList.toggle('uiSpace', isMobile && spread && uiShown);
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
      // 휴대폰에서 페이지를 톡 치는 건 툴바 보이기/숨기기용. 넘김은 스와이프나 좌우 화살표로 한다.
      // (주의) disableFlipByClick: true 는 이전 페이지(왼쪽) 넘김까지 막아서 쓰지 않는다.
      //  탭 넘김만 아래에서 따로 막는다.
      disableFlipByClick: false,
      maxShadowOpacity: 0.5
    });
    guardFlipWhileZoomed(pageFlip);
    if (isMobile) {
      // 휴대폰: 화면을 톡 치는 건 툴바용. 손가락이 끌려 움직이지 않은 터치(탭)는
      // 라이브러리의 '탭 → 넘김'으로 보내지 않는다. 스와이프(isUserMove)와
      // 좌우 화살표(flipNext/flipPrev)는 그대로 동작한다.
      const stopWithGuard = pageFlip.userStop;
      pageFlip.userStop = function (...args) {
        if (!pageFlip.isUserMove) { pageFlip.isUserTouch = false; return undefined; }
        return stopWithGuard.apply(pageFlip, args);
      };
    }
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
    // 다른 핸들러보다 먼저 걸어서, 확대 중에 새어 들어온 넘김을 가장
    // 먼저 되돌린 뒤에 나머지(페이지 표시 갱신 등)가 처리되게 한다.
    pageFlip.on('flip', enforceNoFlipWhileZoomed);
    pageFlip.on('init', enforceNoFlipWhileZoomed);
    pageFlip.on('flip', updateIndicator);
    pageFlip.on('init', updateIndicator);
    pageFlip.on('flip', playFlipSound);
    pageFlip.on('flip', syncBookWidth);
    pageFlip.on('init', syncBookWidth);
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
    closeToc();
    // flip()은 확대 중엔 막혀 있으므로(guardFlipWhileZoomed), 목차/썸네일로
    // 직접 이동할 때는 먼저 확대를 풀어준다. 줌 리셋과 flip()을 같은 틱에
    // 바로 이어붙이면 브라우저가 축소 변화를 아직 반영(페인트)하기 전이라
    // 라이브러리가 넘김에 필요한 치수를 잘못 읽어 조용히 실패하므로, 한
    // 프레임 기다렸다가 flip을 호출한다.
    if (zoomLevel > 1) {
      zoomLevel = 1;
      applyZoom();
      requestAnimationFrame(() => pageFlip.flip(Number(page) - 1));
    } else {
      pageFlip.flip(Number(page) - 1);
    }
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
    if (zoomLevel > 1) cancelLibraryTouch();
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

  // ---- 데스크톱: Ctrl(또는 트랙패드 핀치) + 스크롤로 확대/축소 ----
  // 일반 스크롤은 그대로 둬서(확대 중이면 상하 이동, 아니면 아무 효과 없음)
  // Ctrl/Cmd를 누른 상태의 스크롤이나 트랙패드 핀치(브라우저가 ctrlKey:true로
  // 보내줌)일 때만 마우스 커서 위치를 기준으로 확대/축소한다.
  stageEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.002);
    setZoomAroundPoint(zoomLevel * factor, e.clientX, e.clientY);
  }, { passive: false });

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

  // ---- 핀치 줌 (두 손가락으로 확대/축소하면서 원하는 지점으로 이동) ----
  // 확대 전(zoomLevel===1)에도 동작해야 하므로 dragLayer(확대 중에만 보임)가
  // 아니라 항상 존재하는 window에 캡처 단계로 건다. 손가락이 1개일 때는
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

  // StPageFlip은 손가락을 처음 댄 요소(distElement) 기준으로 터치를 계속
  // 추적한다. 핀치를 시작할 때 첫 손가락은 확대되기 전(dragLayer가 아직 안
  // 보이는 상태)에 닿아서 그 요소로 잡혀버리는데, 핀치가 끝난 뒤 그
  // 손가락을 그대로 움직여 패닝해도 터치의 target은 중간에 안 바뀌므로
  // 계속 StPageFlip(window의 전역 touchmove/touchend 리스너)으로 새어
  // 들어가 "드래그해서 페이지 넘기기"로 오인된다 - 확대해서 이동하다가
  // 페이지가 넘어가는 원인. 그래서 핀치/확대 관련 리스너를 전부 stageEl이
  // 아니라 window에 캡처 단계로 걸어서, StPageFlip의 window 리스너보다
  // 먼저 가로채 dragLayer가 처리하는 것만 빼고 나머지는 차단한다.
  function isStrayTouch(e) {
    return (pinchActive || document.body.classList.contains('zoomed')) &&
      e.target !== dragLayer && !dragLayer.contains(e.target);
  }

  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    stopAutoplay();
    isPanning = false;
    pinchActive = true;
    cancelLibraryTouch(); // 첫 손가락이 확대 전에 남긴 라이브러리 터치 기록 제거
    pinchStartDist = touchDist(e.touches);
    pinchStartZoom = zoomLevel;
    bookEl.classList.add('noTransition');
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true, passive: false });

  window.addEventListener('touchmove', (e) => {
    if (pinchActive && e.touches.length >= 2) {
      e.preventDefault();
      e.stopPropagation();
      const dist = touchDist(e.touches);
      const mid = touchMid(e.touches);
      setZoomAroundPoint(pinchStartZoom * (dist / pinchStartDist), mid.x, mid.y);
      return;
    }
    if (isStrayTouch(e)) e.stopPropagation();
  }, { capture: true, passive: false });

  function endPinch(e) {
    if (!pinchActive) return;
    if (e && e.touches && e.touches.length >= 2) return;
    pinchActive = false;
    bookEl.classList.remove('noTransition');
    zoomLevel = +zoomLevel.toFixed(2);
    applyZoom();
  }
  function handleTouchEnd(e) {
    if (isStrayTouch(e)) e.stopPropagation();
    endPinch(e);
  }
  window.addEventListener('touchend', handleTouchEnd, { capture: true });
  window.addEventListener('touchcancel', handleTouchEnd, { capture: true });

  // ---- 휴대폰: 화면을 톡 치면 툴바 보이기/숨기기 ----
  // 손가락이 거의 움직이지 않고 짧게 닿았다 떨어진 경우만 '탭'으로 본다.
  // (스와이프로 넘기기, 두 손가락 핀치, 확대 중 드래그 이동은 탭이 아님)
  if (isMobile) {
    const TAP_IGNORE = '#bottomBar, #pageIndicator, .navArrow, #tocPanel, #thumbPanel, .scrim';
    let tapStart = null;
    let pointersDown = 0;
    window.addEventListener('pointerdown', (e) => {
      pointersDown++;
      tapStart = (pointersDown === 1 && !e.target.closest(TAP_IGNORE))
        ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
    }, true);
    window.addEventListener('pointercancel', () => { pointersDown = Math.max(0, pointersDown - 1); tapStart = null; }, true);
    window.addEventListener('pointerup', (e) => {
      pointersDown = Math.max(0, pointersDown - 1);
      const s = tapStart;
      tapStart = null;
      if (!s || pinchActive) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 10 || Date.now() - s.t > 350) return;
      if (document.body.classList.contains('tocOpen') || document.body.classList.contains('thumbOpen')) return;
      if (document.body.classList.contains('moreOpen')) {
        document.body.classList.remove('moreOpen');
        return;
      }
      setUiShown(!uiShown);
    }, true);
  }

  function setUiShown(show) {
    uiShown = show;
    document.body.classList.toggle('uiShown', show);
    if (!show) document.body.classList.remove('moreOpen');
    // 휴대폰 가로는 툴바 자리만큼 책 크기가 달라지므로 다시 배치한다(확대 중엔 보던 위치 유지를 위해 생략)
    if (document.body.classList.contains('phoneLandscape') && zoomLevel === 1) {
      const currentPage = pageFlip.getCurrentPageIndex();
      buildBook();
      pageFlip.turnToPage(currentPage);
      applyZoom();
    }
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
  function onViewportChange() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const currentPage = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
      // zoomLevel을 먼저 1로 되돌려야, 리빌드 중에 뜨는 flip/init 이벤트에서
      // enforceNoFlipWhileZoomed가 "확대 중에 페이지가 바뀌었다"고 오판해
      // currentPage로 되돌리는 turnToPage를 또 호출하는 혼선이 안 생긴다.
      zoomLevel = 1;
      buildBook();
      pageFlip.turnToPage(currentPage);
      applyZoom();
    }, 250);
  }
  window.addEventListener('resize', onViewportChange);
  // 휴대폰을 돌렸을 때 일부 브라우저는 resize가 늦거나 안 오는 경우가 있어 방향 전환도 함께 받는다
  window.addEventListener('orientationchange', onViewportChange);
  if (screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', onViewportChange);
  }
})();
