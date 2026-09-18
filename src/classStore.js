import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, ensureSignedIn } from "./firebase";
import { makeClassKey } from "./keys";

export { makeClassKey };

/**
 * 학급 목록
 *   classes/{학급키}
 *
 * 문서 ID를 학급 코드에서 만들기 때문에 같은 코드로 두 학급이 생기지 않습니다.
 * 학생이 입력한 코드(mood 문서의 code 필드)와 대조해 게시판을 나눕니다.
 */

function classesRef() {
  return collection(db, "classes");
}

export async function saveClass({ name, code }) {
  await ensureSignedIn();
  const trimmedCode = code.trim();
  await setDoc(doc(classesRef(), makeClassKey(trimmedCode)), {
    name: name.trim(),
    code: trimmedCode,
    updatedAt: serverTimestamp(),
  });
}

export async function removeClass(classId) {
  await ensureSignedIn();
  await deleteDoc(doc(classesRef(), classId));
}

/**
 * 학급 목록을 실시간으로 구독합니다.
 * @returns 구독 해지 함수
 */
export function subscribeClasses(onData, onError) {
  let unsubscribe = () => {};
  let cancelled = false;

  ensureSignedIn()
    .then(() => {
      if (cancelled) return;
      unsubscribe = onSnapshot(
        classesRef(),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort((a, b) =>
            String(a.name).localeCompare(String(b.name), "ko")
          );
          onData(list);
        },
        onError
      );
    })
    .catch(onError);

  return () => {
    cancelled = true;
    unsubscribe();
  };
}
