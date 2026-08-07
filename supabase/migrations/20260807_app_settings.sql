-- App Settings: single-row configuration table for organization branding,
-- public contact info, and admin-managed dropdown option lists.

CREATE TABLE public.app_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- enforce single row
    org_name_so TEXT NOT NULL DEFAULT 'Nootaayo Marwaaz',
    org_name_en TEXT NOT NULL DEFAULT 'Marwaaz Public Notary',
    logo_url TEXT,
    contact_email TEXT NOT NULL DEFAULT 'hssnmoalim@gmail.com',
    contact_phone TEXT NOT NULL DEFAULT '+252 611122205',
    contact_address TEXT NOT NULL DEFAULT 'Baidoa – Somalia',
    reference_subjects JSONB NOT NULL DEFAULT '[
        "Beec Dhul", "Beec Gaari", "Beec Mooto", "Sugitaan Milkiyad Dhul",
        "Sugitaan Dhaxalkoob", "Sugitaan Milkiyad Gaari/Koox/Nooc kale",
        "Codsi Sabarloog", "Wakaalad", "Damaanad", "Heshiis", "Cadeyn",
        "Cadeyn Heshiis Kiro", "Xeer Hoosaad", "Cadeyn Rahan", "Qiimeyn Guri",
        "Cadeyn Hibeyn/ Waqaf"
    ]'::jsonb,
    land_types JSONB NOT NULL DEFAULT '["Dhul Banaan", "Dhul dhisan"]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO public.app_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view app settings"
    ON public.app_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update app settings"
    ON public.app_settings FOR UPDATE TO authenticated USING (
        (auth.jwt() -> 'user_metadata' ->> 'role') = 'Admin'
    );
