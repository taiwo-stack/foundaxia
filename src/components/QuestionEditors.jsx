import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { questionKind } from '../../api/_quizGrade.js';
import '../styles/StudyTools.css';

// Tutor-side builders: question types for quizzes, and flashcard decks.

export const QUESTION_KINDS = [
  { kind: 'mc', label: 'Multiple choice' },
  { kind: 'match', label: '↔ Match (drag & drop)' },
  { kind: 'order', label: '↕ Put in order (drag & drop)' },
];

export const blankQuestion = (kind = 'mc', question = '') => {
  if (kind === 'match') return { type: 'match', question, pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] };
  if (kind === 'order') return { type: 'order', question, items: ['', '', ''] };
  return { question, options: ['', '', '', ''], correct: 0 };
};

// Change a question's type, keeping its wording.
export const convertQuestion = (q, kind) => (questionKind(q) === kind ? q : blankQuestion(kind, q.question || ''));

const filled = (v) => String(v ?? '').trim() !== '';

// True for an untouched question card (replaced when questions are imported).
export const isBlankQuestion = (q) => {
  const kind = questionKind(q);
  if (filled(q.question)) return false;
  if (kind === 'match') return !(q.pairs || []).some(p => filled(p.left) || filled(p.right));
  if (kind === 'order') return !(q.items || []).some(filled);
  return !(q.options || []).some(filled);
};

// An error message, or null when every question is complete.
export const validateQuestions = (qs) => {
  if (!qs || qs.length === 0) return 'Add at least one quiz question.';
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    const n = i + 1;
    if (!filled(q.question)) return `Question ${n} is empty.`;
    const kind = questionKind(q);
    if (kind === 'match') {
      const pairs = q.pairs || [];
      if (pairs.length < 2) return `Question ${n} needs at least 2 pairs to match.`;
      if (pairs.some(p => !filled(p.left) || !filled(p.right))) return `Fill in both sides of every pair in question ${n}.`;
    } else if (kind === 'order') {
      const items = q.items || [];
      if (items.length < 2) return `Question ${n} needs at least 2 items to put in order.`;
      if (items.some(it => !filled(it))) return `Fill in every item in question ${n}.`;
    } else {
      const opts = Array.isArray(q.options) ? q.options : [];
      if (opts.length < 2 || opts.some(o => !filled(o))) return `Fill in every option for question ${n}.`;
      if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= opts.length) return `Select the correct answer for question ${n}.`;
    }
  }
  return null;
};

export function QuestionTypePicker({ q, onChange }) {
  const kind = questionKind(q);
  return (
    <div className="qe-kinds" role="radiogroup" aria-label="Question type">
      {QUESTION_KINDS.map(k => (
        <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind}
          className={`qe-kind${kind === k.kind ? ' on' : ''}`} onClick={() => onChange(convertQuestion(q, k.kind))}>
          {k.label}
        </button>
      ))}
    </div>
  );
}

// Answers for match and order questions (multiple choice keeps its own inputs).
export function DragQuestionEditor({ q, onChange }) {
  const kind = questionKind(q);
  if (kind === 'match') {
    const pairs = q.pairs || [];
    const setPair = (i, side, v) => onChange({ ...q, pairs: pairs.map((p, j) => (j === i ? { ...p, [side]: v } : p)) });
    return (
      <div className="qe-box">
        <div className="qe-head-row"><span>Term</span><span>Its match</span></div>
        {pairs.map((p, i) => (
          <div key={i} className="qe-pair">
            <input type="text" value={p.left} placeholder={`e.g. ${['CPU', 'RAM', 'Mouse', 'Monitor'][i % 4]}`} onChange={e => setPair(i, 'left', e.target.value)} />
            <span className="qe-arrow">↔</span>
            <input type="text" value={p.right} placeholder={`e.g. ${['The brain of the computer', 'Short-term memory', 'Points and clicks', 'Shows the picture'][i % 4]}`} onChange={e => setPair(i, 'right', e.target.value)} />
            {pairs.length > 2 && <button type="button" className="qe-del" aria-label={`Remove pair ${i + 1}`} onClick={() => onChange({ ...q, pairs: pairs.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
          </div>
        ))}
        <button type="button" className="qe-add" onClick={() => onChange({ ...q, pairs: [...pairs, { left: '', right: '' }] })}><Plus size={14} /> Add pair</button>
        <p className="qe-note">Students see the terms with the matches shuffled, and drag each match onto its term. They get part marks for each pair they get right.</p>
      </div>
    );
  }
  if (kind === 'order') {
    const items = q.items || [];
    const setItem = (i, v) => onChange({ ...q, items: items.map((it, j) => (j === i ? v : it)) });
    const move = (i, to) => { if (to < 0 || to >= items.length) return; const next = [...items]; const [it] = next.splice(i, 1); next.splice(to, 0, it); onChange({ ...q, items: next }); };
    return (
      <div className="qe-box">
        <div className="qe-head-row"><span>Type the items in the RIGHT order (first at the top)</span></div>
        {items.map((it, i) => (
          <div key={i} className="qe-item">
            <span className="qe-num">{i + 1}</span>
            <input type="text" value={it} placeholder={`Step ${i + 1}`} onChange={e => setItem(i, e.target.value)} />
            <button type="button" className="qe-mini" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={13} /></button>
            <button type="button" className="qe-mini" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label="Move down"><ArrowDown size={13} /></button>
            {items.length > 2 && <button type="button" className="qe-del" aria-label={`Remove item ${i + 1}`} onClick={() => onChange({ ...q, items: items.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
          </div>
        ))}
        <button type="button" className="qe-add" onClick={() => onChange({ ...q, items: [...items, ''] })}><Plus size={14} /> Add item</button>
        <p className="qe-note">Students get the items shuffled and drag them into order. They get part marks for each item in the right place.</p>
      </div>
    );
  }
  return null;
}

/* ---------- Flashcards ---------- */

export const blankCards = () => [{ front: '', back: '' }, { front: '', back: '' }, { front: '', back: '' }];

export const validateCards = (cards) => {
  const list = (cards || []).filter(c => filled(c.front) || filled(c.back));
  if (list.length === 0) return 'Add at least one flashcard.';
  const i = list.findIndex(c => !filled(c.front) || !filled(c.back));
  if (i >= 0) return `Flashcard ${i + 1} needs both a front and a back.`;
  return null;
};

// Drop empty cards and trim before saving.
export const cleanCards = (cards) => (cards || [])
  .map(c => ({ front: String(c.front ?? '').trim(), back: String(c.back ?? '').trim() }))
  .filter(c => c.front || c.back);

// "Term - meaning", "Term: meaning" or tab-separated (pasted from Excel), one per line.
const parseList = (txt) => txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
  const m = l.match(/^(.+?)\s*(?:\t|\s[-–—]\s|:\s|=\s?)\s*(.+)$/);
  return m ? { front: m[1].trim(), back: m[2].trim() } : { front: l, back: '' };
});

export function FlashcardEditor({ cards, onChange }) {
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const set = (i, side, v) => onChange(cards.map((c, j) => (j === i ? { ...c, [side]: v } : c)));
  const addPasted = () => {
    const found = parseList(paste);
    if (!found.length) return;
    onChange([...cards.filter(c => filled(c.front) || filled(c.back)), ...found]);
    setPaste(''); setShowPaste(false);
  };
  return (
    <div className="qe-cards">
      <div className="qe-cards-top">
        <span className="qe-cards-title">🃏 Cards ({cleanCards(cards).length})</span>
        <button type="button" className="qe-link" onClick={() => setShowPaste(s => !s)}>{showPaste ? 'Close' : 'Paste a list'}</button>
      </div>
      {showPaste && (
        <div className="qe-paste">
          <textarea rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'One card per line:\nCPU - The brain of the computer\nRAM: Short-term memory\n(or copy two columns from Excel)'} />
          <button type="button" className="qe-add" onClick={addPasted} disabled={!paste.trim()}><Plus size={14} /> Add {parseList(paste).length || ''} cards</button>
        </div>
      )}
      {cards.map((c, i) => (
        <div key={i} className="qe-card">
          <span className="qe-num">{i + 1}</span>
          <div className="qe-card-sides">
            <textarea rows={2} value={c.front} placeholder="Front: a question or term" onChange={e => set(i, 'front', e.target.value)} />
            <textarea rows={2} value={c.back} placeholder="Back: the answer or meaning" onChange={e => set(i, 'back', e.target.value)} />
          </div>
          {cards.length > 1 && <button type="button" className="qe-del" aria-label={`Remove card ${i + 1}`} onClick={() => onChange(cards.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
        </div>
      ))}
      <button type="button" className="qe-add" onClick={() => onChange([...cards, { front: '', back: '' }])}><Plus size={14} /> Add card</button>
      <p className="qe-note">Students flip each card, then mark it "I know it" or "Still learning". The ones they are still learning come back until they know them all.</p>
    </div>
  );
}
