# 접속 횟수 그래프 V3 · 프론트엔드 인계 전 설계

## 요구사항

- 기준일: **2026-11-05 (Asia/Seoul)**. 최초 비교군 5명은 `visit_participants.cohort = 1`.
- 이후 초대한 이용자는 `cohort >= 2`로 등록하며 최초 5명 집단은 바꾸지 않는다.
- 핵심 지표는 **기존 5명의 누적 방문 횟수**와 **전체 참여자의 누적 방문 횟수**.
- 동시 접속자 수, 로그인 지속률, 5명 중 N명이 접속한 비율과 다르다.
- 실제 접속은 동일 브라우저 새로고침과 과도한 재호출을 줄이기 위해 **마지막 기록 호출 후 30분 이상** 경과할 때만 재방문으로 인정한다.
- 화면에서 `recordVisit()`을 호출하기 전의 과거 접속은 복원 불가. 기존 일일 방문 행은 1회로 보존.

## DB 변경

- `visit_participants`: 기존 그대로 (`member_id`, `cohort`, `included_from`, `included_until`).
- `daily_visits`: `(member_id, visit_date)` 기존 기본키 유지.
  - `visit_count integer not null default 1` 추가.
  - `last_seen_at timestamptz not null` 추가. 기존 행은 `first_seen_at`으로 백필.
- `private.record_visit_atomic()` 내부 함수로 서버 시간 기준 30분 간격을 원자적으로 계산.
- 공개 `record_visit()`은 기존 반환 boolean·호출 형식을 그대로 유지하고 내부 함수를 호출.
- 기존 `get_visit_trend()`(접속률)는 유지, 신규 `get_visit_counts(p_days)`(접속 횟수) 추가.
- DB 테이블의 직접 INSERT/SELECT/UPDATE/DELETE 권한은 `anon`, `authenticated`에게 부여하지 않는다. 승인 회원 본인에 대한 기록만 제한된 함수에서 처리한다.
- 관리자도 방문기록 정보를 필요 이상 보관하지 않고, 기본 통계 페이지는 개인별 로그를 표시하지 않는다.

## 프론트엔드용 API (백엔드 JS에 추가)

```js
// 로그인이 확인된 뒤에만 호출 (방문 시점, 탭 재진입 시점 등)
await villageBackend.recordVisit();

// 그래프에 사용할 최근 14일: 배열은 날짜 오름차순
const rows = await villageBackend.getVisitCounts(14);
```

**응답 필드**

| 필드 | 단위 | 설명 |
| --- | --- | --- |
| visit_date | YYYY-MM-DD | 한국 날짜 |
| baseline_daily_visits | 회 | 초기 5명 당일 접속 횟수 합 |
| total_daily_visits | 회 | 전체 실험 참여자 당일 접속 횟수 합 |
| baseline_cumulative_visits | 회 | 초기 5명 시작일부터 해당일까지 누적 횟수 |
| total_cumulative_visits | 회 | 전체 참여자들의 등록 시작일부터 해당일까지 누적 횟수 |
| baseline_active | 명 | 초기 5명 중 당일 1번 이상 접속한 인원 |
| total_active | 명 | 전체 중 당일 1번 이상 접속한 인원 |
| baseline_participants | 명 | 해당 날짜 초기 비교군 대상자 수 |
| total_participants | 명 | 해당 날짜 전체 실험 대상자 수 |

Supabase JS / PostgREST에서는 `bigint` 반환값의 직렬화 형식을 실제 응답으로 확인하고 그래프에서 안전하게 숫자로 변환한다. 작은 실험 규모에선 일반적으로 안전한 정수 범위다.

누적값은 조회 시작일 이전의 방문도 포함하므로, 날짜 조회 범위를 늘리거나 줄여도 동일 날짜의 누적값은 변하지 않는다.

## 팀 간 역할 분리

- **백엔드 담당:** 테이블 변경, RLS, 함수 구현, 테스트, 초기 비교군 등록 승인 지원.
- **프론트엔드 담당:** 이미 로그인한 사용자 진입 때 `recordVisit()` 호출 위치 결정, 그래프 갱신 주기, 에러 표시, 마을 UI.
- 그래프 기본 화면에는 `baseline_cumulative_visits`와 `total_cumulative_visits`를 선 2개로 표시하고, 필요하면 일일 방문 횟수 막대를 함께 제시.

## 운영 시 주의

- 초기 5명은 **실제 방문 로그가 자동으로 생성된 것이 아니라 실험 대상**으로 등록되는 것. 이미 지나간 접속은 소급되지 않는다.
- 통계 참여자 선정 시 동의/안내, 보관 기간, 집계 공개 범위를 합의한다.
- SQL Editor에서 실행한 쿼리의 저장 버튼은 선택이지만 `visit-counts-upgrade.sql`, `verify-visit-counts.sql`, `backend/schema.sql`을 로컬/PR에 남긴다.
- `visit-counts-upgrade.sql`은 **현재 운영 테이블이 이미 존재하는 상태에 대한 1회성 변경**이며, 전체 `schema.sql`과 함께 실행하지 않는다.
