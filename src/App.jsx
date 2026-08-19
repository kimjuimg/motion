import React, { useEffect, useState } from "react";
import { isFirebaseConfigured } from "./firebase";
import { saveMood, subscribeMoods } from "./moodStore";

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
const NOTE_ROTATIONS = [-4, 3, -6, 2, 5, -2, 4, -3, 1, -5, 6, -1];

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
        .mc-emo-btn, .mc-note { transition: none !important; animation: none !important; }
      }
      .mc-note {
        transition: transform 0.2s ease;
      }
      .mc-note:hover { transform: scale(1.04) rotate(0deg) !important; z-index: 5; }
      @keyframes mc-pop {
        0% { transform: scale(0.85); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
      }
      .mc-scrollbar::-webkit-scrollbar { width: 10px; }
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

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      setError("이름과 코드를 모두 입력해 주세요.");
      return;
    }
    setError("");
    onEnter({ role: "student", name: name.trim(), code: code.trim() });
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
                이름과 코드를 입력하고 들어와요
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
                코드
              </label>
              <input
                className="mc-focus"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={40}
                placeholder="선생님이 알려준 코드"
                style={inputStyle}
              />

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

function TeacherScreen({ onGoHome }) {
  const [entries, setEntries] = useState([]);
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

  const counts = EMOTIONS.map((emo) => ({
    ...emo,
    count: entries.filter((e) => e.emotionId === emo.id).length,
  }));

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
              {getTodayLabel()} · 총 {entries.length}명 전달
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

        {/* 통계 바 */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 26,
          }}
        >
          {counts.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(255,255,255,0.1)",
                borderRadius: 999,
                padding: "6px 12px",
                fontSize: 13,
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
                  minWidth: 20,
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

        {error && <p style={{ color: "#F3C6B6", marginBottom: 14 }}>{error}</p>}

        {loading ? (
          <p style={{ color: "#E8D9BE" }}>불러오는 중...</p>
        ) : entries.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              color: "#E8D9BE",
              padding: "60px 0",
              fontSize: 15,
            }}
          >
            아직 전달된 마음이 없어요. 학생들이 입장하면 여기에 쌓여요.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 18,
              justifyContent: "flex-start",
            }}
          >
            {entries.map((entry, i) => {
              const emotion = EMOTION_BY_ID[entry.emotionId] || FALLBACK_EMOTION;
              return (
                <div
                  key={entry.id}
                  className="mc-note"
                  style={{
                    width: 168,
                    minHeight: 150,
                    background: emotion.color,
                    borderRadius: 4,
                    padding: "16px 14px 14px",
                    boxShadow: "0 8px 16px rgba(0,0,0,0.28)",
                    transform: `rotate(${
                      NOTE_ROTATIONS[i % NOTE_ROTATIONS.length]
                    }deg)`,
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -8,
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "#B23B3B",
                      boxShadow: "0 2px 3px rgba(0,0,0,0.4)",
                    }}
                  />
                  <div style={{ fontSize: 30 }}>{emotion.emoji}</div>
                  <div
                    className="mc-hand"
                    style={{ fontSize: 18, color: "#4A3418", marginTop: 4 }}
                  >
                    {entry.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#5B4A30", opacity: 0.85 }}>
                    {emotion.label}
                  </div>
                  {entry.reason && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#4A3418",
                        marginTop: 8,
                        lineHeight: 1.4,
                        wordBreak: "break-word",
                      }}
                    >
                      “{entry.reason}”
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
