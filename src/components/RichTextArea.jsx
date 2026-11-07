import React, { useRef, useState } from 'react';
import { Bold, Italic, Underline, Heading2, List, ListOrdered } from 'lucide-react';
import FormattedText from './FormattedText';

// Textarea with a formatting toolbar. Saves plain text with light marks
// (**bold**, *italic*, __underline__, ## heading, - bullets, 1. numbers) that
// FormattedText turns into real formatting wherever the text is shown.
export default function RichTextArea({ value, onChange, placeholder, rows = 6, id }) {
  const ref = useRef(null);
  const [preview, setPreview] = useState(false);
  const text = value || '';

  // Apply a change and put the cursor/selection back where it belongs.
  const commit = (next, selStart, selEnd) => {
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  const wrap = (mark, sample) => {
    const el = ref.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = text.slice(start, end);
    // Already wrapped? Remove the marks instead (toggle).
    if (text.slice(start - mark.length, start) === mark && text.slice(end, end + mark.length) === mark) {
      const next = text.slice(0, start - mark.length) + selected + text.slice(end + mark.length);
      return commit(next, start - mark.length, end - mark.length);
    }
    const inner = selected || sample;
    const next = text.slice(0, start) + mark + inner + mark + text.slice(end);
    commit(next, start + mark.length, start + mark.length + inner.length);
  };

  // Add/remove a prefix on every line the selection touches.
  const prefixLines = (kind) => {
    const el = ref.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;
    const lines = text.slice(lineStart, lineEnd).split('\n');
    const pattern = kind === 'ul' ? /^\s*[-*•]\s+/ : kind === 'ol' ? /^\s*\d+[.)]\s+/ : /^\s*#{1,3}\s+/;
    const allHave = lines.every(l => !l.trim() || pattern.test(l));
    const clean = (l) => l.replace(/^\s*([-*•]|\d+[.)]|#{1,3})\s+/, '');
    let n = 0;
    const out = lines.map((l) => {
      if (!l.trim()) return l;
      if (allHave) return clean(l);
      n += 1;
      const p = kind === 'ul' ? '- ' : kind === 'ol' ? `${n}. ` : '## ';
      return p + clean(l);
    });
    const block = out.join('\n');
    const next = text.slice(0, lineStart) + block + text.slice(lineEnd);
    commit(next, lineStart + block.length, lineStart + block.length);
  };

  const onKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); return wrap('**', 'bold text'); }
      if (k === 'i') { e.preventDefault(); return wrap('*', 'italic text'); }
      if (k === 'u') { e.preventDefault(); return wrap('__', 'underlined text'); }
    }
    // Enter inside a list continues it; Enter on an empty item ends the list.
    if (e.key === 'Enter' && !e.shiftKey && !mod) {
      const el = ref.current;
      if (el.selectionStart !== el.selectionEnd) return;
      const pos = el.selectionStart;
      const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
      const line = text.slice(lineStart, pos);
      const bullet = line.match(/^(\s*[-*•]\s+)(.*)$/);
      const num = line.match(/^(\s*)(\d+)([.)]\s+)(.*)$/);
      if (!bullet && !num) return;
      e.preventDefault();
      const empty = bullet ? !bullet[2].trim() : !num[4].trim();
      if (empty) {
        const next = text.slice(0, lineStart) + text.slice(pos);
        return commit(next, lineStart, lineStart);
      }
      const prefix = bullet ? bullet[1] : `${num[1]}${Number(num[2]) + 1}${num[3]}`;
      const next = text.slice(0, pos) + '\n' + prefix + text.slice(pos);
      const at = pos + 1 + prefix.length;
      commit(next, at, at);
    }
  };

  const tools = [
    { icon: Bold, label: 'Bold (Ctrl+B)', run: () => wrap('**', 'bold text') },
    { icon: Italic, label: 'Italic (Ctrl+I)', run: () => wrap('*', 'italic text') },
    { icon: Underline, label: 'Underline (Ctrl+U)', run: () => wrap('__', 'underlined text') },
    { icon: Heading2, label: 'Heading', run: () => prefixLines('h') },
    { icon: List, label: 'Bullet list', run: () => prefixLines('ul') },
    { icon: ListOrdered, label: 'Numbered list', run: () => prefixLines('ol') }
  ];

  return (
    <div className="rta">
      <div className="rta-toolbar">
        {tools.map(({ icon: Icon, label, run }) => (
          <button
            key={label}
            type="button"
            className="rta-btn"
            title={label}
            aria-label={label}
            disabled={preview}
            // keep the textarea selection when clicking a tool
            onMouseDown={(e) => e.preventDefault()}
            onClick={run}
          >
            <Icon size={15} />
          </button>
        ))}
        <div className="rta-tabs">
          <button type="button" className={`rta-tab ${!preview ? 'active' : ''}`} onClick={() => setPreview(false)}>Write</button>
          <button type="button" className={`rta-tab ${preview ? 'active' : ''}`} onClick={() => setPreview(true)}>Preview</button>
        </div>
      </div>
      {preview ? (
        <div className="rta-preview" style={{ minHeight: `${rows * 1.5}em` }}>
          {text.trim() ? <FormattedText text={text} /> : <span className="rta-empty">Nothing to preview yet.</span>}
        </div>
      ) : (
        <textarea
          id={id}
          ref={ref}
          className="rta-input"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          rows={rows}
        />
      )}
    </div>
  );
}
