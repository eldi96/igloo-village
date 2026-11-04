# 함께 작업하기

사람과 AI 도구(Claude, Codex 등)가 모두 따르는 규칙입니다.

## 시작하기 전에

1. [PROGRESS.md](PROGRESS.md)에서 현재 상태와 지켜야 할 결정을 읽습니다.
2. 무엇을 맡을지 팀에 먼저 알립니다. `index.html`에 코드가 많이 모여 있어 같은 기능을 동시에 고치면 충돌이 납니다.

## 작업 순서

`main`은 합치는 즉시 https://igloo-village.vercel.app/ 에 배포됩니다. `main`에 바로 올리지 않습니다.

각자 자기 이름의 브랜치 하나에서 작업합니다. 다른 사람의 브랜치에는 커밋하지 않습니다.

GitHub Desktop 기준:

1. **Current Branch**에서 자기 브랜치를 고릅니다.
2. **Fetch origin**을 누른 뒤 **Branch → Update from main**으로 최신 `main`을 받습니다.
3. 작업하고 커밋한 뒤 **Push origin**을 누릅니다.
4. **Preview Pull Request → Create Pull Request**로 `main`에 PR을 엽니다.
5. 다른 사람이 화면을 확인한 뒤 합칩니다.
6. 합쳐진 뒤 다음 작업을 시작하기 전에 2번을 다시 합니다.

명령어로 할 때 2번은 다음과 같습니다.

```sh
git switch 내브랜치
git fetch origin
git merge origin/main
```

- PR 하나에는 기능 하나만 담습니다. 합쳐지기 전에는 다음 기능을 같은 브랜치에 커밋하지 않습니다.
- 합치기 전에 `node --test backend/client.test.mjs quality.test.mjs`를 실행합니다.
- 화면을 바꿨다면 로컬에서 직접 확인하고, 확인한 내용과 못 한 내용을 PR에 적습니다.
- 기능의 상태가 바뀌면 `PROGRESS.md`도 함께 고칩니다.

## 실제 데이터

로컬 실행도 실제 Supabase DB를 사용합니다. 시험한 내용이 실제 사이트에 나타납니다.

- 시험 계정이나 데이터를 만들었다면 끝난 뒤 지웁니다. 다른 사람의 계정, 이글루, 메시지는 임의로 지우지 않습니다.
- DB 구조를 바꾸기 전에 팀에 알립니다. 바꾼 뒤에는 `backend/schema.sql`과 `backend/verify-access.sql`도 함께 고칩니다.
- 권한은 화면이 아니라 DB의 RLS에서 검사합니다.

## 저장소에 넣지 않는 것

이 저장소는 공개입니다. 누구나 코드와 커밋 기록을 볼 수 있습니다.

- secret/service_role 키, 비밀번호, 토큰
- 초대 코드 원본. 코드는 저장소 밖에서 전달합니다.
- 수강생의 개인 정보

브라우저에 들어가는 `backend/config.js`에는 공개용 publishable 키만 둡니다. 실수로 올렸다면 지우는 것으로 끝나지 않으니, 바로 팀에 알리고 값을 바꿉니다.

## 코드 스타일

- 주변 코드의 이름, 주석 양, 작성 방식을 따릅니다. 주석은 한국어로 적습니다.
- 빌드 과정 없는 정적 사이트를 유지합니다. 외부 라이브러리는 버전을 고정합니다.
- 수강생 노트북을 고려합니다. 3D를 바꿨다면 왼쪽 아래 FPS와 삼각형 수를 전후로 비교합니다.
- 요청받은 범위만 바꿉니다.
