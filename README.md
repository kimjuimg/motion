# 오늘의 기분 체크인 🙂💬🙁

학생이 오늘의 기분을 고르면, 선생님 화면의 코르크보드에 쪽지로 실시간으로 붙는 웹앱입니다.

- **프론트엔드**: React + Vite
- **데이터베이스**: Firebase Firestore (익명 로그인)
- **배포**: GitHub → Vercel (푸시하면 자동 배포)

---

## 1. Firebase 준비하기

1. <https://console.firebase.google.com> 접속 → **프로젝트 만들기** (이름 예: `mood-checkin`).
   Google 애널리틱스는 꺼도 됩니다.
2. 왼쪽 메뉴 **빌드 › Firestore Database** → **데이터베이스 만들기**
   - 위치: `asia-northeast3 (서울)`
   - 모드: **프로덕션 모드**로 시작 (규칙은 3단계에서 넣습니다)
3. 왼쪽 메뉴 **빌드 › Authentication** → **시작하기** → **Sign-in method** 탭
   → **익명(Anonymous)** 을 **사용 설정**합니다. ⚠️ 이걸 켜지 않으면 저장이 안 됩니다.
4. 왼쪽 위 **⚙️ 프로젝트 설정** → 아래 **내 앱** 에서 **웹(`</>`)** 아이콘 클릭
   → 앱 닉네임 입력 후 등록 → 나타나는 `firebaseConfig` 값을 복사해 둡니다.

## 2. 로컬에서 실행해 보기

```bash
npm install
npm run dev
```

이 저장소는 `src/firebase.js` 에 Firebase 프로젝트 `motion-d1693` 의 설정값이 기본값으로
들어 있어서, 별도 설정 없이 바로 실행됩니다. Firebase 웹 설정값은 비밀이 아닙니다 —
어떻게 배포하든 브라우저가 받아가는 JS 번들에 그대로 포함되는 공개 값이고,
실제 데이터 보호는 3단계의 Firestore 보안 규칙이 담당합니다.

**다른 Firebase 프로젝트를 쓰고 싶을 때만** `.env` 로 덮어쓰면 됩니다.

```bash
cp .env.example .env
```

`.env` 파일에 1-4단계에서 복사한 값을 채웁니다.

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=mood-checkin-xxxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mood-checkin-xxxx
VITE_FIREBASE_STORAGE_BUCKET=mood-checkin-xxxx.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef
VITE_TEACHER_CODE=원하는교사코드
```

```bash
npm run dev
```

> `.env` 는 `.gitignore` 에 들어 있어 GitHub에 올라가지 않습니다.

## 3. Firestore 보안 규칙 넣기

Firebase 콘솔 **Firestore Database › 규칙** 탭을 열고,
이 저장소의 [`firestore.rules`](./firestore.rules) 내용을 통째로 붙여넣은 뒤 **게시**를 누릅니다.

(Firebase CLI를 쓴다면 `npm i -g firebase-tools && firebase login && firebase deploy --only firestore:rules`)

## 4. GitHub에 올리기

```bash
git init
git add .
git commit -m "오늘의 기분 체크인 웹앱"
gh repo create mood-checkin --public --source=. --push
```

`gh` 로그인이 안 되어 있으면 먼저 `gh auth login` 을 실행하세요.

## 5. Vercel에 배포하기

1. <https://vercel.com> 에 **GitHub 계정으로 로그인**
2. **Add New… › Project** → 이 저장소 **Import**
3. Framework Preset이 **Vite** 로 자동 인식되는지 확인 (빌드 명령 `npm run build`, 출력 폴더 `dist`)
4. **Deploy** → 1~2분 뒤 주소가 나옵니다

환경변수는 넣지 않아도 됩니다. 설정값이 소스에 기본값으로 들어 있습니다.

이후에는 `git push` 만 하면 Vercel이 자동으로 다시 배포합니다.

**배포된 주소**: <https://motion-five-chi.vercel.app>

## 6. 수업에서 쓰는 법

- 학생: 배포 주소 접속 → 이름 + **우리 반** 코드 입력 → 감정 선택 → 전달
  (등록된 반 코드를 치면 칸 아래에 `✓ 우리 반: 3학년 2반` 처럼 반 이름이 바로 떠서
  자기 반이 맞는지 확인할 수 있습니다)
- 선생님: 같은 주소 → **선생님이신가요?** → 교사 코드 입력 → 게시판이 실시간으로 채워짐

### 여러 학급 쓰기

선생님 게시판 위쪽 **⚙️ 학급 관리** 에서 학급을 등록합니다. 학급마다 **이름**(예: `3학년 2반`)과
**코드**(예: `3-2`)를 정하고, 학생에게는 코드를 알려주세요.

등록하면 게시판 위에 학급 칩이 생겨서 **전체 / 3학년 1반 / 3학년 2반** 처럼 골라 볼 수 있습니다.
학급을 고르면 쪽지와 감정 통계가 그 반 것만 나옵니다. **전체** 보기에서는 쪽지마다 어느 반인지
작은 라벨이 붙습니다.

이미 쌓인 기록도 학생이 입력했던 코드로 자동 분류되므로, 나중에 학급을 등록해도 지난 쪽지가
제자리를 찾아갑니다. 등록되지 않은 코드는 코드 값이 그대로 라벨로 표시됩니다.

교사 코드 기본값은 `motion2026` 입니다. 바꾸려면 `src/App.jsx` 의 `TEACHER_CODE` 기본값을
수정하고 push 하세요.

---

## 데이터 구조

```
moods/{YYYY-MM-DD}/entries/{반코드__학생이름}
    name       "김린하"
    code       "3-2"
    emotionId  "happy"
    reason     "체육 시간이 좋았어요"
    updatedAt  (서버 시각)

classes/{반코드}
    name       "3학년 2반"
    code       "3-2"
    updatedAt  (서버 시각)
```

학급 구분은 쪽지의 `code` 와 `classes` 문서 ID를 대조해서 이루어집니다. 학급을 지워도
쪽지는 남고, 학급을 다시 만들면 그대로 다시 묶입니다.

학생마다 문서가 따로 생기므로 여러 명이 동시에 제출해도 서로 덮어쓰지 않고,
같은 학생이 다시 제출하면 본인 쪽지만 바뀝니다. 날짜가 바뀌면 게시판은 자동으로 비워집니다.

## 알아두실 점

- **교사 코드는 브라우저 코드에 포함되므로 진짜 보안 장치가 아닙니다.** 개발자 도구를 열 줄 아는
  학생은 볼 수 있습니다. 교실용 칸막이 정도로 생각해 주세요. 엄격히 막아야 한다면 Firebase
  Authentication의 이메일 로그인 + 규칙에서 교사 계정 확인으로 바꿔야 합니다.
- 익명 로그인이 켜져 있으면 주소를 아는 사람은 누구나 쪽지를 남길 수 있습니다. 수업 시간에만
  주소를 공유하시고, 필요하면 Firebase 콘솔에서 지난 데이터를 정리하세요.
- 학생 이름과 감정은 개인정보입니다. 학교 방침에 따라 이름 대신 번호를 쓰는 것도 좋은 방법입니다.
