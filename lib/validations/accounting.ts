import { z } from 'zod'

export const coaSchema = z.object({
  code: z.string().min(1, 'Kode akun wajib diisi'),
  name: z.string().min(3, 'Nama akun minimal 3 karakter'),
  account_type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  parent_id: z.string().optional(),
  description: z.string().optional(),
  is_active: z.boolean(),
})

export type CoaFormValues = z.infer<typeof coaSchema>

export const journalLineSchema = z.object({
  account_id: z.string().min(1, 'Akun wajib dipilih'),
  debit: z.number({ message: 'Debit harus berupa angka' }).min(0, 'Debit tidak boleh negatif'),
  credit: z.number({ message: 'Kredit harus berupa angka' }).min(0, 'Kredit tidak boleh negatif'),
  notes: z.string().optional(),
}).refine(data => {
  // Hanya salah satu (debit atau credit) yang boleh lebih dari 0 dalam satu baris (aturan dasar, meskipun bisa diabaikan)
  // Atau lebih tepatnya, setidaknya salah satu harus lebih dari 0
  return data.debit > 0 || data.credit > 0
}, {
  message: 'Harus mengisi nilai debit atau kredit',
  path: ['debit']
})

export const journalEntrySchema = z.object({
  description: z.string().min(3, 'Keterangan jurnal minimal 3 karakter'),
  entry_date: z.string().min(1, 'Tanggal transaksi wajib diisi'),
  entry_type: z.enum(['manual', 'purchase', 'sale', 'production', 'adjustment']),
  lines: z.array(journalLineSchema).min(2, 'Jurnal minimal membutuhkan 2 baris (Debit & Kredit)'),
}).refine(data => {
  const totalDebit = data.lines.reduce((sum, line) => sum + line.debit, 0)
  const totalCredit = data.lines.reduce((sum, line) => sum + line.credit, 0)
  return totalDebit === totalCredit
}, {
  message: 'Jurnal tidak seimbang. Total Debit harus sama dengan Total Kredit.',
  path: ['lines'] // akan menampilkan error di form level
})

export type JournalEntryFormValues = z.infer<typeof journalEntrySchema>
