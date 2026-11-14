import React, { useState } from 'react';
import { ArrowUp, ArrowDown, GripVertical, Check, X } from 'lucide-react';
import '../styles/StudyTools.css';

// Drag-and-drop quiz questions for students. Works with a mouse (drag) and on phones
// (tap an answer, then tap where it goes). `correct` is the answer key, shown after submitting.

const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

/* ---------- Match: drag each answer onto its term ---------- */
export function MatchQuestion({ q, value, onChange, disabled, correct }) {
  const lefts = q.lefts || [];
  const placed = Array.isArray(value) ? value : lefts.map(() => null);
  const [picked, setPicked] = useState(null); // { from: 'bank' | slotIndex, text }
  const [over, setOver] = useState(null);

  // Answers not placed yet (handles repeated answers by count).
  const bank = [...(q.choices || [])];
  placed.forEach(p => { if (p == null) return; const i = bank.findIndex(b => same(b, p)); if (i >= 0) bank.splice(i, 1); });

  const place = (from, txt, slot) => {
    const next = [...placed];
    const displaced = next[slot];
    if (typeof from === 'number') next[from] = displaced ?? null; // swap between slots
    next[slot] = txt;
    onChange(next);
    setPicked(null);
  };
  const unplace = (slot) => {
    const next = [...placed]; next[slot] = null; onChange(next); setPicked(null);
  };

  const dragProps = (from, txt) => disabled ? {} : {
    draggable: true,
    onDragStart: (e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ from, txt })); e.dataTransfer.effectAllowed = 'move'; },
  };
  const dropProps = (slot) => disabled ? {} : {
    onDragOver: (e) => { e.preventDefault(); setOver(slot); },
    onDragLeave: () => setOver(o => (o === slot ? null : o)),
    onDrop: (e) => {
      e.preventDefault(); setOver(null);
      try { const { from, txt } = JSON.parse(e.dataTransfer.getData('text/plain')); if (from !== slot) place(from, txt, slot); } catch { /* not ours */ }
    },
  };

  return (
    <div className="dq">
      {!disabled && <p className="dq-hint">Drag each answer onto its match, or tap an answer and then tap the box.</p>}
      <ul className="dq-match">
        {lefts.map((left, i) => {
          const val = placed[i];
          const review = Array.isArray(correct);
          const ok = review && same(val, correct[i]);
          return (
            <li key={i} className="dq-match-row">
              <span className="dq-left">{left}</span>
              <span
                className={`dq-slot${val != null ? ' filled' : ''}${over === i ? ' over' : ''}${picked ? ' ready' : ''}${review ? (ok ? ' right' : ' wrong') : ''}`}
                {...dropProps(i)}
                onClick={() => {
                  if (disabled) return;
                  if (picked) { if (picked.from !== i) place(picked.from, picked.text, i); else setPicked(null); }
                  else if (val != null) setPicked({ from: i, text: val });
                }}
                role="button"
                tabIndex={disabled ? -1 : 0}
                onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click(); } }}
                aria-label={val != null ? `${left}: ${val}` : `Drop the answer for ${left}`}
              >
                {val != null ? (
                  <span className={`dq-chip in-slot${picked && picked.from === i ? ' picked' : ''}`} {...dragProps(i, val)}>
                    {val}
                    {!disabled && <button type="button" className="dq-chip-x" aria-label="Take back" onClick={(e) => { e.stopPropagation(); unplace(i); }}><X size={12} /></button>}
                  </span>
                ) : <span className="dq-slot-empty">Drop here</span>}
                {review && (ok ? <Check size={16} className="dq-mark" /> : <X size={16} className="dq-mark" />)}
              </span>
              {review && !ok && <span className="dq-should">Answer: {correct[i]}</span>}
            </li>
          );
        })}
      </ul>
      {!disabled && bank.length > 0 && (
        <div className="dq-bank" {...(disabled ? {} : {
          onDragOver: (e) => e.preventDefault(),
          onDrop: (e) => { e.preventDefault(); try { const { from } = JSON.parse(e.dataTransfer.getData('text/plain')); if (typeof from === 'number') unplace(from); } catch { /* not ours */ } },
        })}>
          {bank.map((txt, i) => (
            <span
              key={txt + i}
              className={`dq-chip${picked && picked.from === 'bank' && same(picked.text, txt) ? ' picked' : ''}`}
              {...dragProps('bank', txt)}
              role="button"
              tabIndex={0}
              onClick={() => setPicked(p => (p && p.from === 'bank' && same(p.text, txt) ? null : { from: 'bank', text: txt }))}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
            >
              <GripVertical size={13} className="dq-grip" /> {txt}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Order: drag the items into the right order ---------- */
export function OrderQuestion({ q, value, onChange, disabled, correct }) {
  const list = Array.isArray(value) && value.length ? value : (q.items || []);
  const [dragFrom, setDragFrom] = useState(null);
  const [over, setOver] = useState(null);
  const review = Array.isArray(correct);

  const move = (from, to) => {
    if (from === to || to < 0 || to >= list.length) return;
    const next = [...list];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    onChange(next);
  };

  return (
    <div className="dq">
      {!disabled && <p className="dq-hint">Drag the items into the right order (first at the top), or use the arrows.</p>}
      <ol className="dq-order">
        {list.map((txt, i) => {
          const ok = review && same(txt, correct[i]);
          return (
            <li
              key={txt + i}
              className={`dq-order-row${over === i ? ' over' : ''}${dragFrom === i ? ' dragging' : ''}${review ? (ok ? ' right' : ' wrong') : ''}`}
              draggable={!disabled}
              onDragStart={(e) => { setDragFrom(i); e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => { setDragFrom(null); setOver(null); }}
              onDragOver={(e) => { if (disabled) return; e.preventDefault(); setOver(i); }}
              onDrop={(e) => { if (disabled) return; e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); setOver(null); setDragFrom(null); if (Number.isInteger(from)) move(from, i); }}
            >
              <span className="dq-num">{i + 1}</span>
              {!disabled && <GripVertical size={15} className="dq-grip" />}
              <span className="dq-order-text">{txt}</span>
              {!disabled && (
                <span className="dq-arrows">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move "${txt}" up`}><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === list.length - 1} aria-label={`Move "${txt}" down`}><ArrowDown size={14} /></button>
                </span>
              )}
              {review && (ok ? <Check size={16} className="dq-mark" /> : <X size={16} className="dq-mark" />)}
            </li>
          );
        })}
      </ol>
      {review && list.some((t, i) => !same(t, correct[i])) && (
        <p className="dq-should">Right order: {correct.join(' → ')}</p>
      )}
    </div>
  );
}
