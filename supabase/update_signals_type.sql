-- Allow political_insight as a signal type
ALTER TABLE signals
  DROP CONSTRAINT IF EXISTS signals_type_check;

ALTER TABLE signals
  ADD CONSTRAINT signals_type_check
  CHECK (type IN ('contradiction', 'alignment', 'warning', 'political_insight'));
