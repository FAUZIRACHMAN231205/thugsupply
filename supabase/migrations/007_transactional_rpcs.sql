-- ============================================================
-- THUG SUPPLY ERP - Transaksi atomik untuk alur yang mengubah stok
-- Jalankan setelah 006_admin_rls.sql
--
-- Sebelumnya alur ini dijalankan dari browser sebagai beberapa request terpisah,
-- sehingga bisa gagal di tengah jalan atau tercatat dua kali saat diklik ulang.
-- Setiap fungsi di bawah berjalan dalam satu transaksi, mengunci baris dokumen
-- (FOR UPDATE) dan memvalidasi status sebelum mengubah stok.
--
-- Fungsi memakai SECURITY INVOKER, jadi RLS admin dari 006 tetap berlaku.
-- stock_before/stock_after sekarang diisi nilai sebenarnya; perubahan
-- current_stock tetap dilakukan trigger update_material_stock/update_product_stock.
-- ============================================================

-- 1. Terima Purchase Order → stok bahan baku masuk
-- ============================================================
CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_item record;
  v_stock numeric;
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
    SELECT current_stock INTO v_stock FROM materials WHERE id = v_item.material_id FOR UPDATE;
    v_stock := COALESCE(v_stock, 0);

    INSERT INTO stock_movements (
      material_id, movement_type, quantity, reference_id, reference_type,
      notes, stock_before, stock_after, created_by
    ) VALUES (
      v_item.material_id, 'purchase_in', v_item.quantity, p_po_id, 'purchase_order',
      'Diterima dari PO ' || v_po.po_number, v_stock, v_stock + v_item.quantity, auth.uid()
    );

    UPDATE purchase_order_items SET received_quantity = v_item.quantity WHERE id = v_item.id;
  END LOOP;

  UPDATE purchase_orders SET status = 'received', updated_at = NOW() WHERE id = p_po_id;
END;
$$;

-- 2. Selesaikan Work Order → bahan baku keluar, produk jadi masuk
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_work_order(p_wo_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_wo work_orders%ROWTYPE;
  v_need record;
  v_stock numeric;
  v_shortages text[] := ARRAY[]::text[];
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
    SELECT m.id, m.name, m.size, m.code, m.current_stock,
           SUM(bi.quantity) * v_wo.quantity AS needed
    FROM bom_items bi
    JOIN materials m ON m.id = bi.material_id
    WHERE bi.bom_id = v_wo.bom_id
    GROUP BY m.id
    ORDER BY m.id
  LOOP
    IF COALESCE(v_need.current_stock, 0) < v_need.needed THEN
      v_shortages := v_shortages || format(
        '%s%s (%s): butuh %s, stok %s',
        v_need.name,
        CASE WHEN v_need.size IS NOT NULL THEN ' [' || v_need.size || ']' ELSE '' END,
        v_need.code, v_need.needed, COALESCE(v_need.current_stock, 0)
      );
    END IF;
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
    SELECT current_stock INTO v_stock FROM materials WHERE id = v_need.material_id;
    v_stock := COALESCE(v_stock, 0);

    INSERT INTO stock_movements (
      material_id, movement_type, quantity, reference_id, reference_type,
      notes, stock_before, stock_after, created_by
    ) VALUES (
      v_need.material_id, 'production_out', -v_need.needed, p_wo_id, 'work_order',
      'Bahan baku produksi WO ' || v_wo.wo_number, v_stock, v_stock - v_need.needed, auth.uid()
    );
  END LOOP;

  SELECT current_stock INTO v_stock FROM products WHERE id = v_wo.product_id FOR UPDATE;
  v_stock := COALESCE(v_stock, 0);

  INSERT INTO stock_movements (
    product_id, movement_type, quantity, reference_id, reference_type,
    notes, stock_before, stock_after, created_by
  ) VALUES (
    v_wo.product_id, 'production_in', v_wo.quantity, p_wo_id, 'work_order',
    'Produk selesai dari WO ' || v_wo.wo_number, v_stock, v_stock + v_wo.quantity, auth.uid()
  );

  UPDATE work_orders
  SET status = 'completed', completed_date = CURRENT_DATE, updated_at = NOW()
  WHERE id = p_wo_id;
END;
$$;

-- 3. Bayar lunas Invoice → ready_stock: stok produk keluar; pre_order: buat Work Order
-- ============================================================
CREATE OR REPLACE FUNCTION public.pay_invoice(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_inv invoices%ROWTYPE;
  v_item record;
  v_stock numeric;
  v_bom_id uuid;
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
    FOR v_item IN
      SELECT product_id, SUM(quantity) AS quantity
      FROM invoice_items
      WHERE invoice_id = p_invoice_id
      GROUP BY product_id
      ORDER BY product_id
    LOOP
      SELECT current_stock INTO v_stock FROM products WHERE id = v_item.product_id FOR UPDATE;
      v_stock := COALESCE(v_stock, 0);

      INSERT INTO stock_movements (
        product_id, movement_type, quantity, reference_id, reference_type,
        notes, stock_before, stock_after, created_by
      ) VALUES (
        v_item.product_id, 'sale_out', -v_item.quantity, p_invoice_id, 'invoice',
        'Penjualan lunas Invoice ' || v_inv.invoice_number, v_stock, v_stock - v_item.quantity, auth.uid()
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
        'WO-PRE-' || to_char(NOW(), 'YYMM') || UPPER(SUBSTR(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6)),
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

REVOKE EXECUTE ON FUNCTION public.receive_purchase_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_work_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pay_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_work_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_invoice(uuid) TO authenticated;
