# 아키텍처

## 디렉토리 구조
```text
src/
├── ui/                # 현재 모바일 MVP 화면 코드
├── data/              # 상품 데이터 수집 adapter, 병합, 검수, 정규화
├── server/            # 결제 사용권, 리포트 접근제어 순수 로직
└── lib/               # 순수 계산 로직 + 브라우저용 상품 catalog

data/                 # raw, incoming, active 상품 데이터
docs/                 # 제품, 아키텍처, UI, ADR 문서
server/               # 로컬/운영 Node HTTP 서버
scripts/              # Harness 실행기와 테스트
.codex/hooks/         # Codex 훅 스크립트
.codex/skills/        # Harness 전용 Codex 스킬
phases/               # Harness phase와 step 파일
```

## 패턴
- 현재 MVP는 의존성 없는 HTML/CSS/ESM JavaScript와 Node HTTP 서버로 제공한다.
- 입력 상호작용, 필터, 결과 탭은 `src/ui/app.js`에서 관리한다.
- 금융 계산은 UI에서 직접 구현하지 않고 `src/lib/`의 순수 함수로 둔다.
- 외부 상품 데이터 연동, 병합, 검수는 `src/data/`와 `scripts/`의 Node.js 코드에서만 수행한다.
- 유료 상세 리포트 생성은 `server/app-server.js`의 `/api/checkout`, `/api/reports`, `/api/reports/recalculate`를 통해서만 처리한다.
- 1회 결제 사용권은 결제 당시 입력 조건 해시에 묶이며, 상품 제외 재계산만 같은 리포트 범위 안에서 허용한다.
- 실제 계정/결제/API가 붙으면 Next.js App Router로 전환하고, 외부 API 래퍼는 `src/services/`, 라우트는 `src/app/api/`에 둔다.

## 데이터 흐름
```text
사용자 입력
→ 모바일 UI에서 입력 상태 관리
→ src/lib/products.js의 active 상품 catalog 조회
→ lib의 세후 이자/배분 계산
→ UI에서 배분안, 계산 가정, 가입 링크 표시
```

유료 리포트 흐름:

```text
사용자 조건 입력
→ /api/checkout에서 결제 주문/사용권 생성
→ PG 승인 확인 후 사용권 paid 상태
→ /api/reports에서 결제 당시 입력 조건 해시 검증
→ 서버에서 상세 리포트 생성 및 사용권 소비
→ /api/reports/recalculate에서 같은 입력 조건 + 제외 상품만 재계산
```

상품 데이터 흐름:

```text
네이버페이 예금/적금/파킹 목록
→ 목록 summary signature 비교
→ 신규/변경/캐시 없음 상품만 상세 `금리 안내` 수집
→ data/incoming/naver-products.json + data/incoming/naver-detail-cache.json
→ scripts/import-naver-products.js
→ data/raw-products.json
→ scripts/review-products.js
→ scripts/update-products.js
→ data/active-products.json
→ src/lib/products.js
```

## 상태 관리
- 상품 데이터는 검수된 active catalog만 브라우저에 번들한다.
- 클라이언트 상태는 폼 입력, 선택 탭, localStorage의 결제 리포트 재열람 토큰 범위로 제한한다.
- 결제 접근 토큰 원장은 `data/runtime/`에 저장하며 배포/소스 관리 대상에서 제외한다.
- 민감 정보, PG secret, 외부 API 키는 브라우저 코드에 두지 않는다.

## 데이터 품질
- 상품 데이터에는 `sourceUrl`, `updatedAt`, `rateGuideText`, `detailConditionText`, `eligibility`, `availabilityStatus`를 포함한다.
- 계산 결과에는 사용한 세율, 우대조건 적용 여부, 만기 전 인출 가정, 예금자보호 분산 여부를 포함한다.
- 데이터가 오래되었거나 필수 필드가 비어 있으면 추천 결과에서 해당 상품을 제외하거나 경고 상태로 표시한다.
