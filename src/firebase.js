import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import { firebaseConfig, isFirebaseConfigured } from "./firebaseConfig";

/**
 * Firebase SDK 초기화.
 *
 * 이 파일을 불러오는 순간 SDK 전체(700kB 남짓)가 따라옵니다. 그래서 화면에서는
 * 이 파일을 직접 import 하지 않고, moodStore/classStore 를 필요한 순간에
 * 동적 import 로 불러 씁니다. 설정값과 `isFirebaseConfigured` 는 SDK 없이도
 * 읽을 수 있도록 firebaseConfig.js 에 따로 두었습니다.
 */

export { isFirebaseConfigured };

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

export const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;

let signInPromise = null;

/** 익명 로그인. 여러 번 불러도 실제 로그인은 한 번만 일어납니다. */
export function ensureSignedIn() {
  if (!auth) return Promise.reject(new Error("Firebase 설정이 없습니다."));
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!signInPromise) {
    signInPromise = signInAnonymously(auth)
      .then((cred) => cred.user)
      .catch((err) => {
        signInPromise = null;
        throw err;
      });
  }
  return signInPromise;
}
