// Quiz question types, shared by the server (api/quiz.js) and the app's offline mode.
//
//   Multiple choice (default) { question, options: [...], correct: 2 }
//   Match (drag & drop)       { type: 'match', question, pairs: [{ left, right }, ...] }
//   Put in order (drag & drop){ type: 'order', question, items: [...in the right order] }
//
// Students get the question without the answer: match questions as `lefts` plus the
// right-hand answers shuffled into `choices`, order questions with `items` shuffled.
// A match/order answer is the list of answer texts the student placed, slot by slot.

export const questionKind = (q) => (q && (q.type === 'match' || q.type === 'order') ? q.type : 'mc');

const text = (v) => String(v ?? '').trim();

// Same shuffle every time for the same question, so a refresh doesn't reorder the cards.
const seededShuffle = (list, seed) => {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  // Never hand out the answer already in place.
  if (out.length > 1 && out.every((v, i) => v === list[i])) out.push(out.shift());
  return out;
};

const pairsOf = (q) => (Array.isArray(q.pairs) ? q.pairs : []).map(p => ({ left: text(p && p.left), right: text(p && p.right) }));
const itemsOf = (q) => (Array.isArray(q.items) ? q.items : []).map(text);

// The question as students see it before they submit.
export const stripQuestion = (q) => {
  const kind = questionKind(q);
  if (kind === 'match') {
    const pairs = pairsOf(q);
    return { type: 'match', question: q.question, lefts: pairs.map(p => p.left), choices: seededShuffle(pairs.map(p => p.right), 'm' + q.question + pairs.map(p => p.left).join('|')) };
  }
  if (kind === 'order') {
    const items = itemsOf(q);
    return { type: 'order', question: q.question, items: seededShuffle(items, 'o' + q.question + items.join('|')) };
  }
  // eslint-disable-next-line no-unused-vars
  const { correct, answer, correct_answer, ...rest } = q || {};
  return rest;
};

// What the student gets back after submitting, to show the right answers.
export const answerKey = (q) => {
  const kind = questionKind(q);
  if (kind === 'match') return pairsOf(q).map(p => p.right);
  if (kind === 'order') return itemsOf(q);
  return q.correct;
};

// 0..1 credit for one answer. Match and order questions give part marks per slot.
export const gradeQuestion = (q, answer) => {
  const kind = questionKind(q);
  if (kind === 'mc') {
    return answer !== null && answer !== undefined && answer !== '' && Number(answer) === Number(q.correct) ? 1 : 0;
  }
  const key = answerKey(q);
  if (!Array.isArray(answer) || key.length === 0) return 0;
  const right = key.filter((k, i) => text(answer[i]) === k).length;
  return right / key.length;
};

// { correctCount, total, percent, correctAnswers }. correctCount counts fully right questions.
export const gradeQuiz = (questions, answers) => {
  const credits = questions.map((q, i) => gradeQuestion(q, answers[i]));
  const total = questions.length;
  const score = credits.reduce((a, b) => a + b, 0);
  return {
    correctCount: credits.filter(c => c === 1).length,
    total,
    percent: total ? Math.round((score / total) * 100) : 0,
    correctAnswers: questions.map(answerKey)
  };
};

// Flashcard decks are tasks too ({ task_type: 'flashcards', quiz_questions: [{ front, back }] }).
export const isFlashcardTask = (t) => !!t && String(t.task_type || '').toLowerCase() === 'flashcards';
