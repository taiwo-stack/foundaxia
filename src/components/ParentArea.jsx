import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, Unlock, ShieldCheck, Wallet, CheckCircle2, Receipt, X, Printer, AlertCircle, CreditCard } from 'lucide-react';
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

const CHANNEL_LABELS = { card: 'Card', bank: 'Bank', bank_transfer: 'Bank transfer', ussd: 'USSD', manual: 'Paid at school / transfer', mobile_money: 'Mobile money', qr: 'QR' };

export default function ParentArea({ studentName, initialReference, onReferenceHandled }) {
  const [status, setStatus] = useState(null); // { hasCode, lockedUntil }
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

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit parent code.'); return; }
    setBusy(true);
    try {
      const s = await parentApi('unlock', { code });
      setSession(s);
      setNow(Date.now());
      setCode('');
      await loadFees(s.token);
    } catch (err) {
      setError(err.message);
      setCode('');
      if (/locked for|try again in/i.test(err.message)) loadStatus();
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

  const [custom, setCustom] = useState({ amount: '', description: '' });

  const handleCustomPay = (e) => {
    e.preventDefault();
    const amount = Number(custom.amount);
    if (!Number.isFinite(amount) || amount < 100) { setError('Enter an amount of at least ₦100.'); return; }
    startPayment('custom', { action: 'pay-custom', amount, description: custom.description }, () => setCustom({ amount: '', description: '' }));
  };

  const handlePay = (fee) => startPayment(fee.id, { action: 'pay', feeId: fee.id });

  // key: which button shows "Opening..."; onPaid: extra cleanup after a confirmed payment.
  const startPayment = async (key, { action, ...payload }, onPaid) => {
    if (!session || payingId) return;
    setError('');
    setNotice('');
    setPayingId(key);
    try {
      const { accessCode, authorizationUrl, reference } = await parentApi(action, { token: session.token, ...payload });
      let Pop;
      try {
        Pop = await loadPaystack();
      } catch {
        window.location.assign(authorizationUrl); // pop-up blocked or script failed: use Paystack's page
        return;
      }
      const popup = new Pop();
      popup.resumeTransaction(accessCode, {
        onSuccess: () => { setPayingId(null); onPaid?.(); confirm(reference); },
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
    return (
      <div className="pa-wrap">
        <div className="dashboard-card pa-lock-card">
          <div className="pa-lock-icon"><Lock size={26} /></div>
          <h2>Parent Area</h2>
          <p className="pa-lock-sub">For parents and guardians of {studentName || 'this student'}. Enter your 6-digit parent code to view and pay fees.</p>

          {notice && <div className="pa-alert pa-alert-ok"><CheckCircle2 size={16} /> {notice}</div>}

          {status === null ? (
            <div className="pa-muted">Loading...</div>
          ) : !status.hasCode && !status.failed ? (
            <div className="pa-alert pa-alert-info">
              <AlertCircle size={16} /> No parent code has been set up yet. Please contact FoundaXia to get one.
            </div>
          ) : (
            <form onSubmit={handleUnlock} className="pa-code-form">
              <input
                ref={codeInputRef}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                aria-label="Parent code"
                className="pa-code-input"
                disabled={busy || !!lockedUntil}
              />
              <button type="submit" className="pa-btn-primary" disabled={busy || code.length !== 6 || !!lockedUntil}>
                <Unlock size={16} /> {busy ? 'Checking...' : 'Unlock'}
              </button>
            </form>
          )}

          {error && <div className="pa-alert pa-alert-err"><AlertCircle size={16} /> {error}</div>}
          {lockedUntil && !error && (
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

  return (
    <div className="pa-wrap">
      <div className="pa-header">
        <div>
          <h2><Wallet size={22} /> Parent Area</h2>
          <span className="pa-muted">Fees and payments for {studentName || 'your child'} · locks in {minsLeft} min</span>
        </div>
        <button type="button" className="pa-btn-ghost" onClick={() => lock()}><Lock size={15} /> Lock</button>
      </div>

      {notice && <div className="pa-alert pa-alert-ok"><CheckCircle2 size={16} /> {notice}</div>}
      {error && <div className="pa-alert pa-alert-err"><AlertCircle size={16} /> {error}</div>}

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

      {unpaid.length > 0 && (
      <section className="dashboard-card">
        <h3><Wallet size={18} color="var(--primary-color)" /> Fees to Pay</h3>
        {(
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
      </section>
      )}

      <section className="dashboard-card">
        <h3><CreditCard size={18} color="var(--primary-color)" /> Make a Payment</h3>
        <p className="pa-muted" style={{ margin: '0 0 0.85rem' }}>
          Enter the amount you agreed with FoundaXia{unpaid.length > 0 ? ', or use the Pay buttons above for listed fees' : ''}.
        </p>
        <form onSubmit={handleCustomPay} className="pa-custom">
          <label className="pa-custom-amount">
            <span>Amount (₦)</span>
            <div className="pa-naira-input">
              <b>₦</b>
              <input type="number" inputMode="decimal" min="100" step="0.01" placeholder="e.g. 25000" value={custom.amount}
                onChange={(e) => setCustom(c => ({ ...c, amount: e.target.value }))} required />
            </div>
          </label>
          <label className="pa-custom-desc">
            <span>What is it for? (optional)</span>
            <input type="text" maxLength={200} placeholder="e.g. November tutoring" value={custom.description}
              onChange={(e) => setCustom(c => ({ ...c, description: e.target.value }))} />
          </label>
          <button type="submit" className="pa-btn-primary" disabled={!!payingId}>
            {payingId === 'custom' ? 'Opening...' : `Pay${Number(custom.amount) >= 100 ? ' ' + naira(Number(custom.amount) * 100) : ''}`}
          </button>
        </form>
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
