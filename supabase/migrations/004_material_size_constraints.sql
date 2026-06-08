-- ============================================================
-- THUG SUPPLY ERP - Material size constraints (Fase 1)
-- Jalankan setelah 003_add_material_size.sql
-- ============================================================

-- Normalisasi data kosong
UPDATE materials SET size = NULL WHERE TRIM(COALESCE(size, '')) = '';

-- Satu varian per kombinasi nama + ukuran (ukuran kosong = satu baris tanpa size)
CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_name_size_unique
  ON materials (
    LOWER(TRIM(name)),
    COALESCE(NULLIF(TRIM(size), ''), '__NONE__')
  );

CREATE INDEX IF NOT EXISTS idx_materials_size ON materials(size)
  WHERE size IS NOT NULL;

COMMENT ON COLUMN materials.size IS 'Ukuran garmen (S–5XL, One Size). Wajib untuk Blank Apparel dan Kain Utama ber-satuan pcs.';
