-- ============================================================
-- THUG SUPPLY ERP - Admin-only Row Level Security
-- Jalankan setelah 005_product_size.sql
--
-- Sebelumnya semua user yang login (auth.role() = 'authenticated') punya
-- akses penuh ke seluruh tabel. Sekarang hanya user dengan role admin di
-- app_metadata yang boleh membaca/menulis. Aturannya sama dengan
-- lib/auth/roles.ts (role / roles / user_role / user_roles, string atau array).
--
-- Set role admin:
--   UPDATE auth.users
--   SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
--   WHERE email = '...';
-- User harus logout-login ulang agar JWT memuat role baru.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_each(COALESCE(auth.jwt() -> 'app_metadata', '{}'::jsonb)) AS m(key, value)
    CROSS JOIN LATERAL (
      SELECT m.value #>> '{}' AS role WHERE jsonb_typeof(m.value) = 'string'
      UNION ALL
      SELECT jsonb_array_elements_text(m.value) WHERE jsonb_typeof(m.value) = 'array'
    ) r
    WHERE m.key IN ('role', 'roles', 'user_role', 'user_roles')
      AND LOWER(r.role) = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'suppliers', 'materials', 'purchase_orders', 'purchase_order_items', 'stock_movements',
    'customers', 'products', 'quotations', 'quotation_items', 'invoices', 'invoice_items',
    'bill_of_materials', 'bom_items', 'work_orders', 'work_order_stages',
    'chart_of_accounts', 'journal_entries', 'journal_lines'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated users full access" ON %I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admin full access" ON %I;', t);
    EXECUTE format(
      'CREATE POLICY "Admin full access" ON %I FOR ALL TO authenticated '
      'USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));',
      t
    );
  END LOOP;
END $$;
