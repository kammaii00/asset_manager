# 자산 관리자 (Asset Manager) 프로젝트 요약

## 💡 1. 프로젝트 개요
* **목적:** 주식·연금·현금·부동산·금·가상화폐·자동차 등 개인 자산을 한 화면에서 입력·집계하고, 차트·목표 비중·AI 조언으로 포트폴리오를 점검한다.
* **주요 타겟:** 개인 투자자 및 가계 자산을 직접 관리하려는 사용자(첫 화면부터 대시보드 진입, 설정에서 선택적 Google 연동).

## 🛠 2. 기술 스택
* **Frontend:** Next.js 15.x(App Router), React 19, Tailwind CSS 4, Lucide React, Recharts
* **Backend:** Next.js Route Handlers(`app/api/*`), Firebase(Firestore, Auth), Firebase Admin(서버 토큰 검증)
* **기타 도구:** Zustand(+ persist: 브라우저 로컬 저장), Yahoo Finance 2(시세), `@google/genai`(AI 어드바이저·인사이트), 환율/금 시세 전용 API 라우트

## ✨ 3. 핵심 기능 목록
* **대시보드(`/`):** 자산 유형별 집계, 원·달러 드릴다운, 일/월 히스토리 차트, 대시보드 포함 여부·요약
* **입력·거래(`entry`):** 유형별 자산 추가·거래(매수/매도 등) 관리, 무료 플랜 시 자산 개수 상한 안내
* **설정(`settings`):** 대시보드에 쓸 자산 유형 on/off, 목표 자산 비중·목표 총액, 클라우드 연동(로그인) UI
* **시세·환율:** 서버 API에서 주식/코인 등 시세 보강, 환율·금 시세 캐시 활용
* **AI 어드바이저 / AI 인사이트:** 자산·목표 맥락 기반 질의/요약(비용·정책은 API 라우트에서 제어 가능)
* **투자일기(`journal`) — Phase 2:** **평일(월~금)** 오전 7시(KST) Cloud Function이 구글 검색 기반 Gemini로 국내외 증시 뉴스를 정리해 **공용** 컬렉션 `market_briefings/{YYYY-MM-DD}`에 1건 저장하고, 화면은 이 시황과 내 기록(`users/{uid}/journals/{YYYY-MM-DD}.userNote`)을 날짜로 합쳐 타임라인으로 보여준다. 로그인 필수, 과거 날짜에도 기록 가능. AI 호출이 유저 수와 무관하게 하루 1회라 비용이 고정되고, 화면은 Firestore 읽기만 하므로 즉시 표시된다.
* **멀티 유저·동기화(진행 방향):** Firestore `users/{uid}/...` 경로 격리, 로그인 시 로컬 `local_*` 자산을 서버로 올리는 `syncWithCloud`, 보안 규칙으로 본인 데이터만 read/write

## 📂 4. 디렉토리 구조 및 역할
AI는 작업 시 아래 구조를 참고하여 파일을 탐색하고 수정해야 합니다.

📦 `web_app/` (Next.js 앱 루트)
 ┣ 📂 `src/app/` # App Router 페이지 및 API
 ┃ ┣ 📜 `layout.js` # 폰트·전역 스타일, `AuthProvider`로 래핑, `lang="ko"`·번역 차단 설정
 ┃ ┣ 📜 `error.js` # 페이지 렌더링 오류 시 실제 메시지 + "다시 시도" 복구 화면
 ┃ ┣ 📜 `global-error.js` # 루트 레이아웃까지 무너질 때의 최종 방어막
 ┃ ┣ 📜 `page.js` # 대시보드(메인)
 ┃ ┣ 📂 `entry/` # 자산·거래 입력
 ┃ ┣ 📂 `journal/` # 투자일기 (날짜별 타임라인: 공용 시황 + 내 기록)
 ┃ ┣ 📂 `settings/` # 설정·목표 비중·로그인/백업 UI
 ┃ ┗ 📂 `api/` # Route Handlers (`assets`, `transactions`, `history`, `settings`, `ai-advisor`, `ai-insights`, `journal`, `exchange-rate`, `gold-price` 등)
 ┣ 📂 `src/components/` # `AppNav`(공용 헤더 `AppHeader` + 모바일 하단 탭바 `MobileTabBar`), `AiAdvisor`, `AiInsights`, `AuthProvider`, `JournalBriefing`(시황 블록), `JournalNoteEditor`(기록 작성·수정) 등
 ┣ 📂 `functions/` # Cloud Functions — `index.js`(일일 자산 스냅샷), `briefing.js`(매일 07시 증시 브리핑 생성)
 ┣ 📂 `src/store/` # `useAssetStore.js` — Zustand 전역 상태·persist·인증 헤더·클라우드 동기화 액션
 ┣ 📂 `src/lib/` # `firebase.js`(클라이언트 SDK), `firebase-admin.js`(Admin + `getUserIdFromRequest`)
 ┗ 📜 `firestore.rules` # `users/{userId}` 및 하위 컬렉션에 대한 UID 기반 접근 제어

## 🗺 5. 화면 구성 및 네비게이션
* **공통 네비게이션:** 모든 화면이 `AppNav.js`를 공유한다. 데스크탑(md 이상)은 상단 헤더의 텍스트 메뉴, 모바일(md 미만)은 화면 하단 고정 탭바(대시보드·자산입력·투자일기·설정 4개)로 이동하며, 현재 위치는 `usePathname()`으로 자동 강조된다.
* **대시보드(진입):** 앱 실행 시 바로 메인(대시보드) 표시 → 입력(`entry`), 투자일기(`journal`), 설정(`settings`) 링크
* **입력(`entry`):** 유형별 폼·거래 목록 → 대시보드/투자일기/설정 이동
* **투자일기(`journal`):** 날짜별 타임라인 — 각 날짜에 그날의 시황(요약 + 접었다 펴는 국내·해외 뉴스·출처)과 내 기록을 함께 표시. 기록이 없는 날은 "이 날의 기록 남기기" 버튼으로 과거 날짜에도 작성 가능. 비로그인 시 로그인 게이트.
* **설정:** 유형/목표 비중 저장 → 대시보드 반영

## 🔄 6. 데이터 흐름 및 아키텍처
* **클라이언트 상태:** `useAssetStore`가 자산·거래·히스토리·설정·투자일기 메타 등을 보관하고 `persist`로 로컬에 스냅샷 저장한다.
* **서버·DB:** API 라우트가 `Authorization: Bearer <Firebase ID Token>`을 `firebase-admin`으로 검증한 뒤 **Firebase Admin Firestore(`adminDb`)**로 `users/{uid}/assets`, `users/{uid}/transactions`, `users/{uid}/journals` 등만 읽고 쓴다.
* **투자일기 흐름:** ① 생성 — 평일 07:00(KST, `0 7 * * 1-5`) `generateDailyBriefing`(Cloud Function)이 야후에서 지수 5종(코스피·코스닥·나스닥·S&P500·원달러)과 **VIX**를 읽고, 구글 검색을 붙인 Gemini(`gemini-3.6-flash`, `tools: [{googleSearch:{}}]`)로 국내외 뉴스를 JSON(`headline`/`summary`/`domestic`/`overseas`/`watch`)으로 받아 `market_briefings/{date}`에 저장. **시장 온도(`sentiment`)는 모델이 아니라 VIX 실측값으로 코드가 판정**한다(15 미만 안정 / 20 미만 보통 / 30 미만 경계 / 그 이상 공포) — 매일 기준이 동일하고 환각 여지가 없으며, 감정 태그와 대조하면 "시장 온도 × 내 감정" 백데이터가 된다. 07시는 미국 정규장 마감(최대 06:00 KST) 직후이자 국내 개장 전이라 전일 종가가 모두 확정된 시점. 토·일요일은 국내·미국 모두 휴장이라 지수가 금요일 종가 그대로여서 실행하지 않고, 금요일 미국장 결과와 주말 뉴스는 **월요일 브리핑이 `resolveNewsWindow()`로 검색 구간을 "금요일 장 마감 이후"로 넓혀** 함께 다룬다. ② 조회 — `fetchJournals()` → GET `/api/journal`이 `market_briefings`와 `users/{uid}/journals`를 각각 읽어 **날짜를 키로 병합**해 한 번에 반환. ③ 기록 — `saveJournalNote()` → POST `/api/journal`로 `users/{uid}/journals/{date}.userNote` 병합 저장.
* **공용 시황 접근:** `market_briefings`는 유저 공용이지만 클라이언트가 직접 읽지 않고 API 라우트가 Admin SDK로만 접근하므로 `firestore.rules`의 기본 차단(whitelisting)을 그대로 둔다.
* **로컬 퍼스트 분기:** 스토어는 비로그인 시 `local_*` ID로 자산·거래를 메모리/로컬에만 쌓는 경로를 갖고, 설정에서 Google 로그인 성공 시 `syncWithCloud`로 서버에 올린 뒤 서버 데이터를 다시 불러온다. 투자일기는 로그인 필수.
* **AI:** 클라이언트가 자산 컨텍스트와 함께 `/api/ai-advisor`, `/api/ai-insights`를 호출하고, 투자일기는 `/api/journal/today`가 시황 요약을 생성한다. 서버에서 모델·제한 정책을 적용한다.

## 📝 7. 최근 주요 업데이트 내역
* [2026-08-03]: **일일 시황 생성을 매일 → 평일(월~금)로 축소.** 07시 브리핑은 "직전에 마감된 시장"을 정리하는데, 토요일 07시는 금요일 미국장(토 06:00 KST 마감) 종가를 담아 의미가 있지만 **일요일 07시는 토요일이 전 시장 휴장이라 토요일 브리핑과 지수·데이터가 완전히 동일**했다. 사용자 선택으로 토요일까지 빼고 `schedule: "0 7 * * 1-5"`로 변경(Gemini 호출 연 104회 감소). 대신 월요일 브리핑이 금요일 장 마감 이후를 모두 커버해야 하므로 `resolveNewsWindow(weekday)`를 추가해 **월요일에는 검색 구간을 "지난 금요일 장 마감 이후 주말 동안"으로, 그 외 요일은 기존 "최근 24시간"으로** 프롬프트를 분기했다(기존 "이틀 이상 지난 뉴스 제외" 규칙을 그대로 두면 월요일에 금요일 미국장 결과가 통째로 빠진다). 프롬프트에 요일도 함께 알려준다. 공휴일은 한쪽 시장만 쉬는 경우가 대부분이라 요일 규칙만 적용하고 별도 처리하지 않는다. **부작용:** 타임라인은 시황·기록이 있는 날짜만 줄을 만들므로 지난 주말 날짜에는 소급 기록이 불가하다(오늘이 주말이면 오늘 줄은 항상 표시).
* [2026-08-03]: **모바일에서 '자산 입력'·'투자일기' 메뉴가 사라지던 문제 해결 + 네비게이션 공용화.** 4개 화면 헤더에 똑같이 복사돼 있던 `<nav className="hidden md:flex">`가 768px 미만에서 통째로 숨겨지는데 대체 메뉴가 없어, 모바일에서는 설정 아이콘 외에 다른 화면으로 갈 방법이 없었다. 헤더를 `src/components/AppNav.js`의 `AppHeader`로 단일화하고(현재 위치 강조는 `usePathname()`으로 자동 판정), md 미만에서만 뜨는 하단 고정 탭바 `MobileTabBar`(대시보드·자산입력·투자일기·설정)를 추가했다. 탭바에 가리지 않도록 각 `<main>`에 하단 여백(`pb-24 md:pb-8` 등)을 주고, 설정 화면의 기존 하단 고정 저장 바는 모바일에서 `bottom-[calc(4rem+env(safe-area-inset-bottom))]`로 탭바 위에 얹어 겹침·iOS 홈 인디케이터를 함께 처리했다.
* [2026-07-31]: **투자일기 시황 템플릿 정형화.** 평평하게 나열되던 시황을 `headline`(한 줄 제목) → 시장 온도 + 지수 → `summary`(2~3문장) → 접히는 상세(`domestic`/`overseas`를 **사실 `title` + 해석 `detail` 2단**으로, `watch`는 7일 이내 예정 일정) 구조로 재편. 작업 중 실측으로 확인한 3가지: ① **야후의 `regularMarketChangePercent`는 종목에 따라 값이 깨진다** — `^VIX`가 `change`를 전일종가와 같은 값으로 내려 -54.73%(실제 -17.28%)가 나왔다. 이후 등락률은 `resolveChangePercent()`로 **전일종가에서 직접 계산**한다. ② **`responseMimeType: 'application/json'`은 구글 검색 도구와 함께 쓰면 응답이 빈 문자열로 온다**(오류 없이 조용히 실패) — 구조화 출력 강제 대신 프롬프트 + 방어적 파싱을 유지한다. ③ 프롬프트 형식 예시에 `"..."` 플레이스홀더를 넣으면 **모델이 말줄임표를 그대로 출력해 JSON이 깨진다** — 예시는 항목 하나만 적고 개수는 규칙 문장으로 지정한다.
* [2026-07-31]: **투자일기 Phase 2 — 개인화 지연 생성 시황 → 공용 일일 브리핑 전환.** 접속할 때마다 유저별로 시황을 만들던 `/api/journal/today`(213줄)를 삭제하고, 매일 07:00(KST) Cloud Function `generateDailyBriefing`이 **구글 검색 연동 Gemini**로 국내외 증시 뉴스를 정리해 공용 `market_briefings/{date}` 1건만 생성하도록 변경. AI 호출이 유저 수와 무관하게 하루 1회로 고정되고, 화면은 Firestore 읽기만 해 즉시 뜨며, 장중/종가 판별(`finalized`)·30분 캐시·강제 리프레시 로직이 전부 사라졌다. 화면은 상단 시황 카드 + 하단 기록 목록 구조에서 **날짜별 타임라인**(각 날짜 = 시황 + 내 기록)으로 재구성했고, 과거 날짜에도 기록을 남길 수 있다. 실행 시각을 자정이 아닌 07시로 잡은 이유는 **자정에는 미국 정규장이 진행 중**(22:30~05:00 KST)이라 전일 미국 종가가 확정되지 않기 때문. 모델은 `gemini-2.5-flash`가 신규 사용 차단(404)되어 `gemini-3.6-flash` 사용. 기존 유저 문서의 `aiContext`(구버전 개인 시황)는 삭제하지 않고 화면에서만 숨긴다.
* [2026-07-29]: **모바일(안드로이드 크롬) 접속 시 대시보드가 뜬 직후 죽던 문제 해결.** 원인은 **크롬 자동 번역**이었다 — `layout.js`가 `<html lang="en">`으로 선언돼 있어 크롬이 "한국어 내용의 영어 페이지"로 판단해 자동 번역을 걸었고, 번역기가 텍스트 노드를 `<font>`로 감싸면서 React가 기억하던 DOM 참조가 깨져 `insertBefore ... not a child of this node`로 화면 전체가 붕괴했다. 데이터가 들어와 리렌더가 잦아지는 **로그인 직후**에 특히 잘 터졌고, 자동 번역이 소극적인 데스크탑에서는 재현되지 않았다. 대응: `lang="ko"`로 정정 + `translate="no"`·`notranslate` 클래스·`<meta name="google" content="notranslate">`로 번역 차단. 더불어 `error.js`/`global-error.js`를 추가해, 앞으로 클라이언트 오류가 나도 Next.js 기본 문구 대신 **실제 에러 메시지와 "다시 시도" 버튼**이 표시되도록 했다(원인 추적 불가 문제 해소).
* [2026-07-10]: **GitHub Actions 자동 배포 복구**(2026-04-02부터 계속 실패, 그동안 배포는 수동으로 이뤄짐). 원인은 시크릿 하나(`FIREBASE_SERVICE_ACCOUNT_ASSET_MASTER_JWPARK`)를 **배포 인증**과 **앱 Admin SDK** 두 용도로 공유한 것 — 앱용 키(`firebase-adminsdk` SA)로 덮어쓴 뒤부터 `cloudfunctions` 권한이 없어 webframeworks의 SSR 함수 배포가 403(`Failed to list functions`)으로 실패했다. GCP에서 `github-action` SA에 권한을 추가해도 소용없던 이유는 CI가 그 SA로 인증하지 않았기 때문. 대응: **배포 인증 = `github-action` SA 키**, **앱 Admin SDK = 신규 시크릿 `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON`**으로 분리. 또한 서비스 계정 JSON을 `.env.production`에 그대로 쓰면 내부의 큰따옴표·개행 때문에 dotenv가 값을 잘라먹어 파싱이 깨지므로 **base64로 전달**(`FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`)하도록 `embed-firebase-admin.mjs` 수정.
* [2026-07-09]: **투자일기 Phase 1** 신규 구축 — `journal/page.js`(오늘의 AI 시황 카드 + 감정 태그·자유 메모 + 지난 기록), `/api/journal/today`(보유 종목 기준 시황·뉴스 지연 생성, 하루 1회 캐시), `/api/journal`(목록 GET·메모 POST), 스토어에 `fetchTodayJournal`/`fetchJournals`/`saveJournalNote` 추가, 헤더 "투자일기" 링크 활성화. Firestore `users/{uid}/journals/{YYYY-MM-DD}`에 `aiContext`(객관·source=ai_auto)와 `userNote`(주관·source=user)를 분리 저장해 향후 AI 자산관리 조언 백데이터로 활용.
* [2026-04-06]: Cloud Run API 500 — `firebase deploy`는 `package.json` 스크립트를 무시하고 내부적으로 `next build`를 실행하는데, **Next.js 16 기본이 Turbopack**이라 `firebase-admin`이 `firebase-admin-<hash>` 가상 패키지로 외부화되어 Cloud Run에서 `ERR_MODULE_NOT_FOUND`. Firebase CLI는 Next.js 12-15.x만 공식 지원. 대응: **Next.js 16 → 15.5.14 다운그레이드**(Webpack 기본), ESLint 설정도 `FlatCompat`으로 Next.js 15 호환 포맷으로 수정.
* [2026-04-02]: Firebase Hosting(Cloud Run) API 500 — 원인은 **Turbopack 빌드가 `process.env.FIREBASE_*`를 번들에 넣지 않아** Cloud Run 런타임에 값이 비는 것이었음. 대응: `embed-firebase-admin.mjs`로 `firebaseAdminEmbedded.generated.js`에 자격 증명 **상수 삽입**(gitignore·`prebuild`/`predev`/`postinstall`). `firebase-admin`은 모듈형 초기화·`FIREBASE_CONFIG` 무인자 초기화 유지. CI는 워크플로가 `.env.production`에 서비스 계정 JSON을 쓴 뒤 `npm ci`→embed→`next build`.
* [2026-03-30]: API의 Firestore 접근을 클라이언트 SDK에서 **Admin SDK(`adminDb`)**로 전환(보안 규칙상 서버 요청은 인증 컨텍스트가 없어 `users/{uid}` 읽기 실패하던 문제 수정). 클라이언트는 `auth.authStateReady()` 후 ID 토큰을 API에 전달하도록 `getAuthHeaders` 정리.
* [2026-03-28]: Firestore 범용화 — API `assets/[id]`, `transactions/[id]`를 `users/{uid}/...`로 통일, 스케줄 함수 `takeDailySnapshot`을 사용자별 `collectionGroup('assets')` 기준으로 스냅샷 기록. 루트 컬렉션 → `users/{uid}` 이전용 스크립트 `web_app/scripts/migrate-root-to-user.mjs` 및 `npm run migrate:firestore`.
* [2026-03-28]: 최초 진입 시 Google 로그인 게이트 제거, 메인(대시보드) 즉시 표시. 클라우드 연동은 설정 화면의 기존 로그인 흐름 유지.
* [2025-03-19]: Firestore 유저별 격리 규칙(`firestore.rules`) 정비, API에서 Firebase Admin 기반 UID 검증(`firebase-admin.js`), 스토어의 클라우드 동기화·인증 헤더·무료 자산 한도 등 멀티 유저·로컬-클라우드 혼합 흐름 반영.
