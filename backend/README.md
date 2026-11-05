# Supabase 연결 상태와 다음 작업

## 바깥 불빛 보상 (2026-11-05)

- exterior-light.sql 원격 적용 완료(unlock_soft_blue_exterior_light). 프로젝트가 2개인 시점에 영구 해금. 기존 충족자도 반영, 기존 주황 불빛은 자동 변경하지 않음.
- igloos.exterior_light warm/blue, members.exterior_light_unlocked_at. get_exterior_light/set_exterior_light RPC는 본인 학생 계정만 호출. 직접 UPDATE 권한 없음. 공개 지도에는 색상만 포함. 소유자 변경 시 warm 초기화.
- 기존 카드 해금 트리거를 확장하며 사용자 행 잠금 후 판정. 검증: verify-exterior-light.sql(rollback), verify-access.sql. schema.sql 전체·증분 파일 재실행 금지.

## 프로젝트 카드 테마 (2026-11-05)

- `card-themes.sql` 원격 적용 완료: unlock_persistent_project_card_themes. 기존 프로젝트 주인 해금, 첫 등록 트리거로 영구 해금. 삭제 시 회수하지 않음.
- members.card_theme 기본 glass, 선택값 rose/cream/graphite/mint. card_theme_unlocked_at은 DB만 기록. 기존 UPDATE(display_name) 권한 유지.
- get_igloo_card_theme(p_home), set_card_theme(p_theme)는 승인 회원 권한으로 호출. 공개 방 방문자는 주인 테마를 조회하지만 변경은 본인 학생 설정만 가능. 비공개 방은 주인만 조회.
- rollback 검증 `verify-card-themes.sql`, 전체 권한 검증 `verify-access.sql`에 직접 수정 차단 포함. 전체 schema.sql·증분 SQL 재실행 금지.

## 성장 실험 통계 (2026-11-05 추가)

- `visit-experiment.sql`은 운영 DB 적용 완료. 기존 학생 5명 고정, 개발팀 4명 제외 명단 별도 보관, 이후 승인 학생은 자동 cohort=2 등록. 개발팀 명단을 바꾸려면 private.visit_exclusions를 별도로 관리한다.
- `get_visit_experiment(1~90)`은 승인 회원에게 사용자별 이름·일별/누적 횟수를 제공한다. 익명 접근·원본 방문 테이블 직접 접근은 차단. 새로 집계하는 사용자에게 이 조회 범위를 안내한다.
- 예정일 11/6과 실제 최초 신규 등록일을 구분. 실제 등록일 기준으로 기존 5명의 완료일 평균 비교. 기준 기간 기록은 선택한 조회 범위에 의존하지 않는다. 방문 빈도 변화는 관찰 지표이며 인과관계 확정 지표가 아니다.
- 원격 이력: visit_experiment_dashboard_and_student_enrollment, use_actual_new_student_date_for_visit_comparison. 증분 SQL과 schema.sql을 운영에 재실행하지 않는다.
- 검증: `verify-visit-experiment.sql`, `verify-visit-counts.sql`, `verify-access.sql`은 rollback 시험. 기존 일일 집계·회원·프로젝트·우편 데이터 보존.
- 보안 점검의 private.visit_exclusions 정책 없음 INFO는 직접 접근을 막기 위한 의도된 구성. [RLS 점검 설명](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). 이전 초대 코드·우편함 공개 함수·비밀번호 설정 경고는 이번 범위에서 변경하지 않음.

- 프로젝트: `igloo-village` / 서울 리전
- 프로젝트 참조: `pvqnobhmqcfkeneccsjk`
- SDK: `@supabase/supabase-js@2.118.0`, jsDelivr ESM. 버전을 고정한다.
- `config.js`에는 공개용 publishable 키만 있다. 비밀 키를 추가하지 않는다.
- 현재 스키마의 사본은 `schema.sql`. 원격 migration은 `initial_igloo_village_backend`, `consolidate_igloo_update_policy`, `add_invite_code_signup`, `add_village_chat`, `restrict_chat_to_team`, `add_igloo_latest_project_time`.
- DB 구조를 바꾸면 `schema.sql`과 `verify-access.sql`도 함께 고친다.

## 현재 연결하는 범위

페이지 시작 시 실제 DB의 이글루 31개를 읽어 연결을 검사한다. 실패해도 3D 마을은 실행된다.
`window.__iglooBackendStatus` 또는 `<html data-supabase="...">`로 상태를 확인한다.

- 화면에 연결된 것: 로그인, 초대 코드 가입, 이름 수정, 이글루 선점, 지도 실시간 구독, 마을 대화, 프로젝트 링크 등록·조회·삭제.
- 함수만 있고 화면에 연결되지 않은 것: 공개 설정, 우편.
- 아직 시안인 것: 우편 도착 표시, 등대 발송 화면.

## DB 권한

- `igloos`: 마을용 위치 ID, 입주·공개 상태, 마지막 프로젝트 등록 시간만 비로그인 조회 가능. 프로젝트 내용은 포함하지 않는다. 등록 시간은 DB가 기록하고 사용자가 고칠 수 없다.
- `members`: 역할은 관리자만 지정. 초대 코드로 수강생 승인. 사용자는 자기 표시 이름만 수정 가능.
- `private.invite_codes`: 초대 코드는 해시로만 저장한다. 원본은 저장소에 적지 않는다.
- `chat_messages`: `private.chat_members`에 지정된 계정만 읽고 쓴다. 자기 메시지만 삭제. 한 사람당 1초에 한 번만 전송. 지정 목록은 저장소에 적지 않는다.
- `projects`: 승인된 수강생이 자기 이글루에 등록. 잠긴 이글루의 프로젝트는 소유자만 조회.
- `mail_messages`: 승인된 강사만 현재 입주한 수강생에게 발송. 발신자·수신자만 조회. 읽음 수정은 수신자만 가능.
- 등대는 `igloos` 테이블에 없으므로 학생이 선점할 수 없다.
- `claim_igloo`: 단일 UPDATE와 UNIQUE 제약으로 동시 선점과 한 사람의 중복 선점을 차단한다.
- `send_mail`: 받는 사람 전원을 검증한 뒤 한 트랜잭션으로 저장한다.
- Realtime 게시 대상은 `igloos`, `mail_messages`, `chat_messages`. 우편과 대화는 DB의 RLS가 읽기 권한을 검사한다.
- 역할 조회용 `private` 함수만 제한적으로 SECURITY DEFINER이며 검색 경로를 비운다. 공개 RPC는 SECURITY INVOKER.

## 다음 연결 순서

1. 공개 설정을 `setIglooPublic`과 연결한다.
2. 강사 계정을 지정한다. 누구나 강사로 가입하거나 자동 승인되게 만들지 않는다.
3. 강사 발송 화면·수신함을 연결한다.
4. 미확인 우편 수로 우편함 표시를 제어한다.
5. 로그인 사용자가 바뀌거나 로그아웃하면 이전 우편 구독을 해제하고 개인 화면 데이터를 비운다.

`client.js`가 연결·조회·로그인·선점·프로젝트·우편·대화·구독 API를 제공한다. UI와 DB 권한을 서로 대신하지 않는다.
DB 설정이 끝났다는 이유로 테스트용 수강생이나 화면의 소유자 값을 실제 인증 주체로 사용하지 않는다.

## 직접 등록 기능의 DB 준비

`manual-project-upload.sql`은 기존 DB에 사용법·이미지 경로 열과 비공개 이미지 버킷/RLS를 추가한다.
2026-11-05 add_manual_project_upload 마이그레이션으로 원격 적용 완료. 이미 적용된 DB에 재실행하지 않는다.
`schema.sql`에는 같은 변경을 반영했다. 기존 DB에 초기 스키마 전체를 재실행하지 않는다.
이미지는 프로젝트 조회 권한이 있는 계정에게 1시간 유효한 서명 URL로 제공한다.


## 댓글 답글·삭제 (2026-11-05)

- `comment-replies.sql`: 기존 DB용 증분 변경. parent_id·deleted_at, 본인 삭제 RLS·열 권한, 한 단계·동일 프로젝트 검증 트리거 추가. Supabase 원격 적용 완료. 초기 schema.sql을 기존 DB에 재실행하지 않는다.
- `verify-comment-replies.sql`: 빈 이글루 하나를 임시 사용해 댓글·답글·타인 삭제 차단·다른 프로젝트 연결 차단·2단계 답글 차단·비공개 접근 차단을 검증하고 전부 롤백한다.
- 댓글 삭제는 body를 빈 문자열로 지우고 deleted_at을 기록한다. 본문 복구 기능은 없으며 원댓글 행과 기존 답글만 유지한다. 클라이언트는 댓글 임의 수정·작성자 변경·물리 삭제 권한이 없다.
- 원격 적용 이력: add_comment_replies_and_soft_delete, fix_reply_parent_read_under_rls. 후자는 부모 조회의 불필요한 행 잠금을 제거한 수정이며 최종 파일에는 수정된 정의를 담았다.
- 기존 인증 점검 안내(이번 기능과 별개): check_invite / join_with_invite의 의도된 SECURITY DEFINER 노출과 유출 비밀번호 보호 비활성 경고. 이번 작업에서는 인증 설정을 바꾸지 않았다. [함수 권한 점검](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [인증된 사용자 함수 권한 점검](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [비밀번호 보호](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).


## 댓글 우편함 알림 (2026-11-05)

- `comment-notifications.sql` 원격 적용 완료: add_project_comment_notifications. 기존 mail_messages는 변경하지 않았다. 과거 댓글에 알림을 소급 생성하지 않는다.
- comment_notifications: id, recipient_id, project_id, comment_id, created_at, read_at. 수신자 본인이 현재 소유한 프로젝트의 알림만 SELECT·read_at UPDATE 가능. 클라이언트 INSERT·DELETE 금지.
- private.notify_project_comment: 공개 API에서 실행할 수 없는 트리거 전용 SECURITY DEFINER 함수. 타인이 댓글·답글을 등록하면 프로젝트 소유자에게 알림 생성. 본인 작성 제외. 댓글 삭제 처리 시 해당 알림 정리. 프로젝트·회원·댓글 물리 삭제 시 FK로 정리.
- Realtime에 comment_notifications 추가. 로그인 계정 변경 시 구독 해제·알림 초기화, 재연결·탭 복귀·30초 주기 조회로 재동기화. 내 우편함만 점등하며 방문자에게 남의 미확인 상태를 공개하지 않음.
- 우편함 클릭 → 새 댓글 프로젝트 목록 → 프로젝트 카드 → 피드백 정상 로딩 뒤 해당 프로젝트의 열람 시작 시각 이전 알림을 읽음 처리. 다른 프로젝트의 알림은 유지. 목록은 최신 미확인 100건까지 표시하며 추가 알림은 읽음 후 다시 조회.
- `verify-comment-notifications.sql`은 임시 계정·빈 방을 트랜잭션 안에서만 사용하고 모두 롤백한다. 타인 수신함 읽기·갱신·알림 직접 생성 차단, 본인 작성 제외, 답글 알림, 읽음, 삭제 알림 정리 검증 완료.
- DB 관리자가 작업 중인 daily_visits 테이블의 RLS 정책 없음 INFO가 점검에 표시됨. 이번 작업에서 생성·변경하지 않음. [RLS 점검 설명](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).


### 전체 마을에서 점등 보기 (추가 적용)

기존의 본인 화면만 점등하던 동작을 변경했다. get_unread_mailbox_homes RPC로 이글루 ID만 모두에게 공개하고 알림 본문 권한은 유지한다. mailbox-glow.sql 원격 적용 완료. 전체 화면은 10초 주기로 갱신하고, 현재 화면의 댓글 작성·삭제와 본인 읽음 처리는 즉시 재조회한다. 추가 테이블·컬럼·RLS 변경 없음. 의도된 공개 SECURITY DEFINER 함수: [공개 함수 권한 점검](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
