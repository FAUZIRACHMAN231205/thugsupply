// Tes migration Supabase tanpa menyentuh database asli.
// Dijalankan dengan: npm run test:db
//
// PGlite = Postgres yang berjalan di dalam Node (WebAssembly). Skema auth milik
// Supabase (auth.jwt(), auth.uid(), role authenticated/anon) ditiru secukupnya
// agar RLS dan fungsi RPC bisa diuji apa adanya.
import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'
import { fileURLToPath } from 'url'

const MIG = fileURLToPath(new URL('../migrations/', import.meta.url))
const db = new PGlite()

const ADMIN = '11111111-1111-1111-1111-111111111111'
const USER = '22222222-2222-2222-2222-222222222222'

// --- Stub Supabase environment ---
const stub = `
  CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  INSERT INTO auth.users VALUES ('${ADMIN}'), ('${USER}');
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
    $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt() ->> 'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'role' $$;
  CREATE ROLE authenticated; CREATE ROLE anon;
  GRANT USAGE ON SCHEMA auth TO authenticated, anon;
`
await db.exec(stub)

for (const f of fs.readdirSync(MIG).sort()) {
  let sql = fs.readFileSync(MIG + f, 'utf8').replace(/CREATE EXTENSION[^;]*;/gi, '')
  try { await db.exec(sql); console.log('migrated', f) }
  catch (e) { console.error('MIGRATION FAILED', f, e.message); process.exit(1) }
}
await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon;`)

let failures = 0
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++ }

async function as(who, fn) {
  const claims = who === 'admin'
    ? { sub: ADMIN, role: 'authenticated', app_metadata: { roles: ['Admin'] } }
    : { sub: USER, role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: { role: 'admin' } }
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '${JSON.stringify(claims)}', false); SET ROLE authenticated;`)
  try { return await fn() } finally { await db.exec('RESET ROLE') }
}
async function expectError(fn, re, msg) {
  try { await fn(); ok(false, msg + ' (no error)') }
  catch (e) { ok(re.test(e.message), `${msg} → "${e.message.split('\n')[0]}"`) }
}
const one = async (sql) => (await db.query(sql)).rows[0]

// --- Seed as superuser ---
await db.exec(`
  INSERT INTO suppliers (id, code, name) VALUES ('a0000000-0000-0000-0000-000000000001', 'SUP1', 'Supplier');
  INSERT INTO materials (id, code, name, unit, current_stock) VALUES
    ('b0000000-0000-0000-0000-000000000001', 'MAT1', 'Kain Cotton', 'meter', 5),
    ('b0000000-0000-0000-0000-000000000002', 'MAT2', 'Sablon', 'pcs', 100);
  INSERT INTO products (id, code, name, unit, current_stock) VALUES
    ('c0000000-0000-0000-0000-000000000001', 'PRD1', 'Kaos', 'pcs', 0);
  INSERT INTO purchase_orders (id, po_number, supplier_id, status) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'PO1', 'a0000000-0000-0000-0000-000000000001', 'sent'),
    ('d0000000-0000-0000-0000-000000000002', 'PO2', 'a0000000-0000-0000-0000-000000000001', 'draft');
  INSERT INTO purchase_order_items (purchase_order_id, material_id, quantity, unit_price) VALUES
    ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 10, 1000),
    ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 5, 1000);
  INSERT INTO bill_of_materials (id, product_id) VALUES ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001');
  INSERT INTO bom_items (bom_id, material_id, quantity, unit) VALUES
    ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1.5, 'meter'),
    ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 1, 'pcs');
  INSERT INTO work_orders (id, wo_number, product_id, bom_id, quantity, status) VALUES
    ('f0000000-0000-0000-0000-000000000001', 'WO1', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 10, 'in_progress'),
    ('f0000000-0000-0000-0000-000000000002', 'WO2', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 1, 'draft');
  INSERT INTO invoices (id, invoice_number, status, sale_type, total_amount) VALUES
    ('90000000-0000-0000-0000-000000000001', 'INV1', 'sent', 'ready_stock', 500),
    ('90000000-0000-0000-0000-000000000002', 'INV2', 'draft', 'pre_order', 700);
  INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price) VALUES
    ('90000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 3, 100),
    ('90000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 1, 100),
    ('90000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 7, 100);
`)

console.log('\n== RLS ==')
await as('user', async () => {
  ok((await db.query('SELECT * FROM suppliers')).rows.length === 0, 'non-admin (role hanya di user_metadata) tidak bisa membaca suppliers')
  await expectError(() => db.query(`INSERT INTO suppliers (code, name) VALUES ('X', 'X')`), /row-level security/, 'non-admin tidak bisa insert')
  await db.query(`UPDATE materials SET current_stock = 999`)
  await expectError(() => db.query(`SELECT receive_purchase_order('d0000000-0000-0000-0000-000000000001')`), /Akses ditolak/, 'non-admin tidak bisa memanggil RPC')
})
ok(Number((await one(`SELECT current_stock FROM materials WHERE code='MAT1'`)).current_stock) === 5, 'update non-admin tidak mengubah data')
await as('admin', async () => {
  ok((await db.query('SELECT * FROM suppliers')).rows.length === 1, 'admin (app_metadata.roles = ["Admin"]) bisa membaca')
})
await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claims', '', false); SET ROLE anon;`)
ok((await db.query('SELECT * FROM suppliers')).rows.length === 0, 'anon tidak bisa membaca'); await db.exec('RESET ROLE')

console.log('\n== receive_purchase_order ==')
await as('admin', async () => {
  await db.query(`SELECT receive_purchase_order('d0000000-0000-0000-0000-000000000001')`)
  ok(Number((await one(`SELECT current_stock FROM materials WHERE code='MAT1'`)).current_stock) === 20, 'stok MAT1 5 + 10 + 5 = 20')
  const mv = (await db.query(`SELECT stock_before::int b, stock_after::int a, created_by FROM stock_movements WHERE reference_type='purchase_order' ORDER BY stock_before`)).rows
  ok(JSON.stringify(mv.map(r => [r.b, r.a])) === '[[5,15],[15,20]]' || JSON.stringify(mv.map(r => [r.b, r.a])) === '[[5,10],[10,20]]', `stock_before/after berurutan ${JSON.stringify(mv.map(r => [r.b, r.a]))}`)
  ok(mv[0].created_by === ADMIN, 'created_by diisi auth.uid()')
  ok((await one(`SELECT status FROM purchase_orders WHERE po_number='PO1'`)).status === 'received', 'status PO = received')
  await expectError(() => db.query(`SELECT receive_purchase_order('d0000000-0000-0000-0000-000000000001')`), /berstatus "received"/, 'terima ulang ditolak')
  await expectError(() => db.query(`SELECT receive_purchase_order('d0000000-0000-0000-0000-000000000002')`), /berstatus "draft"/, 'PO draft ditolak')
  ok(Number((await one(`SELECT current_stock FROM materials WHERE code='MAT1'`)).current_stock) === 20, 'stok tidak berubah setelah penolakan')
})

console.log('\n== complete_work_order ==')
await as('admin', async () => {
  // butuh 15 MAT1 (stok 20) dan 10 MAT2 (stok 100) → cukup. Uji kekurangan dulu dengan stok MAT1 dikurangi.
  await db.query(`UPDATE materials SET current_stock = 14 WHERE code='MAT1'`)
  await expectError(() => db.query(`SELECT complete_work_order('f0000000-0000-0000-0000-000000000001')`), /Stok bahan baku tidak cukup/, 'kekurangan stok ditolak')
  ok((await one(`SELECT count(*)::int n FROM stock_movements WHERE reference_type='work_order'`)).n === 0, 'tidak ada mutasi setelah penolakan (rollback)')
  await db.query(`UPDATE materials SET current_stock = 20 WHERE code='MAT1'`)
  await db.query(`SELECT complete_work_order('f0000000-0000-0000-0000-000000000001')`)
  ok(Number((await one(`SELECT current_stock FROM materials WHERE code='MAT1'`)).current_stock) === 5, 'MAT1 20 - 15 = 5')
  ok(Number((await one(`SELECT current_stock FROM materials WHERE code='MAT2'`)).current_stock) === 90, 'MAT2 100 - 10 = 90')
  ok(Number((await one(`SELECT current_stock FROM products WHERE code='PRD1'`)).current_stock) === 10, 'produk +10')
  const wo = await one(`SELECT status, completed_date FROM work_orders WHERE wo_number='WO1'`)
  ok(wo.status === 'completed' && wo.completed_date, 'status WO = completed + completed_date terisi')
  await expectError(() => db.query(`SELECT complete_work_order('f0000000-0000-0000-0000-000000000001')`), /berstatus "completed"/, 'selesaikan ulang ditolak')
  await expectError(() => db.query(`SELECT complete_work_order('f0000000-0000-0000-0000-000000000002')`), /berstatus "draft"/, 'WO draft ditolak')
})

console.log('\n== pay_invoice ==')
await as('admin', async () => {
  await db.query(`SELECT pay_invoice('90000000-0000-0000-0000-000000000001')`)
  ok(Number((await one(`SELECT current_stock FROM products WHERE code='PRD1'`)).current_stock) === 6, 'ready_stock: produk 10 - (3+1) = 6')
  const mv = await one(`SELECT quantity::int q, stock_before::int b, stock_after::int a FROM stock_movements WHERE reference_type='invoice'`)
  ok(mv.q === -4 && mv.b === 10 && mv.a === 6, 'satu mutasi sale_out -4 (10 → 6)')
  const inv = await one(`SELECT status, paid_amount::int p FROM invoices WHERE invoice_number='INV1'`)
  ok(inv.status === 'paid' && inv.p === 500, 'invoice paid, paid_amount = total')
  await expectError(() => db.query(`SELECT pay_invoice('90000000-0000-0000-0000-000000000001')`), /berstatus "paid"/, 'bayar ulang ditolak')
  ok(Number((await one(`SELECT current_stock FROM products WHERE code='PRD1'`)).current_stock) === 6, 'stok tidak berubah setelah penolakan')

  await db.query(`SELECT pay_invoice('90000000-0000-0000-0000-000000000002')`)
  const pre = await one(`SELECT wo_number, bom_id, quantity::int q, status, order_type, target_date - start_date d FROM work_orders WHERE order_type='pre_order'`)
  ok(pre && pre.bom_id === 'e0000000-0000-0000-0000-000000000001' && pre.q === 7 && pre.status === 'draft' && pre.d === 14, `pre_order: WO ${pre?.wo_number} dibuat dengan BOM aktif, qty 7, target +14 hari`)
  ok(Number((await one(`SELECT current_stock FROM products WHERE code='PRD1'`)).current_stock) === 6, 'pre_order tidak mengubah stok')
})

console.log('\n== 008: stok tidak boleh minus ==')
await as('admin', async () => {
  const before = Number((await one(`SELECT current_stock FROM materials WHERE code='MAT1'`)).current_stock)
  await expectError(() => db.query(`INSERT INTO stock_movements (material_id, movement_type, quantity, stock_before, stock_after) VALUES ('b0000000-0000-0000-0000-000000000001', 'adjustment', -1000, 0, 0)`), /Stok Kain Cotton \(MAT1\) tidak cukup/, 'adjustment yang membuat stok minus ditolak')
  ok(Number((await one(`SELECT current_stock FROM materials WHERE code='MAT1'`)).current_stock) === before, 'stok tidak berubah')
  await db.query(`INSERT INTO stock_movements (material_id, movement_type, quantity, stock_before, stock_after) VALUES ('b0000000-0000-0000-0000-000000000001', 'adjustment', -2, 0, 0)`)
  const mv = await one(`SELECT stock_before::int b, stock_after::int a FROM stock_movements WHERE movement_type='adjustment'`)
  ok(mv.b === before && mv.a === before - 2, `adjustment manual: stock_before/after diisi trigger (${mv.b} → ${mv.a})`)
  await expectError(() => db.query(`UPDATE materials SET current_stock = -1 WHERE code='MAT1'`), /materials_current_stock_nonnegative/, 'UPDATE langsung ke minus ditolak CHECK')
  await db.query(`INSERT INTO stock_movements (product_id, movement_type, quantity) VALUES ('c0000000-0000-0000-0000-000000000001', 'adjustment', 1)`)
  ok(Number((await one(`SELECT current_stock FROM products WHERE code='PRD1'`)).current_stock) === 7, 'adjustment produk +1 (6 → 7)')

  await db.query(`INSERT INTO invoices (id, status, sale_type, total_amount) VALUES ('90000000-0000-0000-0000-000000000003', 'sent', 'ready_stock', 1)`)
  await db.query(`INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price) VALUES ('90000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 5, 1), ('90000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 5, 1)`)
  await expectError(() => db.query(`SELECT pay_invoice('90000000-0000-0000-0000-000000000003')`), /Stok produk tidak cukup/, 'pay_invoice: butuh 10, stok 7 → ditolak')
  ok((await one(`SELECT status FROM invoices WHERE id='90000000-0000-0000-0000-000000000003'`)).status === 'sent', 'status invoice tetap sent')
  ok(Number((await one(`SELECT current_stock FROM products WHERE code='PRD1'`)).current_stock) === 7, 'stok produk tetap 7')
})

console.log('\n== 008: penomoran dokumen ==')
await as('admin', async () => {
  const period = (await one(`SELECT to_char(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYMM') p`)).p
  const inv3 = (await one(`SELECT invoice_number FROM invoices WHERE id='90000000-0000-0000-0000-000000000003'`)).invoice_number
  ok(inv3 === `INV-${period}-0001`, `invoice tanpa nomor diberi ${inv3}`)
  const a = (await one(`INSERT INTO purchase_orders (supplier_id) VALUES ('a0000000-0000-0000-0000-000000000001') RETURNING po_number`)).po_number
  const b = (await one(`INSERT INTO purchase_orders (po_number, supplier_id) VALUES ('', 'a0000000-0000-0000-0000-000000000001') RETURNING po_number`)).po_number
  ok(a === `PO-${period}-0001` && b === `PO-${period}-0002`, `PO berurutan: ${a}, ${b}`)
  await expectError(() => db.query(`INSERT INTO invoices (customer_id) VALUES ('00000000-0000-0000-0000-00000000dead')`), /foreign key/, 'insert invoice gagal (FK)')
  const next = (await one(`INSERT INTO invoices (status) VALUES ('draft') RETURNING invoice_number`)).invoice_number
  ok(next === `INV-${period}-0002`, `nomor tidak melompat setelah insert gagal: ${next}`)
  const kept = (await one(`INSERT INTO quotations (quotation_number) VALUES ('QUO-MANUAL') RETURNING quotation_number`)).quotation_number
  ok(kept === 'QUO-MANUAL', 'nomor yang diisi manual dipertahankan')
  ok((await one(`INSERT INTO work_orders (product_id, quantity) VALUES ('c0000000-0000-0000-0000-000000000001', 1) RETURNING wo_number`)).wo_number === `WO-${period}-0001`, 'WO diberi nomor WO-…-0001')
  const jeNo = (await one(`INSERT INTO journal_entries (entry_date, description) VALUES (CURRENT_DATE, 'x') RETURNING entry_number`)).entry_number
  ok(new RegExp(`^JE-${period}-\\d{4}$`).test(jeNo), `jurnal diberi nomor ${jeNo}`)
  const pre = (await one(`SELECT wo_number FROM work_orders WHERE order_type='pre_order'`)).wo_number
  ok(pre === `WO-PRE-${period}-0001`, `WO pre-order dari pay_invoice: ${pre}`)
})
await as('user', async () => {
  await expectError(() => db.query(`SELECT next_document_number('INV')`), /row-level security/, 'non-admin tidak bisa memakai counter')
})

console.log('\n== 008 gagal jika ada stok minus ==')
{
  const db2 = new PGlite()
  await db2.exec(stub)
  const files = fs.readdirSync(MIG).sort()
  for (const f of files.filter(f => f < '008')) await db2.exec(fs.readFileSync(MIG + f, 'utf8').replace(/CREATE EXTENSION[^;]*;/gi, ''))
  await db2.exec(`INSERT INTO materials (code, name, unit, current_stock) VALUES ('NEG', 'Minus', 'pcs', -3)`)
  try { await db2.exec(fs.readFileSync(MIG + files.find(f => f.startsWith('008')), 'utf8')); ok(false, 'migration seharusnya gagal') }
  catch (e) { ok(/Masih ada stok minus[\s\S]*Minus \(NEG\): -3/.test(e.message), 'migration berhenti dan menyebutkan barang yang minus') }
}

console.log('\n== 009: jurnal otomatis ==')
const je = async (refType, refId) => (await db.query(`
  SELECT c.code, jl.debit::numeric d, jl.credit::numeric c
  FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id = je.id JOIN chart_of_accounts c ON c.id = jl.account_id
  WHERE je.reference_type = '${refType}' AND je.reference_id = '${refId}' ORDER BY jl.debit DESC, c.code`)).rows
  .map(r => `${r.code}:${Number(r.d) ? 'D' + Number(r.d) : 'C' + Number(r.c)}`).join(' ')
await as('admin', async () => {
  const maps = (await db.query(`SELECT m.key, c.code FROM account_mappings m LEFT JOIN chart_of_accounts c ON c.id = m.account_id ORDER BY sort_order`)).rows
  ok(maps.length === 7 && maps.every(m => m.code), `7 pemetaan akun terisi: ${maps.map(m => m.key + '=' + m.code).join(', ')}`)

  let got = await je('purchase_order', 'd0000000-0000-0000-0000-000000000001')
  ok(got === '1301:D15000 2101:C15000', `terima PO tempo: Persediaan BB / Hutang Usaha 15.000 [${got}]`)
  ok((await one(`SELECT entry_number FROM journal_entries WHERE reference_id='d0000000-0000-0000-0000-000000000001'`)).entry_number.startsWith('JE-'), 'jurnal otomatis diberi nomor JE-…')
  await db.query(`SELECT pay_purchase_order('d0000000-0000-0000-0000-000000000001')`)
  got = await je('purchase_payment', 'd0000000-0000-0000-0000-000000000001')
  ok(got === '2101:D15000 1101:C15000', `bayar supplier: Hutang Usaha / Kas 15.000 [${got}]`)
  ok((await one(`SELECT paid_at FROM purchase_orders WHERE po_number='PO1'`)).paid_at, 'paid_at terisi')
  await expectError(() => db.query(`SELECT pay_purchase_order('d0000000-0000-0000-0000-000000000001')`), /sudah lunas/, 'bayar ulang ditolak')

  await db.query(`INSERT INTO purchase_orders (id, supplier_id, status, payment_term) VALUES ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'confirmed', 'cash')`)
  await db.query(`INSERT INTO purchase_order_items (purchase_order_id, material_id, quantity, unit_price) VALUES ('d0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 4, 2500)`)
  await db.query(`SELECT receive_purchase_order('d0000000-0000-0000-0000-000000000003')`)
  got = await je('purchase_order', 'd0000000-0000-0000-0000-000000000003')
  ok(got === '1301:D10000 1101:C10000', `terima PO tunai: Persediaan BB / Kas 10.000 [${got}]`)
  ok((await one(`SELECT paid_at FROM purchase_orders WHERE id='d0000000-0000-0000-0000-000000000003'`)).paid_at, 'PO tunai langsung lunas')
  await expectError(() => db.query(`SELECT pay_purchase_order('d0000000-0000-0000-0000-000000000003')`), /sudah lunas/, 'PO tunai tidak bisa dibayar lagi')

  await db.query(`INSERT INTO purchase_orders (id, po_number, supplier_id, status) VALUES ('d0000000-0000-0000-0000-000000000004', 'PO-LAMA', 'a0000000-0000-0000-0000-000000000001', 'received')`)
  await expectError(() => db.query(`SELECT pay_purchase_order('d0000000-0000-0000-0000-000000000004')`), /sebelum jurnal otomatis aktif/, 'PO lama (tanpa jurnal penerimaan) ditolak')

  // Produksi: MAT1 cost 1000, MAT2 cost 500; BOM 1.5 MAT1 + 1 MAT2
  await db.exec(`UPDATE materials SET cost_price = 1000 WHERE code='MAT1'; UPDATE materials SET cost_price = 500 WHERE code='MAT2'; UPDATE products SET cost_price = 20000 WHERE code='PRD1'`)
  await db.query(`INSERT INTO stock_movements (material_id, movement_type, quantity) VALUES ('b0000000-0000-0000-0000-000000000001', 'adjustment', 100)`)
  await db.query(`INSERT INTO work_orders (id, product_id, bom_id, quantity, status) VALUES ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 2, 'in_progress')`)
  const prodBefore = Number((await one(`SELECT current_stock FROM products WHERE code='PRD1'`)).current_stock)
  await db.query(`SELECT complete_work_order('f0000000-0000-0000-0000-000000000003')`)
  got = await je('work_order', 'f0000000-0000-0000-0000-000000000003')
  ok(got === '1302:D4000 1301:C4000', `selesai WO: Persediaan BJ / Persediaan BB 4.000 [${got}]`)
  ok(Number((await one(`SELECT current_stock FROM products WHERE code='PRD1'`)).current_stock) === prodBefore + 2, 'stok produk +2')

  const pre = await one(`SELECT id FROM work_orders WHERE order_type='pre_order'`)
  await db.query(`UPDATE work_orders SET status='in_progress' WHERE id='${pre.id}'`)
  await db.query(`SELECT complete_work_order('${pre.id}')`)
  got = await je('work_order', pre.id)
  ok(got === '1302:D14000 5101:D14000 1301:C14000 1302:C14000', `selesai WO pre-order: produksi + HPP 14.000 [${got}]`)
  ok(Number((await one(`SELECT current_stock FROM products WHERE code='PRD1'`)).current_stock) === prodBefore + 2, 'pre-order: stok produk kembali (masuk lalu diserahkan)')
  ok((await one(`SELECT count(*)::int n FROM stock_movements WHERE reference_id='${pre.id}' AND movement_type='sale_out'`)).n === 1, 'pre-order: ada mutasi sale_out penyerahan')

  // Penjualan ready stock dengan PPN
  await db.query(`INSERT INTO invoices (id, status, sale_type, subtotal, tax_amount, total_amount) VALUES ('90000000-0000-0000-0000-000000000004', 'sent', 'ready_stock', 100000, 11000, 111000)`)
  await db.query(`INSERT INTO invoice_items (invoice_id, product_id, quantity, unit_price) VALUES ('90000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 2, 50000)`)

  const cashMap = (await one(`SELECT account_id FROM account_mappings WHERE key='cash'`)).account_id
  await db.query(`UPDATE account_mappings SET account_id = NULL WHERE key='cash'`)
  await expectError(() => db.query(`SELECT pay_invoice('90000000-0000-0000-0000-000000000004')`), /Kas & Bank" belum diatur/, 'akun belum dipetakan → transaksi ditolak')
  ok((await one(`SELECT status FROM invoices WHERE id='90000000-0000-0000-0000-000000000004'`)).status === 'sent'
    && Number((await one(`SELECT current_stock FROM products WHERE code='PRD1'`)).current_stock) === prodBefore + 2, 'invoice & stok tidak berubah (rollback)')
  await db.query(`UPDATE account_mappings SET account_id = '${cashMap}' WHERE key='cash'`)

  await db.query(`SELECT pay_invoice('90000000-0000-0000-0000-000000000004')`)
  got = await je('invoice', '90000000-0000-0000-0000-000000000004')
  ok(got === '1101:D111000 5101:D40000 1302:C40000 2102:C11000 4101:C100000', `invoice lunas: Kas / Penjualan + PPN; HPP / Persediaan BJ [${got}]`)
  got = await je('invoice', '90000000-0000-0000-0000-000000000002')
  ok(got === '1101:D700 4101:C700', `invoice pre-order: Kas / Penjualan, tanpa HPP [${got}]`)

  const bal = await one(`SELECT SUM(debit)::numeric d, SUM(credit)::numeric c FROM journal_lines`)
  ok(Number(bal.d) === Number(bal.c), `total debit = total kredit seluruh jurnal (${Number(bal.d)})`)
  ok((await one(`SELECT bool_and(is_balanced) b FROM journal_entries`)).b, 'semua journal_entries is_balanced')
  await expectError(() => db.query(`SELECT post_journal('sale', 'x', 'invoice', '90000000-0000-0000-0000-000000000004', '[{"account":"cash","debit":1},{"account":"sales_revenue","credit":1}]')`), /duplicate key/, 'jurnal kedua untuk referensi yang sama ditolak')
  await expectError(() => db.query(`SELECT post_journal('sale', 'x', NULL, NULL, '[{"account":"cash","debit":2},{"account":"sales_revenue","credit":1}]')`), /tidak seimbang/, 'jurnal tidak seimbang ditolak')
})

console.log('\n== 009 dengan COA berhierarki & kode bentrok ==')
{
  const db3 = new PGlite()
  await db3.exec(stub)
  const files = fs.readdirSync(MIG).sort()
  for (const f of files.filter(f => f < '009')) await db3.exec(fs.readFileSync(MIG + f, 'utf8').replace(/CREATE EXTENSION[^;]*;/gi, ''))
  await db3.exec(`
    INSERT INTO chart_of_accounts (id, code, name, account_type) VALUES ('00000000-0000-0000-0000-00000000a000', '1000', 'Aset', 'asset');
    INSERT INTO chart_of_accounts (code, name, account_type, parent_id) VALUES ('1100', 'Kas Besar', 'asset', '00000000-0000-0000-0000-00000000a000');
    INSERT INTO chart_of_accounts (code, name, account_type) VALUES ('2102', 'Salah Tipe', 'equity');
    INSERT INTO chart_of_accounts (code, name, account_type) VALUES ('4101', 'Penjualan Lama', 'revenue');`)
  await db3.exec(fs.readFileSync(MIG + files.find(f => f.startsWith('009')), 'utf8'))
  const r = (await db3.query(`SELECT m.key, c.code, c.name, p.code parent FROM account_mappings m LEFT JOIN chart_of_accounts c ON c.id = m.account_id LEFT JOIN chart_of_accounts p ON p.id = c.parent_id ORDER BY m.sort_order`)).rows
  const by = Object.fromEntries(r.map(x => [x.key, x]))
  ok(by.cash.code === '1101' && by.cash.parent === '1000', 'akun aset baru ditaruh di bawah induk 1000 (tetap tampil di Neraca)')
  ok(by.vat_output.code === null, 'kode 2102 bertipe lain → pemetaan PPN dibiarkan kosong')
  ok(by.sales_revenue.name === 'Penjualan Lama', 'kode 4101 yang sudah ada & tipenya cocok dipakai ulang')
  await db3.exec(fs.readFileSync(MIG + files.find(f => f.startsWith('009')), 'utf8'))
  ok((await db3.query(`SELECT count(*)::int n FROM account_mappings`)).rows[0].n === 7, 'migration 009 aman dijalankan ulang')
}

console.log('\n== skema: subtotal purchase_order_items ==')
await expectError(() => db.query(`INSERT INTO purchase_order_items (purchase_order_id, material_id, quantity, unit_price, subtotal) VALUES ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 1, 1, 1)`), /generated column|non-DEFAULT/, 'insert subtotal eksplisit ditolak (kolom generated)')

console.log('\n== 010: fungsi laporan ==')
// Logika lama di browser: saldo per akun dari semua journal_lines
const clientBalances = async () => {
  const accounts = (await db.query(`SELECT id, code, account_type FROM chart_of_accounts`)).rows
  const lines = (await db.query(`SELECT account_id, debit::float8 d, credit::float8 c FROM journal_lines`)).rows
  return Object.fromEntries(accounts.map(a => {
    const l = lines.filter(x => x.account_id === a.id)
    const d = l.reduce((s, x) => s + x.d, 0), c = l.reduce((s, x) => s + x.c, 0)
    return [a.id, ['asset', 'expense'].includes(a.account_type) ? d - c : c - d]
  }))
}
await as('admin', async () => {
  const expected = await clientBalances()
  const rows = (await db.query(`SELECT id, code, balance::float8 b, total_debit::float8 d FROM account_balances()`)).rows
  ok(rows.length === Object.keys(expected).length && rows.every(r => Math.abs(r.b - expected[r.id]) < 0.001),
    `account_balances() sama dengan perhitungan lama untuk ${rows.length} akun`)
  ok(rows.map(r => r.code).join() === [...rows.map(r => r.code)].sort().join(), 'diurutkan menurut kode')
  const totalD = rows.reduce((s, r) => s + r.d, 0)
  ok(Math.abs(totalD - Number((await one(`SELECT SUM(debit)::float8 s FROM journal_lines`)).s)) < 0.001, 'total debit semua akun = total debit jurnal')

  const future = (await db.query(`SELECT balance::float8 b FROM account_balances(CURRENT_DATE + 400, NULL)`)).rows
  ok(future.every(r => r.b === 0), 'filter p_from di masa depan → semua saldo 0')

  const m = (await db.query(`SELECT month, revenue::float8 r, cogs::float8 c FROM monthly_profit_summary(6)`)).rows
  const thisMonth = (await one(`SELECT date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')::date::text m`)).m
  const toStr = d => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10)
  ok(m.length === 6 && toStr(m[5].month) === thisMonth, `6 bulan, bulan terakhir = ${thisMonth}`)
  const rev = rows.filter(r => r.code.startsWith('4')).reduce((s, r) => s + r.b, 0)
  const cogs = rows.filter(r => r.code.startsWith('5')).reduce((s, r) => s + r.b, 0)
  ok(m[5].r === rev && m[5].c === cogs, `bulan ini: pendapatan ${m[5].r}, HPP ${m[5].c} (sama dengan saldo akun)`)
  ok((await db.query(`SELECT * FROM monthly_profit_summary(0)`)).rows.length === 1
    && (await db.query(`SELECT * FROM monthly_profit_summary(100)`)).rows.length === 36, 'p_months dibatasi 1–36')
})

// Lebih dari 1000 baris jurnal + jurnal di bulan-bulan sebelumnya
await db.exec(`
  WITH acc AS (
    SELECT (SELECT account_id FROM account_mappings WHERE key='cash') cash,
           (SELECT account_id FROM account_mappings WHERE key='sales_revenue') rev
  ), e AS (
    INSERT INTO journal_entries (entry_date, entry_type, description, total_debit, total_credit)
    SELECT CURRENT_DATE, 'manual', 'bulk ' || g, 1000, 1000 FROM generate_series(1, 1500) g
    RETURNING id
  )
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
  SELECT e.id, acc.cash, 1000, 0 FROM e, acc
  UNION ALL
  SELECT e.id, acc.rev, 0, 1000 FROM e, acc;

  WITH acc AS (SELECT (SELECT account_id FROM account_mappings WHERE key='cash') cash,
                      (SELECT account_id FROM account_mappings WHERE key='sales_revenue') rev),
  e AS (
    INSERT INTO journal_entries (entry_date, entry_type, description, total_debit, total_credit)
    VALUES ((date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '3 months')::date + 4, 'manual', '3 bulan lalu', 777, 777),
           ((date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '7 months')::date + 4, 'manual', '7 bulan lalu', 999, 999)
    RETURNING id, total_debit
  )
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
  SELECT e.id, acc.cash, e.total_debit, 0 FROM e, acc
  UNION ALL
  SELECT e.id, acc.rev, 0, e.total_debit FROM e, acc;
`)
await as('admin', async () => {
  ok((await one(`SELECT count(*)::int n FROM journal_lines`)).n > 3000, `journal_lines sekarang ${(await one(`SELECT count(*)::int n FROM journal_lines`)).n} baris`)
  const expected = await clientBalances()
  const rows = (await db.query(`SELECT id, balance::float8 b FROM account_balances()`)).rows
  ok(rows.every(r => Math.abs(r.b - expected[r.id]) < 0.001), 'account_balances() tetap benar dengan >3000 baris jurnal')
  const m = (await db.query(`SELECT revenue::float8 r FROM monthly_profit_summary(6)`)).rows
  ok(m[2].r === 777, `jurnal 3 bulan lalu masuk bulan yang benar (${m[2].r})`)
  ok(!m.some(x => x.r === 999), 'jurnal 7 bulan lalu tidak masuk ringkasan 6 bulan')
  const period = (await db.query(`SELECT code, balance::float8 b FROM account_balances((date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '3 months')::date, (date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '2 months')::date - 1)`)).rows
  ok(period.find(r => r.code === '4101').b === 777, 'account_balances(p_from, p_to) hanya menghitung periode itu')
})
await as('user', async () => {
  ok((await db.query(`SELECT * FROM account_balances()`)).rows.length === 0, 'non-admin: account_balances() kosong (RLS)')
  ok((await db.query(`SELECT * FROM monthly_profit_summary(6)`)).rows.every(r => Number(r.revenue) === 0), 'non-admin: ringkasan bulanan 0 (RLS)')
})

console.log('\n== 011: dashboard_summary ==')
await db.exec(`
  INSERT INTO work_orders (product_id, quantity, status)
  SELECT 'c0000000-0000-0000-0000-000000000001', 1, 'in_progress' FROM generate_series(1, 8);
  INSERT INTO invoices (status, total_amount)
  SELECT (ARRAY['sent','overdue','partial','draft','cancelled'])[1 + g % 5], 10 FROM generate_series(0, 14) g;
  INSERT INTO materials (code, name, unit, current_stock, reorder_point) VALUES
    ('LOW1', 'Kritis 10%', 'pcs', 1, 10),
    ('LOW2', 'Kritis 50%', 'pcs', 5, 10),
    ('LOW3', 'Kritis 0%', 'pcs', 0, 4),
    ('LOW4', 'Tanpa batas', 'pcs', 0, 0),
    ('LOW5', 'Kritis 90%', 'pcs', 9, 10),
    ('LOW6', 'Kritis 100%', 'pcs', 10, 10),
    ('OK1', 'Aman', 'pcs', 50, 10);
  UPDATE materials SET is_active = false WHERE code = 'LOW6';
  -- pendapatan & pembelian bulan lalu
  WITH acc AS (SELECT (SELECT account_id FROM account_mappings WHERE key='cash') cash,
                      (SELECT account_id FROM account_mappings WHERE key='sales_revenue') rev,
                      (SELECT account_id FROM account_mappings WHERE key='inventory_material') inv),
  e AS (
    INSERT INTO journal_entries (entry_date, entry_type, description, total_debit, total_credit, reference_type, reference_id)
    VALUES ((date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '1 month')::date + 2, 'sale', 'bulan lalu', 5000, 5000, NULL, NULL),
           ((date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta') - INTERVAL '1 month')::date + 3, 'purchase', 'PO bulan lalu', 4000, 4000, 'purchase_order', gen_random_uuid())
    RETURNING id, description, total_debit
  )
  INSERT INTO journal_lines (journal_entry_id, account_id, debit, credit)
  SELECT e.id, CASE WHEN e.description = 'bulan lalu' THEN acc.cash ELSE acc.inv END, e.total_debit, 0 FROM e, acc
  UNION ALL
  SELECT e.id, CASE WHEN e.description = 'bulan lalu' THEN acc.rev ELSE acc.cash END, 0, e.total_debit FROM e, acc;
`)
await as('admin', async () => {
  const d = (await one(`SELECT dashboard_summary() s`)).s
  const exp = await one(`SELECT
    (SELECT count(*)::int FROM work_orders WHERE status='in_progress') wo,
    (SELECT count(*)::int FROM invoices WHERE status IN ('sent','overdue','partial')) inv,
    (SELECT count(*)::int FROM materials WHERE is_active AND current_stock <= reorder_point) low,
    (SELECT revenue::float8 FROM monthly_profit_summary(1)) rev,
    (SELECT COALESCE(SUM(total_debit),0)::float8 FROM journal_entries WHERE reference_type='purchase_order'
       AND entry_date >= date_trunc('month', NOW() AT TIME ZONE 'Asia/Jakarta')::date) pur`)
  ok(d.active_work_orders === exp.wo && exp.wo > 5, `Work Order Aktif = ${d.active_work_orders} (tidak lagi mentok di 5)`)
  ok(d.pending_invoices === exp.inv && exp.inv > 5, `Invoice Pending = ${d.pending_invoices} (sent/overdue/partial saja)`)
  ok(d.low_stock_items === exp.low, `Stok Hampir Habis = ${d.low_stock_items}`)
  ok(Number(d.revenue_month) === exp.rev, `Pendapatan bulan ini = ${d.revenue_month} (sama dengan Laba Rugi)`)
  ok(Number(d.revenue_prev_month) === 5000, `Pendapatan bulan lalu = ${d.revenue_prev_month}`)
  ok(Number(d.purchase_month) === exp.pur && exp.pur > 0, `Pembelian bulan ini = ${d.purchase_month} (nilai barang PO diterima)`)
  ok(Number(d.purchase_prev_month) === 4000, `Pembelian bulan lalu = ${d.purchase_prev_month}`)
  const codes = d.low_stock_materials.map(m => m.code).join(',')
  ok(codes === 'LOW3,LOW1,LOW2,LOW5', `4 bahan paling kritis, urut: ${codes}`)
  ok(!codes.includes('LOW6') && !codes.includes('OK1'), 'bahan nonaktif & stok aman tidak ikut')
})
await as('user', async () => {
  const d = (await one(`SELECT dashboard_summary() s`)).s
  ok(d.active_work_orders === 0 && Number(d.revenue_month) === 0 && d.low_stock_materials.length === 0, 'non-admin: semua 0 (RLS)')
})

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
