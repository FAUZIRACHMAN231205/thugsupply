-- ============================================================
-- THUG SUPPLY ERP - Stok tidak boleh minus + penomoran dokumen berurutan
-- Jalankan setelah 007_transactional_rpcs.sql
-- ============================================================

-- 1. STOK TIDAK BOLEH MINUS
-- ============================================================
-- Migration ini gagal jika sudah ada stok minus. Perbaiki dulu lewat
-- Mutasi Stok (adjustment) agar jejak auditnya tercatat, lalu jalankan ulang.
DO $$
DECLARE
  v_list text;
BEGIN
  SELECT string_agg(format('%s %s (%s): %s', kind, name, code, current_stock), E'\n')
  INTO v_list
  FROM (
    SELECT 'Bahan baku' AS kind, name, code, current_stock FROM materials WHERE current_stock < 0
    UNION ALL
    SELECT 'Produk', name, code, current_stock FROM products WHERE current_stock < 0
  ) s;

  IF v_list IS NOT NULL THEN
    RAISE EXCEPTION E'Masih ada stok minus, perbaiki dulu sebelum menjalankan migration ini:\n%', v_list;
  END IF;
END $$;

UPDATE materials SET current_stock = 0 WHERE current_stock IS NULL;
UPDATE products SET current_stock = 0 WHERE current_stock IS NULL;

-- DROP ... IF EXISTS agar migration aman dijalankan ulang
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_current_stock_nonnegative;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_current_stock_nonnegative;
ALTER TABLE materials
  ALTER COLUMN current_stock SET NOT NULL,
  ADD CONSTRAINT materials_current_stock_nonnegative CHECK (current_stock >= 0);
ALTER TABLE products
  ALTER COLUMN current_stock SET NOT NULL,
  ADD CONSTRAINT products_current_stock_nonnegative CHECK (current_stock >= 0);

-- Satu trigger BEFORE INSERT menggantikan trigger_update_stock dan
-- trigger_update_product_stock: mengunci baris stok, menolak mutasi yang membuat
-- stok minus, mengisi stock_before/stock_after, lalu memperbarui current_stock.
-- Berlaku untuk semua jalur (RPC, penyesuaian manual, stok awal).
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_label text;
BEGIN
  IF NEW.material_id IS NOT NULL THEN
    SELECT current_stock, name || COALESCE(' [' || size || ']', '') || ' (' || code || ')'
    INTO v_stock, v_label
    FROM materials WHERE id = NEW.material_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bahan baku tidak ditemukan';
    END IF;
    IF v_stock + NEW.quantity < 0 THEN
      RAISE EXCEPTION 'Stok % tidak cukup: stok %, keluar %', v_label, v_stock, -NEW.quantity;
    END IF;

    NEW.stock_before := v_stock;
    NEW.stock_after := v_stock + NEW.quantity;
    UPDATE materials SET current_stock = v_stock + NEW.quantity, updated_at = NOW()
    WHERE id = NEW.material_id;
  END IF;

  IF NEW.product_id IS NOT NULL THEN
    SELECT current_stock, name || COALESCE(' [' || size || ']', '') || ' (' || code || ')'
    INTO v_stock, v_label
    FROM products WHERE id = NEW.product_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produk tidak ditemukan';
    END IF;
    IF v_stock + NEW.quantity < 0 THEN
      RAISE EXCEPTION 'Stok % tidak cukup: stok %, keluar %', v_label, v_stock, -NEW.quantity;
    END IF;

    IF NEW.material_id IS NULL THEN
      NEW.stock_before := v_stock;
      NEW.stock_after := v_stock + NEW.quantity;
    END IF;
    UPDATE products SET current_stock = v_stock + NEW.quantity, updated_at = NOW()
    WHERE id = NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_stock ON stock_movements;
DROP TRIGGER IF EXISTS trigger_update_product_stock ON stock_movements;
DROP FUNCTION IF EXISTS public.update_material_stock();
DROP FUNCTION IF EXISTS public.update_product_stock();

DROP TRIGGER IF EXISTS trigger_apply_stock_movement ON stock_movements;
CREATE TRIGGER trigger_apply_stock_movement
  BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- 2. PENOMORAN DOKUMEN BERURUTAN
-- ============================================================
-- Format: <PREFIX>-<YYMM>-<0001>, reset tiap bulan (zona waktu Asia/Jakarta).
-- Counter diperbarui di transaksi yang sama dengan insert dokumen, jadi nomor
-- tidak bentrok dan tidak melompat jika insert gagal. Tanda hubung membedakannya
-- dari nomor acak lama (mis. INV26091234) sehingga tidak bisa bentrok.
CREATE TABLE IF NOT EXISTS document_counters (
  doc_type   text NOT NULL,
  period     text NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, period)
);

ALTER TABLE document_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON document_counters;
CREATE POLICY "Admin full access" ON document_counters FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.next_document_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_period text := to_char(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYMM');
  v_value integer;
BEGIN
  INSERT INTO document_counters (doc_type, period, last_value)
  VALUES (p_prefix, v_period, 1)
  ON CONFLICT (doc_type, period)
  DO UPDATE SET last_value = document_counters.last_value + 1
  RETURNING last_value INTO v_value;

  RETURN p_prefix || '-' || v_period || '-' || LPAD(v_value::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;

-- Isi kolom nomor otomatis jika kosong. TG_ARGV[0] = nama kolom, TG_ARGV[1] = prefix.
CREATE OR REPLACE FUNCTION public.assign_document_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(to_jsonb(NEW) ->> TG_ARGV[0], '') = '' THEN
    NEW := jsonb_populate_record(
      NEW, jsonb_build_object(TG_ARGV[0], public.next_document_number(TG_ARGV[1]))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_po_number ON purchase_orders;
CREATE TRIGGER trigger_po_number BEFORE INSERT ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_document_number('po_number', 'PO');

DROP TRIGGER IF EXISTS trigger_quotation_number ON quotations;
CREATE TRIGGER trigger_quotation_number BEFORE INSERT ON quotations
  FOR EACH ROW EXECUTE FUNCTION public.assign_document_number('quotation_number', 'QUO');

DROP TRIGGER IF EXISTS trigger_invoice_number ON invoices;
CREATE TRIGGER trigger_invoice_number BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_document_number('invoice_number', 'INV');

DROP TRIGGER IF EXISTS trigger_wo_number ON work_orders;
CREATE TRIGGER trigger_wo_number BEFORE INSERT ON work_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_document_number('wo_number', 'WO');

DROP TRIGGER IF EXISTS trigger_entry_number ON journal_entries;
CREATE TRIGGER trigger_entry_number BEFORE INSERT ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.assign_document_number('entry_number', 'JE');

-- 3. pay_invoice: cek kecukupan stok + nomor WO pre-order berurutan
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
      SELECT p.name, p.size, p.code, p.current_stock, SUM(ii.quantity) AS quantity
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
      -- stock_before/stock_after diisi trigger apply_stock_movement
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

  UPDATE invoices
  SET status = 'paid', paid_amount = total_amount, updated_at = NOW()
  WHERE id = p_invoice_id;
END;
$$;
