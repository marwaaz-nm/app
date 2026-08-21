-- One organization-wide template shared by every survey PDF and device.
ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS survey_pdf_design JSONB NOT NULL DEFAULT '{
  "title":"LAND SURVEY REPORT", "subtitle":"Warbixinta Sahanka Dhulka",
  "accent":"#2563eb", "font":"Arial", "density":"comfortable",
  "showLogo":true, "showFooter":true,
  "sections":{"summary":true,"boundaries":true,"sketch":true,"certification":true},
  "notes":""
}'::jsonb;
