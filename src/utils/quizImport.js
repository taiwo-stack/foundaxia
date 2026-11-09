// Bulk-create quiz questions from an Excel (.xlsx) or CSV file.
//
// Expected columns (header row optional, any order when headers are present):
//   Question | Answer | Option A | Option B | Option C | Option D
// - True/False question: leave the options empty, Answer = True or False.
// - Multiple choice: fill 2-4 options, Answer = the letter (A-D), number (1-4) or the option text.
//
// No external library: .xlsx is a zip of XML files, read with the browser's DecompressionStream.

export const QUIZ_TEMPLATE_URL = '/templates/FoundaXia-Quiz-Template.xlsx';
const MAX_QUESTIONS = 300;

/* ---------------- file -> rows ---------------- */

export async function readSpreadsheetRows(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.xls')) {
    throw new Error('Old .xls files are not supported. In Excel choose File → Save As → "Excel Workbook (.xlsx)" or "CSV", then upload again.');
  }
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') {
    return parseCsv(await file.text());
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    return readXlsxRows(new Uint8Array(await file.arrayBuffer()));
  }
  throw new Error('Please upload an Excel file (.xlsx) or a CSV file.');
}

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => firstLine.split(ch).length - 1;
  const delim = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file does not look like a real Excel (.xlsx) file.');
  const entries = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = {};
  for (let n = 0; n < entries; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const fname = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    files[fname] = { method, compSize, localOff };
    p += 46 + nameLen + extraLen + commentLen;
  }
  const read = async (fname) => {
    const f = files[fname];
    if (!f) return null;
    const lo = f.localOff;
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const data = bytes.subarray(start, start + f.compSize);
    if (f.method === 0) return dec.decode(data);
    if (f.method !== 8) throw new Error('Unsupported Excel compression.');
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot read .xlsx files. Please save the sheet as CSV and upload that instead.');
    }
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).text();
  };
  return { files, read };
}

const decodeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&')
  .replace(/_x([0-9A-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

const textOf = (xml) => {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  clean.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g, (_, t) => { out += t; return ''; });
  return decodeXml(out);
};

const attr = (tag, name) => {
  const m = tag.match(new RegExp('\\b' + name + '="([^"]*)"'));
  return m ? m[1] : null;
};

const colIndex = (ref) => {
  const letters = (ref.match(/^[A-Z]+/i) || ['A'])[0].toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsxRows(bytes) {
  const zip = await unzip(bytes);

  // First sheet in workbook order (not necessarily sheet1.xml).
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wbXml = await zip.read('xl/workbook.xml');
  const relsXml = await zip.read('xl/_rels/workbook.xml.rels');
  if (wbXml && relsXml) {
    const firstSheet = wbXml.match(/<sheet\b[^>]*>/);
    const rid = firstSheet && (attr(firstSheet[0], 'r:id') || attr(firstSheet[0], 'id'));
    if (rid) {
      const rel = [...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map(m => m[0]).find(r => attr(r, 'Id') === rid);
      const target = rel && attr(rel, 'Target');
      if (target) sheetPath = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    }
  }
  const sheetXml = await zip.read(sheetPath) || await zip.read('xl/worksheets/sheet1.xml');
  if (!sheetXml) throw new Error('Could not find a worksheet in this Excel file.');

  const sstXml = await zip.read('xl/sharedStrings.xml');
  const shared = sstXml ? [...sstXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => textOf(m[1])) : [];

  const rows = [];
  for (const rm of sheetXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNum = Number(attr(rm[1], 'r')) || rows.length + 1;
    const cells = [];
    for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = cm[1], inner = cm[2] || '';
      const ref = attr(a, 'r');
      const idx = ref ? colIndex(ref) : cells.length;
      const t = attr(a, 't');
      const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = textOf(inner);
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (v != null) val = decodeXml(v);
      cells[idx] = val;
    }
    rows[rowNum - 1] = Array.from(cells, c => c ?? '');
  }
  return Array.from(rows, r => r || []);
}

/* ---------------- rows -> questions ---------------- */

const TRUE_WORDS = ['true', 't', 'yes', 'y', '1', '✓', '✔'];
const FALSE_WORDS = ['false', 'f', 'no', 'n', '0', '✗', '✘', 'x'];

function headerMap(row) {
  const map = {};
  row.forEach((raw, i) => {
    const h = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
    if (!h) return;
    if (map.question == null && /^(question|questions|statement|prompt|q)( text)?$/.test(h)) map.question = i;
    else if (map.answer == null && /^(answer|correct|correct answer|answer key|key|solution)$/.test(h)) map.answer = i;
    else {
      const m = h.match(/^(?:option|choice|opt)? ?([a-d1-4])$/);
      if (m) {
        const k = 'abcd'.indexOf(m[1]) >= 0 ? 'abcd'.indexOf(m[1]) : Number(m[1]) - 1;
        if (map['opt' + k] == null) map['opt' + k] = i;
      }
    }
  });
  return map.question != null && map.answer != null ? map : null;
}

export function rowsToQuestions(rows) {
  const firstIdx = rows.findIndex(r => r && r.some(c => String(c || '').trim()));
  if (firstIdx < 0) return { questions: [], errors: ['The file is empty.'] };

  let map = headerMap(rows[firstIdx]);
  let start = firstIdx + 1;
  if (!map) { map = { question: 0, answer: 1, opt0: 2, opt1: 3, opt2: 4, opt3: 5 }; start = firstIdx; }

  const questions = [], errors = [];
  for (let r = start; r < rows.length; r++) {
    const row = rows[r] || [];
    const get = (i) => (i == null ? '' : String(row[i] ?? '').trim());
    if (!row.some(c => String(c || '').trim())) continue;
    const rowLabel = `Row ${r + 1}`;
    const question = get(map.question);
    const answer = get(map.answer);
    const lettered = [0, 1, 2, 3].map(k => ({ letter: 'ABCD'[k], text: get(map['opt' + k]) }));
    const filled = lettered.filter(o => o.text);

    if (!question) { errors.push(`${rowLabel}: the question is empty.`); continue; }
    if (!answer) { errors.push(`${rowLabel}: the Answer column is empty.`); continue; }

    if (filled.length === 0) {
      const a = answer.toLowerCase();
      if (TRUE_WORDS.includes(a)) questions.push({ question, options: ['True', 'False'], correct: 0 });
      else if (FALSE_WORDS.includes(a)) questions.push({ question, options: ['True', 'False'], correct: 1 });
      else errors.push(`${rowLabel}: Answer must be True or False (found "${answer}").`);
      continue;
    }
    if (filled.length < 2) { errors.push(`${rowLabel}: a multiple-choice question needs at least 2 options.`); continue; }

    const a = answer.toUpperCase();
    let correct = -1;
    if (/^[A-D]$/.test(a)) correct = filled.findIndex(o => o.letter === a);
    else if (/^[1-4]$/.test(a)) correct = filled.findIndex(o => o.letter === 'ABCD'[Number(a) - 1]);
    if (correct < 0) correct = filled.findIndex(o => o.text.toLowerCase() === answer.toLowerCase());
    if (correct < 0) { errors.push(`${rowLabel}: Answer "${answer}" does not match any filled option (use A, B, C or D).`); continue; }

    questions.push({ question, options: filled.map(o => o.text), correct });
    if (questions.length >= MAX_QUESTIONS) { errors.push(`Only the first ${MAX_QUESTIONS} questions were read.`); break; }
  }
  if (questions.length === 0 && errors.length === 0) errors.push('No questions found in the file.');
  return { questions, errors };
}

export async function importQuizFile(file) {
  return rowsToQuestions(await readSpreadsheetRows(file));
}
