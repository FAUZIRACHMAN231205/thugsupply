'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { quotationSchema, type QuotationFormValues } from '@/lib/validations/sales'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase/supabase'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import StatusBadge from '@/components/ui/StatusBadge'
import { Plus, Eye, X, Loader2, Trash2, Printer } from 'lucide-react'
import type { Quotation, QuotationItem } from '@/types/database'
import { formatProductLabel } from '@/lib/inventory-size'

export default function QuotationsPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedQuo, setSelectedQuo] = useState<Quotation | null>(null)

  const form = useForm<QuotationFormValues>({
    resolver: zodResolver(quotationSchema) as unknown as import('react-hook-form').Resolver<QuotationFormValues>,
    defaultValues: {
      customer_id: '',
      issue_date: new Date().toISOString().split('T')[0],
      valid_until: '',
      notes: '',
      items: []
    }
  })
  
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchItems = useWatch({ control, name: 'items' }) || []

  const [taxRate, setTaxRate] = useState(11) // Default PPN 11%

  const { data, isLoading: loading } = useQuery({
    queryKey: ['quotations_data'],
    queryFn: async () => {
      const [quoRes, custRes, prodRes] = await Promise.all([
        supabase
          .from('quotations')
          .select('*, customer:customers(*), items:quotation_items(*, product:products(*))')
          .order('created_at', { ascending: false }),
        supabase
          .from('customers')
          .select('*')
          .eq('is_active', true),
        supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
      ])

      if (quoRes.error) throw quoRes.error
      if (custRes.error) throw custRes.error
      if (prodRes.error) throw prodRes.error

      return {
        quotations: quoRes.data || [],
        customers: custRes.data || [],
        products: prodRes.data || []
      }
    }
  })

  const quotations = data?.quotations || []
  const customers = data?.customers || []
  const products = data?.products || []

  // Open Create Modal
  const handleCreateOpen = () => {
    reset({
      customer_id: customers[0]?.id || '',
      issue_date: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 14 days later
      notes: '',
      items: [{ product_id: products[0]?.id || '', quantity: 1, unit_price: products[0]?.selling_price || 0, discount_percent: 0 }]
    })
    setIsCreateOpen(true)
  }

  // Add Item Row
  const handleAddItemRow = () => {
    const defaultProd = products[0]
    append({ product_id: defaultProd?.id || '', quantity: 1, unit_price: defaultProd?.selling_price || 0, discount_percent: 0 })
  }

  // Change Item Product
  const handleProductChange = (index: number, productId: string) => {
    setValue(`items.${index}.product_id`, productId)
    const prod = products.find(p => p.id === productId)
    if (prod) {
      setValue(`items.${index}.unit_price`, prod.selling_price)
    }
  }

  // Calculations
  const calculateTotals = () => {
    const items = watchItems || []
    const subtotal = items.reduce((sum, item) => {
      const qty = item.quantity || 0
      const price = item.unit_price || 0
      const discount = item.discount_percent || 0
      const discountedPrice = price * (1 - (discount / 100))
      return sum + (qty * discountedPrice)
    }, 0)
    
    const tax_amount = subtotal * (taxRate / 100)
    const total_amount = subtotal + tax_amount
    
    return { subtotal, tax_amount, total_amount }
  }

  const createMutation = useMutation({
    mutationFn: async (formData: QuotationFormValues) => {
      const { subtotal, tax_amount, total_amount } = calculateTotals()

      const { data: quoData, error: quoError } = await supabase
        .from('quotations')
        .insert([{
          customer_id: formData.customer_id,
          issue_date: formData.issue_date,
          valid_until: formData.valid_until,
          status: 'draft',
          notes: formData.notes || null,
          subtotal,
          tax_amount,
          discount_amount: 0,
          total_amount
        }])
        .select()

      if (quoError) throw quoError
      const newQuo = quoData[0]

      const itemsToInsert = formData.items.map(item => {
        const discountedPrice = item.unit_price * (1 - (item.discount_percent / 100))
        return {
          quotation_id: newQuo.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent,
          subtotal: item.quantity * discountedPrice
        }
      })

      const { error: itemsError } = await supabase
        .from('quotation_items')
        .insert(itemsToInsert)

      if (itemsError) throw itemsError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations_data'] })
      setIsCreateOpen(false)
    },
    onError: (err) => {
      console.error('Error saving quotation:', err)
      toast.error('Gagal membuat Penawaran Harga')
    }
  })

  const onSubmit = (data: QuotationFormValues) => {
    createMutation.mutate(data)
  }

  const submitting = createMutation.isPending

  // View details
  const handleViewDetails = (quo: Quotation) => {
    setSelectedQuo(quo)
    setIsDetailOpen(true)
  }

  const statusMutation = useMutation({
    mutationFn: async ({ quo, newStatus }: { quo: Quotation, newStatus: 'sent' | 'accepted' | 'rejected' | 'expired' }) => {
      const { error } = await supabase
        .from('quotations')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', quo.id)
      
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations_data'] })
      setIsDetailOpen(false)
    },
    onError: (err) => {
      console.error('Error updating status:', err)
      toast.error('Gagal memperbarui status penawaran')
    }
  })

  const handleUpdateStatus = async (quo: Quotation, newStatus: 'sent' | 'accepted' | 'rejected' | 'expired') => {
    const ok = await confirm({
      title: 'Ubah Status Penawaran',
      message: `Ubah status penawaran ${quo.quotation_number} ke ${newStatus}?`,
      confirmLabel: 'Ubah Status',
      danger: newStatus === 'rejected',
    })
    if (!ok) return
    statusMutation.mutate({ quo, newStatus })
  }

  const handlePrint = () => {
    window.print()
  }

  const { subtotal: currentSubtotal, tax_amount: currentTax, total_amount: currentTotal } = calculateTotals()

  return (
    <div className="page-modules">
      <div className="module-grid-stats">
        {[
          { label: 'Total Penawaran', value: quotations.length, color: '#c9a84c' },
          { label: 'Draft', value: quotations.filter(q => q.status === 'draft').length, color: '#94a3b8' },
          { label: 'Diterima', value: quotations.filter(q => q.status === 'accepted').length, color: '#22c55e' },
          { label: 'Potensi Nilai', value: formatCurrency(quotations.reduce((s, q) => s + q.total_amount, 0)), color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, marginBottom: '0.5rem' }}>{s.label}</div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 border-b border-slate-800">
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>Penawaran Harga</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Daftar semua penawaran harga ke customer</div>
          </div>
          <button onClick={handleCreateOpen} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Plus size={14} /> Buat Penawaran Baru
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
            <Loader2 size={24} className="animate-spin text-[#c9a84c]" />
            <span>Memuat data...</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>No. Penawaran</th>
                  <th>Customer</th>
                  <th>Tanggal Penawaran</th>
                  <th>Valid Hingga</th>
                  <th>Total Nilai</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {quotations.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data Penawaran Harga.</td>
                  </tr>
                ) : (
                  quotations.map((quo) => (
                    <tr key={quo.id}>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#c9a84c', fontWeight: 600 }}>{quo.quotation_number}</span></td>
                      <td>
                        <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{quo.customer?.name}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{quo.customer?.city}</div>
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>{formatDate(quo.issue_date)}</td>
                      <td style={{ fontSize: '0.8125rem' }}>{formatDate(quo.valid_until)}</td>
                      <td><span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', fontWeight: 700 }}>{formatCurrency(quo.total_amount)}</span></td>
                      <td><StatusBadge status={quo.status} /></td>
                      <td>
                        <button onClick={() => handleViewDetails(quo)} className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#94a3b8' }}>
                          <Eye size={14} /> Detail
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: Create Quotation */}
      {isCreateOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)',
          overflowY: 'auto', padding: '3rem 1rem 10rem 1rem'
        }}>
          <div className="glass-gold" style={{
            background: '#090d16', borderRadius: '1rem', width: '100%', maxWidth: '42rem',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', margin: '0 auto'
          }}>
            {/* Header — tetap di atas */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-slate-800/50">
              <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec' }}>Buat Penawaran Harga Baru</h3>
              <button onClick={() => setIsCreateOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {/* Body — scrollable */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',  }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Pilih Customer *</label>
                  <select {...register('customer_id')} className="input-base" style={{ background: '#0f172a' }}>
                    <option value="" disabled>-- Pilih Customer --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                  </select>
                  <FormError message={errors.customer_id?.message} />
                </div>
                <div>
                  <label className="form-label">Berlaku Hingga *</label>
                  <input type="date" {...register('valid_until')} className="input-base" />
                  <FormError message={errors.valid_until?.message} />
                </div>
              </div>

              <div>
                <label className="form-label">Catatan Penawaran</label>
                <input type="text" {...register('notes')} className="input-base" placeholder="Tambahkan catatan khusus..." />
                <FormError message={errors.notes?.message} />
              </div>

              {/* Items Section */}
              <div style={{ border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '1rem', background: '#050811' }}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-3">
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8' }}>Daftar Produk</span>
                  <button type="button" onClick={handleAddItemRow} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}>+ Tambah Row</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {fields.map((field, index) => (
                    <div key={field.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <div style={{ flex: 2 }}>
                        <select
                          {...register(`items.${index}.product_id`)}
                          onChange={(e) => handleProductChange(index, e.target.value)}
                          className="input-base"
                          style={{ background: '#0f172a', width: '100%' }}
                        >
                          <option value="" disabled>-- Pilih Produk --</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>
                              {formatProductLabel(p)} — {formatCurrency(p.selling_price)}
                            </option>
                          ))}
                        </select>
                        <FormError message={errors.items?.[index]?.product_id?.message} />
                      </div>
                      
                      <div style={{ flex: 0.8 }}>
                        <input
                          type="number"
                          {...register(`items.${index}.quantity`)}
                          className="input-base"
                          style={{ width: '100%' }}
                          placeholder="Qty"
                        />
                        <FormError message={errors.items?.[index]?.quantity?.message} />
                      </div>

                      <div style={{ flex: 1.5 }}>
                        <input
                          type="number"
                          {...register(`items.${index}.unit_price`)}
                          className="input-base"
                          style={{ width: '100%' }}
                          placeholder="Harga Satuan"
                        />
                        <FormError message={errors.items?.[index]?.unit_price?.message} />
                      </div>

                      <div style={{ flex: 0.8 }}>
                        <input
                          type="number"
                          {...register(`items.${index}.discount_percent`)}
                          className="input-base"
                          style={{ width: '100%' }}
                          placeholder="Disc %"
                        />
                        <FormError message={errors.items?.[index]?.discount_percent?.message} />
                      </div>

                      <button
                        type="button"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: fields.length === 1 ? 'not-allowed' : 'pointer', padding: '0.25rem', marginBottom: errors.items?.[index] ? '1.5rem' : '0' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {errors.items?.root && <FormError message={errors.items.root.message} />}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: '1rem', borderTop: '1px solid #1e293b', paddingTop: '0.75rem', gap: '0.25rem', fontSize: '0.8125rem', color: '#94a3b8' }}>
                  <div>Subtotal: <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{formatCurrency(currentSubtotal)}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>Pajak (PPN %):</span>
                    <input type="number" min={0} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="input-base" style={{ width: '4rem', padding: '0.125rem 0.375rem', height: '1.5rem', background: '#0f172a' }} />
                    <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{formatCurrency(currentTax)}</span>
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#c9a84c', marginTop: '0.25rem' }}>
                    Total: <span>{formatCurrency(currentTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.3)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setIsCreateOpen(false)} className="btn btn-secondary btn-sm" disabled={submitting}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} disabled={submitting}>
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Simpan Penawaran (Draft)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: View Details */}
      {isDetailOpen && selectedQuo && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)',
          overflowY: 'auto', padding: '3rem 1rem 10rem 1rem'
        }}>
          <div className="glass-gold print-area" style={{
            background: '#090d16', borderRadius: '1rem', width: '100%', maxWidth: '38rem',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', margin: '0 auto'
          }}>
            {/* Header — tetap di atas */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-slate-800/50">
              <div>
                <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="no-print">Detail</span> Penawaran <span style={{ fontFamily: 'monospace', color: '#c9a84c' }}>{selectedQuo.quotation_number}</span>
                </h3>
                <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.125rem' }}>Dibuat pada {formatDate(selectedQuo.issue_date)}</div>
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="no-print" style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {/* Body — scrollable */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',  }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ background: '#050811', padding: '1rem', borderRadius: '0.5rem'}}>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0', marginTop: '0.25rem' }}>{selectedQuo.customer?.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{selectedQuo.customer?.contact_person} | {selectedQuo.customer?.phone}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="no-print">Status Saat Ini</div>
                  <div style={{ marginTop: '0.25rem' }} className="no-print">
                    <StatusBadge status={selectedQuo.status} />
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div style={{ overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem', fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase' }}>Nama Produk</th>
                      <th style={{ padding: '0.5rem', fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '0.5rem', fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Harga Satuan</th>
                      <th style={{ padding: '0.5rem', fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Diskon</th>
                      <th style={{ padding: '0.5rem', fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedQuo.items?.map((item: QuotationItem) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(30, 41, 59, 0.4)' }}>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem' }}>
                          <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{item.product?.name}</div>
                          <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{item.product?.code}</div>
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem', textAlign: 'right', color: '#cbd5e1' }}>{item.quantity} {item.product?.unit}</td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem', textAlign: 'right', color: '#cbd5e1' }}>{formatCurrency(item.unit_price)}</td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem', textAlign: 'right', color: '#22c55e' }}>{item.discount_percent}%</td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem', textAlign: 'right', fontWeight: 600, color: '#f8f4ec' }}>{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', borderTop: '1px solid #1e293b', paddingTop: '1rem', marginTop: '0.5rem', gap: '0.25rem', fontSize: '0.8125rem', color: '#94a3b8' }}>
                <div>Subtotal: <span style={{ color: '#cbd5e1' }}>{formatCurrency(selectedQuo.subtotal)}</span></div>
                <div>PPN: <span style={{ color: '#cbd5e1' }}>{formatCurrency(selectedQuo.tax_amount)}</span></div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f8f4ec' }}>Total: <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 700, color: '#c9a84c' }}>{formatCurrency(selectedQuo.total_amount)}</span></div>
              </div>

              <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Catatan: {selectedQuo.notes || '-'}</div>

              {/* Status Update Controls */}
              <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.3)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <button onClick={handlePrint} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginRight: 'auto' }}>
                  <Printer size={14} /> Cetak PDF
                </button>
                {selectedQuo.status === 'draft' && (
                  <button onClick={() => handleUpdateStatus(selectedQuo, 'sent')} className="btn btn-primary btn-sm">
                    Kirim ke Pelanggan (Sent)
                  </button>
                )}
                {selectedQuo.status === 'sent' && (
                  <>
                    <button onClick={() => handleUpdateStatus(selectedQuo, 'accepted')} className="btn btn-primary btn-sm" style={{ background: '#22c55e', color: '#020617' }}>
                      Setujui (Accepted)
                    </button>
                    <button onClick={() => handleUpdateStatus(selectedQuo, 'rejected')} className="btn btn-danger btn-sm">
                      Tolak (Rejected)
                    </button>
                  </>
                )}
                <button onClick={() => setIsDetailOpen(false)} className="btn btn-secondary btn-sm">
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


