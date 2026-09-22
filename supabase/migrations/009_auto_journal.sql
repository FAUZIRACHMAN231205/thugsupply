-- ============================================================
-- THUG SUPPLY ERP - Jurnal otomatis dari pembelian, produksi, dan penjualan
-- Jalankan setelah 008_stock_guard_and_numbering.sql
--
-- Jurnal dibuat di transaksi yang sama dengan mutasi stok, jadi keduanya
-- selalu berhasil atau gagal bersama:
--   Terima PO (tempo)   : Persediaan Bahan Baku  / Hutang Usaha
--   Terima PO (tunai)   : Persediaan Bahan Baku  / Kas
--   Bayar ke supplier   : Hutang Usaha           / Kas
--   Selesai WO          : Persediaan Barang Jadi / Persediaan Bahan Baku   (biaya bahan)
--     + pre-order       : HPP                    / Persediaan Barang Jadi  (langsung diserahkan)
--   Invoice lunas       : Kas / Penjualan + PPN Keluaran
--     + ready stock     : HPP                    / Persediaan Barang Jadi  (cost_price produk)
--
-- Transaksi sebelum migration ini TIDAK dijurnal ulang. Catat saldo awal
-- lewat jurnal manual bila perlu.
-- ============================================================

-- 1. PEMETAAN AKUN
-- ============================================================
CREATE TABLE IF NOT EXISTS account_mappings (
  key           text PRIMARY KEY,
  label         text NOT NULL,
  expected_type varchar(20) NOT NULL CHECK (expected_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  account_id    uuid REFERENCES chart_of_accounts(id),
  sort_order    integer NOT NULL DEFAULT 0,
  updated_at    timestamptz DEFAULT NOW()
);

ALTER TABLE account_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON account_mappings;
CREATE POLICY "Admin full access" ON account_mappings FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

DROP TRIGGER IF EXISTS set_account_mappings_updated_at ON account_mappings;
CREATE TRIGGER set_account_mappings_updated_at BEFORE UPDATE ON account_mappings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pakai akun dengan kode default bila sudah ada (dan tipenya cocok), selain itu
-- buat akunnya. Jika COA sudah memakai akun induk untuk tipe tersebut, akun baru
-- ditaruh di bawah induk agar tetap tampil di Neraca.
DO $$
DECLARE
  d record;
  v_id uuid;
  v_type text;
  v_parent uuid;
BEGIN
  FOR d IN
    SELECT * FROM (VALUES
      (1, 'cash',               'Kas & Bank',             'asset',     '1101', 'Kas'),
      (2, 'inventory_material', 'Persediaan Bahan Baku',  'asset',     '1301', 'Persediaan Bahan Baku'),
      (3, 'inventory_product',  'Persediaan Barang Jadi', 'asset',     '1302', 'Persediaan Barang Jadi'),
      (4, 'accounts_payable',   'Hutang Usaha',           'liability', '2101', 'Hutang Usaha'),
      (5, 'vat_output',         'PPN Keluaran',           'liability', '2102', 'PPN Keluaran'),
      (6, 'sales_revenue',      'Pendapatan Penjualan',   'revenue',   '4101', 'Penjualan'),
      (7, 'cogs',               'Harga Pokok Penjualan',  'expense',   '5101', 'Harga Pokok Penjualan')
    ) AS t(sort_order, key, label, type, code, name)
  LOOP
    IF EXISTS (SELECT 1 FROM account_mappings WHERE key = d.key) THEN
      CONTINUE;
    END IF;

    v_id := NULL;
    SELECT id, account_type INTO v_id, v_type FROM chart_of_accounts WHERE code = d.code;

    IF v_id IS NULL THEN
      SELECT p.id INTO v_parent
      FROM chart_of_accounts p
      WHERE p.account_type = d.type
        AND p.parent_id IS NULL
        AND EXISTS (SELECT 1 FROM chart_of_accounts c WHERE c.parent_id = p.id)
      ORDER BY (LEFT(p.code, 1) = LEFT(d.code, 1)) DESC, p.code
      LIMIT 1;

      INSERT INTO chart_of_accounts (code, name, account_type, parent_id, description)
      VALUES (d.code, d.name, d.type, v_parent, 'Dibuat otomatis untuk jurnal otomatis')
      RETURNING id INTO v_id;
    ELSIF v_type <> d.type THEN
      RAISE NOTICE 'Kode akun % sudah dipakai akun bertipe %, atur akun "%" secara manual', d.code, v_type, d.label;
      v_id := NULL;
    END IF;

    INSERT INTO account_mappings (key, label, expected_type, account_id, sort_order)
    VALUES (d.key, d.label, d.type, v_id, d.sort_order);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.mapped_account(p_key text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_map account_mappings%ROWTYPE;
  v_type text;
  v_active boolean;
BEGIN
  SELECT * INTO v_map FROM account_mappings WHERE key = p_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pemetaan akun "%" tidak dikenal', p_key;
  END IF;
  IF v_map.account_id IS NULL THEN
    RAISE EXCEPTION 'Akun untuk "%" belum diatur. Atur di Akuntansi → Chart of Accounts → Akun Jurnal Otomatis', v_map.label;
  END IF;

  SELECT account_type, is_active INTO v_type, v_active FROM chart_of_accounts WHERE id = v_map.account_id;
  IF v_type <> v_map.expected_type THEN
    RAISE EXCEPTION 'Akun untuk "%" harus bertipe %, sekarang %', v_map.label, v_map.expected_type, v_type;
  END IF;
  IF v_active = false THEN
    RAISE EXCEPTION 'Akun untuk "%" tidak aktif', v_map.label;
  END IF;

  RETURN v_map.account_id;
END;
$$;

-- 2. POSTING JURNAL
-- ============================================================
-- Satu dokumen sumber hanya boleh punya satu jurnal otomatis per jenis referensi.
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_reference
  ON journal_entries (reference_type, reference_id)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

-- p_lines: [{"account": "<key account_mappings>", "debit": n, "credit": n, "description": "..."}]
-- Baris bernilai 0 dilewati; jurnal tanpa nilai tidak dibuat (return NULL).
CREATE OR REPLACE FUNCTION public.post_journal(
  p_entry_type text,
  p_description text,
  p_reference_type text,
  p_reference_id uuid,
  p_lines jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_debit numeric;
  v_credit numeric;
BEGIN
  SELECT COALESCE(SUM(ROUND(COALESCE((x ->> 'debit')::numeric, 0), 2)), 0),
         COALESCE(SUM(ROUND(COALESCE((x ->> 'credit')::numeric, 0), 2)), 0)
  INTO v_debit, v_credit
  FROM jsonb_array_elements(p_lines) x;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION 'Jurnal otomatis tidak seimbang (debit %, kredit %)', v_debit, v_credit;
  END IF;
  IF v_debit = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO journal_entries (
    entry_date, entry_type, description, reference_id, reference_type,
    total_debit, total_credit, created_by
  ) VALUES (
    (NOW() AT TIME ZONE 'Asia/Jakarta')::date, p_entry_type, p_description, p_reference_id, p_reference_type,
    v_debit, v_credit, auth.uid()
  )
  RETURNING id INTO v_entry_id;

  INSERT INTO journal_lines (journal_entry_id, account_id, description, debit, credit)
  SELECT v_entry_id,
         public.mapped_account(x ->> 'account'),
         x ->> 'description',
         ROUND(COALESCE((x ->> 'debit')::numeric, 0), 2),
         ROUND(COALESCE((x ->> 'credit')::numeric, 0), 2)
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS l(x, n)
  WHERE ROUND(COALESCE((x ->> 'debit')::numeric, 0), 2) <> 0
     OR ROUND(COALESCE((x ->> 'credit')::numeric, 0), 2) <> 0
  ORDER BY n;

  RETURN v_entry_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mapped_account(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_journal(text, text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mapped_account(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal(text, text, text, uuid, jsonb) TO authenticated;

-- 3. PEMBELIAN: termin pembayaran PO
-- ============================================================
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS payment_term varchar(10) NOT NULL DEFAULT 'credit'
    CHECK (payment_term IN ('credit', 'cash')),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

COMMENT ON COLUMN purchase_orders.payment_term IS 'credit = tempo (hutang usaha), cash = dibayar tunai saat barang diterima';
COMMENT ON COLUMN purchase_orders.paid_at IS 'Waktu pelunasan ke supplier; NULL = belum lunas';

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_item record;
  v_total numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase Order tidak ditemukan';
  END IF;
  IF v_po.status NOT IN ('sent', 'confirmed') THEN
    RAISE EXCEPTION 'PO % berstatus "%", tidak bisa diterima', v_po.po_number, v_po.status;
  END IF;

  FOR v_item IN
    SELECT * FROM purchase_order_items
    WHERE purchase_order_id = p_po_id
    ORDER BY material_id, id
  LOOP
    -- stock_before/stock_after diisi trigger apply_stock_movement
    INSERT INTO stock_movements (
      material_id, movement_type, quantity, reference_id, reference_type, notes, created_by
    ) VALUES (
      v_item.material_id, 'purchase_in', v_item.quantity, p_po_id, 'purchase_order',
      'Diterima dari PO ' || v_po.po_number, auth.uid()
    );

    UPDATE purchase_order_items SET received_quantity = v_item.quantity WHERE id = v_item.id;
  END LOOP;

  SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_total
  FROM purchase_order_items WHERE purchase_order_id = p_po_id;

  PERFORM public.post_journal(
    'purchase',
    'Penerimaan barang PO ' || v_po.po_number
      || CASE WHEN v_po.payment_term = 'cash' THEN ' (tunai)' ELSE ' (tempo)' END,
    'purchase_order', p_po_id,
    jsonb_build_array(
      jsonb_build_object('account', 'inventory_material', 'debit', v_total),
      jsonb_build_object(
        'account', CASE WHEN v_po.payment_term = 'cash' THEN 'cash' ELSE 'accounts_payable' END,
        'credit', v_total
      )
    )
  );

  UPDATE purchase_orders
  SET status = 'received',
      paid_at = CASE WHEN payment_term = 'cash' THEN NOW() ELSE paid_at END,
      updated_at = NOW()
  WHERE id = p_po_id;
END;
$$;

-- Pelunasan PO tempo ke supplier
CREATE OR REPLACE FUNCTION public.pay_purchase_order(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_amount numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase Order tidak ditemukan';
  END IF;
  IF v_po.status <> 'received' THEN
    RAISE EXCEPTION 'PO % berstatus "%", hanya PO yang sudah diterima yang bisa dilunasi', v_po.po_number, v_po.status;
  END IF;
  IF v_po.payment_term = 'cash' OR v_po.paid_at IS NOT NULL THEN
    RAISE EXCEPTION 'PO % sudah lunas', v_po.po_number;
  END IF;

  -- Nilai hutang diambil dari jurnal penerimaan, bukan dihitung ulang
  SELECT total_credit INTO v_amount
  FROM journal_entries
  WHERE reference_type = 'purchase_order' AND reference_id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO % diterima sebelum jurnal otomatis aktif, jadi tidak ada hutang yang tercatat. Catat pelunasannya lewat jurnal manual.', v_po.po_number;
  END IF;

  PERFORM public.post_journal(
    'purchase',
    'Pelunasan hutang PO ' || v_po.po_number,
    'purchase_payment', p_po_id,
    jsonb_build_array(
      jsonb_build_object('account', 'accounts_payable', 'debit', v_amount),
      jsonb_build_object('account', 'cash', 'credit', v_amount)
    )
  );

  UPDATE purchase_orders SET paid_at = NOW(), updated_at = NOW() WHERE id = p_po_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_purchase_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_purchase_order(uuid) TO authenticated;

-- 4. PRODUKSI
-- ============================================================
-- WO pre-order dibuat untuk pesanan customer yang sudah lunas, jadi produknya
-- langsung diserahkan: stok produk masuk lalu keluar lagi (sale_out) dan biaya
-- produksinya diakui sebagai HPP. Sebelumnya stok pre-order tertahan di gudang.
CREATE OR REPLACE FUNCTION public.complete_work_order(p_wo_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_wo work_orders%ROWTYPE;
  v_need record;
  v_shortages text[] := ARRAY[]::text[];
  v_cost numeric := 0;
  v_lines jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_wo FROM work_orders WHERE id = p_wo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work Order tidak ditemukan';
  END IF;
  IF v_wo.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Work Order % berstatus "%", hanya WO in_progress yang bisa diselesaikan',
      v_wo.wo_number, v_wo.status;
  END IF;

  -- Kunci semua bahan baku (urut id agar tidak deadlock) sebelum cek kecukupan stok
  PERFORM 1 FROM materials
  WHERE id IN (SELECT material_id FROM bom_items WHERE bom_id = v_wo.bom_id)
  ORDER BY id
  FOR UPDATE;

  FOR v_need IN
    SELECT m.id, m.name, m.size, m.code, m.current_stock, m.cost_price,
           SUM(bi.quantity) * v_wo.quantity AS needed
    FROM bom_items bi
    JOIN materials m ON m.id = bi.material_id
    WHERE bi.bom_id = v_wo.bom_id
    GROUP BY m.id
    ORDER BY m.id
  LOOP
    IF v_need.current_stock < v_need.needed THEN
      v_shortages := v_shortages || format(
        '%s%s (%s): butuh %s, stok %s',
        v_need.name,
        CASE WHEN v_need.size IS NOT NULL THEN ' [' || v_need.size || ']' ELSE '' END,
        v_need.code, v_need.needed, v_need.current_stock
      );
    END IF;
    v_cost := v_cost + v_need.needed * COALESCE(v_need.cost_price, 0);
  END LOOP;

  IF array_length(v_shortages, 1) > 0 THEN
    RAISE EXCEPTION E'Stok bahan baku tidak cukup:\n%', array_to_string(v_shortages, E'\n');
  END IF;

  FOR v_need IN
    SELECT bi.material_id, SUM(bi.quantity) * v_wo.quantity AS needed
    FROM bom_items bi
    WHERE bi.bom_id = v_wo.bom_id
    GROUP BY bi.material_id
    ORDER BY bi.material_id
  LOOP
    INSERT INTO stock_movements (
      material_id, movement_type, quantity, reference_id, reference_type, notes, created_by
    ) VALUES (
      v_need.material_id, 'production_out', -v_need.needed, p_wo_id, 'work_order',
      'Bahan baku produksi WO ' || v_wo.wo_number, auth.uid()
    );
  END LOOP;

  INSERT INTO stock_movements (
    product_id, movement_type, quantity, reference_id, reference_type, notes, created_by
  ) VALUES (
    v_wo.product_id, 'production_in', v_wo.quantity, p_wo_id, 'work_order',
    'Produk selesai dari WO ' || v_wo.wo_number, auth.uid()
  );

  v_lines := jsonb_build_array(
    jsonb_build_object('account', 'inventory_product', 'debit', v_cost, 'description', 'Hasil produksi'),
    jsonb_build_object('account', 'inventory_material', 'credit', v_cost, 'description', 'Pemakaian bahan baku')
  );

  IF v_wo.order_type = 'pre_order' THEN
    INSERT INTO stock_movements (
      product_id, movement_type, quantity, reference_id, reference_type, notes, created_by
    ) VALUES (
      v_wo.product_id, 'sale_out', -v_wo.quantity, p_wo_id, 'work_order',
      'Diserahkan ke customer (pre-order) WO ' || v_wo.wo_number, auth.uid()
    );

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account', 'cogs', 'debit', v_cost, 'description', 'HPP pre-order'),
      jsonb_build_object('account', 'inventory_product', 'credit', v_cost, 'description', 'Penyerahan ke customer')
    );
  END IF;

  PERFORM public.post_journal(
    'production',
    'Produksi selesai WO ' || v_wo.wo_number
      || CASE WHEN v_wo.order_type = 'pre_order' THEN ' (pre-order, langsung diserahkan)' ELSE '' END,
    'work_order', p_wo_id, v_lines
  );

  UPDATE work_orders
  SET status = 'completed', completed_date = CURRENT_DATE, updated_at = NOW()
  WHERE id = p_wo_id;
END;
$$;

-- 5. PENJUALAN
-- ============================================================
CREATE OR REPLACE FUNCTION public.pay_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_inv invoices%ROWTYPE;
  v_item record;
  v_bom_id uuid;
  v_shortages text[] := ARRAY[]::text[];
  v_cogs numeric := 0;
  v_tax numeric;
  v_lines jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Akses ditolak' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice tidak ditemukan';
  END IF;
  IF v_inv.status IN ('paid', 'cancelled') THEN
    RAISE EXCEPTION 'Invoice % berstatus "%", tidak bisa diproses', v_inv.invoice_number, v_inv.status;
  END IF;

  IF v_inv.sale_type = 'ready_stock' THEN
    -- Kunci semua produk (urut id agar tidak deadlock) lalu cek kecukupan stok sekaligus
    PERFORM 1 FROM products
    WHERE id IN (SELECT product_id FROM invoice_items WHERE invoice_id = p_invoice_id)
    ORDER BY id
    FOR UPDATE;

    FOR v_item IN
      SELECT p.name, p.size, p.code, p.current_stock, p.cost_price, SUM(ii.quantity) AS quantity
      FROM invoice_items ii
      JOIN products p ON p.id = ii.product_id
      WHERE ii.invoice_id = p_invoice_id
      GROUP BY p.id
      ORDER BY p.id
    LOOP
      IF v_item.current_stock < v_item.quantity THEN
        v_shortages := v_shortages || format(
          '%s%s (%s): butuh %s, stok %s',
          v_item.name,
          CASE WHEN v_item.size IS NOT NULL THEN ' [' || v_item.size || ']' ELSE '' END,
          v_item.code, v_item.quantity, v_item.current_stock
        );
      END IF;
      v_cogs := v_cogs + v_item.quantity * COALESCE(v_item.cost_price, 0);
    END LOOP;

    IF array_length(v_shortages, 1) > 0 THEN
      RAISE EXCEPTION E'Stok produk tidak cukup:\n%', array_to_string(v_shortages, E'\n');
    END IF;

    FOR v_item IN
      SELECT product_id, SUM(quantity) AS quantity
      FROM invoice_items
      WHERE invoice_id = p_invoice_id
      GROUP BY product_id
      ORDER BY product_id
    LOOP
      INSERT INTO stock_movements (
        product_id, movement_type, quantity, reference_id, reference_type, notes, created_by
      ) VALUES (
        v_item.product_id, 'sale_out', -v_item.quantity, p_invoice_id, 'invoice',
        'Penjualan lunas Invoice ' || v_inv.invoice_number, auth.uid()
      );
    END LOOP;

  ELSIF v_inv.sale_type = 'pre_order' THEN
    FOR v_item IN
      SELECT product_id, quantity FROM invoice_items WHERE invoice_id = p_invoice_id ORDER BY id
    LOOP
      SELECT id INTO v_bom_id
      FROM bill_of_materials
      WHERE product_id = v_item.product_id AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1;

      INSERT INTO work_orders (
        wo_number, product_id, bom_id, quantity, status, order_type,
        start_date, target_date, notes
      ) VALUES (
        public.next_document_number('WO-PRE'),
        v_item.product_id, v_bom_id, v_item.quantity, 'draft', 'pre_order',
        CURRENT_DATE, CURRENT_DATE + 14,
        'Pre-order otomatis dari Invoice lunas ' || v_inv.invoice_number
      );
    END LOOP;
  END IF;

  v_tax := COALESCE(v_inv.tax_amount, 0);
  v_lines := jsonb_build_array(
    jsonb_build_object('account', 'cash', 'debit', v_inv.total_amount, 'description', 'Penerimaan pembayaran'),
    jsonb_build_object('account', 'sales_revenue', 'credit', v_inv.total_amount - v_tax, 'description', 'Penjualan'),
    jsonb_build_object('account', 'vat_output', 'credit', v_tax, 'description', 'PPN Keluaran')
  );
  IF v_cogs > 0 THEN
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account', 'cogs', 'debit', v_cogs, 'description', 'HPP'),
      jsonb_build_object('account', 'inventory_product', 'credit', v_cogs, 'description', 'Pengeluaran barang jadi')
    );
  END IF;

  PERFORM public.post_journal(
    'sale', 'Penjualan lunas Invoice ' || v_inv.invoice_number, 'invoice', p_invoice_id, v_lines
  );

  UPDATE invoices
  SET status = 'paid', paid_amount = total_amount, updated_at = NOW()
  WHERE id = p_invoice_id;
END;
$$;
