import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

/**
 * Firebase 웹 설정값은 비밀이 아닙니다.
 * 어떻게 배포하든 브라우저가 받아가는 JS 번들에 그대로 포함되는 공개 값이라,
 * Firebase 공식 문서도 소스에 두는 것을 허용합니다.
 * 실제 데이터 보호는 firestore.rules 의 보안 규칙이 담당합니다.
 *
 * 다른 Firebase 프로젝트를 쓰고 싶으면 .env 파일이나 배포 환경변수로 덮어쓰면 됩니다.
 */
const DEFAULT_CONFIG = {
  apiKey: "AIzaSyDQcpAki7J3iVYZ5-l_DjpV7KzziNqV-1Y",
  authDomain: "motion-d1693.firebaseapp.com",
  projectId: "motion-d1693",
  storageBucket: "motion-d1693.firebasestorage.app",
  messagingSenderId: "349400820350",
  appId: "1:349400820350:web:866bf828eefa0a8681c62f",
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || DEFAULT_CONFIG.apiKey,
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_CONFIG.authDomain,
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || DEFAULT_CONFIG.projectId,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    DEFAULT_CONFIG.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    DEFAULT_CONFIG.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || DEFAULT_CONFIG.appId,
};

/** 환경변수가 아직 채워지지 않았으면 화면에 안내를 띄우기 위한 플래그. */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

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
