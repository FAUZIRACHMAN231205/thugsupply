-- ============================================================
-- THUG SUPPLY ERP - Database Migration v1.2 (Security & Fixes)
-- ============================================================

-- 1. ADD MISSING FOREIGN KEYS
-- ============================================================
ALTER TABLE stock_movements 
  ADD CONSTRAINT fk_sm_product_id FOREIGN KEY (product_id) REFERENCES products(id),
  ADD CONSTRAINT fk_sm_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE journal_entries
  ADD CONSTRAINT fk_je_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id);

-- 2. ADD MISSING INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status);
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_product ON work_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);

-- 3. FIX MISSING TRIGGERS (updated_at)
-- ============================================================
DROP TRIGGER IF EXISTS set_quotations_updated_at ON quotations;
CREATE TRIGGER set_quotations_updated_at BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_bom_updated_at ON bill_of_materials;
CREATE TRIGGER set_bom_updated_at BEFORE UPDATE ON bill_of_materials FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Add updated_at to journal_entries if it exists, actually wait, journal_entries only has created_at right now?
-- Checking the schema: journal_entries has `created_at` but NO `updated_at`. I will add it.
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS set_journal_entries_updated_at ON journal_entries;
CREATE TRIGGER set_journal_entries_updated_at BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. FIX MISSING TRIGGERS (Product Stock)
-- ============================================================
CREATE OR REPLACE FUNCTION update_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    UPDATE products 
    SET current_stock = current_stock + NEW.quantity,
        updated_at = NOW()
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_stock ON stock_movements;
CREATE TRIGGER trigger_update_product_stock
  AFTER INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION update_product_stock();

-- 5. ENABLE ROW LEVEL SECURITY (RLS) & ADD POLICIES
-- ============================================================
-- Enable RLS on all tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_of_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

-- Create policies to allow authenticated users full access
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
    EXECUTE format('CREATE POLICY "Allow authenticated users full access" ON %I FOR ALL USING (auth.role() = ''authenticated'');', t);
  END LOOP;
END $$;
