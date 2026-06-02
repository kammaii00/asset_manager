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
* **투자일기(`journal`):** 주식시장 이슈·감정·행동을 일기 형식으로 기록(날짜·감정·강도·행동·관련 자산). 로그인 필수, Firestore `users/{uid}/journals` 저장
* **AI 투자 심리 분석:** 투자일기(최대 30개) + 현재 포트폴리오를 Gemini에 전달 → 감정 패턴·행동 일관성·개선 방향 스트리밍 조언(`/api/ai-journal-advisor`)
* **멀티 유저·동기화(진행 방향):** Firestore `users/{uid}/...` 경로 격리, 로그인 시 로컬 `local_*` 자산을 서버로 올리는 `syncWithCloud`, 보안 규칙으로 본인 데이터만 read/write

## 📂 4. 디렉토리 구조 및 역할
AI는 작업 시 아래 구조를 참고하여 파일을 탐색하고 수정해야 합니다.

📦 `web_app/` (Next.js 앱 루트)
 ┣ 📂 `src/app/` # App Router 페이지 및 API
 ┃ ┣ 📜 `layout.js` # 폰트·전역 스타일, `AuthProvider`로 래핑
 ┃ ┣ 📜 `page.js` # 대시보드(메인)
 ┃ ┣ 📂 `entry/` # 자산·거래 입력
 ┃ ┣ 📂 `journal/` # 투자일기 (기록 입력·목록·AI 분석)
 ┃ ┣ 📂 `settings/` # 설정·목표 비중·로그인/백업 UI
 ┃ ┗ 📂 `api/` # Route Handlers (`assets`, `transactions`, `history`, `settings`, `ai-advisor`, `ai-insights`, `ai-journal-advisor`, `journals`, `exchange-rate`, `gold-price` 등)
 ┣ 📂 `src/components/` # `AiAdvisor`, `AiInsights`, `AuthProvider` 등 UI·인증 래퍼
 ┣ 📂 `src/store/` # `useAssetStore.js` — Zustand 전역 상태·persist·인증 헤더·클라우드 동기화 액션
 ┣ 📂 `src/lib/` # `firebase.js`(클라이언트 SDK), `firebase-admin.js`(Admin + `getUserIdFromRequest`)
 ┗ 📜 `firestore.rules` # `users/{userId}` 및 하위 컬렉션에 대한 UID 기반 접근 제어

## 🗺 5. 화면 구성 및 네비게이션
* **대시보드(진입):** 앱 실행 시 바로 메인(대시보드) 표시 → 입력(`entry`), 투자일기(`journal`), 설정(`settings`) 링크
* **입력(`entry`):** 유형별 폼·거래 목록 → 대시보드/투자일기/설정 이동
* **투자일기(`journal`):** 날짜·감정·행동·내용 입력 → 저장(Firestore) → AI 분석 버튼으로 심리 패턴 조언 수신
* **설정:** 유형/목표 비중 저장 → 대시보드 반영

## 🔄 6. 데이터 흐름 및 아키텍처
* **클라이언트 상태:** `useAssetStore`가 자산·거래·히스토리·설정·투자일기 메타 등을 보관하고 `persist`로 로컬에 스냅샷 저장한다.
* **서버·DB:** API 라우트가 `Authorization: Bearer <Firebase ID Token>`을 `firebase-admin`으로 검증한 뒤 **Firebase Admin Firestore(`adminDb`)**로 `users/{uid}/assets`, `users/{uid}/transactions`, `users/{uid}/journals` 등만 읽고 쓴다.
* **투자일기 흐름:** 클라이언트 `addJournal()` → POST `/api/journals` → Firestore 저장. AI 분석 시 `runAiAnalysis()` → POST `/api/ai-journal-advisor`(journals 30개 + assets + exchangeRate) → Gemini SSE 스트리밍 → 클라이언트 실시간 렌더링.
* **로컬 퍼스트 분기:** 스토어는 비로그인 시 `local_*` ID로 자산·거래를 메모리/로컬에만 쌓는 경로를 갖고, 설정에서 Google 로그인 성공 시 `syncWithCloud`로 서버에 올린 뒤 서버 데이터를 다시 불러온다. 투자일기는 로그인 필수.
* **AI:** 클라이언트가 자산 컨텍스트와 함께 `/api/ai-advisor`, `/api/ai-insights`, `/api/ai-journal-advisor`를 호출하고, 서버에서 모델·제한 정책을 적용한다.

## 📝 7. 최근 주요 업데이트 내역
* [2026-05-04]: **투자일기 + AI 심리 분석** 기능 추가 — `journal/page.js` UI, Zustand 스토어에 `journals` CRUD 액션(`fetchJournals`, `addJournal`, `updateJournal`, `deleteJournal`), `/api/journals` CRUD API, `/api/ai-journal-advisor` 신설(투자일기 30개 + 포트폴리오 기반 Gemini 스트리밍 분석). 모든 페이지 헤더 내비게이션에 "투자일기" 링크 추가.
* [2026-04-06]: Cloud Run API 500 — `firebase deploy`는 `package.json` 스크립트를 무시하고 내부적으로 `next build`를 실행하는데, **Next.js 16 기본이 Turbopack**이라 `firebase-admin`이 `firebase-admin-<hash>` 가상 패키지로 외부화되어 Cloud Run에서 `ERR_MODULE_NOT_FOUND`. Firebase CLI는 Next.js 12-15.x만 공식 지원. 대응: **Next.js 16 → 15.5.14 다운그레이드**(Webpack 기본), ESLint 설정도 `FlatCompat`으로 Next.js 15 호환 포맷으로 수정.
* [2026-04-02]: Firebase Hosting(Cloud Run) API 500 — 원인은 **Turbopack 빌드가 `process.env.FIREBASE_*`를 번들에 넣지 않아** Cloud Run 런타임에 값이 비는 것이었음. 대응: `embed-firebase-admin.mjs`로 `firebaseAdminEmbedded.generated.js`에 자격 증명 **상수 삽입**(gitignore·`prebuild`/`predev`/`postinstall`). `firebase-admin`은 모듈형 초기화·`FIREBASE_CONFIG` 무인자 초기화 유지. CI는 워크플로가 `.env.production`에 서비스 계정 JSON을 쓴 뒤 `npm ci`→embed→`next build`.
* [2026-03-30]: API의 Firestore 접근을 클라이언트 SDK에서 **Admin SDK(`adminDb`)**로 전환(보안 규칙상 서버 요청은 인증 컨텍스트가 없어 `users/{uid}` 읽기 실패하던 문제 수정). 클라이언트는 `auth.authStateReady()` 후 ID 토큰을 API에 전달하도록 `getAuthHeaders` 정리.
* [2026-03-28]: Firestore 범용화 — API `assets/[id]`, `transactions/[id]`를 `users/{uid}/...`로 통일, 스케줄 함수 `takeDailySnapshot`을 사용자별 `collectionGroup('assets')` 기준으로 스냅샷 기록. 루트 컬렉션 → `users/{uid}` 이전용 스크립트 `web_app/scripts/migrate-root-to-user.mjs` 및 `npm run migrate:firestore`.
* [2026-03-28]: 최초 진입 시 Google 로그인 게이트 제거, 메인(대시보드) 즉시 표시. 클라우드 연동은 설정 화면의 기존 로그인 흐름 유지.
* [2025-03-19]: Firestore 유저별 격리 규칙(`firestore.rules`) 정비, API에서 Firebase Admin 기반 UID 검증(`firebase-admin.js`), 스토어의 클라우드 동기화·인증 헤더·무료 자산 한도 등 멀티 유저·로컬-클라우드 혼합 흐름 반영.
