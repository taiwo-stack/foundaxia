import React from 'react';
import '../styles/RichTextArea.css';

// Renders the small formatting language used by course descriptions (written with the
// toolbar in RichTextArea):
//   **bold**   *italic*   __underline__
//   ## Heading
//   - bullet item        1. numbered item
//   blank line = new paragraph, single line break = line break
// Everything is built as React elements - no HTML is ever injected - so a description
// can never run scripts or break the page. Plain old descriptions render unchanged.

const INLINE = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\s\n][^*\n]*?\*)/g;

const renderInline = (text, keyBase) => {
  const out = [];
  let last = 0;
  let i = 0;
  text.replace(INLINE, (match, _g, offset) => {
    if (offset > last) out.push(text.slice(last, offset));
    const k = `${keyBase}-${i++}`;
    if (match.startsWith('**')) out.push(<strong key={k}>{match.slice(2, -2)}</strong>);
    else if (match.startsWith('__')) out.push(<u key={k}>{match.slice(2, -2)}</u>);
    else out.push(<em key={k}>{match.slice(1, -1)}</em>);
    last = offset + match.length;
    return match;
  });
  if (last < text.length) out.push(text.slice(last));
  return out;
};

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,3}\s+(.*)$/;

// Groups lines into blocks: paragraphs, bullet lists, numbered lists, headings.
const toBlocks = (text) => {
  const blocks = [];
  let cur = null;
  const flush = () => { if (cur) blocks.push(cur); cur = null; };
  String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach((line) => {
    let m;
    if (!line.trim()) { flush(); return; }
    if ((m = line.match(HEADING))) { flush(); blocks.push({ type: 'h', lines: [m[1]] }); return; }
    if ((m = line.match(BULLET))) {
      if (cur?.type !== 'ul') { flush(); cur = { type: 'ul', lines: [] }; }
      cur.lines.push(m[1]); return;
    }
    if ((m = line.match(NUMBER))) {
      if (cur?.type !== 'ol') { flush(); cur = { type: 'ol', lines: [] }; }
      cur.lines.push(m[1]); return;
    }
    if (cur?.type !== 'p') { flush(); cur = { type: 'p', lines: [] }; }
    cur.lines.push(line);
  });
  flush();
  return blocks;
};

export default function FormattedText({ text, className = '', as: Tag = 'div', style }) {
  const blocks = toBlocks(text);
  if (blocks.length === 0) return null;
  return (
    <Tag className={`formatted-text ${className}`.trim()} style={style}>
      {blocks.map((b, bi) => {
        if (b.type === 'h') return <h4 key={bi} className="ft-heading">{renderInline(b.lines[0], bi)}</h4>;
        if (b.type === 'ul' || b.type === 'ol') {
          const List = b.type;
          return (
            <List key={bi} className="ft-list">
              {b.lines.map((l, li) => <li key={li}>{renderInline(l, `${bi}-${li}`)}</li>)}
            </List>
          );
        }
        return (
          <p key={bi} className="ft-para">
            {b.lines.map((l, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(l, `${bi}-${li}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </Tag>
  );
}

// Plain-text version (formatting marks removed) for search and short card previews.
export const stripFormatting = (text) =>
  String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.replace(HEADING, '$1').replace(BULLET, '• $1').replace(NUMBER, '$1'))
    .join(' ')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    .replace(/\*([^*\s\n][^*\n]*?)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
