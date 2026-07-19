# 데이터 파이프라인

## 목적
유료 리포트 계산에는 검증된 상품 데이터만 사용한다. 자동 수집 원본과 계산용 active catalog를 분리해 잘못된 금리, 깨진 링크, 오래된 조건이 리포트에 들어가지 않도록 한다.

## 현재 MVP 흐름
```text
data/incoming/fss-products.csv
또는 data/incoming/finlife-products.json
또는 data/incoming/naver-products.json
→ scripts/import-fss-products.js 또는 scripts/import-finlife-products.js 또는 scripts/import-naver-products.js
→ data/raw-products.json
→ scripts/review-products.js 운영자 검수
→ src/data/pipeline.js 정규화/검증
→ data/active-products.json
→ src/lib/products.js
→ src/lib/optimizer.js 계산 반영
```

## 파일 역할
- `data/raw-products.json`: 수집 또는 수동 입력된 원본 상품 데이터. 금융사명, 상품명, 금리 문구, 우대조건 문구, 공식 링크를 최대한 원본에 가깝게 보관한다.
- `data/incoming/fss-products.csv`: 일일 수집 feed 샘플. 금융상품 한눈에 CSV/API adapter의 입력 역할을 한다.
- `data/incoming/finlife-products.json`: 금융상품 한눈에 API에서 수집한 예금/적금 원본 변환 결과. `FINLIFE_API_KEY`가 있어야 생성된다.
- `data/incoming/naver-products.json`: 네이버페이 예금/적금/파킹통장 페이지와 상품 목록 응답을 변환한 결과.
- `data/incoming/naver-detail-cache.json`: 네이버 상품 상세 페이지의 `금리 안내` 수집 결과 캐시. 목록 요약이 동일한 상품은 상세 페이지를 다시 읽지 않는다.
- `data/product-change-log.json`: 일일 수집에서 기존 상품의 금리, 한도, 우대조건, 링크가 바뀐 기록.
- `data/active-products.json`: 검증 결과. `active` 상품과 제외된 상품, 제외 사유를 함께 저장한다.
- `src/lib/products.js`: 브라우저 MVP가 import하는 계산용 상품 catalog. 직접 수정하지 말고 `npm run update-products`로 생성한다.
- `src/data/pipeline.js`: 원본 데이터 정규화, 우대조건 태깅, 오래된 데이터 제외, 필수 필드 검증을 담당한다.
- `src/data/adapters/fss-csv.js`: 금융상품 feed CSV를 raw product 형태로 변환한다.
- `src/data/adapters/finlife-api.js`: 금융상품 한눈에 API 응답을 raw product 형태로 변환한다.
- `src/data/adapters/naver-savings.js`: 네이버페이 예금/적금/파킹통장 응답을 raw product 형태로 변환하고 상세 페이지의 `금리 안내` 원문에서 나이, 소득, 첫가입, 급여이체, 주거래 조건을 세분화한다.
- `src/data/importer.js`: 새로 수집한 상품을 기존 raw 데이터와 병합하고 변경 여부를 판단한다.
- `src/data/review.js`: 검수 대상 목록, 승인, 거절 상태 변경을 담당한다.
- `scripts/fetch-finlife-products.js`: `FINLIFE_API_KEY`로 예금/적금 API를 호출하고 incoming JSON을 생성한다.
- `scripts/import-finlife-products.js`: incoming JSON을 raw 상품 데이터와 병합한다.
- `scripts/fetch-naver-products.js`: 네이버페이 예금, 적금, 파킹통장 목록 페이지에서 필터 코드를 읽고 상품 목록 응답을 incoming JSON으로 저장한다.
- `scripts/import-naver-products.js`: 네이버 incoming JSON을 raw 상품 데이터와 병합한다.
- `scripts/review-products.js`: 운영자 CLI. `pending` 상품을 확인하고 승인/거절한 뒤 active catalog를 재생성한다.

## 업데이트 명령
```bash
npm run import-fss
npm run fetch-finlife
npm run import-finlife
npm run daily-finlife-products
npm run fetch-naver
npm run import-naver
npm run daily-naver-products
npm run review-products -- list
npm run review-products -- approve --bank "은행명" --name "상품명" --type deposit --official-url "https://bank.example.com/product" --note "공식 페이지 확인"
npm run review-products -- reject --bank "은행명" --name "상품명" --type installment --reason "공식 링크 확인 실패"
npm run update-products
npm run daily-products
npm test
npm run build
```

`npm run daily-products`는 로컬 CSV feed import와 active catalog 생성을 한 번에 수행한다.
`npm run daily-products`의 기본 소스는 네이버페이 예금/적금/파킹통장이다.
`npm run daily-finlife-products`는 금융상품 한눈에 API 수집, raw 병합, active catalog 생성을 한 번에 수행한다. 이 명령은 `FINLIFE_API_KEY` 환경 변수가 필요하다.
실제 네이버 수집 검증처럼 일부 상품만 확인할 때는 `NAVER_FETCH_LIMIT=2 npm run fetch-naver`처럼 카테고리별 수집 개수를 제한할 수 있다. 이 경우 incoming 파일은 `isPartial: true`로 저장되며, 기본 `import-naver`는 부분 수집 파일을 병합하지 않는다.

## 네이버페이 수집 설정
1. `npm run fetch-naver`로 네이버페이 예금/적금/파킹통장 목록을 수집한다.
2. 목록 요약의 상품 코드, 금리, 한도, 조건 문구를 이전 캐시와 비교한다.
3. 신규 상품, 변경 상품, 캐시에 없는 상품만 상세 페이지에 들어가 `금리 안내` 섹션을 읽는다.
4. 상세에서 읽은 조건 원문은 `rateGuideText`, `detailConditionText`, `detailSections`에 저장한다.
5. 파킹통장처럼 금액별 차등금리가 있는 상품은 `tieredRateRules`에 구간별 금액과 금리를 구조화해 저장한다.
6. `npm run import-naver`로 신규/변경/삭제 상품을 `data/raw-products.json`에 병합한다.
7. `npm run review-products -- list`로 검수 대상을 확인한다.
8. 공식 가입 링크, 나이/소득 조건, 최대한도, 우대조건을 확인한 뒤 승인한다.

주의:
- 네이버 페이지의 공개 HTML은 상품 목록을 직접 포함하지 않고 클라이언트 로딩 구조를 사용한다.
- 현재 확인된 내부 endpoint는 `/productList`, `/productDetails`, `/productInterest`이며, 실제 상품 응답 파라미터와 상세 페이지 URL 형식은 브라우저 네트워크 로그 기준으로 계속 검증해야 한다.
- 수집 데이터는 그대로 계산에 반영하지 않고 반드시 `pending` 검수 상태를 거친다.

## 금융상품 한눈에 수집 설정
1. 금융상품 한눈에 API 인증키를 발급받는다.
2. 실행 환경에 `FINLIFE_API_KEY`를 설정한다.
3. `npm run fetch-finlife`로 `data/incoming/finlife-products.json`을 생성한다.
4. `npm run import-finlife`로 신규/변경 상품을 `data/raw-products.json`에 병합한다.
5. `npm run review-products -- list`로 검수 대상을 확인한다.
6. 공식 은행 상품 페이지를 확인한 뒤 `--official-url`과 함께 승인한다.

## 일일 수집 정책
- 매일 전체 상세를 다시 수집하지 않는다. 목록 요약 signature가 동일하면 기존 `금리 안내` 상세 캐시를 재사용한다.
- 신규 상품은 `reviewStatus: pending`으로 들어오며 계산에 바로 사용하지 않는다.
- 기존 승인 상품이 수집 feed와 동일하면 `approved` 상태를 유지하고 `lastImportedAt`만 갱신한다.
- 기존 승인 상품의 금리, 한도, 우대조건, 상세 `금리 안내`, 공식 링크가 바뀌면 `reviewStatus: pending`으로 되돌리고 `data/product-change-log.json`에 변경 내용을 남긴다.
- 구간별 금리표가 바뀌면 `tieredRateRules` 변경으로 기록하고, 파킹통장 계산은 사용자 배분 금액에 맞는 구간별 실효금리를 사용한다.
- 네이버 목록에서 사라진 네이버 출처 상품은 `availabilityStatus: removed`와 `reviewStatus: pending`으로 표시해 운영자가 제외 여부를 검수한다.
- 운영자가 `npm run review-products -- list`로 변경 내용을 확인한다.
- 승인할 상품은 `npm run review-products -- approve ...`로 `approved` 처리한다. 명령 실행 후 active catalog와 브라우저용 상품 모듈이 자동 재생성된다.
- 거절할 상품은 `npm run review-products -- reject ...`로 `rejected` 처리한다. 거절 상품은 계산에 사용되지 않는다.

## 검증 기준
상품은 아래 조건을 모두 만족해야 계산에 사용된다.

- `reviewStatus`가 `approved`
- 금융사명, 상품명, 상품 유형 존재
- 기본금리와 최고금리 존재
- 최고금리가 기본금리 이상
- 파킹통장이 아닌 상품은 기간 존재
- 공식 가입 링크 존재
- 업데이트 날짜가 오래되지 않음

## 상태
- `active`: 계산 사용 가능
- `needs_review`: 수집은 되었지만 검수 전
- `stale`: 오래된 데이터
- `disabled`: 필수 필드가 깨져 계산 제외

## 다음 확장
- 금융감독원 금융상품 한눈에 API 또는 CSV 수집 adapter 추가
- 은행별 공식 페이지 변경 감지
- 우대조건 파싱 결과 관리자 검수 화면
- 매일 1회 스케줄러 실행
- 금리 변경 diff와 알림 대상 리포트 추출
