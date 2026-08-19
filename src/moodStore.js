import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, ensureSignedIn } from "./firebase";

/**
 * 저장 구조
 *   moods/{YYYY-MM-DD}/entries/{학생키}
 * 학생마다 문서가 따로 생기므로 여러 명이 동시에 제출해도 서로 덮어쓰지 않습니다.
 * 같은 학생이 다시 제출하면 자기 문서만 갱신됩니다.
 */

function entriesRef(dateKey) {
  return collection(db, "moods", dateKey, "entries");
}

/** Firestore 문서 ID로 쓸 수 없는 문자를 정리합니다. */
export function makeStudentKey(code, name) {
  const raw = `${code}__${name}`;
  const cleaned = raw.replace(/[/\\.#$[\]]/g, "-").trim();
  return cleaned.slice(0, 120) || "unknown";
}

export async function saveMood({ dateKey, code, name, emotionId, reason }) {
  await ensureSignedIn();
  const key = makeStudentKey(code, name);
  await setDoc(doc(entriesRef(dateKey), key), {
    name,
    code,
    emotionId,
    reason,
    updatedAt: serverTimestamp(),
  });
}

/**
 * 오늘 제출된 마음을 실시간으로 구독합니다.
 * 새로고침 없이 학생이 제출하는 즉시 선생님 화면에 나타납니다.
 * @returns 구독 해지 함수
 */
export function subscribeMoods(dateKey, onData, onError) {
  let unsubscribe = () => {};
  let cancelled = false;

  ensureSignedIn()
    .then(() => {
      if (cancelled) return;
      unsubscribe = onSnapshot(
        entriesRef(dateKey),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          list.sort(
            (a, b) =>
              (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)
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
