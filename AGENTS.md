# 프로젝트: 최적 저축 포트폴리오 서비스

## 기술 스택
- 의존성 없는 정적 HTML/CSS/ESM JavaScript MVP
- Node.js 내장 test runner 기반 테스트
- Node.js 기반 상품 데이터 import/review/update 스크립트
- Python 3 기반 Harness 실행/검증 스크립트
- 향후 실제 결제/API/계정 기능 도입 시 Next.js 15 App Router + TypeScript strict mode로 전환

## 아키텍처 규칙
- CRITICAL: 외부 금융상품 데이터 수집, 보정, API 호출은 Node.js 스크립트, 서버 측 코드 또는 향후 `app/api/` 라우트 핸들러에서만 처리한다.
- CRITICAL: 클라이언트 컴포넌트에서 직접 외부 금융 API, 크롤링 대상, 제휴 링크 생성 API를 호출하지 않는다.
- CRITICAL: 추천 결과에는 계산 기준일, 데이터 업데이트 날짜, 세전/세후 구분, 기본금리/최고금리 구분, 우대조건 적용 여부를 명확히 포함한다.
- CRITICAL: 서비스 문구는 투자 자문처럼 표현하지 않는다. 결과는 사용자가 입력한 조건과 저장성 상품 데이터에 기반한 예상 계산으로 표시한다.
- 현재 MVP 화면 코드는 `src/ui/`, 순수 계산 로직은 `src/lib/`, 데이터 수집/정규화/검수 로직은 `src/data/`, 실행 스크립트는 `scripts/`에 둔다.
- Next.js 전환 후 컴포넌트는 `src/components/`, 타입은 `src/types/`, 외부 API 래퍼는 `src/services/`에 둔다.
- 금융상품 가입 링크는 공식 페이지를 우선 사용하고, 제휴 링크가 있으면 경제적 이해관계를 UI에 표시한다.

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD).
- 커밋 메시지는 conventional commits 형식을 따를 것 (`feat:`, `fix:`, `docs:`, `refactor:`).

## 명령어
현재 MVP 명령:

```bash
npm run dev              # 정적 개발 서버
npm run fetch-finlife    # 금융상품 한눈에 API 수집
npm run fetch-naver      # 네이버페이 예금/적금/파킹통장 수집
npm run import-finlife   # 수집 JSON을 raw 상품 데이터에 병합
npm run import-naver     # 네이버 수집 JSON을 raw 상품 데이터에 병합
npm run import-fss       # 일일 CSV feed 반영
npm run review-products  # 수집/변경 상품 검수
npm run update-products  # active catalog 생성
npm run daily-finlife-products # API 수집 + 병합 + catalog 생성
npm run daily-naver-products # 네이버 수집 + 병합 + catalog 생성
npm run daily-products   # 기본 일일 업데이트: 네이버 기준
npm run build            # 카탈로그 생성 + 테스트
npm run lint             # JS syntax check
npm run test             # Node.js test runner
```

하네스 검증:

```bash
python3 .codex/hooks/stop_validation.py
python3 scripts/execute.py <phase-dir>
python3 scripts/execute.py <phase-dir> --push
```

Next.js 전환 후 사용할 표준 명령:

```bash
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트
```
