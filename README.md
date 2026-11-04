# 이글루 마을

SKT ALEPH 수강생이 이글루 하나씩을 맡아 자기 프로젝트를 공유하는 3D 마을입니다. Three.js r160 기반 정적 사이트이고, DB와 로그인은 Supabase, 배포는 Vercel을 씁니다.

- 공개 주소: https://igloo-village.vercel.app/
- `main`에 합쳐지면 Vercel이 자동으로 배포합니다.

## 지금 되는 것

- 로그인, 초대 코드 가입, 이글루 선택(깃발 저장)
- 다른 사람의 깃발 실시간 표시
- 지정된 협업자 계정만 쓰는 실시간 대화
- 자기 이글루 안에서 이름 바꾸기
- 회전과 확대가 되는 임시 3D 이글루 내부

자기 이글루의 상자에 프로젝트 링크를 올릴 수 있습니다. 공개/비공개와 우편 발송은 아직 화면에 연결되지 않았습니다. 구현 상태와 다음 작업은 [PROGRESS.md](PROGRESS.md)를 봅니다.

## 함께 작업하기

작업 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md)를 먼저 읽어 주세요.

## 로컬 실행

프로젝트 폴더에서 다음 명령을 실행하고 http://localhost:8123 을 엽니다. 빌드 과정은 없습니다.

```sh
python -m http.server 8123
```

- Three.js와 Supabase SDK는 jsDelivr CDN에서 불러오므로 인터넷 연결이 필요합니다.
- **로컬에서도 실제 Supabase DB에 연결됩니다.** 시험으로 만든 계정과 메시지는 실제 사이트에 그대로 나타납니다.
- 파일을 고쳤는데 그대로 보이면 `Ctrl+Shift+R`로 새로고침합니다.

## 테스트

```sh
node --test backend/client.test.mjs quality.test.mjs
```

DB 권한 검증은 [backend/verify-access.sql](backend/verify-access.sql)에 있으며, 변경 내용을 모두 롤백합니다.

## 파일 역할

| 파일 | 역할 |
| --- | --- |
| `index.html` | 마을 장면, 입력, 카메라, 이글루 상태, 하단 UI, 장면 전환 |
| `village.js` | 도로, 호수, 나무, 가로등, 등대 등 마을 소품 |
| `mailboxes.js` | 이글루별 우편함 외형과 도착 표시 시안 |
| `auth-ui.js` | 로그인, 가입, 초대 코드, 이름 바꾸기 창 |
| `chat-ui.js` | 마을 화면 오른쪽의 대화 창 |
| `quality.js` | FPS에 따라 품질을 내리고 올리는 규칙 |
| `room.js` | 일반 이글루 내부 임시 3D 방, 링크 입력창, 오른쪽 카드 |
| `lighthouse-room.js` | 등대 내부 서재 |
| `lighthouse-mail.js` | 수신자 선택, 메시지 작성, 확인 화면 시안 |
| `backend/` | Supabase 연결, DB 구조, 권한, 검증 코드 |

## 성능 표시

왼쪽 아래 FPS는 약 2초마다 갱신됩니다. 품질은 3/3에서 시작해, FPS가 연속으로 28 미만이면 한 단계씩 낮아지고 45 이상이 유지되면 다시 올라갑니다. 규칙은 `quality.js`에 있습니다. 공개 전에 지울 시험용 표시이며, 개발자 도구에서 `window.__iglooStats`로 FPS, 품질 단계, 삼각형 수, 드로 콜 수를 확인할 수 있습니다.
