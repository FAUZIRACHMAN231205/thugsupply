-- ============================================================
-- THUG SUPPLY ERP - Ringkasan dashboard dihitung di database
-- Jalankan setelah 010_report_functions.sql
--
-- Sebelumnya beberapa angka dashboard salah:
--   - "Work Order Aktif" & "Invoice Pending" dihitung dari daftar yang dibatasi 5 baris
--   - "Pendapatan Bulan Ini" menjumlahkan semua invoice terbit bulan ini,
--     termasuk draft dan yang dibatalkan
--   - "Pembelian Bulan Ini" hanya PO yang dipesan bulan ini
--   - "Stok Hampir Habis" dihitung dari materials yang dimuat ke browser (limit baris)
--   - tren "+12.4%" / "+8.2%" adalah angka tetap
--
-- Sekarang:
--   revenue  = pendapatan dari jurnal (sama dengan Laba Rugi), bulan ini vs bulan lalu
--   purchase = nilai barang PO yang diterima (jurnal penerimaan PO), bulan ini vs bulan lalu
--   hitungan lain memakai COUNT di database
-- Bulan mengikuti zona waktu Asia/Jakarta. SECURITY INVOKER: RLS admin tetap berlaku.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH b AS (
    SELECT date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')::date AS this_month,
           (date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '1 month')::date AS prev_month
  ),
  revenue AS (
    SELECT
      COALESCE(SUM(jl.credit - jl.debit) FILTER (WHERE je.entry_date >= b.this_month), 0) AS this_month,
      COALESCE(SUM(jl.credit - jl.debit) FILTER (WHERE je.entry_date < b.this_month), 0) AS prev_month
    FROM b
    JOIN journal_entries je ON je.entry_date >= b.prev_month
    JOIN journal_lines jl ON jl.journal_entry_id = je.id
    JOIN chart_of_accounts a ON a.id = jl.account_id AND a.account_type = 'revenue'
  ),
  purchase AS (
    SELECT
      COALESCE(SUM(je.total_debit) FILTER (WHERE je.entry_date >= b.this_month), 0) AS this_month,
      COALESCE(SUM(je.total_debit) FILTER (WHERE je.entry_date < b.this_month), 0) AS prev_month
    FROM b
    JOIN journal_entries je ON je.entry_date >= b.prev_month AND je.reference_type = 'purchase_order'
  ),
  low_stock AS (
    SELECT id, code, name, size, unit, current_stock, reorder_point
    FROM materials
    WHERE is_active = true AND current_stock <= COALESCE(reorder_point, 0)
  )
  SELECT jsonb_build_object(
    'revenue_month',       (SELECT this_month FROM revenue),
    'revenue_prev_month',  (SELECT prev_month FROM revenue),
    'purchase_month',      (SELECT this_month FROM purchase),
    'purchase_prev_month', (SELECT prev_month FROM purchase),
    'active_work_orders',  (SELECT count(*) FROM work_orders WHERE status = 'in_progress'),
    'pending_invoices',    (SELECT count(*) FROM invoices WHERE status IN ('sent', 'overdue', 'partial')),
    'pending_quotations',  (SELECT count(*) FROM quotations WHERE status IN ('draft', 'sent')),
    'total_customers',     (SELECT count(*) FROM customers WHERE is_active = true),
    'total_suppliers',     (SELECT count(*) FROM suppliers WHERE is_active = true),
    'low_stock_items',     (SELECT count(*) FROM low_stock),
    -- 4 bahan paling kritis: stok terendah relatif terhadap batas minimum
    'low_stock_materials', COALESCE((
      SELECT jsonb_agg(to_jsonb(l) ORDER BY l.current_stock / NULLIF(l.reorder_point, 0) NULLS LAST, l.current_stock, l.code)
      FROM (
        SELECT * FROM low_stock
        ORDER BY current_stock / NULLIF(reorder_point, 0) NULLS LAST, current_stock, code
        LIMIT 4
      ) l
    ), '[]'::jsonb)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_summary() TO authenticated;
