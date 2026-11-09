import React, { useRef, useState } from 'react';
import { FileSpreadsheet, Download } from 'lucide-react';
import { importQuizFile, QUIZ_TEMPLATE_URL } from '../utils/quizImport';

// "Import from Excel" for quiz builders. Calls onImport(questions) with
// [{ question, options, correct }] after the user confirms.
const QuizImport = ({ onImport }) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      const { questions, errors } = await importQuizFile(file);
      const list = errors.slice(0, 8).map(x => '• ' + x).join('\n') + (errors.length > 8 ? `\n• …and ${errors.length - 8} more` : '');
      if (questions.length === 0) {
        alert('No questions could be imported.\n\n' + list);
        return;
      }
      const tf = questions.filter(q => q.options.length === 2 && q.options[0] === 'True' && q.options[1] === 'False').length;
      const summary = `${questions.length} question(s) found` +
        (tf && tf < questions.length ? ` (${tf} True/False, ${questions.length - tf} multiple choice)` : tf ? ' (all True/False)' : '') + '.';
      const ok = window.confirm(errors.length
        ? `${summary}\n\n${errors.length} row(s) will be skipped:\n${list}\n\nAdd the ${questions.length} good question(s) to this quiz?`
        : `${summary}\n\nAdd them to this quiz?`);
      if (!ok) return;
      onImport(questions);
      setMsg(`✅ Added ${questions.length} question(s) from ${file.name}`);
    } catch (err) {
      alert('Could not read the file: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: '#f0fff4', border: '1px dashed #68d391', borderRadius: 10, padding: '0.55rem 0.7rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: '#2f855a', color: '#fff', border: 'none', borderRadius: 8, padding: '0.4rem 0.75rem', fontWeight: 700, fontSize: '0.78rem', cursor: busy ? 'wait' : 'pointer' }}>
        <FileSpreadsheet size={15} /> {busy ? 'Reading…' : 'Import from Excel'}
      </button>
      <a href={QUIZ_TEMPLATE_URL} download style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#2f855a', fontWeight: 600, textDecoration: 'none' }}>
        <Download size={14} /> Download template
      </a>
      <span style={{ color: '#4a5568', fontSize: '0.74rem', flexBasis: '100%' }}>
        {msg || 'One question per row: Question | Answer (True / False). Optional Option A–D with Answer A–D for multiple choice. .xlsx or .csv'}
      </span>
      <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  );
};

export default QuizImport;
