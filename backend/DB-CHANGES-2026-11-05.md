# 댓글·우편함 DB 변경 전달용 (2026-11-05)

## 1. 댓글 삭제·답글 — 적용 완료

- 대상: public.project_comments
- 추가: parent_id(uuid, 원댓글 참조), deleted_at(timestamptz).
- 삭제 시 body는 빈 문자열, 행·답글 연결은 보존. 화면에서는 삭제 댓글을 숨김.
- 본인만 삭제 처리. 임의 본문 수정·작성자 변경·물리 삭제는 허용하지 않음.
- 같은 프로젝트 원댓글에 한 단계 답글만 허용. 삭제된 원댓글에는 신규 답글 차단.
- 기존 댓글 데이터 유지. 스키마 검증 트리거·본문 CHECK·답글 인덱스 추가.
- 원격 이력: add_comment_replies_and_soft_delete / fix_reply_parent_read_under_rls.

## 2. 우편함 새 댓글 알림 — 적용 완료

- 추가 테이블: public.comment_notifications
- 컬럼: id / recipient_id / project_id / comment_id / created_at / read_at.
- 타인의 새 댓글·답글 → 프로젝트 주인에게 알림. 본인이 쓴 글은 제외.
- 댓글을 삭제하면 해당 알림 제거. 기존 답글의 알림은 유지.
- 알림은 수신자 본인만 조회하고 read_at만 변경 가능. 클라이언트의 알림 생성·삭제 금지.
- private.notify_project_comment 함수와 project_comments의 알림 트리거 추가. 함수는 비공개·직접 실행 차단.
- Supabase Realtime 게시 대상에 comment_notifications 추가.
- 과거 댓글 알림 소급 생성 없음. 기존 mail_messages·접속 통계 테이블 변경 없음.
- 원격 이력: add_project_comment_notifications.

## 3. 로컬 SQL 파일

- 수정: schema.sql (이번 변경을 초기 스키마 사본에 추가), verify-access.sql (댓글 열 권한 확인 추가).
- 추가: comment-replies.sql, comment-notifications.sql (기존 DB에 적용하는 증분 SQL).
- 추가: verify-comment-replies.sql, verify-comment-notifications.sql (모든 시험 데이터를 롤백하는 검증).
- 기존 DB에는 schema.sql을 재실행하지 말 것. 위 원격 변경은 이미 적용되어 증분 파일도 재실행하지 말 것.
- schema.sql은 이 작업 시작 당시 사본에 이번 변경을 추가한 파일이다. 팀원이 별도로 반영한 DB 변경과는 병합 전에 비교 필요.

## 4. 확인 결과와 복구

- 댓글 삭제·답글 권한 및 알림 수신자 권한·읽음·삭제 정리 롤백 검증 통과. 시험 계정 남기지 않음.
- 새 화면은 로컬만 적용, Git 커밋·푸시·배포 없음.
- 앱을 이전 버전으로 되돌려도 이번 추가 컬럼과 알림 테이블은 남겨 둘 수 있음. 삭제한 댓글 본문은 복구 불가.
- 알림 수집 중지만 필요하면 알림 트리거·Realtime 구독부터 중지하는 별도 변경안을 검토. 기존 댓글 컬럼을 바로 제거하면 답글 연결이 손실되므로 임의로 제거하지 말 것.


## 5. 마을 전체 우편함 점등 — 추가 적용 완료

- 테이블·컬럼·기존 알림 RLS 변경 없음.
- public.get_unread_mailbox_homes() 함수 1개 추가. 결과는 미확인 알림이 있는 igloo_id 목록뿐. 알림 내용·수신자·댓글 ID·개수는 반환하지 않음.
- anon·authenticated에 이 함수의 실행 권한만 부여. 알림 테이블의 타인 조회·읽음 처리는 계속 차단.
- 알림 내용 RLS를 우회해 ID만 집계하는 의도된 SECURITY DEFINER 함수이며 인자 없음, search_path 고정, 쓰기 작업 없음. 공개 함수 실행 관련 보안 점검 안내가 발생할 수 있음.
- 원격 이력: expose_mailbox_glow_home_ids. 증분 파일 mailbox-glow.sql, 롤백 검증 verify-mailbox-glow.sql 추가. schema.sql에 동일 정의 추가.
- 모든 화면은 10초마다 점등 목록 조회. 댓글 작성·삭제한 현재 화면과 알림 수신자 화면은 즉시 갱신. 주인이 읽으면 나머지 화면은 다음 조회 때 소등.

## 6. main 통합 (2026-11-05)

- 팀원 최신 main의 방문 통계 SQL 블록을 원문 그대로 보존하고 이번 댓글·우편함 정의를 함께 병합했다. 병합 작업 중 DB 서버 SQL 재실행·재적용은 하지 않았다.
