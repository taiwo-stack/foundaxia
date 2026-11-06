import React, { useState, useEffect, useCallback } from 'react';
import { X, KeyRound, Copy, Check, Plus, MessageCircle, Wallet, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { parentApi } from '../services/dataService';
import '../styles/ParentArea.css';

// Admin: manage one student's parent code and fees.

const naira = (kobo) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format((Number(kobo) || 0) / 100);

const fmtDate = (value) => {
  if (!value) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};

// 080... -> 23480... for WhatsApp links (Nigerian numbers); other formats pass through.
const waNumber = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0') && digits.length === 11) return '234' + digits.slice(1);
  return digits;
};

export default function ParentFeesModal({ student, onClose }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [shownCode, setShownCode] = useState(null); // code currently revealed (new or shown again)
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ description: '', amount: '', dueDate: '' });

  const load = useCallback(async () => {
    try {
      setInfo(await parentApi('admin-student', { studentId: student.id }));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [student.id]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const generateCode = () => run(async () => {
    if (info?.hasCode && !window.confirm('Replace the current parent code? The old code will stop working.')) return;
    const { code } = await parentApi('admin-generate-code', { studentId: student.id });
    setShownCode(code);
    setCopied(false);
    await load();
  });

  const toggleShow = () => run(async () => {
    if (shownCode) { setShownCode(null); return; }
    const { code } = await parentApi('admin-show-code', { studentId: student.id });
    setShownCode(code);
    setCopied(false);
  });

  const addFee = (e) => {
    e.preventDefault();
    run(async () => {
      await parentApi('admin-add-fee', { studentId: student.id, description: form.description, amount: Number(form.amount), dueDate: form.dueDate || null });
      setForm({ description: '', amount: '', dueDate: '' });
      await load();
    });
  };

  const cancelFee = (fee) => run(async () => {
    if (!window.confirm(`Cancel "${fee.description}" (${naira(fee.amount_kobo)})?`)) return;
    await parentApi('admin-cancel-fee', { feeId: fee.id });
    await load();
  });

  const markPaid = (fee) => run(async () => {
    const note = window.prompt(`Record "${fee.description}" (${naira(fee.amount_kobo)}) as paid outside the portal.\nOptional note (e.g. "Bank transfer 12 Nov"):`, '');
    if (note === null) return;
    await parentApi('admin-mark-paid', { feeId: fee.id, note });
    await load();
  });

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(shownCode); setCopied(true); } catch { /* ignore */ }
  };

  const phone = waNumber(student.phone);
  const waText = encodeURIComponent(
    `Hello, this is FoundaXia Academy. Your Parent Area code for ${student.full_name} is ${shownCode}. ` +
    `Log in to ${student.full_name}'s student dashboard, open "Parent Area" and enter this code to view and pay fees. Please keep it private.`
  );

  const fees = (info?.fees || []).filter(f => f.status !== 'cancelled');
  const outstanding = fees.filter(f => f.status === 'unpaid').reduce((s, f) => s + Number(f.amount_kobo), 0);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal-content pfm" style={{ maxWidth: '640px' }}>
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        <h3 className="modal-title">Parent &amp; Fees: {student.full_name}</h3>

        {error && <div className="pa-alert pa-alert-err" style={{ marginBottom: '1rem' }}>{error}</div>}

        {/* Parent code */}
        <section className="pfm-section">
          <div className="pfm-row">
            <div>
              <h4><KeyRound size={16} /> Parent code</h4>
              <p className="pa-muted" style={{ margin: 0 }}>
                {info === null ? 'Loading...' : info.hasCode ? `Created ${fmtDate(info.codeSetAt)}.` : "No code yet. Parents can't open the Parent Area until you create one."}
              </p>
            </div>
            <div className="pfm-code-actions">
              {info?.canShow && (
                <button type="button" className="pa-btn-ghost" onClick={toggleShow} disabled={busy}>
                  {shownCode ? <EyeOff size={15} /> : <Eye size={15} />} {shownCode ? 'Hide' : 'Show'}
                </button>
              )}
              <button type="button" className="pa-btn-ghost" onClick={generateCode} disabled={busy || info === null}>
                {info?.hasCode ? 'Reset code' : 'Generate code'}
              </button>
            </div>
          </div>

          {info?.hardLocked && (
            <div className="pa-alert pa-alert-err" style={{ marginTop: '0.75rem' }}>
              <AlertCircle size={16} /> Locked after 10 wrong attempts in one day. Someone may be guessing. Reset the code and send the new one to the parent.
            </div>
          )}
          {info?.hasCode && !info.canShow && !shownCode && (
            <p className="pa-muted" style={{ margin: '0.6rem 0 0' }}>This is an older code that can't be shown. Reset it to get a new one you can see again.</p>
          )}

          {shownCode && (
            <div className="pfm-code">
              <div className="pfm-code-text">{shownCode}</div>
              <p>Parents can type just the last part, e.g. <b>{shownCode.replace(/^foundaxia-/, '')}</b>. Capital letters and spaces don't matter.</p>
              <div className="pfm-code-actions">
                <button type="button" className="pa-btn-ghost" onClick={copyCode}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}</button>
                <a className="pa-btn-primary" href={`https://wa.me/${phone}?text=${waText}`} target="_blank" rel="noreferrer">
                  <MessageCircle size={15} /> Send on WhatsApp
                </a>
              </div>
            </div>
          )}
        </section>

        {/* Add fee */}
        <section className="pfm-section">
          <h4><Plus size={16} /> Add a fee</h4>
          <form onSubmit={addFee} className="pfm-form">
            <input type="text" placeholder="What is it for? e.g. November tutoring (8 sessions)" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} required maxLength={200} />
            <div className="pfm-form-row">
              <input type="number" placeholder="Amount (₦)" min="100" step="0.01" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} required />
              <input type="date" value={form.dueDate} onChange={(e) => setForm(f => ({ ...f, dueDate: e.target.value }))} title="Due date (optional)" />
              <button type="submit" className="pa-btn-primary" disabled={busy}>Add fee</button>
            </div>
          </form>
        </section>

        {/* Fees */}
        <section className="pfm-section">
          <div className="pfm-row">
            <h4><Wallet size={16} /> Fees</h4>
            {fees.length > 0 && <span className="pa-muted">Outstanding: <strong>{naira(outstanding)}</strong></span>}
          </div>
          {info === null ? null : fees.length === 0 ? (
            <p className="pa-muted">No fees yet.</p>
          ) : (
            <ul className="pa-list">
              {fees.map(fee => (
                <li key={fee.id} className={`pa-fee ${fee.status === 'paid' ? 'is-paid' : ''}`}>
                  <div className="pa-fee-main">
                    <div className="pa-fee-title">{fee.description}</div>
                    <div className="pa-fee-due">
                      {fee.status === 'paid' ? `Paid ${fmtDate(fee.paid_at)}` : fee.due_date ? `Due ${fmtDate(fee.due_date)}` : 'No due date'}
                    </div>
                  </div>
                  <div className="pa-fee-amount">{naira(fee.amount_kobo)}</div>
                  {fee.status === 'unpaid' ? (
                    <div className="pfm-fee-actions">
                      <button type="button" className="btn-action approve" onClick={() => markPaid(fee)} disabled={busy}>Mark paid</button>
                      <button type="button" className="btn-action cancel" onClick={() => cancelFee(fee)} disabled={busy}>Cancel</button>
                    </div>
                  ) : (
                    <span className="badge badge-completed">Paid</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
