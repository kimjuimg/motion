import React, { useEffect, useState } from "react";
import { isFirebaseConfigured } from "./firebase";
import { saveMood, subscribeMoods } from "./moodStore";
import {
  makeClassKey,
  removeClass,
  saveClass,
  subscribeClasses,
} from "./classStore";

/* ---------- 데이터 ---------- */

const EMOTIONS = [
  { id: "excited", emoji: "😆", label: "신남", color: "#F3CD5C" },
  { id: "happy", emoji: "😊", label: "행복", color: "#F3CD5C" },
  { id: "calm", emoji: "😌", label: "편안", color: "#9DBF8E" },
  { id: "meh", emoji: "😐", label: "무덤덤", color: "#9DBF8E" },
  { id: "sad", emoji: "😢", label: "슬픔", color: "#ACA0D8" },
  { id: "down", emoji: "😔", label: "속상", color: "#ACA0D8" },
  { id: "angry", emoji: "😠", label: "화남", color: "#E28B6D" },
  { id: "anxious", emoji: "😰", label: "불안", color: "#E28B6D" },
  { id: "tired", emoji: "😴", label: "피곤", color: "#D6C6A8" },
];

const EMOTION_BY_ID = Object.fromEntries(EMOTIONS.map((e) => [e.id, e]));
const FALLBACK_EMOTION = {
  id: "unknown",
  emoji: "❔",
  label: "알 수 없음",
  color: "#D6C6A8",
};

/**
 * 선생님 화면 진입 코드.
 * 이 값은 브라우저 번들에 포함되므로 진짜 보안 장치가 아니라 교실용 칸막이입니다.
 * 바꾸려면 아래 기본값을 수정하거나, 배포 환경변수 VITE_TEACHER_CODE 를 설정하세요.
 */
const TEACHER_CODE = import.meta.env.VITE_TEACHER_CODE || "motion2026";
/** 감정 목록에 적힌 순서. 감정순 정렬에서 같은 감정끼리 묶는 데 씁니다. */
const EMOTION_ORDER = Object.fromEntries(EMOTIONS.map((e, i) => [e.id, i]));

const SORT_OPTIONS = [
  { id: "recent", label: "최신순" },
  { id: "name", label: "이름순" },
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
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [goTeacher, setGoTeacher] = useState(false);
  const [teacherCodeInput, setTeacherCodeInput] = useState("");
  const [teacherError, setTeacherError] = useState("");
  const [classes, setClasses] = useState([]);

  // 등록된 반 목록을 받아와서, 학생이 친 코드가 어느 반인지 바로 보여줍니다.
  useEffect(() => {
    const stop = subscribeClasses(setClasses, (err) => console.error(err));
    return stop;
  }, []);

  const typedCode = code.trim();
  const matchedClass =
    typedCode && classes.find((c) => c.id === makeClassKey(typedCode));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !typedCode) {
      setError("이름과 반 코드를 모두 입력해 주세요.");
      return;
    }
    setError("");
    onEnter({
      role: "student",
      name: name.trim(),
      code: typedCode,
      className: matchedClass ? matchedClass.name : "",
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
                이름과 우리 반 코드를 입력하고 들어와요
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  color: "#7A6A4E",
                  marginBottom: 6,
                }}
              >
                이름
              </label>
              <input
                className="mc-focus"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                placeholder="예: 김린하"
                style={inputStyle}
              />

              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  color: "#7A6A4E",
                  margin: "16px 0 6px",
                }}
              >
                우리 반
              </label>
              <input
                className="mc-focus"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={40}
                placeholder="선생님이 알려준 반 코드 (예: 3-2)"
                style={inputStyle}
              />

              {matchedClass ? (
                <p
                  style={{
                    color: "#5E7A4E",
                    fontSize: 13,
                    margin: "8px 0 0",
                  }}
                >
                  ✓ 우리 반: <strong>{matchedClass.name}</strong>
                </p>
              ) : (
                typedCode &&
                classes.length > 0 && (
                  <p
                    style={{
                      color: "#A8845C",
                      fontSize: 13,
                      margin: "8px 0 0",
                    }}
                  >
                    등록된 반 코드가 아니에요. 선생님이 알려준 코드가 맞는지
                    확인해 주세요.
                  </p>
                )
              )}

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

/* ---------- 화면: 학생 - 감정 선택 ---------- */

function StudentScreen({ student, onGoHome }) {
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | done | error
  const dateKey = getTodayKey();

  const handleSubmit = async () => {
    if (!selected) return;
    setStatus("saving");
    try {
      await saveMood({
        dateKey,
        code: student.code,
        name: student.name,
        emotionId: selected.id,
        reason: reason.trim(),
      });
      setStatus("done");
    } catch (e) {
      console.error(e);
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
          <div style={{ fontSize: 56, marginBottom: 10 }}>{selected.emoji}</div>
          <p style={{ color: "#9C8A6E", fontSize: 14, margin: "0 0 4px" }}>
            {student.name}님의 <strong>{selected.label}</strong> 마음을 잘 전달했어요
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
                setSelected(null);
                setReason("");
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
          {student.name}님, 오늘 기분이 어때요?
        </h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}
        >
          {EMOTIONS.map((emo) => {
            const isSel = selected?.id === emo.id;
            return (
              <button
                key={emo.id}
                onClick={() => setSelected(emo)}
                aria-pressed={isSel}
                className="mc-emo-btn mc-focus"
                style={{
                  border: isSel ? "2px solid #7A4F2B" : "1px solid #EADFC5",
                  background: isSel ? emo.color : "#FFFCF4",
                  borderRadius: 14,
                  padding: "14px 6px",
                  cursor: "pointer",
                  boxShadow: isSel ? "0 6px 14px rgba(122,79,43,0.25)" : "none",
                }}
              >
                <div style={{ fontSize: 30 }}>{emo.emoji}</div>
                <div
                  style={{
                    fontSize: 13,
                    marginTop: 4,
                    color: "#5B4A30",
                    fontWeight: isSel ? 700 : 400,
                  }}
                >
                  {emo.label}
                </div>
              </button>
            );
          })}
        </div>

        <label
          style={{
            display: "block",
            fontSize: 13,
            color: "#7A6A4E",
            margin: "20px 0 6px",
          }}
        >
          이유 (선택)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder="한 줄로 이야기해 볼까요?"
          className="mc-focus"
          style={{
            ...inputStyle,
            minHeight: 60,
            resize: "vertical",
          }}
        />

        {status === "error" && (
          <p style={{ color: "#C0553A", fontSize: 13, marginTop: 10 }}>
            전달에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!selected || status === "saving"}
          className="mc-focus"
          style={{
            width: "100%",
            marginTop: 18,
            padding: "13px 0",
            borderRadius: 14,
            border: "none",
            background: selected ? "#C0724A" : "#DCCBA9",
            color: "#FFFDF7",
            fontSize: 16,
            fontWeight: 700,
            cursor: selected ? "pointer" : "not-allowed",
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
      await saveClass({ name, code });
      setName("");
      setCode("");
      setError("");
    } catch (err) {
      console.error(err);
      setError("저장에 실패했어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (cls) => {
    setBusy(true);
    try {
      await removeClass(cls.id);
      setError("");
    } catch (err) {
      console.error(err);
      setError("삭제에 실패했어요. 잠시 뒤 다시 시도해 주세요.");
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
          placeholder="학급 이름 (예: 3학년 2반)"
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

      {error && (
        <p style={{ color: "#F3C6B6", fontSize: 13, marginBottom: 0 }}>
          {error}
        </p>
      )}

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
function EmotionSummary({ entries, compact = false }) {
  const counts = EMOTIONS.map((emo) => ({
    ...emo,
    count: entries.filter((e) => e.emotionId === emo.id).length,
  })).filter((c) => !compact || c.count > 0);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 6 : 8 }}>
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
              color: "#4A3418",
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

function EntryTable({ entries, showClassColumn, classLabelFor }) {
  return (
    <div
      className="mc-scrollbar"
      style={{
        background: "#FFFDF7",
        borderRadius: 14,
        overflowX: "auto",
        boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 14,
          minWidth: showClassColumn ? 640 : 540,
        }}
      >
        <thead>
          <tr style={{ background: "#F1E6CE" }}>
            <th style={thStyle}>감정</th>
            <th style={thStyle}>이름</th>
            {showClassColumn && <th style={thStyle}>반</th>}
            <th style={thStyle}>이유</th>
            <th style={{ ...thStyle, textAlign: "right" }}>시간</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => {
            const emotion = EMOTION_BY_ID[entry.emotionId] || FALLBACK_EMOTION;
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
                      color: "#4A3418",
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
                <td
                  style={{
                    ...tdStyle,
                    fontWeight: 700,
                    color: "#5B4A30",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.name}
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
                  {entry.reason || <span style={{ color: "#C4B593" }}>—</span>}
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 교사 화면: 게시판 ---------- */

function TeacherScreen({ onGoHome }) {
  const [entries, setEntries] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(ALL_CLASSES);
  const [showManager, setShowManager] = useState(false);
  const [sortBy, setSortBy] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const dateKey = getTodayKey();

  useEffect(() => {
    const stop = subscribeMoods(
      dateKey,
      (list) => {
        setEntries(list);
        setError("");
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError("불러오지 못했어요. 인터넷 연결과 Firestore 보안 규칙을 확인해 주세요.");
        setLoading(false);
      }
    );
    return stop;
  }, [dateKey]);

  useEffect(() => {
    const stop = subscribeClasses(setClasses, (err) => console.error(err));
    return stop;
  }, []);

  // 선택한 학급이 삭제되면 전체 보기로 되돌립니다.
  useEffect(() => {
    if (
      selectedClassId !== ALL_CLASSES &&
      !classes.some((c) => c.id === selectedClassId)
    ) {
      setSelectedClassId(ALL_CLASSES);
    }
  }, [classes, selectedClassId]);

  const selectedClass = classes.find((c) => c.id === selectedClassId) || null;

  const visibleEntries = selectedClass
    ? entries.filter((e) => makeClassKey(e.code) === selectedClass.id)
    : entries;

  /** 쪽지에 붙일 학급 이름. 등록되지 않은 코드는 코드 그대로 보여줍니다. */
  const classLabelFor = (entry) => {
    const match = classes.find((c) => c.id === makeClassKey(entry.code));
    return match ? match.name : entry.code;
  };

  const countForClass = (cls) =>
    entries.filter((e) => makeClassKey(e.code) === cls.id).length;

  // 최신순은 moodStore 에서 이미 정렬해 오므로 그대로 둡니다.
  const sortedEntries = [...visibleEntries].sort((a, b) => {
    if (sortBy === "name") {
      return String(a.name).localeCompare(String(b.name), "ko");
    }
    if (sortBy === "emotion") {
      const diff =
        (EMOTION_ORDER[a.emotionId] ?? 99) - (EMOTION_ORDER[b.emotionId] ?? 99);
      return diff !== 0
        ? diff
        : String(a.name).localeCompare(String(b.name), "ko");
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
        const registered = classes.find((c) => c.id === key);
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
          {classes.map((cls) => (
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

        {error && <p style={{ color: "#F3C6B6", marginBottom: 14 }}>{error}</p>}

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
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
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
            </div>

            {selectedClass ? (
              <EntryTable
                entries={sortedEntries}
                showClassColumn={false}
                classLabelFor={classLabelFor}
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
  const [session, setSession] = useState(null); // {role:'student', name, code} | {role:'teacher'}

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
      {session?.role === "teacher" && (
        <TeacherScreen onGoHome={() => setSession(null)} />
      )}
    </div>
  );
}
