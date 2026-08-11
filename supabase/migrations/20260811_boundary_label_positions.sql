-- Lets a surveyor manually place the Waqooyi/Bari/Koonfur/Galbeed direction labels
-- anywhere on the map/sketch (click a direction button, then click the map), rather than
-- relying only on an automatic (and occasionally wrong-looking) compass-bearing guess.
-- Format: "N:lat,lng;E:lat,lng;S:lat,lng;W:lat,lng" — only directions the user has
-- actually placed are included; a record with no entries (or this column empty) falls
-- back to the automatic bearing calculation in the app.

ALTER TABLE public.surveys
  ADD COLUMN IF NOT EXISTS boundary_label_positions TEXT;
