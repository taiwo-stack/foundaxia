-- Parent Area: parent access codes, student fees and Paystack payments.
-- Run once in Supabase -> SQL Editor. Safe to run again.
--
-- Only the server (/api/parent, using the service role) reads or writes these tables.
-- Row Level Security is switched on with NO policies, so the keys used in the browser
-- (anon / student logins) cannot read them at all - a student can't peek at fees or
-- the parent code through the normal database API.

-- One parent code per student. The code itself is never stored, only a salted hash.
CREATE TABLE IF NOT EXISTS public.parent_access (
  student_id      TEXT PRIMARY KEY,
  code_hash       TEXT        NOT NULL,
  failed_attempts INT         NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fees the school asks a family to pay. Amounts differ per student, so each fee has its own.
CREATE TABLE IF NOT EXISTS public.student_fees (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  TEXT        NOT NULL,
  description TEXT        NOT NULL,
  amount_kobo BIGINT      NOT NULL CHECK (amount_kobo > 0),
  due_date    DATE,
  status      TEXT        NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'cancelled')),
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_fees_student_idx ON public.student_fees (student_id);
-- true when the parent typed the amount themselves ("Make a payment").
ALTER TABLE public.student_fees ADD COLUMN IF NOT EXISTS parent_initiated BOOLEAN NOT NULL DEFAULT false;

-- Payment attempts (Paystack) and payments recorded by an admin (cash / bank transfer).
CREATE TABLE IF NOT EXISTS public.fee_payments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_id      UUID        NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
  student_id  TEXT        NOT NULL,
  reference   TEXT        NOT NULL UNIQUE,
  amount_kobo BIGINT      NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  channel     TEXT,
  note        TEXT,
  paid_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_payments_student_idx ON public.fee_payments (student_id);
CREATE INDEX IF NOT EXISTS fee_payments_fee_idx     ON public.fee_payments (fee_id);

ALTER TABLE public.parent_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_fees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments  ENABLE ROW LEVEL SECURITY;
