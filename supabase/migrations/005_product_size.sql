-- ============================================================
-- THUG SUPPLY ERP - Product size (Fase 5)
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS size text;

UPDATE products SET size = NULL WHERE TRIM(COALESCE(size, '')) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_size_unique
  ON products (
    LOWER(TRIM(name)),
    COALESCE(NULLIF(TRIM(size), ''), '__NONE__')
  );

CREATE INDEX IF NOT EXISTS idx_products_size ON products(size)
  WHERE size IS NOT NULL;

COMMENT ON COLUMN products.size IS 'Ukuran produk jadi (S–5XL, One Size). Satu baris = satu SKU ukuran.';
