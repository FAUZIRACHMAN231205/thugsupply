import { z } from 'zod'
import { materialRequiresSize, MATERIAL_SIZE_VALUES } from '@/lib/inventory-size'

const sizeEnum = z.enum(MATERIAL_SIZE_VALUES)

export const materialSchema = z
  .object({
    code: z.string().min(1, 'Kode material wajib diisi').max(20, 'Maksimal 20 karakter'),
    name: z.string().min(3, 'Nama material minimal 3 karakter').max(100, 'Maksimal 100 karakter'),
    description: z.string().optional(),
    size: sizeEnum.optional(),
    unit: z.string().min(1, 'Satuan wajib diisi'),
    category: z.string().optional(),
    cost_price: z.coerce
      .number({ error: 'Harga beli harus berupa angka' })
      .min(0, 'Harga beli tidak boleh negatif'),
    reorder_point: z.coerce
      .number({ error: 'Reorder point harus berupa angka' })
      .min(0, 'Reorder point tidak boleh negatif'),
    current_stock: z.coerce
      .number({ error: 'Stok awal harus berupa angka' })
      .min(0, 'Stok awal tidak boleh negatif')
      .optional(),
    is_active: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (materialRequiresSize(data.category, data.unit) && !data.size) {
      ctx.addIssue({
        code: 'custom',
        message: 'Ukuran wajib diisi untuk bahan apparel (kategori Blank Apparel atau Kain Utama satuan pcs)',
        path: ['size'],
      })
    }
  })

export type MaterialFormValues = z.infer<typeof materialSchema>

export const supplierSchema = z.object({
  code: z.string().min(1, 'Kode supplier wajib diisi'),
  name: z.string().min(3, 'Nama supplier minimal 3 karakter'),
  contact_person: z.string().optional(),
  email: z.string().email('Format email tidak valid').or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  payment_terms_days: z.coerce.number().min(0, 'Termin pembayaran tidak boleh negatif'),
  is_active: z.boolean(),
})

export type SupplierFormValues = z.infer<typeof supplierSchema>

export const poItemSchema = z.object({
  material_id: z.string().min(1, 'Material wajib dipilih'),
  quantity: z.coerce.number().min(1, 'Kuantitas minimal 1'),
  unit_price: z.coerce.number().min(0, 'Harga satuan tidak boleh negatif'),
})

export const purchaseOrderSchema = z.object({
  supplier_id: z.string().min(1, 'Supplier wajib dipilih'),
  order_date: z.string().min(1, 'Tanggal pemesanan wajib diisi'),
  expected_date: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(poItemSchema).min(1, 'Minimal satu item material wajib ditambahkan'),
})

export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderSchema>

export const stockMovementSchema = z.object({
  item_type: z.enum(['material', 'product']),
  item_id: z.string().min(1, 'Barang/Material wajib dipilih'),
  quantity: z.coerce.number().refine((val) => val !== 0, 'Kuantitas tidak boleh nol'),
  notes: z.string().optional(),
})

export type StockMovementFormValues = z.infer<typeof stockMovementSchema>
