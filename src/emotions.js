/**
 * 무드 미터(Mood Meter) 감정 100개.
 * 출처: 마크 브래킷, <감정의 발견> (북라이프) — 이 폴더의 "무드 미터(Mood Meter).hwpx"
 *
 * 가로축은 쾌적함(왼쪽 낮음 → 오른쪽 높음), 세로축은 활력(위 높음 → 아래 낮음).
 * 그래서 네 칸으로 나뉩니다.
 *
 *              쾌적함 낮음        쾌적함 높음
 *   활력 높음   빨강 (red)         노랑 (yellow)
 *   활력 낮음   파랑 (blue)        초록 (green)
 *
 * 각 칸은 그림과 똑같이 5×5 이고, 아래 배열도 그림의 줄 순서(위 → 아래),
 * 줄 안에서는 왼쪽 → 오른쪽 순서로 적었습니다. 색은 그림처럼 칸 안에서도
 * 열마다 조금씩 달라집니다.
 *
 * id 는 Firestore 에 그대로 저장되는 값이라 한 번 정하면 바꾸지 마세요.
 * 바꾸면 그 전에 쌓인 기록이 "알 수 없음" 으로 보입니다.
 */

export const QUADRANTS = [
  {
    id: "red",
    // 이유 칸에 흐리게 보여 주는 예시 문장
    example: "예) 동생이 내 물건을 허락 없이 써서 화가 났어요",
    label: "빨강",
    title: "화나고 불안해요",
    hint: "활력 높음 · 쾌적함 낮음",
    emoji: "😠",
    color: "#D7372A",
    textColor: "#FFFFFF",
    // 열(왼쪽 → 오른쪽)마다의 칸 색
    columns: ["#7E1F24", "#B5202A", "#D7372A", "#EF5A2B", "#F2742A"],
    rows: [
      [["enraged", "격분한", "Enraged", "🤬"], ["panicked", "공황에 빠진", "Panicked", "😱"], ["stressed", "스트레스 받는", "Stressed", "😫"], ["jittery", "초조한", "Jittery", "😬"], ["shocked", "충격받은", "Shocked", "😲"]],
      [["livid", "격노한", "Livid", "👿"], ["furious", "몹시 화 난", "Furious", "😡"], ["frustrated", "좌절한", "Frustrated", "😤"], ["tense", "신경이 날카로운", "Tense", "😣"], ["stunned", "망연자실한", "Stunned", "😳"]],
      [["fuming", "화가 치밀어 오른", "Fuming", "🌋"], ["frightened", "겁먹은", "Frightened", "😨"], ["angry", "화난", "Angry", "😠"], ["nervous", "초조한", "Nervous", "😥"], ["restless", "안절부절못하는", "Restless", "🌀"]],
      [["anxious", "불안한", "Anxious", "😰"], ["apprehensive", "우려하는", "Apprehensive", "😧"], ["worried", "근심하는", "Worried", "😟"], ["irritated", "짜증나는", "Irritated", "💢"], ["annoyed", "거슬리는", "Annoyed", "🙄"]],
      [["repulsed", "불쾌한", "Repulsed", "🤢"], ["troubled", "골치 아픈", "Troubled", "🤯"], ["concerned", "염려하는", "Concerned", "😦"], ["uneasy", "마음이 불편한", "Uneasy", "😕"], ["peeved", "언짢은", "Peeved", "😾"]],
    ],
  },
  {
    id: "yellow",
    // 이유 칸에 흐리게 보여 주는 예시 문장
    example: "예) 체육 시간에 우리 팀이 이겨서 신났어요",
    label: "노랑",
    title: "신나고 즐거워요",
    hint: "활력 높음 · 쾌적함 높음",
    emoji: "😆",
    color: "#F7CC3D",
    textColor: "#4A3418",
    columns: ["#F7E36B", "#F8D84A", "#F7CC3D", "#F6BC39", "#F5AA33"],
    rows: [
      [["surprised", "놀란", "Surprised", "😮"], ["upbeat", "긍정적인", "Upbeat", "😀"], ["festive", "흥겨운", "Festive", "🥳"], ["exhilarated", "아주 신나는", "Exhilarated", "🤩"], ["ecstatic", "황홀한", "Ecstatic", "😍"]],
      [["hyper", "들뜬", "Hyper", "🤪"], ["cheerful", "쾌활한", "Cheerful", "😄"], ["motivated", "동기 부여된", "Motivated", "💪"], ["inspired", "영감을 받은", "Inspired", "💡"], ["elated", "의기양양한", "Elated", "🙌"]],
      [["energized", "기운이 넘치는", "Energized", "⚡"], ["lively", "활발한", "Lively", "🏃"], ["excited", "흥분한", "Excited", "😆"], ["optimistic", "낙관적인", "Optimistic", "🌈"], ["enthusiastic", "열광하는", "Enthusiastic", "🎉"]],
      [["pleased", "만족스러운", "Pleased", "🙂"], ["focused", "집중하는", "Focused", "🎯"], ["happy", "행복한", "Happy", "😊"], ["proud", "자랑스러운", "Proud", "😎"], ["thrilled", "짜릿한", "Thrilled", "🎢"]],
      [["pleasant", "유쾌한", "Pleasant", "😃"], ["joyful", "기쁜", "Joyful", "😁"], ["hopeful", "희망찬", "Hopeful", "🌟"], ["playful", "재미있는", "Playful", "😜"], ["blissful", "더없이 행복한", "Blissful", "💖"]],
    ],
  },
  {
    id: "blue",
    // 이유 칸에 흐리게 보여 주는 예시 문장
    example: "예) 어젯밤 늦게 자서 아침부터 피곤해요",
    label: "파랑",
    title: "슬프고 지쳐요",
    hint: "활력 낮음 · 쾌적함 낮음",
    emoji: "😢",
    color: "#2850BD",
    textColor: "#FFFFFF",
    columns: ["#1F2D86", "#2433A0", "#2850BD", "#2C74DD", "#2E9BE8"],
    rows: [
      [["disgusted", "역겨운", "Disgusted", "🤮"], ["glum", "침울한", "Glum", "☹️"], ["disappointed", "실망스러운", "Disappointed", "😞"], ["listless", "의욕 없는", "Down", "😩"], ["apathetic", "냉담한", "Apathetic", "😶"]],
      [["pessimistic", "비관적인", "Pessimistic", "😒"], ["morose", "시무룩한", "Morose", "🙁"], ["discouraged", "낙담한", "Discouraged", "😓"], ["sad", "슬픈", "Sad", "😢"], ["bored", "지루한", "Bored", "🥱"]],
      [["alienated", "소외된", "Alienated", "🙍"], ["miserable", "비참한", "Miserable", "😖"], ["lonely", "쓸쓸한", "Lonely", "🍂"], ["disheartened", "기죽은", "Disheartened", "😔"], ["tired", "피곤한", "Tired", "😪"]],
      [["despondent", "의기소침한", "Despondent", "😿"], ["depressed", "우울한", "Depressed", "🌧️"], ["sullen", "뚱한", "Sullen", "😑"], ["exhausted", "기진맥진한", "Exhausted", "🥵"], ["fatigued", "지친", "Fatigued", "🐌"]],
      [["despairing", "절망한", "Despairing", "😭"], ["hopeless", "가망 없는", "Hopeless", "🕳️"], ["desolate", "고독한", "Desolate", "🏜️"], ["spent", "소모된", "Spent", "🥀"], ["drained", "진이 빠진", "Drained", "😵"]],
    ],
  },
  {
    id: "green",
    // 이유 칸에 흐리게 보여 주는 예시 문장
    example: "예) 아침에 가족과 이야기하며 걸어와서 마음이 편해요",
    label: "초록",
    title: "편안하고 차분해요",
    hint: "활력 낮음 · 쾌적함 높음",
    emoji: "😌",
    color: "#63B032",
    textColor: "#FFFFFF",
    columns: ["#8CC63F", "#78BC36", "#5FAE32", "#3FA535", "#2D9A35"],
    rows: [
      [["at-ease", "속 편한", "At Ease", "🙆"], ["easygoing", "태평한", "Easygoing", "🏖️"], ["content", "자족하는", "Content", "🧘"], ["loving", "다정한", "Loving", "🤗"], ["fulfilled", "충만한", "Fulfilled", "🌕"]],
      [["calm", "평온한", "Calm", "😌"], ["secure", "안전한", "Secure", "🏠"], ["satisfied", "만족스러운", "Satisfied", "😋"], ["grateful", "감사하는", "Grateful", "🙏"], ["touched", "감동적인", "Touched", "🥲"]],
      [["relaxed", "여유로운", "Relaxed", "🛋️"], ["chill", "차분한", "Chill", "🍃"], ["restful", "편안한", "Restful", "🛌"], ["blessed", "축복받은", "Blessed", "😇"], ["balanced", "안정적인", "Balanced", "⚖️"]],
      [["mellow", "한가로운", "Mellow", "🌤️"], ["thoughtful", "생각에 잠긴", "Thoughtful", "🤔"], ["peaceful", "평화로운", "Peaceful", "🕊️"], ["comfortable", "편한", "Comfortable", "🧸"], ["carefree", "근심 걱정 없는", "Carefree", "🎈"]],
      [["sleepy", "나른한", "Sleepy", "😴"], ["complacent", "흐뭇한", "Complacent", "☺️"], ["tranquil", "고요한", "Tranquil", "🌙"], ["cozy", "안락한", "Cozy", "☕"], ["serene", "안온한", "Serene", "🌿"]],
    ],
  },
];

/** 모든 감정을 한 줄로. 순서는 빨강 → 노랑 → 파랑 → 초록, 칸 안에서는 그림 순서. */
export const EMOTIONS = QUADRANTS.flatMap((q) =>
  q.rows.flatMap((row, r) =>
    row.map(([id, label, en, emoji], c) => ({
      id,
      label,
      en,
      emoji,
      quadrant: q.id,
      row: r,
      col: c,
      color: q.columns[c],
      textColor: q.textColor,
    }))
  )
);

const EMOTION_BY_ID = Object.fromEntries(EMOTIONS.map((e) => [e.id, e]));

/**
 * 무드 미터로 바꾸기 전에 쓰던 감정 id 중 새 목록에 없는 것.
 * 그날 이미 전달된 기록이 "알 수 없음" 으로 보이지 않도록 가장 가까운 감정으로 잇습니다.
 */
const LEGACY_IDS = {
  fun: "playful",
  meh: "apathetic",
  down: "glum",
  leftout: "alienated",
  scared: "frightened",
};

export const FALLBACK_EMOTION = {
  id: "unknown",
  emoji: "❔",
  label: "알 수 없음",
  en: "Unknown",
  quadrant: null,
  color: "#D6C6A8",
  textColor: "#4A3418",
};

/** 저장된 emotionId 로 감정을 찾습니다. 옛 id 도 받아 주고, 모르면 FALLBACK_EMOTION. */
export function findEmotion(id) {
  return EMOTION_BY_ID[id] || EMOTION_BY_ID[LEGACY_IDS[id]] || FALLBACK_EMOTION;
}

/** "감정순" 정렬용 순서 번호. 모르는 감정은 맨 뒤. */
export function emotionOrder(id) {
  const emo = findEmotion(id);
  return emo === FALLBACK_EMOTION ? 999 : EMOTIONS.indexOf(emo);
}
