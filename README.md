# Thug Supply ERP System

Sistem manajemen bisnis terintegrasi untuk **Thug Supply** — brand fashion garmen Indonesia.

## 🛠 Tech Stack

- **Frontend**: Next.js 16.2.6 (App Router) + React 19.2.4 + TypeScript
- **Styling**: Tailwind CSS 4 + Cormorant Garamond + Poppins
- **Backend & Database**: Supabase (PostgreSQL)
- **Charts**: Recharts
- **Form**: React Hook Form + Zod

## 📦 Modul

| Modul | Fitur |
|-------|-------|
| **Purchase & Inventory** | Supplier, Bahan Baku, Purchase Order, Mutasi Stok |
| **Sales** | Customer, Produk, Penawaran Harga, Invoice |
| **Manufacturing** | Bill of Materials, Work Order, Tracking Produksi |
| **Accounting** | COA, Jurnal, Laba Rugi, Neraca |

## 🚀 Getting Started

### 1. Clone & Install

```bash
npm install
```

### 2. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com)
2. Copy `.env.local.example` → `.env.local`
3. Isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Jalankan SQL migration di **Supabase SQL Editor**:

```bash
# Jalankan berurutan di Supabase SQL Editor:
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_security_and_fixes.sql
supabase/migrations/003_add_material_size.sql
supabase/migrations/004_material_size_constraints.sql
supabase/migrations/005_product_size.sql
supabase/migrations/006_admin_rls.sql
supabase/migrations/007_transactional_rpcs.sql
supabase/migrations/008_stock_guard_and_numbering.sql
supabase/migrations/009_auto_journal.sql
supabase/migrations/010_report_functions.sql
supabase/migrations/011_dashboard_summary.sql
```

   Migration 009 membuat jurnal otomatis dari pembelian, produksi, dan penjualan. Akun yang dipakai bisa diubah di **Akuntansi → Chart of Accounts → Akun Jurnal Otomatis**.

5. Beri role admin ke akun Anda (hanya admin yang bisa login dan mengakses data), lalu logout-login ulang:

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
WHERE email = 'email-anda@contoh.com';
```

### 3. Jalankan Development Server

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) di browser.

### 4. Tes Migration Database

```bash
npm run test:db
```

Menjalankan seluruh migration di `supabase/migrations/` pada Postgres sementara di dalam Node (PGlite), lalu menguji RLS admin, transaksi stok, penomoran dokumen, jurnal otomatis, dan fungsi laporan. **Tidak menyentuh database Supabase Anda** dan tidak butuh koneksi internet. Jalankan setiap kali menambah atau mengubah migration.

## 📁 Struktur Folder

```
app/
├── (dashboard)/           # Route group dengan DashboardShell layout
│   ├── dashboard/         # Halaman utama
│   ├── inventory/         # Modul Purchase & Inventori
│   │   ├── page.tsx       # Overview stok
│   │   ├── materials/     # Master bahan baku
│   │   ├── purchase-orders/ # Purchase Order
│   │   ├── suppliers/     # Data supplier
│   │   └── movements/     # Mutasi stok
│   ├── sales/             # Modul Penjualan
│   │   ├── customers/     # Data customer
│   │   ├── products/      # Master produk
│   │   ├── quotations/    # Penawaran harga
│   │   └── invoices/      # Invoice
│   ├── manufacturing/     # Modul Manufaktur
│   │   ├── bom/           # Bill of Materials
│   │   └── work-orders/   # Work Order
│   └── accounting/        # Modul Akuntansi
│       ├── chart-of-accounts/ # COA
│       ├── journal/       # Jurnal
│       └── reports/       # Laporan Keuangan
components/
├── layout/                # Sidebar, Topbar, DashboardShell
└── ui/                    # Komponen UI reusable
lib/
├── supabase/              # Supabase client (browser & server)
├── utils.ts               # Utility functions
└── mock-data.ts           # Demo data
types/
└── database.ts            # TypeScript types
supabase/
└── migrations/
    └── 001_initial_schema.sql  # SQL schema lengkap
```

## 🔗 Integrasi Antar Modul

```
Purchase Order → Stock Movements → Bahan Baku Tersedia
                                      ↓
Bill of Materials → Work Order → Produksi → Produk Jadi
                                               ↓
                                 Quotation → Invoice → Jurnal Akuntansi
```

## 📊 Database Setup di Supabase

1. Login ke [app.supabase.com](https://app.supabase.com)
2. Buat project baru
3. Pergi ke **SQL Editor**
4. Jalankan semua file migrasi di `supabase/migrations/` **berurutan** (001 → 005)
5. Klik **Run** untuk setiap file
6. Copy **Project URL** dan **anon key** dari **Settings → API**
7. Isi file `.env.local`

### Ukuran (Size) pada bahan baku & produk

- Satu baris material/produk = **satu ukuran** (S, M, L, …)
- Wajib untuk **Blank Apparel** dan **Kain Utama** ber-satuan `pcs`
- Unique index mencegah duplikat nama + ukuran yang sama
