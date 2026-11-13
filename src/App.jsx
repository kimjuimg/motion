import React, { useEffect, useState } from "react";
import { isFirebaseConfigured } from "./firebaseConfig";
import { makeClassKey, newSessionId } from "./keys";
import { QUADRANTS, EMOTIONS, findEmotion, emotionOrder } from "./emotions";

/**
 * Firebase SDK 는 첫 화면에 필요하지 않습니다.
 *
 * 학생은 반을 고르는 동안, 선생님은 교사 코드를 치는 동안 아무것도 읽고 쓰지
 * 않습니다. 그래서 Firebase 를 쓰는 moodStore/classStore 는 정적으로 import
 * 하지 않고 여기서 동적으로 불러옵니다. 그러면 SDK 가 별도 청크로 떨어져
 * 나가서, 첫 화면은 그만큼 가볍게 뜹니다.
 *
 * 두 함수를 거쳐 가는 이유는 import() 가 같은 모듈에 대해 한 번만 실제로
 * 받아오고 그다음부터는 이미 받은 것을 돌려주기 때문입니다 — 호출할 때마다
 * 부담 없이 부르면 됩니다.
 */
const loadMoodStore = () => import("./moodStore");
const loadClassStore = () => import("./classStore");

/**
 * 동적 import 로 가져온 구독을 useEffect 에서 쓰기 좋게 감쌉니다.
 * 모듈이 도착하기 전에 화면을 떠나면 구독을 시작하자마자 바로 끊습니다.
 * @param start 구독을 시작하고 해지 함수를 돌려주는 async 함수
 * @returns useEffect 가 그대로 돌려주면 되는 정리 함수
 */
function subscribeLazily(start, onError) {
  let stop = () => {};
  let cancelled = false;

  start()
    .then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else stop = unsubscribe;
    })
    .catch(onError);

  return () => {
    cancelled = true;
    stop();
  };
}

/* ---------- 데이터 ---------- */

/* 고를 수 있는 감정은 무드 미터 100개입니다 — src/emotions.js 참고. */

/**
 * 에러를 화면에 보여줄 문장으로 바꿉니다.
 * 자주 나오는 원인은 한국어로 풀어 주고, 원래 코드는 항상 함께 보여 줍니다.
 * 원인을 짐작으로만 안내하면 엉뚱한 곳을 고치게 되기 때문입니다.
 */
const ERROR_HINTS = {
  "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
    "Firebase 설정이 더 이상 유효하지 않습니다. 프로젝트가 지워졌거나 API 키가 바뀐 것 같아요.",
  "auth/invalid-api-key":
    "Firebase API 키가 올바르지 않습니다. src/firebase.js 의 설정값을 확인해 주세요.",
  "auth/admin-restricted-operation":
    "Firebase 콘솔에서 익명 로그인이 꺼져 있습니다. Authentication 에서 켜 주세요.",
  "auth/unauthorized-domain":
    "이 주소가 Firebase 승인된 도메인 목록에 없습니다. Authentication > 설정에서 추가해 주세요.",
  "auth/network-request-failed":
    "인터넷 연결이 끊겼거나 학교 방화벽에 막혀 있습니다.",
  "permission-denied":
    "Firestore 보안 규칙이 접근을 막고 있습니다. firestore.rules 가 배포되었는지 확인해 주세요.",
  unavailable: "Firestore 서버에 닿지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  "failed-precondition":
    "Firestore 데이터베이스가 아직 만들어지지 않았을 수 있습니다.",
  "not-found": "Firestore 데이터베이스를 찾지 못했습니다.",
};

function describeError(err) {
  const code = (err && (err.code || err.name)) || "unknown";
  const hint = ERROR_HINTS[code] || "인터넷 연결과 Firebase 설정을 확인해 주세요.";
  return { hint, code };
}

/** 에러 안내 문단. 설명 아래에 코드를 작게 붙여 그대로 읽어 전달할 수 있게 합니다. */
function ErrorNote({ lead, error, color, style }) {
  const { hint, code } = describeError(error);
  return (
    <p
      style={{
        color: color || "#C0553A",
        fontSize: 13,
        marginTop: 10,
        lineHeight: 1.5,
        ...style,
      }}
    >
      {lead} {hint}
      <br />
      <span style={{ opacity: 0.75, fontSize: 12, fontFamily: "monospace" }}>
        오류 코드: {code}
      </span>
    </p>
  );
}

/**
 * 선생님 화면 진입 코드.
 * 이 값은 브라우저 번들에 포함되므로 진짜 보안 장치가 아니라 교실용 칸막이입니다.
 * 바꾸려면 아래 기본값을 수정하거나, 배포 환경변수 VITE_TEACHER_CODE 를 설정하세요.
 */
const TEACHER_CODE = import.meta.env.VITE_TEACHER_CODE || "motion2026";

/**
 * 기본 학급 네 개. 선생님이 ⚙️ 학급 관리에서 학급을 하나도 등록하지 않았을 때
 * 학생 화면의 반 버튼과 선생님 화면의 반 묶음에 이 네 반을 씁니다.
 * 학급을 하나라도 등록하면 그때부터는 등록한 학급만 씁니다.
 */
const DEFAULT_CLASSES = ["1반", "2반", "3반", "4반"].map((name) => ({
  id: makeClassKey(name),
  name,
  code: name,
  isDefault: true,
}));

/** 화면에서 쓸 학급 목록: 등록된 학급이 있으면 그것, 없으면 기본 네 반. */
function classListFrom(registered) {
  return registered.length > 0 ? registered : DEFAULT_CLASSES;
}

const SORT_OPTIONS = [
  { id: "recent", label: "최신순" },
  { id: "emotion", label: "감정순" },
];

const thStyle = {
  textAlign: "left",
  padding: "12px 14px",
  color: "#7A4F2B",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "11px 14px",
  verticalAlign: "middle",
};

/** Firestore 타임스탬프를 '오후 2:31' 형태로 바꿉니다. */
function formatTime(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return "—";
  return date.toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getTodayLabel() {
  const d = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

/* ---------- 스타일 ---------- */

function GlobalStyle() {
  return (
    <style>{`
      .mc-root { font-family: 'Gowun Dodum', sans-serif; }
      .mc-hand { font-family: 'Hi Melody', cursive; }
      .mc-focus:focus-visible {
        outline: 3px solid #4A6FA5;
        outline-offset: 2px;
      }
      .mc-emo-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .mc-emo-btn:hover { transform: translateY(-3px); }
      /* 이유 칸의 예시 문장은 진짜 답처럼 보이지 않게 흐리게 */
      .mc-reason::placeholder { color: #CDBF9F; opacity: 1; font-style: italic; }
      @media (prefers-reduced-motion: reduce) {
        .mc-emo-btn { transition: none !important; animation: none !important; }
      }
      @keyframes mc-pop {
        0% { transform: scale(0.85); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
      }
      .mc-scrollbar::-webkit-scrollbar { width: 10px; height: 10px; }
      .mc-scrollbar::-webkit-scrollbar-thumb { background: #A9825C; border-radius: 8px; }
    `}</style>
  );
}

/* ---------- 화면: 설정 안내 ---------- */

function SetupNotice() {
  return (
    <div style={screenWrap}>
      <div style={{ ...cardBase, maxWidth: 480 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🧩</div>
        <h1 className="mc-hand" style={{ fontSize: 26, color: "#7A4F2B", margin: 0 }}>
          Firebase 설정이 아직 없어요
        </h1>
        <p style={{ color: "#7A6A4E", fontSize: 14, lineHeight: 1.7, marginTop: 12 }}>
          <code>.env.example</code> 을 <code>.env</code> 로 복사한 뒤 Firebase 웹 앱
          설정값을 채워 주세요. Vercel에 올릴 때는 프로젝트 설정의{" "}
          <strong>Environment Variables</strong> 에 같은 값을 넣으면 됩니다.
        </p>
        <p style={{ color: "#9C8A6E", fontSize: 13, marginTop: 10 }}>
          자세한 순서는 저장소의 <code>README.md</code> 에 정리해 두었습니다.
        </p>
      </div>
    </div>
  );
}

/* ---------- 화면: 로그인 ---------- */

function LoginScreen({ onEnter }) {
  const [classId, setClassId] = useState(null);
  const [error, setError] = useState("");
  const [goTeacher, setGoTeacher] = useState(false);
  const [teacherCodeInput, setTeacherCodeInput] = useState("");
  const [teacherError, setTeacherError] = useState("");
  const [classes, setClasses] = useState([]);

  // 등록된 반 목록을 받아와서 반 버튼으로 보여 줍니다 (없으면 기본 네 반).
  // 첫 화면이 뜬 뒤에 시작하므로, 이때 Firebase 청크도 함께 받아집니다.
  useEffect(
    () =>
      subscribeLazily(async () => {
        const { subscribeClasses } = await loadClassStore();
        return subscribeClasses(setClasses, (err) => console.error(err));
      }, (err) => console.error(err)),
    []
  );

  const classList = classListFrom(classes);
  const chosenClass = classList.find((c) => c.id === classId) || null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!chosenClass) {
      setError("우리 반을 골라 주세요.");
      return;
    }
    setError("");
    // 이름은 받지 않습니다. 들어올 때마다 새 세션 id 를 만들어 기록을 나눕니다.
    onEnter({
      role: "student",
      code: chosenClass.code,
      className: chosenClass.name,
      sessionId: newSessionId(),
    });
  };

  const handleTeacherSubmit = (e) => {
    e.preventDefault();
    if (teacherCodeInput.trim() !== TEACHER_CODE) {
      setTeacherError("코드가 올바르지 않습니다.");
      return;
    }
    onEnter({ role: "teacher" });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 20% 20%, #F6EFDE 0%, #EFE4CC 55%, #E6D8B8 100%)",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#FFFDF7",
          borderRadius: 20,
          padding: "36px 28px",
          boxShadow: "0 18px 40px rgba(120, 90, 40, 0.18)",
          border: "1px solid #EADFC5",
        }}
      >
        {!goTeacher ? (
          <>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{ fontSize: 40, marginBottom: 6 }}>🙂💬🙁</div>
              <h1
                className="mc-hand"
                style={{ fontSize: 30, color: "#7A4F2B", margin: 0 }}
              >
                오늘의 기분 체크인
              </h1>
              <p style={{ color: "#9C8A6E", fontSize: 14, marginTop: 6 }}>
                우리 반을 고르고 들어와요 (이름은 쓰지 않아요)
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <p
                id="mc-class-label"
                style={{ fontSize: 13, color: "#7A6A4E", margin: "0 0 8px" }}
              >
                우리 반
              </p>
              <div
                role="radiogroup"
                aria-labelledby="mc-class-label"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 8,
                }}
              >
                {classList.map((cls) => {
                  const on = cls.id === classId;
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setClassId(cls.id);
                        setError("");
                      }}
                      className="mc-focus"
                      style={{
                        padding: "16px 8px",
                        borderRadius: 14,
                        border: on ? "2px solid #C0724A" : "1px solid #E2D4B4",
                        background: on ? "#F8E3D3" : "#FFFCF4",
                        color: on ? "#7A4F2B" : "#5B4A30",
                        fontSize: 17,
                        fontWeight: on ? 700 : 400,
                        cursor: "pointer",
                      }}
                    >
                      {on && "✓ "}
                      {cls.name}
                    </button>
                  );
                })}
              </div>

              {error && (
                <p style={{ color: "#C0553A", fontSize: 13, marginTop: 10 }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="mc-focus"
                style={{
                  width: "100%",
                  marginTop: 22,
                  padding: "13px 0",
                  borderRadius: 14,
                  border: "none",
                  background: "#C0724A",
                  color: "#FFFDF7",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                들어가기
              </button>
            </form>

            <button
              onClick={() => onEnter({ role: "data" })}
              className="mc-focus"
              style={{
                width: "100%",
                marginTop: 14,
                padding: "11px 0",
                borderRadius: 12,
                border: "1px solid #C7A876",
                background: "#FBF3E2",
                color: "#7A4F2B",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              📋 모은 문장 보기 (엔트리에 붙여넣기)
            </button>

            <button
              onClick={() => setGoTeacher(true)}
              className="mc-focus"
              style={{
                width: "100%",
                marginTop: 14,
                padding: "10px 0",
                borderRadius: 12,
                border: "1px solid #E2D4B4",
                background: "transparent",
                color: "#9C8A6E",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              선생님이신가요?
            </button>
          </>
        ) : (
          <>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{ fontSize: 34, marginBottom: 6 }}>🗂️</div>
              <h1
                className="mc-hand"
                style={{ fontSize: 26, color: "#7A4F2B", margin: 0 }}
              >
                선생님 보기
              </h1>
              <p style={{ color: "#9C8A6E", fontSize: 14, marginTop: 6 }}>
                교사 코드를 입력해 주세요
              </p>
            </div>
            <form onSubmit={handleTeacherSubmit}>
              <input
                className="mc-focus"
                type="password"
                value={teacherCodeInput}
                onChange={(e) => setTeacherCodeInput(e.target.value)}
                placeholder="교사 코드"
                style={inputStyle}
              />
              {teacherError && (
                <p style={{ color: "#C0553A", fontSize: 13, marginTop: 10 }}>
                  {teacherError}
                </p>
              )}
              <button
                type="submit"
                className="mc-focus"
                style={{
                  width: "100%",
                  marginTop: 18,
                  padding: "13px 0",
                  borderRadius: 14,
                  border: "none",
                  background: "#4A6FA5",
                  color: "#FFFDF7",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                들어가기
              </button>
            </form>
            <button
              onClick={() => {
                setGoTeacher(false);
                setTeacherError("");
              }}
              className="mc-focus"
              style={{
                width: "100%",
                marginTop: 14,
                padding: "10px 0",
                borderRadius: 12,
                border: "none",
                background: "transparent",
                color: "#9C8A6E",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              ← 학생 화면으로
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #E2D4B4",
  fontSize: 15,
  fontFamily: "'Gowun Dodum', sans-serif",
  background: "#FFFCF4",
};

/* ---------- 학생 화면: 이유 다듬기 ---------- */

/** 쉼표(반각 , · 전각 ， · 、)를 띄어쓰기로 바꿉니다. 학생이 쓰는 동안 바로 적용합니다. */
function stripCommas(text) {
  return String(text ?? "").replace(/[,，、]/g, " ");
}

/**
 * 저장하거나 보여 줄 이유 문장. 쉼표를 없애고 겹친 띄어쓰기를 하나로 줄입니다.
 * 이미 쉼표가 들어간 채 저장된 지난 기록도 화면과 엑셀에서는 이렇게 다듬어 보여 줍니다.
 */
function cleanReason(text) {
  return stripCommas(text).replace(/[ \t]{2,}/g, " ").trim();
}

/* ---------- 학생 화면: 이유 검사 ---------- */

/** 이유는 이만큼은 써야 저장됩니다 (띄어쓰기·문장부호·아래 낱말은 빼고 셉니다). */
const REASON_MIN_CHARS = 5;

/**
 * 이유가 되지 않는 낱말. "그냥", "몰라요" 처럼 쓰면 이 낱말을 지우고 남은
 * 글자 수로 판단하므로, "그냥 그냥 그냥" 도 걸러지고
 * "그냥 친구랑 놀아서 좋았어요" 는 통과합니다.
 */
const FILLER_WORDS = ["그냥", "몰라", "모름", "모르겠", "없음", "없어", "아무거나", "아무것도", "글쎄", "별로"];

/**
 * 이유를 검사합니다.
 * @returns 통과하면 null, 아니면 학생에게 보여 줄 안내 문장
 */
function checkReason(text) {
  const trimmed = text.trim();
  if (!trimmed) return "왜 이런 마음이 들었는지 이유를 써 주세요.";

  let core = trimmed
    // 띄어쓰기와 문장부호, ㅋㅋ·ㅠㅠ 같은 낱자는 세지 않습니다.
    .replace(/[\s.,!?~…·'"()\-_^;:]/g, "")
    .replace(/[ㄱ-ㅎㅏ-ㅣ]/g, "");
  const hadFiller = FILLER_WORDS.some((w) => core.includes(w));
  for (const w of FILLER_WORDS) core = core.split(w).join("");
  // "요요요", "하하하하하" 처럼 같은 글자만 되풀이한 것도 세지 않습니다.
  if (new Set(core).size < 3) core = "";

  if (core.length >= REASON_MIN_CHARS) return null;
  if (hadFiller) {
    return "'그냥', '몰라요' 말고, 어떤 일이 있었는지 조금 더 자세히 써 볼까요?";
  }
  return `조금 더 자세히 써 주세요. (${REASON_MIN_CHARS}글자 이상)`;
}

/* ---------- 학생 화면: 무드 미터 감정 고르기 ---------- */

/**
 * 무드 미터 방식으로 두 단계에 걸쳐 고릅니다.
 * 1) 네 가지 색 중 지금 마음에 가까운 칸 (활력 × 쾌적함)
 * 2) 그 칸의 감정 25개(5×5) 중 딱 맞는 낱말
 * 100개를 한꺼번에 늘어놓으면 휴대폰에서 한참 스크롤해야 하고, 무엇보다
 * "먼저 큰 갈래를 느끼고 → 정확한 이름을 찾는" 무드 미터의 순서가 사라집니다.
 */
function MoodMeterPicker({ quadrant, onQuadrant, selected, onSelect }) {
  const q = QUADRANTS.find((x) => x.id === quadrant);

  if (!q) {
    return (
      <div>
        <p style={{ fontSize: 13, color: "#7A6A4E", margin: "0 0 8px" }}>
          지금 마음은 어느 색에 가까워요?
        </p>
        <div style={{ display: "flex", gap: 6 }}>
          {/* 세로축: 활력 */}
          <div
            aria-hidden
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-around",
              fontSize: 11,
              color: "#9C8A6E",
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              textAlign: "center",
            }}
          >
            <span>활력 낮음</span>
            <span>활력 높음</span>
          </div>
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            {QUADRANTS.map((x) => (
              <button
                key={x.id}
                onClick={() => onQuadrant(x.id)}
                className="mc-emo-btn mc-focus"
                style={{
                  border: "none",
                  borderRadius: 16,
                  padding: "18px 8px",
                  cursor: "pointer",
                  background: `linear-gradient(135deg, ${x.columns[0]}, ${x.columns[4]})`,
                  color: x.textColor,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  minHeight: 112,
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 34, lineHeight: 1 }}>{x.emoji}</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{x.title}</span>
                <span style={{ fontSize: 11, opacity: 0.85 }}>{x.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div
          aria-hidden
          style={{
            display: "flex",
            justifyContent: "space-around",
            fontSize: 11,
            color: "#9C8A6E",
            marginTop: 6,
            paddingLeft: 20,
          }}
        >
          <span>← 쾌적함 낮음</span>
          <span>쾌적함 높음 →</span>
        </div>
      </div>
    );
  }

  const emotions = EMOTIONS.filter((e) => e.quadrant === q.id);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <p style={{ fontSize: 13, color: "#7A6A4E", margin: 0 }}>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 3,
              background: q.color,
              marginRight: 6,
            }}
          />
          <strong>{q.title}</strong> — 딱 맞는 낱말을 골라요
        </p>
        <button
          onClick={() => onQuadrant(null)}
          className="mc-focus"
          style={{
            border: "1px solid #E2D4B4",
            background: "transparent",
            borderRadius: 999,
            padding: "4px 10px",
            fontSize: 12,
            color: "#9C8A6E",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          ← 색 다시 고르기
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 4,
        }}
      >
        {emotions.map((emo) => {
          const isSel = selected?.id === emo.id;
          return (
            <button
              key={emo.id}
              onClick={() => onSelect(emo)}
              aria-pressed={isSel}
              title={`${emo.label} (${emo.en})`}
              className="mc-emo-btn mc-focus"
              style={{
                border: isSel ? "3px solid #3A2A14" : "3px solid transparent",
                background: emo.color,
                color: emo.textColor,
                borderRadius: 10,
                padding: "8px 2px 6px",
                cursor: "pointer",
                boxShadow: isSel ? "0 6px 14px rgba(0,0,0,0.3)" : "none",
                transform: isSel ? "scale(1.06)" : undefined,
                position: "relative",
                zIndex: isSel ? 1 : 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                minHeight: 84,
                minWidth: 0,
              }}
            >
              <div style={{ fontSize: 24, lineHeight: 1.1 }}>{emo.emoji}</div>
              <div
                style={{
                  fontSize: 11.5,
                  marginTop: 4,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  // 한국어는 낱말 단위로 줄을 바꿔야 읽기 쉽습니다.
                  wordBreak: "keep-all",
                  overflowWrap: "anywhere",
                }}
              >
                {emo.label}
              </div>
              <div style={{ fontSize: 9, opacity: 0.8, marginTop: 1 }}>{emo.en}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 화면: 학생 - 감정 선택 ---------- */

function StudentScreen({ student, onGoHome }) {
  const [quadrant, setQuadrant] = useState(null);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | done | error
  const [saveError, setSaveError] = useState(null);
  // 안내 문장은 학생이 쓰기 시작했거나 전달을 눌러 본 뒤에만 보여 줍니다.
  // 이유 칸이 뜨자마자 빨간 글씨부터 보이면 혼나는 느낌이 듭니다.
  const [reasonTouched, setReasonTouched] = useState(false);
  const dateKey = getTodayKey();
  const reasonProblem = checkReason(reason);
  const canSubmit = Boolean(selected) && !reasonProblem && status !== "saving";
  const exampleText =
    QUADRANTS.find((q) => q.id === selected?.quadrant)?.example ||
    "예) 쉬는 시간에 친구와 놀아서 즐거웠어요";

  const handleSubmit = async () => {
    setReasonTouched(true);
    if (!selected || reasonProblem) return;
    setStatus("saving");
    try {
      const { saveMood } = await loadMoodStore();
      await saveMood({
        dateKey,
        code: student.code,
        sessionId: student.sessionId,
        emotionId: selected.id,
        reason: cleanReason(reason),
      });
      setStatus("done");
    } catch (e) {
      console.error(e);
      setSaveError(e);
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div style={screenWrap}>
        <div
          style={{
            ...cardBase,
            textAlign: "center",
            animation: "mc-pop 0.3s ease",
          }}
        >
          <div
            style={{
              width: 92,
              height: 92,
              margin: "0 auto 12px",
              borderRadius: 24,
              background: selected.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 52,
              boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
            }}
          >
            {selected.emoji}
          </div>
          <p style={{ color: "#9C8A6E", fontSize: 14, margin: "0 0 4px" }}>
            <strong>{selected.label}</strong> 마음을 잘 전달했어요
          </p>
          <h2
            className="mc-hand"
            style={{ fontSize: 32, color: "#7A4F2B", margin: "6px 0 0" }}
          >
            행복한 하루 되세요! 🌤️
          </h2>
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              marginTop: 22,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => {
                setStatus("idle");
                setQuadrant(null);
                setSelected(null);
                setReason("");
                setReasonTouched(false);
              }}
              className="mc-focus"
              style={{
                padding: "11px 22px",
                borderRadius: 12,
                border: "1px solid #E2D4B4",
                background: "transparent",
                color: "#9C8A6E",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              다시 선택하기
            </button>
            <button
              onClick={onGoHome}
              className="mc-focus"
              style={{
                padding: "11px 22px",
                borderRadius: 12,
                border: "none",
                background: "#C0724A",
                color: "#FFFDF7",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              처음 화면으로
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={screenWrap}>
      <div style={{ ...cardBase, maxWidth: 480 }}>
        <p style={{ color: "#9C8A6E", fontSize: 13, marginBottom: 2 }}>
          {getTodayLabel()}
          {student.className && ` · ${student.className}`}
        </p>
        <h1
          className="mc-hand"
          style={{ fontSize: 26, color: "#7A4F2B", margin: "0 0 20px" }}
        >
          오늘 기분이 어때요?
        </h1>

        <MoodMeterPicker
          quadrant={quadrant}
          onQuadrant={(q) => {
            setQuadrant(q);
            setSelected(null);
          }}
          selected={selected}
          onSelect={setSelected}
        />

        {/* 이유 칸은 감정을 고른 다음에 나타납니다. */}
        {selected && (
          <>
            <label
              htmlFor="mc-reason"
              style={{
                display: "block",
                fontSize: 13,
                color: "#7A6A4E",
                margin: "20px 0 6px",
              }}
            >
              왜 <strong style={{ color: "#5B4A30" }}>{selected.label}</strong> 마음이
              들었나요? <span style={{ color: "#C0553A" }}>(꼭 써 주세요)</span>
            </label>
            <textarea
              id="mc-reason"
              value={reason}
              onChange={(e) => {
                setReason(stripCommas(e.target.value));
                setReasonTouched(true);
              }}
              maxLength={200}
              placeholder={exampleText}
              aria-invalid={reasonTouched && Boolean(reasonProblem)}
              aria-describedby="mc-reason-hint"
              className="mc-focus mc-reason"
              style={{
                ...inputStyle,
                minHeight: 60,
                resize: "vertical",
                borderColor:
                  reasonTouched && reasonProblem ? "#E0A48A" : inputStyle.border,
              }}
            />
            <p
              id="mc-reason-hint"
              style={{
                fontSize: 12,
                margin: "6px 2px 0",
                lineHeight: 1.5,
                color: reasonTouched && reasonProblem ? "#C0553A" : "#9C8A6E",
              }}
            >
              {reasonTouched && reasonProblem
                ? reasonProblem
                : reasonProblem
                  ? "어떤 일이 있었는지 한 문장으로 써 주세요."
                  : "좋아요! 이제 전달할 수 있어요 ✓"}
            </p>
          </>
        )}

        {status === "error" && (
          <ErrorNote lead="전달에 실패했어요." error={saveError} />
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mc-focus"
          style={{
            width: "100%",
            marginTop: 18,
            padding: "13px 0",
            borderRadius: 14,
            border: "none",
            background: canSubmit ? "#C0724A" : "#DCCBA9",
            color: "#FFFDF7",
            fontSize: 16,
            fontWeight: 700,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {status === "saving" ? "전달하는 중..." : "기분 전달하기"}
        </button>

        <button
          onClick={onGoHome}
          className="mc-focus"
          style={{
            width: "100%",
            marginTop: 10,
            padding: "10px 0",
            borderRadius: 12,
            border: "none",
            background: "transparent",
            color: "#9C8A6E",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          ← 처음 화면으로
        </button>
      </div>
    </div>
  );
}

const screenWrap = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "radial-gradient(circle at 20% 20%, #F6EFDE 0%, #EFE4CC 55%, #E6D8B8 100%)",
  padding: "24px",
};

const cardBase = {
  width: "100%",
  maxWidth: 420,
  background: "#FFFDF7",
  borderRadius: 20,
  padding: "32px 26px",
  boxShadow: "0 18px 40px rgba(120, 90, 40, 0.18)",
  border: "1px solid #EADFC5",
};

/* ---------- 화면: 교사 - 코르크보드 ---------- */

const ALL_CLASSES = "__all__";

/* ---------- 교사 화면: 학급 선택 칩 ---------- */

function ClassChip({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="mc-focus"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        border: active ? "1px solid #FFF6E4" : "1px solid #8E6E48",
        background: active ? "#FFF6E4" : "rgba(255,255,255,0.08)",
        color: active ? "#5C4126" : "#E8D9BE",
        borderRadius: 999,
        padding: "7px 14px",
        fontSize: 13,
        fontWeight: active ? 700 : 400,
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          background: active ? "#C0724A" : "rgba(255,255,255,0.15)",
          color: active ? "#FFFDF7" : "#FFF6E4",
          borderRadius: 999,
          minWidth: 18,
          textAlign: "center",
          fontWeight: 700,
          fontSize: 12,
          padding: "0 6px",
        }}
      >
        {count}
      </span>
    </button>
  );
}

/* ---------- 교사 화면: 학급 관리 패널 ---------- */

function ClassManager({ classes, onClose }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      setError("학급 이름과 코드를 모두 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const { saveClass } = await loadClassStore();
      await saveClass({ name, code });
      setName("");
      setCode("");
      setError("");
    } catch (err) {
      console.error(err);
      setError({ lead: "저장에 실패했어요.", error: err });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (cls) => {
    setBusy(true);
    try {
      const { removeClass } = await loadClassStore();
      await removeClass(cls.id);
      setError("");
    } catch (err) {
      console.error(err);
      setError({ lead: "삭제에 실패했어요.", error: err });
    } finally {
      setBusy(false);
    }
  };

  const panelInput = {
    ...inputStyle,
    background: "rgba(255,255,255,0.9)",
    border: "1px solid #C7A876",
  };

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.25)",
        border: "1px solid #C7A876",
        borderRadius: 16,
        padding: "18px 18px 20px",
        marginBottom: 22,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <h2
          className="mc-hand"
          style={{ color: "#FFF6E4", fontSize: 22, margin: 0 }}
        >
          학급 관리
        </h2>
        <button
          onClick={onClose}
          className="mc-focus"
          style={{
            border: "none",
            background: "transparent",
            color: "#E8D9BE",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          닫기 ✕
        </button>
      </div>

      {classes.length === 0 ? (
        <p style={{ color: "#E8D9BE", fontSize: 13, margin: "0 0 14px" }}>
          아직 등록된 학급이 없어요. 아래에서 추가해 주세요.
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {classes.map((cls) => (
            <div
              key={cls.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                background: "rgba(255,255,255,0.08)",
                borderRadius: 10,
                padding: "9px 12px",
              }}
            >
              <span style={{ color: "#FFF6E4", fontSize: 14 }}>
                {cls.name}
                <span
                  style={{ color: "#E8D9BE", opacity: 0.7, marginLeft: 8 }}
                >
                  코드 {cls.code}
                </span>
              </span>
              <button
                onClick={() => handleRemove(cls)}
                disabled={busy}
                className="mc-focus"
                style={{
                  border: "1px solid #C08B7A",
                  background: "transparent",
                  color: "#F3C6B6",
                  borderRadius: 8,
                  padding: "5px 10px",
                  fontSize: 12,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={handleAdd}
        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="학급 이름 (예: ○학년 ○반)"
          className="mc-focus"
          style={{ ...panelInput, flex: "2 1 200px", width: "auto" }}
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={40}
          placeholder="코드 (예: 3-2)"
          className="mc-focus"
          style={{ ...panelInput, flex: "1 1 140px", width: "auto" }}
        />
        <button
          type="submit"
          disabled={busy}
          className="mc-focus"
          style={{
            border: "none",
            borderRadius: 12,
            background: "#C0724A",
            color: "#FFFDF7",
            padding: "12px 20px",
            fontSize: 14,
            fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          추가
        </button>
      </form>

      {error &&
        (typeof error === "string" ? (
          <p style={{ color: "#F3C6B6", fontSize: 13, marginBottom: 0 }}>
            {error}
          </p>
        ) : (
          <ErrorNote
            lead={error.lead}
            error={error.error}
            color="#F3C6B6"
            style={{ marginTop: 0, marginBottom: 0 }}
          />
        ))}

      <p style={{ color: "#E8D9BE", fontSize: 12, opacity: 0.75, marginBottom: 0 }}>
        학생에게는 <strong>코드</strong>를 알려주세요. 학생이 입력한 코드로 학급이 나뉩니다.
      </p>
    </div>
  );
}

/* ---------- 교사 화면: 감정 통계 ---------- */

/**
 * 감정별 인원수 칩.
 * compact 를 켜면 인원이 0인 감정은 빼고 보여줍니다 (반별 요약용).
 */
/**
 * 감정별 인원 요약.
 *
 * 아무도 고르지 않은 감정은 빼고 보여줍니다. 감정이 24개까지 늘어나면서
 * 0 인 칸을 다 늘어놓으면 오늘 무엇이 많았는지가 그 사이에 묻힙니다.
 * (하나도 없는 날에는 요약 줄 대신 "아직 전달된 마음이 없어요" 가 뜹니다.)
 */
function EmotionSummary({ entries, compact = false }) {
  const resolved = entries.map((e) => findEmotion(e.emotionId));
  const counts = EMOTIONS.map((emo) => ({
    ...emo,
    count: resolved.filter((r) => r === emo).length,
  })).filter((c) => c.count > 0);

  // 무드 미터 네 칸(빨강·노랑·파랑·초록)별 인원
  const quadrantCounts = QUADRANTS.map((q) => ({
    ...q,
    count: resolved.filter((r) => r.quadrant === q.id).length,
  })).filter((q) => q.count > 0);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 6 : 8 }}>
      {quadrantCounts.map((q) => (
        <div
          key={q.id}
          title={`${q.title} (${q.hint})`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: q.color,
            color: q.textColor,
            borderRadius: 999,
            padding: compact ? "4px 10px" : "6px 12px",
            fontSize: compact ? 12 : 13,
            fontWeight: 700,
          }}
        >
          {q.label} {q.count}
        </div>
      ))}
      {quadrantCounts.length > 0 && (
        <span
          aria-hidden
          style={{ width: 1, alignSelf: "stretch", background: "rgba(255,255,255,0.25)" }}
        />
      )}
      {counts.map((c) => (
        <div
          key={c.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(255,255,255,0.1)",
            borderRadius: 999,
            padding: compact ? "4px 10px" : "6px 12px",
            fontSize: compact ? 12 : 13,
            color: "#FFF6E4",
          }}
        >
          <span>{c.emoji}</span>
          <span style={{ opacity: 0.85 }}>{c.label}</span>
          <span
            style={{
              background: c.color,
              color: c.textColor,
              borderRadius: 999,
              minWidth: 18,
              textAlign: "center",
              fontWeight: 700,
              padding: "0 6px",
            }}
          >
            {c.count}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------- 교사 화면: 기록 표 ---------- */

/**
 * 지우기 버튼. 실수로 남의 기록을 날리지 않도록 두 번 눌러야 지워집니다.
 * 브라우저 confirm 창은 쓰지 않습니다 — 이 앱은 어느 화면에서도 모달을
 * 띄우지 않고, 교실 화면에 갑자기 뜨는 시스템 창은 놀라기 쉽습니다.
 */
/** 이름이 없으므로 기록 한 건을 "오후 2:31 · 화난 기록" 처럼 부릅니다. */
function entryLabel(entry) {
  return `${formatTime(entry.updatedAt)} · ${findEmotion(entry.emotionId).label} 기록`;
}

function DeleteEntryButton({ entry, onDelete }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const base = {
    border: "1px solid #E4D5B6",
    background: "transparent",
    borderRadius: 999,
    padding: "3px 10px",
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  if (!asking) {
    return (
      <button
        onClick={() => setAsking(true)}
        className="mc-focus"
        title={`${entryLabel(entry)} 지우기`}
        aria-label={`${entryLabel(entry)} 지우기`}
        style={{ ...base, color: "#B9A886" }}
      >
        ✕
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button
        onClick={async () => {
          setBusy(true);
          // 지워지면 구독이 이 줄을 통째로 걷어가므로 busy 를 되돌릴 필요가
          // 없지만, 실패했을 때는 다시 누를 수 있어야 합니다.
          try {
            await onDelete(entry);
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
        disabled={busy}
        className="mc-focus"
        style={{
          ...base,
          border: "1px solid #D98B6A",
          background: "#D98B6A",
          color: "#FFF6E4",
          fontWeight: 700,
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "지우는 중" : "지울까요?"}
      </button>
      <button
        onClick={() => setAsking(false)}
        disabled={busy}
        className="mc-focus"
        style={{ ...base, color: "#9C8A6E" }}
      >
        취소
      </button>
    </span>
  );
}

function EntryTable({ entries, showClassColumn, classLabelFor, onDelete, style }) {
  return (
    <div
      className="mc-scrollbar"
      style={{
        background: "#FFFDF7",
        borderRadius: 14,
        overflowX: "auto",
        boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
        ...style,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 14,
          minWidth: (showClassColumn ? 560 : 460) + (onDelete ? 80 : 0),
        }}
      >
        <thead>
          <tr style={{ background: "#F1E6CE" }}>
            <th style={thStyle}>감정</th>
            {showClassColumn && <th style={thStyle}>반</th>}
            <th style={thStyle}>이유</th>
            <th style={{ ...thStyle, textAlign: "right" }}>시간</th>
            {onDelete && (
              <th style={{ ...thStyle, textAlign: "right" }} aria-label="지우기" />
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const emotion = findEmotion(entry.emotionId);
            return (
              <tr
                key={entry.id}
                style={{
                  background: i % 2 ? "#FBF6E9" : "#FFFDF7",
                  borderTop: "1px solid #EFE3C8",
                }}
              >
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: emotion.color,
                      color: emotion.textColor,
                      borderRadius: 999,
                      padding: "4px 11px",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{emotion.emoji}</span>
                    {emotion.label}
                  </span>
                </td>
                {showClassColumn && (
                  <td
                    style={{
                      ...tdStyle,
                      color: "#9C8A6E",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {classLabelFor(entry)}
                  </td>
                )}
                <td
                  style={{
                    ...tdStyle,
                    color: "#5B4A30",
                    lineHeight: 1.5,
                    minWidth: 200,
                  }}
                >
                  {cleanReason(entry.reason) || (
                    <span style={{ color: "#C4B593" }}>—</span>
                  )}
                </td>
                <td
                  style={{
                    ...tdStyle,
                    color: "#9C8A6E",
                    textAlign: "right",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatTime(entry.updatedAt)}
                </td>
                {onDelete && (
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <DeleteEntryButton entry={entry} onDelete={onDelete} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 교사 화면: 게시판 ---------- */

/* ---------- 교사 화면: 색깔별 보기 ---------- */

/**
 * 색깔별로 보여 줄 순서. 살펴봐야 할 마음(빨강·파랑)이 먼저 오도록
 * 무드 미터 판의 순서(빨강·노랑·파랑·초록)와 다르게 둡니다.
 */
const COLOR_VIEW_ORDER = ["red", "blue", "yellow", "green"];

const VIEW_OPTIONS = [
  { id: "color", label: "🎨 색깔별" },
  { id: "class", label: "🏫 반별" },
];

/** 기록을 무드 미터 네 칸으로 나눕니다. 모르는 감정은 "기타" 로 따로 모읍니다. */
function groupByColor(entries) {
  const groups = COLOR_VIEW_ORDER.map((id) => ({
    ...QUADRANTS.find((q) => q.id === id),
    entries: [],
  }));
  const other = { id: "other", label: "기타", title: "알 수 없는 감정", hint: "", color: "#D6C6A8", textColor: "#4A3418", emoji: "❔", entries: [] };
  for (const entry of entries) {
    const q = findEmotion(entry.emotionId).quadrant;
    (groups.find((g) => g.id === q) || other).entries.push(entry);
  }
  return other.entries.length ? [...groups, other] : groups;
}

/**
 * 한 색깔의 문장들을 쉼표로 이어 붙입니다.
 * 엔트리 "모델 학습"의 텍스트 데이터는 쉼표로 한 개씩 나뉘므로,
 * 문장 안의 쉼표는 이미 cleanReason 에서 지워져 있어야 개수가 맞습니다.
 */
function joinSentences(entries) {
  return entries
    .map((e) => cleanReason(e.reason))
    .filter(Boolean)
    .join(",");
}

/** 클립보드에 복사. 학교 PC 처럼 clipboard API 가 막힌 곳을 위해 옛 방식도 씁니다. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

/**
 * 네 색깔의 문장 개수를 큰 숫자 타일로 보여 줍니다.
 * 엔트리에 붙여넣을 개수와 같도록, 이유가 비어 있는 (예전) 기록은 세지 않습니다.
 */
function ColorCounts({ groups }) {
  const countOf = (g) => g.entries.filter((e) => cleanReason(e.reason)).length;
  const total = groups.reduce((sum, g) => sum + countOf(g), 0);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: 10,
        marginBottom: 22,
      }}
    >
      {groups.map((g) => {
        const n = countOf(g);
        return (
          <a
            key={g.id}
            href={`#mc-color-${g.id}`}
            className="mc-focus"
            style={{
              background: g.color,
              color: g.textColor,
              borderRadius: 14,
              padding: "12px 14px",
              textDecoration: "none",
              boxShadow: "0 6px 16px rgba(0,0,0,0.22)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 28 }}>{g.emoji}</span>
            <span>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>
                {g.label}
              </span>
              <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
                {n}개
              </span>
              {total > 0 && (
                <span style={{ fontSize: 12, opacity: 0.85, marginLeft: 4 }}>
                  {Math.round((n / total) * 100)}%
                </span>
              )}
            </span>
          </a>
        );
      })}
    </div>
  );
}

/**
 * 한 색깔의 문장 모음.
 * 위에는 쉼표로 이어 붙인 전체 문장(엔트리에 붙여넣을 그대로)과 복사 버튼,
 * 아래에는 문장 하나하나를 감정·반·시간과 함께 보여 줍니다.
 * onDelete 가 있으면(선생님 화면) 문장마다 지우기 버튼이 붙습니다.
 */
function ColorSection({ group, classLabelFor, showClass, onDelete }) {
  const [copied, setCopied] = useState(null); // null | "ok" | "fail"
  const joined = joinSentences(group.entries);
  const count = joined ? joined.split(",").length : 0;

  const handleCopy = async () => {
    const ok = await copyText(joined);
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <section
      id={`mc-color-${group.id}`}
      style={{
        background: "#FFFDF7",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
        scrollMarginTop: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          background: group.color,
          color: group.textColor,
          padding: "10px 16px",
        }}
      >
        <span style={{ fontSize: 22 }}>{group.emoji}</span>
        <h2 style={{ fontSize: 18, margin: 0 }}>
          {group.label} · {group.title}
        </h2>
        <span style={{ fontWeight: 800, fontSize: 18 }}>{count}개</span>
        <button
          onClick={handleCopy}
          disabled={!joined}
          className="mc-focus"
          style={{
            marginLeft: "auto",
            border: "none",
            borderRadius: 999,
            padding: "7px 14px",
            fontSize: 13,
            fontWeight: 700,
            background: "#FFFDF7",
            color: "#5C4126",
            cursor: joined ? "pointer" : "not-allowed",
            opacity: joined ? 1 : 0.6,
          }}
        >
          {copied === "ok"
            ? `✓ ${count}개 복사했어요`
            : copied === "fail"
              ? "복사가 막혔어요 — 아래 칸을 직접 복사해요"
              : "📋 쉼표로 이어서 복사"}
        </button>
      </div>

      {joined ? (
        <>
          {/* 복사될 내용을 그대로 보여 줍니다. 클릭하면 전체가 선택돼서 직접 복사해도 됩니다. */}
          <textarea
            readOnly
            value={joined}
            onFocus={(e) => e.target.select()}
            aria-label={`${group.label} 문장 ${count}개, 쉼표로 이어 붙인 것`}
            className="mc-focus"
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              minHeight: 64,
              border: "none",
              borderBottom: "1px solid #EFE3C8",
              background: "#FBF6E9",
              color: "#5B4A30",
              padding: "10px 16px",
              fontSize: 13,
              lineHeight: 1.6,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
          <ul style={{ listStyle: "none", margin: 0, padding: "6px 0" }}>
            {group.entries.map((entry) => {
              const emo = findEmotion(entry.emotionId);
              const text = cleanReason(entry.reason);
              return (
                <li
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 10,
                    padding: "8px 16px",
                    borderTop: "1px solid #F3EAD6",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      background: emo.color,
                      color: emo.textColor,
                      borderRadius: 999,
                      padding: "3px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {emo.emoji} {emo.label}
                  </span>
                  <span style={{ flex: "1 1 200px", color: "#4A3418", fontSize: 14 }}>
                    {text || <span style={{ color: "#C4B593" }}>(이유 없음)</span>}
                  </span>
                  <span style={{ color: "#9C8A6E", fontSize: 12, whiteSpace: "nowrap" }}>
                    {showClass && `${classLabelFor(entry)} · `}
                    {formatTime(entry.updatedAt)}
                  </span>
                  {onDelete && <DeleteEntryButton entry={entry} onDelete={onDelete} />}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p style={{ margin: 0, padding: "14px 16px", color: "#9C8A6E", fontSize: 13 }}>
          아직 이 색깔의 문장이 없어요.
        </p>
      )}
    </section>
  );
}

/** 색깔별 문장 모음 전체: 개수 타일 + 네 색 묶음. 학생용·선생님용이 함께 씁니다. */
function SentenceBoard({ entries, classLabelFor, showClass, onDelete }) {
  const groups = groupByColor(entries);
  return (
    <>
      <ColorCounts groups={groups} />
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {groups.map((g) => (
          <ColorSection
            key={g.id}
            group={g}
            classLabelFor={classLabelFor}
            showClass={showClass}
            onDelete={onDelete}
          />
        ))}
      </div>
    </>
  );
}

/**
 * 선생님 확인용: 오늘 기록 전체(모든 반)를 CSV(엑셀에서 열림)로 내려받습니다.
 * 반 → 색깔 → 시간 순서로 정리합니다.
 * 맨 앞의 BOM(﻿) 이 없으면 엑셀이 한글을 깨뜨려서 엽니다.
 */
function downloadAllCsv({ entries, classLabelFor, classOrder, dateKey }) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const colorRank = (e) => {
    const i = COLOR_VIEW_ORDER.indexOf(findEmotion(e.emotionId).quadrant);
    return i < 0 ? 99 : i;
  };
  const sorted = [...entries].sort(
    (a, b) =>
      classOrder(a) - classOrder(b) ||
      String(classLabelFor(a)).localeCompare(String(classLabelFor(b)), "ko") ||
      colorRank(a) - colorRank(b) ||
      (a.updatedAt?.toMillis?.() ?? 0) - (b.updatedAt?.toMillis?.() ?? 0)
  );
  const rows = [["날짜", "반", "색깔", "마음", "감정", "영어", "이유", "시간"]];
  for (const entry of sorted) {
    const emo = findEmotion(entry.emotionId);
    const q = QUADRANTS.find((x) => x.id === emo.quadrant);
    rows.push([
      dateKey,
      classLabelFor(entry),
      q ? q.label : "기타",
      q ? q.title : "",
      emo.label,
      emo.en,
      cleanReason(entry.reason),
      formatTime(entry.updatedAt),
    ]);
  }
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `마음기록_${dateKey}_전체.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- 화면: 모은 문장 보기 (학생도 열 수 있음, 읽기 전용) ---------- */

/**
 * 엔트리 모델 학습에 붙여넣을 문장을 학생이 직접 복사해 가는 화면.
 * 이름을 받지 않으므로 누가 쓴 문장인지는 드러나지 않습니다. 지우기는 없습니다.
 */
function DataScreen({ onGoHome }) {
  const [entries, setEntries] = useState([]);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(ALL_CLASSES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const dateKey = getTodayKey();

  useEffect(
    () =>
      subscribeLazily(async () => {
        const { subscribeMoods } = await loadMoodStore();
        return subscribeMoods(
          dateKey,
          (list) => {
            setEntries(list);
            setError(null);
            setLoading(false);
          },
          (err) => {
            setError(err);
            setLoading(false);
          }
        );
      }, (err) => {
        setError(err);
        setLoading(false);
      }),
    [dateKey]
  );

  useEffect(
    () =>
      subscribeLazily(async () => {
        const { subscribeClasses } = await loadClassStore();
        return subscribeClasses(setClasses, (err) => console.error(err));
      }, (err) => console.error(err)),
    []
  );

  const classList = classListFrom(classes);
  const chosen = classList.find((c) => c.id === classId) || null;
  const visible = chosen
    ? entries.filter((e) => makeClassKey(e.code) === chosen.id)
    : entries;
  const classLabelFor = (entry) =>
    classList.find((c) => c.id === makeClassKey(entry.code))?.name || entry.code;

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at top, #8C6A44 0%, #6E4F30 60%, #5C4126 100%)",
        padding: "28px 16px 60px",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div>
            <h1 className="mc-hand" style={{ color: "#FFF6E4", fontSize: 28, margin: 0 }}>
              모은 문장 보기
            </h1>
            <p style={{ color: "#E8D9BE", fontSize: 13, marginTop: 4 }}>
              {getTodayLabel()} · 색깔마다 <strong>📋 쉼표로 이어서 복사</strong>를
              눌러 엔트리 모델 학습에 붙여넣어요
            </p>
          </div>
          <button
            onClick={onGoHome}
            className="mc-focus"
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              border: "1px solid #C7A876",
              background: "rgba(255,255,255,0.08)",
              color: "#FFF6E4",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ← 처음 화면으로
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          <ClassChip
            label="전체"
            count={entries.length}
            active={!chosen}
            onClick={() => setClassId(ALL_CLASSES)}
          />
          {classList.map((cls) => (
            <ClassChip
              key={cls.id}
              label={cls.name}
              count={entries.filter((e) => makeClassKey(e.code) === cls.id).length}
              active={chosen?.id === cls.id}
              onClick={() => setClassId(cls.id)}
            />
          ))}
        </div>

        {error ? (
          <ErrorNote lead="불러오지 못했어요." error={error} color="#F3C6B6" />
        ) : loading ? (
          <p style={{ color: "#E8D9BE" }}>불러오는 중...</p>
        ) : (
          <SentenceBoard
            entries={visible}
            classLabelFor={classLabelFor}
            showClass={!chosen}
          />
        )}
      </div>
    </div>
  );
}

function TeacherScreen({ onGoHome }) {
  const [viewBy, setViewBy] = useState("color");
  const [entries, setEntries] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(ALL_CLASSES);
  const [showManager, setShowManager] = useState(false);
  const [sortBy, setSortBy] = useState("recent");
  const [loading, setLoading] = useState(true);
  // 실패했을 때만 { lead, error } 를 담습니다. 성공하면 다시 null 로 비웁니다.
  const [error, setError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const dateKey = getTodayKey();

  /**
   * 기록 한 건 지우기. 성공하면 구독이 알아서 목록에서 빼 주므로
   * 여기서 따로 상태를 손대지 않습니다.
   */
  const handleDeleteEntry = async (entry) => {
    try {
      const { removeMood } = await loadMoodStore();
      await removeMood(dateKey, entry.id);
      setDeleteError(null);
    } catch (err) {
      console.error(err);
      setDeleteError({
        lead: `${entryLabel(entry)}을 지우지 못했어요.`,
        error: err,
      });
    }
  };

  const handleLoadError = (err) => {
    console.error(err);
    setError({ lead: "불러오지 못했어요.", error: err });
    setLoading(false);
  };

  useEffect(
    () =>
      subscribeLazily(async () => {
        const { subscribeMoods } = await loadMoodStore();
        return subscribeMoods(
          dateKey,
          (list) => {
            setEntries(list);
            setError(null);
            setLoading(false);
          },
          handleLoadError
        );
      }, handleLoadError),
    [dateKey]
  );

  useEffect(
    () =>
      subscribeLazily(async () => {
        const { subscribeClasses } = await loadClassStore();
        return subscribeClasses(setClasses, (err) => console.error(err));
      }, (err) => console.error(err)),
    []
  );

  // 등록된 학급이 없으면 기본 네 반(1반~4반)을 씁니다.
  const classList = classListFrom(classes);

  // 선택한 학급이 삭제되면 전체 보기로 되돌립니다.
  useEffect(() => {
    if (
      selectedClassId !== ALL_CLASSES &&
      !classList.some((c) => c.id === selectedClassId)
    ) {
      setSelectedClassId(ALL_CLASSES);
    }
  }, [classList, selectedClassId]);

  const selectedClass = classList.find((c) => c.id === selectedClassId) || null;

  const visibleEntries = selectedClass
    ? entries.filter((e) => makeClassKey(e.code) === selectedClass.id)
    : entries;

  /** 쪽지에 붙일 학급 이름. 등록되지 않은 코드는 코드 그대로 보여줍니다. */
  const classLabelFor = (entry) => {
    const match = classList.find((c) => c.id === makeClassKey(entry.code));
    return match ? match.name : entry.code;
  };

  /** 엑셀에서 반을 학급 목록 순서(1반, 2반 …)대로 놓기 위한 번호. */
  const classOrder = (entry) => {
    const i = classList.findIndex((c) => c.id === makeClassKey(entry.code));
    return i < 0 ? 999 : i;
  };

  const countForClass = (cls) =>
    entries.filter((e) => makeClassKey(e.code) === cls.id).length;

  // 최신순은 moodStore 에서 이미 정렬해 오므로 그대로 둡니다.
  const sortedEntries = [...visibleEntries].sort((a, b) => {
    if (sortBy === "emotion") {
      return emotionOrder(a.emotionId) - emotionOrder(b.emotionId);
    }
    return 0;
  });

  /**
   * 전체 보기에서 기록을 반별로 묶습니다.
   * 등록되지 않은 코드도 그 코드 자체를 하나의 묶음으로 만들어서,
   * 학급을 등록하기 전에도 반별로 나뉘어 보입니다.
   * 등록된 학급을 먼저, 그다음 인원이 많은 순서로 배치합니다.
   */
  const classGroups = [];
  if (!selectedClass) {
    const byKey = new Map();
    for (const entry of sortedEntries) {
      const key = makeClassKey(entry.code);
      if (!byKey.has(key)) {
        const registered = classList.find((c) => c.id === key);
        byKey.set(key, {
          key,
          label: registered ? registered.name : entry.code,
          registered: Boolean(registered),
          entries: [],
        });
      }
      byKey.get(key).entries.push(entry);
    }
    classGroups.push(...byKey.values());
    classGroups.sort((a, b) => {
      if (a.registered !== b.registered) return a.registered ? -1 : 1;
      if (a.registered) return classOrder(a.entries[0]) - classOrder(b.entries[0]);
      return b.entries.length - a.entries.length;
    });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at top, #8C6A44 0%, #6E4F30 60%, #5C4126 100%)",
        padding: "28px 20px 60px",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <div>
            <h1
              className="mc-hand"
              style={{ color: "#FFF6E4", fontSize: 30, margin: 0 }}
            >
              오늘의 마음 게시판
            </h1>
            <p style={{ color: "#E8D9BE", fontSize: 13, marginTop: 4 }}>
              {getTodayLabel()} ·{" "}
              {selectedClass ? `${selectedClass.name} ` : "전체 "}
              {visibleEntries.length}명 전달
              <span style={{ marginLeft: 8, opacity: 0.75 }}>
                · 실시간으로 자동 업데이트돼요
              </span>
            </p>
          </div>
          <button
            onClick={onGoHome}
            className="mc-focus"
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              border: "1px solid #C7A876",
              background: "rgba(255,255,255,0.08)",
              color: "#FFF6E4",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ← 처음 화면으로
          </button>
        </div>

        {/* 학급 선택 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <ClassChip
            label="전체"
            count={entries.length}
            active={selectedClassId === ALL_CLASSES}
            onClick={() => setSelectedClassId(ALL_CLASSES)}
          />
          {classList.map((cls) => (
            <ClassChip
              key={cls.id}
              label={cls.name}
              count={countForClass(cls)}
              active={selectedClassId === cls.id}
              onClick={() => setSelectedClassId(cls.id)}
            />
          ))}
          <button
            onClick={() => setShowManager((v) => !v)}
            className="mc-focus"
            style={{
              border: "1px dashed #C7A876",
              background: "transparent",
              color: "#E8D9BE",
              borderRadius: 999,
              padding: "7px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ⚙️ 학급 관리
          </button>
        </div>

        {showManager && (
          <ClassManager
            classes={classes}
            onClose={() => setShowManager(false)}
          />
        )}

        {/* 전체 통계 바 */}
        <div style={{ marginBottom: 26 }}>
          <EmotionSummary entries={visibleEntries} />
        </div>

        {error && (
          <ErrorNote
            lead={error.lead}
            error={error.error}
            color="#F3C6B6"
            style={{ marginTop: 0, marginBottom: 14 }}
          />
        )}

        {deleteError && (
          <ErrorNote
            lead={deleteError.lead}
            error={deleteError.error}
            color="#F3C6B6"
            style={{ marginTop: 0, marginBottom: 14 }}
          />
        )}

        {loading ? (
          <p style={{ color: "#E8D9BE" }}>불러오는 중...</p>
        ) : visibleEntries.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#E8D9BE",
              padding: "60px 0",
              fontSize: 15,
            }}
          >
            {selectedClass
              ? `${selectedClass.name}에서 아직 전달된 마음이 없어요. 학생들에게 코드 ${selectedClass.code} 를 알려주세요.`
              : "아직 전달된 마음이 없어요. 학생들이 입장하면 여기에 쌓여요."}
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                marginBottom: 14,
              }}
            >
              <span style={{ color: "#E8D9BE", fontSize: 13, opacity: 0.8 }}>
                보기
              </span>
              {VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setViewBy(opt.id)}
                  aria-pressed={viewBy === opt.id}
                  className="mc-focus"
                  style={{
                    border:
                      viewBy === opt.id ? "1px solid #FFF6E4" : "1px solid #8E6E48",
                    background:
                      viewBy === opt.id ? "#FFF6E4" : "rgba(255,255,255,0.08)",
                    color: viewBy === opt.id ? "#5C4126" : "#E8D9BE",
                    fontWeight: viewBy === opt.id ? 700 : 400,
                    borderRadius: 999,
                    padding: "5px 13px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
              <span
                aria-hidden
                style={{ width: 1, height: 18, background: "#8E6E48", margin: "0 4px" }}
              />
              <span style={{ color: "#E8D9BE", fontSize: 13, opacity: 0.8 }}>
                정렬
              </span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSortBy(opt.id)}
                  aria-pressed={sortBy === opt.id}
                  className="mc-focus"
                  style={{
                    border:
                      sortBy === opt.id
                        ? "1px solid #FFF6E4"
                        : "1px solid #8E6E48",
                    background:
                      sortBy === opt.id ? "#FFF6E4" : "rgba(255,255,255,0.08)",
                    color: sortBy === opt.id ? "#5C4126" : "#E8D9BE",
                    fontWeight: sortBy === opt.id ? 700 : 400,
                    borderRadius: 999,
                    padding: "5px 13px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() =>
                  downloadAllCsv({ entries, classLabelFor, classOrder, dateKey })
                }
                className="mc-focus"
                title="오늘 기록 전체(모든 반)를 반 → 색깔 순서로 정리해서 엑셀 파일로 내려받아요"
                style={{
                  marginLeft: "auto",
                  border: "1px solid #C7A876",
                  background: "rgba(255,255,255,0.12)",
                  color: "#FFF6E4",
                  borderRadius: 999,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                📥 전체 데이터 엑셀로 받기
              </button>
            </div>

            {viewBy === "color" ? (
              <SentenceBoard
                entries={sortedEntries}
                classLabelFor={classLabelFor}
                showClass={!selectedClass}
                onDelete={handleDeleteEntry}
              />
            ) : selectedClass ? (
              <EntryTable
                entries={sortedEntries}
                showClassColumn={false}
                classLabelFor={classLabelFor}
                onDelete={handleDeleteEntry}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                {classGroups.map((group) => (
                  <section key={group.key}>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <h2
                        className="mc-hand"
                        style={{ color: "#FFF6E4", fontSize: 24, margin: 0 }}
                      >
                        {group.label}
                      </h2>
                      <span
                        style={{ color: "#E8D9BE", fontSize: 13, opacity: 0.85 }}
                      >
                        {group.entries.length}명
                      </span>
                      {!group.registered && (
                        <span
                          title="학급 관리에서 이 코드로 반을 등록하면 반 이름으로 표시됩니다"
                          style={{
                            border: "1px dashed #C7A876",
                            color: "#E8D9BE",
                            borderRadius: 999,
                            padding: "2px 9px",
                            fontSize: 11,
                            opacity: 0.85,
                          }}
                        >
                          미등록 코드
                        </span>
                      )}
                      <EmotionSummary entries={group.entries} compact />
                    </div>
                    <EntryTable
                      entries={group.entries}
                      showClassColumn={false}
                      classLabelFor={classLabelFor}
                      onDelete={handleDeleteEntry}
                    />
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- 루트 ---------- */

export default function MoodCheckIn() {
  const [session, setSession] = useState(null); // {role:'student', code, className, sessionId} | {role:'data'} | {role:'teacher'}

  if (!isFirebaseConfigured) {
    return (
      <div className="mc-root">
        <GlobalStyle />
        <SetupNotice />
      </div>
    );
  }

  return (
    <div className="mc-root">
      <GlobalStyle />
      {!session && <LoginScreen onEnter={setSession} />}
      {session?.role === "student" && (
        <StudentScreen student={session} onGoHome={() => setSession(null)} />
      )}
      {session?.role === "data" && (
        <DataScreen onGoHome={() => setSession(null)} />
      )}
      {session?.role === "teacher" && (
        <TeacherScreen onGoHome={() => setSession(null)} />
      )}
    </div>
  );
}
