# Supabase 연결 상태와 다음 작업

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
