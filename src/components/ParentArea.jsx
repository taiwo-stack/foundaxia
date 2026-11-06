import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Lock, Unlock, ShieldCheck, Wallet, CheckCircle2, Receipt, X, Printer, AlertCircle, Eye, EyeOff,
  LayoutDashboard, TrendingUp, CalendarCheck, MessageSquareQuote
} from 'lucide-react';
import { OverviewTab, ProgressTab, AttendanceTab, NotesTab } from './ParentInsights';
import { buildInsights } from '../utils/parentInsights';
import { parentApi } from '../services/dataService';
import '../styles/ParentArea.css';

// Code-protected section of the student dashboard where a parent sees and pays fees.
// The unlock token lives only in this component's memory: leaving the tab, reloading
// or 10 minutes passing locks it again.

const naira = (kobo) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format((Number(kobo) || 0) / 100);

const fmtDate = (value, withTime = false) => {
  if (!value) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Paystack's official checkout script (loaded only when a parent pays).
let paystackScript;
const loadPaystack = () => {
  if (window.PaystackPop) return Promise.resolve(window.PaystackPop);
  if (!paystackScript) {
    paystackScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js.paystack.co/v2/inline.js';
      s.async = true;
      s.onload = () => (window.PaystackPop ? resolve(window.PaystackPop) : reject(new Error('Paystack did not load')));
      s.onerror = () => { paystackScript = null; reject(new Error('Could not load Paystack')); };
      document.head.appendChild(s);
    });
  }
  return paystackScript;
};

// Same rules as the server: "Foundaxia-Mango-42", "mango 42", "MANGO42" -> "mango42"
const normalizeCode = (input) => String(input || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^foundaxia/, '');
const isCodeShaped = (normalized) => /^[a-z]{2,20}\d{2}$/.test(normalized);

const CHANNEL_LABELS = { card: 'Card', bank: 'Bank', bank_transfer: 'Bank transfer', ussd: 'USSD', manual: 'Paid at school / transfer', mobile_money: 'Mobile money', qr: 'QR' };

const TABS = [
  { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { key: 'progress', label: 'Progress', Icon: TrendingUp },
  { key: 'attendance', label: 'Attendance', Icon: CalendarCheck },
  { key: 'notes', label: 'Tutor Notes', Icon: MessageSquareQuote },
  { key: 'payments', label: 'Payments', Icon: Wallet }
];

export default function ParentArea({ studentName, insights, initialReference, onReferenceHandled }) {
  const [tab, setTab] = useState('overview');
  const [notes, setNotes] = useState(null);
  const [notesError, setNotesError] = useState('');
  const [status, setStatus] = useState(null); // { hasCode, lockedUntil, hardLocked }
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [session, setSession] = useState(null); // { token, expiresAt }
  const [data, setData] = useState({ fees: [], payments: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [payingId, setPayingId] = useState(null);
  const [receipt, setReceipt] = useState(null); // { fee, payment }
  const [now, setNow] = useState(Date.now());
  const codeInputRef = useRef(null);

  const lock = useCallback((message = '') => {
    setSession(null);
    setData({ fees: [], payments: [] });
    setNotes(null);
    setNotesError('');
    setTab('overview');
    setCode('');
    setReceipt(null);
    if (message) setNotice(message);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await parentApi('status'));
    } catch (err) {
      setError(err.message);
      setStatus({ hasCode: false, lockedUntil: null, failed: true });
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Returning from Paystack's own page (fallback when the pop-up can't open).
  useEffect(() => {
    if (!initialReference) return;
    (async () => {
      try {
        const r = await parentApi('verify', { reference: initialReference });
        setNotice(r.status === 'success' ? 'Payment received. Thank you!' : 'We could not confirm that payment yet. If you were charged, it will update shortly.');
      } catch (err) {
        setError(err.message);
      } finally {
        onReferenceHandled?.();
      }
    })();
  }, [initialReference, onReferenceHandled]);

  // Countdown + auto-lock.
  useEffect(() => {
    if (!session) return undefined;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= session.expiresAt) lock('The Parent Area locked automatically after 10 minutes.');
    }, 15000);
    return () => clearInterval(t);
  }, [session, lock]);

  const loadFees = useCallback(async (token) => {
    try {
      setData(await parentApi('fees', { token }));
    } catch (err) {
      if (/locked|expired/i.test(err.message)) lock(err.message);
      else setError(err.message);
    }
  }, [lock]);

  const loadNotes = useCallback(async (token) => {
    try {
      const r = await parentApi('notes', { token });
      setNotes(r.notes || []);
      setNotesError('');
    } catch (err) {
      setNotes([]);
      setNotesError(/missing|update/i.test(err.message) ? err.message : 'Tutor notes could not be loaded right now.');
    }
  }, []);

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    if (!isCodeShaped(normalizeCode(code))) { setError('Enter the parent code, e.g. mango-42.'); return; }
    setBusy(true);
    try {
      const s = await parentApi('unlock', { code });
      setSession(s);
      setNow(Date.now());
      setCode('');
      await Promise.all([loadFees(s.token), loadNotes(s.token)]);
    } catch (err) {
      setError(err.message);
      setCode('');
      if (/locked|try again in/i.test(err.message)) loadStatus();
      codeInputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (reference) => {
    try {
      const r = await parentApi('verify', { reference });
      if (r.status === 'success') setNotice('Payment received. Thank you!');
      else setNotice('Payment not confirmed yet. If you were charged, it will update shortly.');
    } catch (err) {
      setError(err.message);
    }
    if (session) await loadFees(session.token);
  };

  const handlePay = async (fee) => {
    if (!session || payingId) return;
    setError('');
    setNotice('');
    setPayingId(fee.id);
    try {
      const { accessCode, authorizationUrl, reference } = await parentApi('pay', { token: session.token, feeId: fee.id });
      let Pop;
      try {
        Pop = await loadPaystack();
      } catch {
        window.location.assign(authorizationUrl); // pop-up blocked or script failed: use Paystack's page
        return;
      }
      const popup = new Pop();
      popup.resumeTransaction(accessCode, {
        onSuccess: () => { setPayingId(null); confirm(reference); },
        onCancel: () => { setPayingId(null); },
        onError: (err) => { setPayingId(null); setError(err?.message || 'Payment could not be completed.'); }
      });
    } catch (err) {
      setPayingId(null);
      if (/locked|expired/i.test(err.message)) lock(err.message);
      else setError(err.message);
    }
  };

  // ---------- Locked view ----------
  if (!session) {
    const lockedUntil = status?.lockedUntil && new Date(status.lockedUntil) > new Date() ? status.lockedUntil : null;
    const hardLocked = !!status?.hardLocked;
    const blocked = !!lockedUntil || hardLocked;
    return (
      <div className="pa-wrap">
        <div className="dashboard-card pa-lock-card">
          <div className="pa-lock-icon"><Lock size={26} /></div>
          <h2>Parent Area</h2>
          <p className="pa-lock-sub">For parents and guardians of {studentName || 'this student'}. Enter your parent code to view and pay fees.</p>

          {notice && <div className="pa-alert pa-alert-ok"><CheckCircle2 size={16} /> {notice}</div>}

          {status === null ? (
            <div className="pa-muted">Loading...</div>
          ) : !status.hasCode && !status.failed ? (
            <div className="pa-alert pa-alert-info">
              <AlertCircle size={16} /> No parent code has been set up yet. Please contact FoundaXia to get one.
            </div>
          ) : (
            <form onSubmit={handleUnlock} className="pa-code-form">
              <div className={`pa-code-field ${blocked ? 'is-disabled' : ''}`}>
                <span className="pa-code-prefix">foundaxia-</span>
                <input
                  ref={codeInputRef}
                  type={showCode ? 'text' : 'password'}
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={40}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="mango-42"
                  aria-label="Parent code"
                  className="pa-code-input"
                  disabled={busy || blocked}
                />
                <button type="button" className="pa-code-eye" onClick={() => setShowCode(v => !v)} aria-label={showCode ? 'Hide code' : 'Show code'} disabled={blocked}>
                  {showCode ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button type="submit" className="pa-btn-primary" disabled={busy || !isCodeShaped(normalizeCode(code)) || blocked}>
                <Unlock size={16} /> {busy ? 'Checking...' : 'Unlock'}
              </button>
            </form>
          )}

          {error && <div className="pa-alert pa-alert-err"><AlertCircle size={16} /> {error}</div>}
          {hardLocked && !error && (
            <div className="pa-alert pa-alert-err"><AlertCircle size={16} /> The Parent Area is locked after too many wrong attempts. Please contact FoundaXia for a new code.</div>
          )}
          {lockedUntil && !hardLocked && !error && (
            <div className="pa-alert pa-alert-err"><AlertCircle size={16} /> Too many wrong attempts. Try again after {fmtDate(lockedUntil, true)}.</div>
          )}
          <p className="pa-foot"><ShieldCheck size={14} /> Forgot the code? FoundaXia can send you a new one.</p>
        </div>
      </div>
    );
  }

  // ---------- Unlocked view ----------
  const unpaid = data.fees.filter(f => f.status === 'unpaid');
  const paidFees = data.fees.filter(f => f.status === 'paid');
  const outstanding = unpaid.reduce((sum, f) => sum + Number(f.amount_kobo), 0);
  const paidTotal = data.payments.reduce((sum, p) => sum + Number(p.amount_kobo), 0);
  const minsLeft = Math.max(1, Math.ceil((session.expiresAt - now) / 60000));
  const today = todayStr();
  const paymentFor = (feeId) => data.payments.find(p => p.fee_id === feeId);
  const ins = buildInsights(insights || {});
  const outstandingText = unpaid.length > 0 ? `${naira(outstanding)} to pay (${unpaid.length} fee${unpaid.length === 1 ? '' : 's'})` : '';

  return (
    <div className="pa-wrap">
      <div className="pa-header">
        <div>
          <h2><Unlock size={22} /> Parent Area</h2>
          <span className="pa-muted">{studentName || 'Your child'}'s learning and payments · locks in {minsLeft} min</span>
        </div>
        <button type="button" className="pa-btn-ghost" onClick={() => lock()}><Lock size={15} /> Lock</button>
      </div>

      {notice && <div className="pa-alert pa-alert-ok"><CheckCircle2 size={16} /> {notice}</div>}
      {error && <div className="pa-alert pa-alert-err"><AlertCircle size={16} /> {error}</div>}

      <nav className="pa-tabs" role="tablist" aria-label="Parent Area sections">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
            className={`pa-tab ${tab === key ? 'is-active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={16} /> <span>{label}</span>
            {key === 'payments' && unpaid.length > 0 && <b className="pa-tab-dot">{unpaid.length}</b>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <OverviewTab ins={ins} notes={notes} outstandingText={outstandingText} onGo={setTab} />}
      {tab === 'progress' && <ProgressTab ins={ins} />}
      {tab === 'attendance' && <AttendanceTab ins={ins} />}
      {tab === 'notes' && <NotesTab notes={notes} notesError={notesError} ins={ins} />}

      {tab === 'payments' && (<>
      <div className="pa-stats">
        <div className="pa-stat pa-stat-due">
          <span>Outstanding</span>
          <strong>{naira(outstanding)}</strong>
          <small>{unpaid.length} fee{unpaid.length === 1 ? '' : 's'} to pay</small>
        </div>
        <div className="pa-stat">
          <span>Paid so far</span>
          <strong>{naira(paidTotal)}</strong>
          <small>{data.payments.length} payment{data.payments.length === 1 ? '' : 's'}</small>
        </div>
      </div>

      <section className="dashboard-card">
        <h3><Wallet size={18} color="var(--primary-color)" /> Fees to Pay</h3>
        {unpaid.length === 0 ? (
          <div className="pa-empty"><CheckCircle2 size={26} /> You're all paid up. Nothing is due right now.</div>
        ) : (
          <ul className="pa-list">
            {unpaid.map(fee => {
              const overdue = fee.due_date && fee.due_date < today;
              return (
                <li key={fee.id} className="pa-fee">
                  <div className="pa-fee-main">
                    <div className="pa-fee-title">{fee.description}</div>
                    {fee.due_date && (
                      <div className={`pa-fee-due ${overdue ? 'is-overdue' : ''}`}>{overdue ? 'Overdue since' : 'Due'} {fmtDate(fee.due_date)}</div>
                    )}
                  </div>
                  <div className="pa-fee-amount">{naira(fee.amount_kobo)}</div>
                  <button type="button" className="pa-btn-primary" onClick={() => handlePay(fee)} disabled={!!payingId}>
                    {payingId === fee.id ? 'Opening...' : 'Pay now'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="pa-secure"><ShieldCheck size={14} /> Payments are processed securely by Paystack (card, bank transfer or USSD).</p>
      </section>

      <section className="dashboard-card">
        <h3><Receipt size={18} color="var(--primary-color)" /> Payment History</h3>
        {paidFees.length === 0 ? (
          <div className="pa-empty pa-empty-muted">No payments yet.</div>
        ) : (
          <ul className="pa-list">
            {paidFees.map(fee => {
              const pay = paymentFor(fee.id);
              return (
                <li key={fee.id} className="pa-fee is-paid">
                  <div className="pa-fee-main">
                    <div className="pa-fee-title">{fee.description}</div>
                    <div className="pa-fee-due">Paid {fmtDate(fee.paid_at || pay?.paid_at)}{pay?.channel ? ` · ${CHANNEL_LABELS[pay.channel] || pay.channel}` : ''}</div>
                  </div>
                  <div className="pa-fee-amount">{naira(fee.amount_kobo)}</div>
                  <button type="button" className="pa-btn-ghost" onClick={() => setReceipt({ fee, payment: pay })}><Receipt size={15} /> Receipt</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </>)}

      {receipt && (
        <div className="modal-overlay pa-receipt-overlay" onClick={(e) => { if (e.target === e.currentTarget) setReceipt(null); }}>
          <div className="pa-receipt" role="dialog" aria-label="Payment receipt">
            <button type="button" className="pa-receipt-close" onClick={() => setReceipt(null)} aria-label="Close"><X size={18} /></button>
            <img src="/images/logo_combined.jpg" alt="FoundaXia Academy" className="pa-receipt-logo" />
            <h3>Payment Receipt</h3>
            <dl>
              <div><dt>Student</dt><dd>{studentName}</dd></div>
              <div><dt>For</dt><dd>{receipt.fee.description}</dd></div>
              <div><dt>Amount</dt><dd>{naira(receipt.fee.amount_kobo)}</dd></div>
              <div><dt>Date paid</dt><dd>{fmtDate(receipt.fee.paid_at || receipt.payment?.paid_at, true)}</dd></div>
              <div><dt>Method</dt><dd>{CHANNEL_LABELS[receipt.payment?.channel] || receipt.payment?.channel || 'N/A'}</dd></div>
              <div><dt>Reference</dt><dd className="pa-ref">{receipt.payment?.reference?.startsWith('MANUAL-') ? 'Recorded by FoundaXia' : (receipt.payment?.reference || 'N/A')}</dd></div>
            </dl>
            <button type="button" className="pa-btn-primary pa-print" onClick={() => window.print()}><Printer size={15} /> Print</button>
          </div>
        </div>
      )}
    </div>
  );
}
