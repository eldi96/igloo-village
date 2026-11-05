# IGLOO VILLAGE — backend_DB_work_log

> 작성 기준: 2026-11-05 (KST) · 개인 작업 브랜치 `PSG` · 최신 GitHub `main` 구조를 참고한 작업 기록  
> **상태: 접속 횟수 V3 로컬·운영 검증 전의 작업 인계 초안.** 적용 결과에 따라 완료 상태를 갱신해야 한다.

## 1. 목표 및 합의 사항

- 수강생 약 30명이 이글루에 프로젝트를 전시하는 협업 사이트.
- 기존 Supabase Auth / `members`를 재사용하여 방문자를 식별한다.
- 협업자는 제외하고 최초 **5명**을 고정 비교군(`cohort=1`)으로 지정한다.
- 이후 합류하는 이용자는 `cohort >= 2`에 별도로 등록한다.
- 핵심 지표는 **로그인 유지율(%)이 아닌 접속 횟수(회)**. ① 기존 비교군 누적 접속 횟수, ② 전체 참여자 누적 접속 횟수를 우상향/횡보 꺾은선 그래프로 비교한다. 일별 접속 횟수도 별도 표시 가능하다.
- 기준 날짜는 2026-11-05, 시간대는 `Asia/Seoul`.
- 새로고침 등 중복 호출 방지를 위해 **최종 기록 호출 후 30분 미만이면 추가 접속 0회**, 30분 이상일 때 1회로 집계한다.
- 개인별 방문 원본은 기본 그래프에 제공하지 않고 일별 집계값만 제공한다.
- **기존 과거 로그인은 소급 집계할 수 없다.** 실제 화면에서 `recordVisit()` 호출을 시작한 시점부터 기록된다.

## 2. 기존 백엔드 현황 (`main` 확인 기준)

- `public.members`는 `auth.users(id)`를 참조하며 `role`, `approved`를 보유한다.
- `public.igloos`는 소유자와 `is_public`, 선점 시각을 관리한다.
- `public.projects`는 설명, 사용법, 이미지, URL을 갖고 소유자에게 수정·삭제 권한을 준다.
- `project_comments`와 `project_reactions`가 새 `main`에 도입되었다.
- 공개/비공개 스위치는 최신 `room.js`/`privacy-panel.js`에 UI 연결됨. **최신 `main`의 프로젝트 조회에는 승인 회원 확인이 필요**하므로, 과거의 비로그인 공개 패치와 병합 여부는 팀 정책에 따라 별도 검토해야 한다.
- GitHub PR 및 배포는 담당자가 승인한 뒤 수행한다. `main` 직접 푸시 금지.

## 3. 기존 방문 통계 V2까지 확인된 이력

| 항목 | 상태 및 근거 |
| --- | --- |
| `visit_participants` 및 `daily_visits` | 사용자가 `visit-analytics.sql`을 Supabase에 적용한 상태로 대화에서 보고 |
| 기존 `record_visit()` / `get_visit_trend()` | 사용자 로컬 `client.js`에 `recordVisit()`·`getVisitTrend()` 존재 확인 |
| 로컬 JavaScript 테스트 | 사용자가 **PASS 20** 보고 (V2 시점) |
| 새 접속 통계 RLS 시험 | 사용자가 `verify-visits.sql`의 **PASS: visits access, consent cohort, duplicate prevention, protected trend, daily uniqueness** 보고 |
| `ON CONFLICT` 권한 오류 | `record_visit()`의 `on conflict (member_id, visit_date) do nothing`에서 42501 발생. `on conflict do nothing`으로 함수/로컬 SQL 수정 후 위 PASS 보고 |
| 실제 방문 로그 수집 | 화면 호출 연결 여부 및 실제 데이터 수집 **미확인** |

## 4. 접속 횟수 V3 변경안 (이번 패키지)

기존 스키마를 보존하고 추가·변경한다.

1. `daily_visits`에 `visit_count integer not null default 1` 및 `last_seen_at timestamptz not null` 추가. 기존 행은 횟수 1회, `last_seen_at=first_seen_at`으로 이행.
2. 직접 쓰기 권한을 회수하고, 승인된 실험 대상자의 본인 기록만 처리하는 `private.record_visit_atomic()` 구현. 내부 함수는 `SECURITY DEFINER`지만 `auth.uid()`, 회원 승인, 실험 등록 날짜를 자체 검사한다. `public.record_visit()` 호출 형태는 유지한다.
3. `private.aggregate_visit_counts()`와 공개 RPC `public.get_visit_counts(p_days)` 추가. 개인별 원본이 아닌 집계 행 반환.
4. 기존 `get_visit_trend()` 접속률 API는 **삭제하지 않음**. 신규 그래프에는 `get_visit_counts()` 사용.
5. `backend/client.js`에 `getVisitCounts(days = 14)` 추가, `backend/client.test.mjs`에 API 테스트 추가, `backend/schema.sql`의 기존 통계 블록을 V3 스키마로 교체.
6. `backend/verify-visit-counts.sql`에서 비로그인 차단, 직접 테이블 조회/삽입 차단, 30분 미만 재호출, 31분 후 재방문, 두 집단별 집계, 미참여자 제외를 롤백 트랜잭션으로 검증하도록 준비.

### V3 제공 파일

- `apply_visit_counts_v3.py` — 로컬 백엔드 세 파일 변경. 원본은 `.visit_counts_backup_v3/` 백업.
- `backend/visit-counts-upgrade.sql` — 이미 V2 스키마가 있는 운영 Supabase용 **1회성** 업그레이드. 팀 승인 전 실행 금지.
- `backend/verify-visit-counts.sql` — V3용 `BEGIN`/`ROLLBACK` 검증.
- `backend/visit-counts-schema-block.sql` — `schema.sql`의 V3 설치 상태 사본.
- `backend/VISIT_COUNTS_V3_DESIGN.md` — 구조·API 설계.
- `frontend_visit_counts_handoff.md` — 프론트엔드 연결 초안. 최종 검증 후 확정할 것.

## 5. 아직 완료하지 않은 항목 / 확인 필요

- [ ] 사용자 로컬 `PSG`에서 V3 패치 적용 및 `git diff --check` 통과
- [ ] 사용자 로컬에서 `node --test backend/client.test.mjs quality.test.mjs` 전체 통과
- [ ] 팀 승인 후 `visit-counts-upgrade.sql`을 운영 DB에 **1회만** 적용
- [ ] `verify-visit-counts.sql` 권한·횟수 검증 PASS 확인
- [ ] 최초 비교군 5명 동의/대상 명단 확정 및 DB 등록 (이름·UUID를 저장소 문서에 기입하지 않음)
- [ ] 이후 참여자의 cohort 및 참여 날짜 관리 방식 합의
- [ ] 실제 로그인·마을 진입 지점에 `recordVisit()` 연결
- [ ] 브라우저 실측으로 30분 재진입/날짜 변경 및 그래프 데이터 값 확인
- [ ] 개인정보 수집 안내, 공개 가능한 집계 범위, 데이터 보관·삭제 정책 합의
- [ ] 최종 프론트엔드 인계 문서와 `PROGRESS.md` 갱신 및 담당자 PR

## 6. 실행 주의 사항

- `backend/schema.sql` 전체를 운영 DB에 재실행하지 않는다. 기존 DB를 만드는 초기 스키마 사본이다.
- V3 업그레이드는 기존 `visit_participants`/`daily_visits`가 이미 존재하는 DB에만 적용한다.
- `backend/verify-visits.sql`은 **구버전 일일 1회용** 테스트. V3는 `backend/verify-visit-counts.sql` 사용.
- 로컬 `git stash`와 예전 공개 조회 패치를 함부로 삭제하거나 재실행하지 않는다.
- 로컬 SQL 파일 저장은 GitHub 푸시나 Supabase SQL Editor의 Save 버튼과 별개다. 운영 DB는 SQL Editor에서 실행할 때만 변경된다.
- 개인 수강생 명단·비밀 키·실제 방문 원본은 GitHub 공개 저장소에 기록하지 않는다.

## 7. 프론트엔드 계약 (최종 검증 뒤 전달)

```js
// 승인된 로그인 회원, 마을 진입 시 호출 (에러가 있어도 3D 마을을 막지 않도록 처리)
await villageBackend.recordVisit();

// 집계 그래프: 조회 기간 1~90일, 기본 14일
const rows = await villageBackend.getVisitCounts(14);
```

일별 반환 필드는 `visit_date`, `baseline_daily_visits`, `total_daily_visits`, `baseline_cumulative_visits`, `total_cumulative_visits`, `baseline_active`, `total_active`, `baseline_participants`, `total_participants`이다. 그래프 주축은 **두 누적 횟수**, 일별 횟수는 보조 그래프로 권장한다.

---

*이 문서는 채팅에서 확인된 결과와 V3 제안 파일을 구분하여 작성했다. 로컬/운영 검증 결과가 도착하면 체크리스트를 실제 결과로 갱신한다.*
