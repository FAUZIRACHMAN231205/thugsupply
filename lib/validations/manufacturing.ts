import { z } from 'zod'

export const bomItemSchema = z.object({
  material_id: z.string().min(1, 'Material wajib dipilih'),
  quantity: z.coerce.number().min(0.001, 'Kuantitas harus lebih besar dari 0'),
  unit: z.string().min(1, 'Satuan wajib diisi'),
  notes: z.string().optional(),
})

export const bomSchema = z.object({
  product_id: z.string().min(1, 'Produk jadi wajib dipilih'),
  version: z.string().min(1, 'Versi BOM wajib diisi'),
  notes: z.string().optional(),
  is_active: z.boolean(),
  items: z.array(bomItemSchema).min(1, 'Minimal satu bahan baku wajib ditambahkan'),
})

export type BomFormValues = z.infer<typeof bomSchema>

export const workOrderSchema = z.object({
  product_id: z.string().min(1, 'Produk jadi wajib dipilih'),
  bom_id: z.string().min(1, 'BOM wajib dipilih'),
  quantity: z.coerce.number().min(1, 'Kuantitas produksi minimal 1'),
  order_type: z.enum(['ready_stock', 'pre_order']),
  target_date: z.string().min(1, 'Target tanggal selesai wajib diisi'),
  notes: z.string().optional(),
})

export type WorkOrderFormValues = z.infer<typeof workOrderSchema>
