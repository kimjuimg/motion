/**
 * Firestore 문서 ID 만들기.
 *
 * 화면(App.jsx)에서 기록을 반별로 묶을 때마다 부르는 함수들입니다.
 * Firebase 를 전혀 쓰지 않는 순수 문자열 처리라서 따로 떼어 두었습니다 —
 * 이 함수를 쓰려고 moodStore/classStore 를 불러오면 Firebase SDK 700kB 가
 * 첫 화면 번들에 딸려 들어옵니다.
 */

/** 학급 코드를 문서 ID 로 바꿉니다. 같은 코드로 두 학급이 생기지 않습니다. */
export function makeClassKey(code) {
  const cleaned = String(code)
    .trim()
    .replace(/[/\\.#$[\]]/g, "-");
  return cleaned.slice(0, 100) || "unknown";
}

/** 반 코드와 이름을 합쳐 학생 한 명의 문서 ID 를 만듭니다. */
export function makeStudentKey(code, name) {
  const raw = `${code}__${name}`;
  const cleaned = raw.replace(/[/\\.#$[\]]/g, "-").trim();
  return cleaned.slice(0, 120) || "unknown";
}
