# UI 디자인 가이드

## 디자인 원칙
1. 금융 도구처럼 보여야 한다. 마케팅 페이지보다 계산, 비교, 근거 확인을 우선한다.
2. 사용자가 금리, 한도, 세후 이자, 우대조건을 빠르게 스캔할 수 있어야 한다.
3. 추천 결과는 단정적인 자문처럼 보이지 않고, 입력값과 데이터 기준에 따른 예상 계산으로 보여야 한다.

## AI 슬롭 안티패턴 - 하지 마라
| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text | AI가 만든 SaaS 랜딩의 흔한 특징 |
| "Powered by AI" 배지 | 기능이 아니라 장식 |
| box-shadow 글로우 애니메이션 | 금융 도구의 신뢰감을 해친다 |
| 보라/인디고 중심 브랜드 색상 | "AI 서비스" 클리셰로 보인다 |
| 모든 카드에 동일한 rounded-2xl | 템플릿 느낌이 강하다 |
| 배경 gradient orb | 계산 도구의 정보 밀도를 떨어뜨린다 |

## 색상
### 배경
| 용도 | 값 |
|------|------|
| 페이지 | `#f7f8f5` |
| 표면 | `#ffffff` |
| 강조 표면 | `#eef5f0` |

### 텍스트
| 용도 | 값 |
|------|------|
| 주 텍스트 | `#17201a` |
| 본문 | `#3f4a43` |
| 보조 | `#6c776f` |
| 비활성 | `#9aa39d` |

### 데이터/시맨틱 색상
| 용도 | 값 |
|------|------|
| 긍정/추가 이익 | `#157347` |
| 주의/데이터 오래됨 | `#b7791f` |
| 에러/불가 | `#c2413a` |
| 중립/기본 | `#6b7280` |
| 정보/링크 | `#2563eb` |

## 컴포넌트
### 카드
```text
rounded-lg bg-white border border-[#dfe5dd] p-4
```

### 버튼
```text
Primary: rounded-md bg-[#17201a] text-white hover:bg-[#28352c]
Secondary: rounded-md border border-[#cbd5cf] text-[#17201a] hover:bg-[#eef5f0]
Text: text-[#2563eb] hover:text-[#1d4ed8]
```

### 입력 필드
```text
rounded-md bg-white border border-[#cbd5cf] px-3 py-2 text-[#17201a]
```

### 표
```text
text-sm border-collapse, 헤더는 bg-[#eef5f0], 숫자는 우측 정렬
```

## 레이아웃
- 전체 너비: `max-w-6xl`
- 정렬: 좌측 정렬 기본
- 간격: 입력 폼은 `gap-3`, 결과와 표는 `gap-4`, 주요 섹션 간 `space-y-6`
- 첫 화면은 입력 폼과 결과 요약이 함께 보이는 계산기 레이아웃으로 구성한다.
- 반복 상품 카드는 8px 이하의 모서리 반경을 사용하고, 카드 안에 또 다른 카드를 넣지 않는다.

## 타이포그래피
| 용도 | 스타일 |
|------|--------|
| 페이지 제목 | `text-3xl font-semibold text-[#17201a]` |
| 섹션 제목 | `text-lg font-semibold text-[#17201a]` |
| 카드 제목 | `text-sm font-medium text-[#3f4a43]` |
| 본문 | `text-sm text-[#3f4a43] leading-relaxed` |
| 보조 정보 | `text-xs text-[#6c776f]` |

## 애니메이션
- 허용: 입력 변경 후 결과 갱신 시 짧은 fade-in 0.2s
- 금지: 반복되는 글로우, 과한 카운터 애니메이션, 배경 장식 애니메이션

## 아이콘
- `lucide-react`를 사용할 수 있으면 버튼과 상태 표시에 우선 사용한다.
- 아이콘은 기능을 보조해야 하며, 둥근 장식 박스 안에 반복적으로 감싸지 않는다.
