-- =============================================================
-- SAVE EACH CLASS'S TIME ZONE
-- When a class is booked in the student's time zone (e.g. 4:00 PM UK time),
-- that zone is saved with the class, so every dashboard shows
-- "4:00 PM UK time (GMT)" instead of converting it to the viewer's clock.
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/wexqhlrhfostrpehknka/sql/new
-- =============================================================

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS time_zone TEXT;

COMMENT ON COLUMN public.schedules.time_zone IS 'IANA time zone the class was booked in (the student''s), e.g. Europe/London. Class times are shown in this zone.';

-- Pelin Akbulut is in the UK: show her existing classes in UK time.
UPDATE public.schedules
  SET time_zone = 'Europe/London'
  WHERE student_id = '86b9cef8-7184-4555-b3b5-27c0f846f9e7'
    AND time_zone IS NULL;
