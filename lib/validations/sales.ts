import { z } from 'zod'
import { MATERIAL_SIZE_VALUES, productRequiresSize } from '@/lib/inventory-size'

const productSizeEnum = z.enum(MATERIAL_SIZE_VALUES)

export const productSchema = z
  .object({
    code: z.string().min(1, 'Kode produk wajib diisi'),
    name: z.string().min(3, 'Nama produk minimal 3 karakter'),
    description: z.string().optional(),
    size: productSizeEnum.optional(),
    category: z.string().optional(),
    unit: z.string().min(1, 'Satuan wajib diisi'),
    selling_price: z.coerce.number().min(0, 'Harga jual tidak boleh negatif'),
    cost_price: z.coerce.number().min(0, 'Harga modal tidak boleh negatif'),
    reorder_point: z.coerce.number().min(0, 'Reorder point tidak boleh negatif'),
    current_stock: z.coerce.number().min(0, 'Stok tidak boleh negatif').optional(),
    is_active: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (productRequiresSize() && !data.size) {
      ctx.addIssue({
        code: 'custom',
        message: 'Ukuran wajib diisi untuk produk jadi',
        path: ['size'],
      })
    }
  })

export type ProductFormValues = z.infer<typeof productSchema>

export const customerSchema = z.object({
  code: z.string().min(1, 'Kode customer wajib diisi'),
  name: z.string().min(3, 'Nama customer minimal 3 karakter'),
  contact_person: z.string().optional(),
  email: z.string().email('Format email tidak valid').or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  payment_terms_days: z.coerce.number().min(0, 'Termin pembayaran tidak boleh negatif'),
  credit_limit: z.coerce.number().min(0, 'Limit kredit tidak boleh negatif'),
  is_active: z.boolean(),
})

export type CustomerFormValues = z.infer<typeof customerSchema>

export const quotationItemSchema = z.object({
  product_id: z.string().min(1, 'Produk wajib dipilih'),
  quantity: z.coerce.number().min(1, 'Kuantitas minimal 1'),
  unit_price: z.coerce.number().min(0, 'Harga satuan tidak boleh negatif'),
  discount_percent: z.coerce.number().min(0).max(100, 'Diskon maksimal 100%'),
})

export const quotationSchema = z.object({
  customer_id: z.string().min(1, 'Customer wajib dipilih'),
  issue_date: z.string().min(1, 'Tanggal wajib diisi'),
  valid_until: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(quotationItemSchema).min(1, 'Minimal satu item produk'),
})

export type QuotationFormValues = z.infer<typeof quotationSchema>

export const invoiceItemSchema = z.object({
  product_id: z.string().min(1, 'Produk wajib dipilih'),
  quantity: z.coerce.number().min(1, 'Kuantitas minimal 1'),
  unit_price: z.coerce.number().min(0, 'Harga satuan tidak boleh negatif'),
  discount_percent: z.coerce.number().min(0).max(100, 'Diskon maksimal 100%'),
})

export const invoiceSchema = z.object({
  customer_id: z.string().min(1, 'Customer wajib dipilih'),
  quotation_id: z.string().optional(),
  issue_date: z.string().min(1, 'Tanggal wajib diisi'),
  due_date: z.string().optional(),
  sale_type: z.enum(['ready_stock', 'pre_order']),
  notes: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, 'Minimal satu item produk'),
})

export type InvoiceFormValues = z.infer<typeof invoiceSchema>
