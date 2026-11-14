import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Shuffle, RotateCcw, Check, Repeat } from 'lucide-react';
import '../styles/StudyTools.css';

// A tutor's flashcard deck, studied by a student: flip a card, then mark it
// "I know it" or "Still learning". The still-learning cards come round again.

export const parseCards = (raw) => {
  let list = raw;
  if (!Array.isArray(list)) { try { list = JSON.parse(raw || '[]'); } catch { list = []; } }
  return (Array.isArray(list) ? list : [])
    .map(c => ({ front: String(c?.front ?? '').trim(), back: String(c?.back ?? '').trim() }))
    .filter(c => c.front || c.back);
};

// Known cards are remembered by their text, so a tutor's later edits don't mix them up.
const cardKey = (c) => c.front + '' + c.back;
const storeKey = (id) => 'fcKnown:' + id;
const loadKnown = (id) => { try { return new Set(JSON.parse(localStorage.getItem(storeKey(id)) || '[]')); } catch { return new Set(); } };
const saveKnown = (id, set) => { try { localStorage.setItem(storeKey(id), JSON.stringify([...set])); } catch { /* storage blocked */ } };

// How many cards in a deck this browser has marked as known.
export const knownCount = (deck) => {
  const cards = parseCards(deck.quiz_questions);
  const known = loadKnown(deck.id);
  return cards.filter(c => known.has(cardKey(c))).length;
};

const shuffled = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export default function FlashcardDeck({ deck, onClose }) {
  const cards = useMemo(() => parseCards(deck?.quiz_questions), [deck]);
  const [known, setKnown] = useState(() => loadKnown(deck?.id));
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);

  const cardIdx = order[pos];
  const card = cards[cardIdx];

  const go = useCallback((delta) => {
    setFlipped(false);
    setPos(p => {
      const n = p + delta;
      if (n >= order.length) { setDone(true); return p; }
      return Math.max(0, n);
    });
  }, [order.length]);

  const mark = useCallback((isKnown) => {
    setKnown(prev => {
      const next = new Set(prev);
      if (isKnown) next.add(cardKey(cards[cardIdx])); else next.delete(cardKey(cards[cardIdx]));
      saveKnown(deck.id, next);
      return next;
    });
    go(1);
  }, [cardIdx, cards, deck, go]);

  const restart = (onlyLearning) => {
    const base = cards.map((_, i) => i).filter(i => !onlyLearning || !known.has(cardKey(cards[i])));
    setOrder(base.length ? base : cards.map((_, i) => i));
    setPos(0); setFlipped(false); setDone(false);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'Escape') onClose();
      if (done) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(f => !f); }
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, go, onClose]);

  const knownNow = cards.filter(c => known.has(cardKey(c))).length;
  const learning = cards.length - knownNow;

  return (
    <div className="fc-overlay" role="dialog" aria-modal="true" aria-label={deck?.title || 'Flashcards'} onClick={onClose}>
      <div className="fc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fc-top">
          <div>
            <h4 className="fc-title">🃏 {deck?.title}</h4>
            <span className="fc-sub">{knownNow} of {cards.length} known</span>
          </div>
          <button type="button" className="fc-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="fc-progress"><span style={{ width: `${cards.length ? (knownNow / cards.length) * 100 : 0}%` }} /></div>

        {cards.length === 0 ? (
          <p className="fc-empty">This deck has no cards yet.</p>
        ) : done ? (
          <div className="fc-done">
            <div className="fc-done-big">{learning === 0 ? '🎉' : '💪'}</div>
            <h5>{learning === 0 ? 'You know every card!' : `Round finished: you know ${knownNow} of ${cards.length}`}</h5>
            <p>{learning === 0 ? 'Come back tomorrow and run through them again to keep them fresh.' : 'Go over the ones you are still learning. A little often works best.'}</p>
            <div className="fc-done-actions">
              {learning > 0 && <button type="button" className="btn-primary" onClick={() => restart(true)}><Repeat size={15} /> Study the {learning} still learning</button>}
              <button type="button" className="btn-action edit" onClick={() => restart(false)}><RotateCcw size={15} /> Start again</button>
            </div>
          </div>
        ) : (
          <>
            <div className="fc-count">Card {pos + 1} of {order.length}</div>
            <button
              type="button"
              className={`fc-card${flipped ? ' flipped' : ''}`}
              onClick={() => setFlipped(f => !f)}
              aria-label={flipped ? `Answer: ${card.back}. Tap to see the question.` : `${card.front}. Tap to see the answer.`}
            >
              <span className="fc-face fc-front">
                <span className="fc-face-label">Question</span>
                <span className="fc-face-text">{card.front}</span>
                <span className="fc-tap">Tap to flip</span>
              </span>
              <span className="fc-face fc-back">
                <span className="fc-face-label">Answer</span>
                <span className="fc-face-text">{card.back}</span>
                {known.has(cardKey(card)) && <span className="fc-tap">✓ You know this one</span>}
              </span>
            </button>

            {flipped ? (
              <div className="fc-judge">
                <button type="button" className="fc-btn learning" onClick={() => mark(false)}><Repeat size={16} /> Still learning</button>
                <button type="button" className="fc-btn known" onClick={() => mark(true)}><Check size={16} /> I know it</button>
              </div>
            ) : (
              <p className="fc-think">Say the answer in your head, then flip the card.</p>
            )}

            <div className="fc-nav">
              <button type="button" onClick={() => go(-1)} disabled={pos === 0} aria-label="Previous card"><ChevronLeft size={18} /></button>
              <button type="button" onClick={() => { setOrder(shuffled(order)); setPos(0); setFlipped(false); }} title="Shuffle"><Shuffle size={16} /> Shuffle</button>
              <button type="button" onClick={() => go(1)} aria-label="Next card"><ChevronRight size={18} /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
