# e-book

이미지 기반 플립북 뷰어. PDF를 페이지별 이미지(WebP)로 변환한 뒤, [StPageFlip](https://github.com/Nodlik/StPageFlip)으로 책장 넘기는 UI를 구현한 순수 정적 사이트입니다. 서버/백엔드 없이 HTML/CSS/JS와 이미지 파일만으로 동작합니다.

## 라이브 데모

GitHub Pages로 호스팅 시: `https://<username>.github.io/ebook/`

## 구조

```
index.html          뷰어 페이지
viewer.js            StPageFlip 초기화, 목차, 확대/축소, 반응형 로직
viewer.css            스타일
books/
  <slug>/
    pages.json           페이지 수, 이미지 경로 설정 (데스크톱/모바일 2종 해상도)
    toc.json              목차 (카테고리 + 하위 항목)
    images/
      desktop/1.webp ...     데스크톱용 고해상도
      mobile/1.webp ...      모바일용 저해상도
```

여러 책을 지원하려면 `books/` 아래에 같은 구조로 폴더를 추가하고 `?book=<slug>` 쿼리 파라미터로 접근합니다 (파라미터 없으면 기본값 사용).

## 기능

- 데스크톱: 두 페이지 펼침 보기 / 모바일: 한 페이지 보기 (자동 전환)
- 목차 패널(왼쪽 슬라이드) — 카테고리 + 개별 항목 클릭 시 해당 페이지로 이동
- 확대/축소 (100%~250%)
- 레티나/고해상도 디스플레이 대응 (캔버스 HiDPI 렌더링)
- 전체화면 모드
