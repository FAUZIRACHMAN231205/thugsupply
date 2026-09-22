-- ============================================================
-- THUG SUPPLY ERP - Perhitungan laporan di database
-- Jalankan setelah 009_auto_journal.sql
--
-- Sebelumnya COA, Neraca, Laba Rugi, dan dashboard mengambil SEMUA baris
-- journal_lines ke browser lalu menjumlahkannya. Supabase membatasi hasil
-- query (default 1000 baris), jadi setelah jurnal bertambah angka laporan
-- akan salah tanpa peringatan. Fungsi di bawah menjumlahkan di database dan
-- hanya mengembalikan satu baris per akun / per bulan.
--
-- SECURITY INVOKER: RLS admin (006) tetap berlaku.
-- ============================================================

-- Saldo per akun. p_from/p_to (opsional) membatasi tanggal jurnal.
-- Saldo normal: debit - kredit untuk aset & beban, kredit - debit untuk lainnya.
CREATE OR REPLACE FUNCTION public.account_balances(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  code varchar,
  name varchar,
  account_type varchar,
  parent_id uuid,
  description text,
  is_active boolean,
  total_debit numeric,
  total_credit numeric,
  balance numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT a.id, a.code, a.name, a.account_type, a.parent_id, a.description, a.is_active,
         COALESCE(t.debit, 0),
         COALESCE(t.credit, 0),
         CASE WHEN a.account_type IN ('asset', 'expense')
              THEN COALESCE(t.debit, 0) - COALESCE(t.credit, 0)
              ELSE COALESCE(t.credit, 0) - COALESCE(t.debit, 0)
         END
  FROM chart_of_accounts a
  LEFT JOIN (
    SELECT jl.account_id, SUM(jl.debit) AS debit, SUM(jl.credit) AS credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE (p_from IS NULL OR je.entry_date >= p_from)
      AND (p_to IS NULL OR je.entry_date <= p_to)
    GROUP BY jl.account_id
  ) t ON t.account_id = a.id
  ORDER BY a.code;
$$;

-- Ringkasan laba rugi per bulan untuk p_months bulan terakhir (termasuk bulan ini,
-- zona waktu Asia/Jakarta). Bulan tanpa jurnal tetap muncul dengan nilai 0.
--   revenue = akun pendapatan (kredit - debit)
--   cogs    = akun beban berkode 5xxx (debit - kredit)
--   expense = akun beban berkode 6xxx (debit - kredit)
CREATE OR REPLACE FUNCTION public.monthly_profit_summary(p_months integer DEFAULT 6)
RETURNS TABLE (month date, revenue numeric, cogs numeric, expense numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta') AS this_month,
           LEAST(GREATEST(COALESCE(p_months, 6), 1), 36) AS n
  ),
  months AS (
    SELECT generate_series(
             b.this_month - (b.n - 1) * INTERVAL '1 month',
             b.this_month,
             INTERVAL '1 month'
           )::date AS month
    FROM bounds b
  ),
  sums AS (
    SELECT date_trunc('month', je.entry_date)::date AS month,
           SUM(CASE WHEN a.account_type = 'revenue' THEN jl.credit - jl.debit ELSE 0 END) AS revenue,
           SUM(CASE WHEN a.account_type = 'expense' AND a.code LIKE '5%' THEN jl.debit - jl.credit ELSE 0 END) AS cogs,
           SUM(CASE WHEN a.account_type = 'expense' AND a.code LIKE '6%' THEN jl.debit - jl.credit ELSE 0 END) AS expense
    FROM journal_entries je
    JOIN journal_lines jl ON jl.journal_entry_id = je.id
    JOIN chart_of_accounts a ON a.id = jl.account_id
    WHERE je.entry_date >= (SELECT MIN(month) FROM months)
    GROUP BY 1
  )
  SELECT m.month, COALESCE(s.revenue, 0), COALESCE(s.cogs, 0), COALESCE(s.expense, 0)
  FROM months m
  LEFT JOIN sums s ON s.month = m.month
  ORDER BY m.month;
$$;

REVOKE EXECUTE ON FUNCTION public.account_balances(date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.monthly_profit_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_balances(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_profit_summary(integer) TO authenticated;
