-- =============================================================
-- FIX: every booking failed with
--   invalid input syntax for type date: "N/A"
--
-- The email-alert trigger on bookings builds its message with
--   COALESCE(NEW.booking_date, 'N/A')
-- booking_date is a DATE, so Postgres tries to turn 'N/A' into a date and
-- fails on every insert (even when a real date is given). Registrations were
-- unaffected because the student branch only uses text columns.
--
-- This patches the existing trigger function in place (finds it by the
-- broken line, swaps in booking_date::text). Your Resend key and alert
-- address inside the function are left exactly as they are.
-- Safe to run once; errors clearly if the function isn't found/already fixed.
--
-- Run in Supabase -> SQL Editor (select ALL with Ctrl+A, copy, paste, Run).
-- =============================================================
DO $$
DECLARE
  fn  oid;
  def text;
BEGIN
  SELECT t.tgfoid INTO fn
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.bookings'::regclass
    AND NOT t.tgisinternal
    AND pg_get_functiondef(t.tgfoid) LIKE '%COALESCE(NEW.booking_date, ''N/A'')%'
  LIMIT 1;

  IF fn IS NULL THEN
    RAISE EXCEPTION 'Booking email function not found, or it is already fixed.';
  END IF;

  def := replace(pg_get_functiondef(fn),
                 'COALESCE(NEW.booking_date, ''N/A'')',
                 'COALESCE(NEW.booking_date::text, ''N/A'')');
  EXECUTE def;  -- pg_get_functiondef returns a full CREATE OR REPLACE FUNCTION statement
END $$;
