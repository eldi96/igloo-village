# Supabase 연결 상태와 다음 작업

- 프로젝트: `igloo-village` / 서울 리전
- 프로젝트 참조: `pvqnobhmqcfkeneccsjk`
- SDK: `@supabase/supabase-js@2.118.0`, jsDelivr ESM. 버전을 고정한다.
- `config.js`에는 공개용 publishable 키만 있다. 비밀 키를 추가하지 않는다.
- 현재 스키마의 사본은 `schema.sql`. 원격 migration은 `initial_igloo_village_backend`, `consolidate_igloo_update_policy`.

## 현재 연결하는 범위

페이지 시작 시 실제 DB의 이글루 31개를 읽어 연결을 검사한다. 실패해도 3D 마을은 실행된다.
`window.__iglooBackendStatus` 또는 `<html data-supabase="...">`로 상태를 확인한다.
현재 깃발 꽂기, 빛기둥, 우편 도착 예시, 등대 발송 화면은 여전히 로컬 시안이다.
화면 버튼을 실데이터 쓰기와 연결한 것으로 오해하지 않도록 한다.

## DB 권한

- `igloos`: 마을용 위치 ID와 입주·공개 상태만 비로그인 조회 가능. 실제 프로젝트는 포함하지 않는다.
- `members`: 역할·가입 승인 여부는 관리자만 지정. 사용자는 자기 표시 이름만 수정 가능.
- `projects`: 승인된 수강생이 자기 이글루에 등록. 잠긴 이글루의 프로젝트는 소유자만 조회.
- `mail_messages`: 승인된 강사만 현재 입주한 수강생에게 발송. 발신자·수신자만 조회. 읽음 수정은 수신자만 가능.
- 등대는 `igloos` 테이블에 없으므로 학생이 선점할 수 없다.
- `claim_igloo`: 단일 UPDATE와 UNIQUE 제약으로 동시 선점과 한 사람의 중복 선점을 차단한다.
- `send_mail`: 받는 사람 전원을 검증한 뒤 한 트랜잭션으로 저장한다.
- Realtime 게시 대상은 `igloos`, `mail_messages`. 우편은 DB의 RLS가 읽기 권한을 검사한다.
- 역할 조회용 `private` 함수만 제한적으로 SECURITY DEFINER이며 검색 경로를 비운다. 공개 RPC는 SECURITY INVOKER.

## 다음 연결 순서

1. Supabase Auth에서 Google 제공자 구성. Google OAuth Client ID/Secret은 대시보드에만 저장한다.
2. Auth URL 허용 목록에 실제 서비스 주소와 로컬 주소를 추가한다.
   - `http://127.0.0.1:8123/`
   - `http://localhost:8123/`
   - `https://eldi96.github.io/igloo-village/`
3. 로그인 UI 연결. 인증된 사용자 UUID가 생기면 관리자가 `members`에 표시 이름·역할·승인 여부를 지정한다.
   누구나 강사로 가입하거나 자동 승인되게 만들지 않는다.
4. 깃발 선택을 `claimIgloo`, 공개 설정을 `setIglooPublic`과 연결한다.
5. 회원 전용 프로젝트 등록·조회, 강사 발송 화면·수신함을 연결한다.
6. 실제 새 프로젝트 등록 시간으로 빛기둥, 미확인 우편 수로 우편함 표시를 제어한다.
7. 로그인 사용자가 바뀌거나 로그아웃하면 이전 우편 구독을 해제하고 개인 화면 데이터를 비운다.

`client.js`가 연결·조회·로그인·선점·프로젝트·우편·구독 API를 제공한다. UI와 DB 권한을 서로 대신하지 않는다.
DB 설정이 끝났다는 이유로 테스트용 수강생이나 화면의 소유자 값을 실제 인증 주체로 사용하지 않는다.
