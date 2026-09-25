'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { purchaseOrderSchema, type PurchaseOrderFormValues } from '@/lib/validations/inventory'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase/supabase'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import StatusBadge from '@/components/ui/StatusBadge'
import { Plus, Eye, CheckCircle, XCircle, X, Loader2, Trash2, Download, Wallet } from 'lucide-react'
import type { PurchaseOrder, PurchaseOrderItem, Material } from '@/types/database'
import { exportToCSV } from '@/lib/export'
import { invalidatePostingQueries } from '@/lib/invalidate-posting'
import { formatMaterialLabel } from '@/lib/inventory-size'

export default function PurchaseOrdersPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  
  const form = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderSchema) as unknown as import('react-hook-form').Resolver<PurchaseOrderFormValues>,
    defaultValues: {
      supplier_id: '',
      order_date: new Date().toISOString().split('T')[0],
      expected_date: '',
      payment_term: 'credit',
      notes: '',
      items: []
    }
  })
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = form
  const { fields: itemFields, append, remove } = useFieldArray({
    control,
    name: 'items'
  })
  const watchItems = useWatch({ control, name: 'items' }) || []

  const { data, isLoading: loading } = useQuery({
    queryKey: ['purchase_orders_data'],
    queryFn: async () => {
      const [posRes, supsRes, matsRes] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select('*, supplier:suppliers(*), items:purchase_order_items(*, material:materials(*))')
          .order('created_at', { ascending: false }),
        supabase
          .from('suppliers')
          .select('*')
          .eq('is_active', true),
        supabase
          .from('materials')
          .select('*')
          .eq('is_active', true)
      ])

      if (posRes.error) throw posRes.error
      if (supsRes.error) throw supsRes.error
      if (matsRes.error) throw matsRes.error

      return {
        purchaseOrders: posRes.data || [],
        suppliers: supsRes.data || [],
        materials: matsRes.data || []
      }
    }
  })

  const purchaseOrders = data?.purchaseOrders || []
  const suppliers = data?.suppliers || []
  const materials = data?.materials || []

  // Open Create Modal
  const handleCreateOpen = () => {
    reset({
      supplier_id: suppliers[0]?.id || '',
      order_date: new Date().toISOString().split('T')[0],
      expected_date: '',
      payment_term: 'credit',
      notes: '',
      items: [{ material_id: materials[0]?.id || '', quantity: 1, unit_price: materials[0]?.cost_price || 0 }]
    })
    setIsCreateOpen(true)
  }

  // Handle adding PO item row
  const handleAddItemRow = () => {
    const defaultMat = materials[0]
    append({ material_id: defaultMat?.id || '', quantity: 1, unit_price: defaultMat?.cost_price || 0 })
  }

  // Handle changing PO item field specifically for material_id to auto-update price
  const handleMaterialChange = (index: number, materialId: string) => {
    const mat = materials.find(m => m.id === materialId)
    setValue(`items.${index}.material_id`, materialId)
    if (mat) {
      setValue(`items.${index}.unit_price`, mat.cost_price)
    }
  }

  // Calculate PO Total
  const calculateTotal = () => {
    return watchItems?.reduce((sum, item) => sum + ((Number(item.quantity)||0) * (Number(item.unit_price)||0)), 0) || 0
  }

  const createMutation = useMutation({
    mutationFn: async (formData: PurchaseOrderFormValues) => {
      const total_amount = calculateTotal()

      const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .insert([{
          supplier_id: formData.supplier_id,
          order_date: formData.order_date,
          expected_date: formData.expected_date || null,
          payment_term: formData.payment_term,
          status: 'draft',
          notes: formData.notes || null,
          total_amount
        }])
        .select()

      if (poError) throw poError
      const newPO = poData[0]

      const itemsToInsert = formData.items.map(item => ({
        purchase_order_id: newPO.id,
        material_id: item.material_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        received_quantity: 0
      }))

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(itemsToInsert)

      if (itemsError) throw itemsError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_orders_data'] })
      setIsCreateOpen(false)
    },
    onError: (err) => {
      console.error('Error saving PO:', err)
      toast.error('Gagal membuat Purchase Order')
    }
  })

  const onSubmit = (data: PurchaseOrderFormValues) => {
      createMutation.mutate(data)
  }

  const submitting = createMutation.isPending

  // Open Details Modal
  const handleViewDetails = (po: PurchaseOrder) => {
    setSelectedPO(po)
    setIsDetailOpen(true)
  }

  const statusMutation = useMutation({
    mutationFn: async ({ po, newStatus }: { po: PurchaseOrder, newStatus: 'sent' | 'confirmed' | 'received' | 'cancelled' }) => {
      if (newStatus === 'received') {
        // Stok masuk + status PO diproses atomik di database (lihat migration 007)
        const { error } = await supabase.rpc('receive_purchase_order', { p_po_id: po.id })
        if (error) throw error
        return
      }

      const { error: poError } = await supabase
        .from('purchase_orders')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', po.id)

      if (poError) throw poError
    },
    onSuccess: (_data, { newStatus }) => {
      invalidatePostingQueries(queryClient)
      setIsDetailOpen(false)
      toast.success(newStatus === 'received'
        ? 'Barang diterima, stok dan jurnal sudah diperbarui.'
        : `Status Purchase Order diubah ke ${newStatus}.`)
    },
    onError: (err) => {
      console.error('Error updating PO status:', err)
      toast.error(err?.message || 'Gagal memperbarui status Purchase Order')
    }
  })

  const handleUpdateStatus = async (po: PurchaseOrder, newStatus: 'sent' | 'confirmed' | 'received' | 'cancelled') => {
    const ok = await confirm({
      title: newStatus === 'received' ? 'Terima Barang' : 'Ubah Status PO',
      message: newStatus === 'received'
        ? `Tandai PO ${po.po_number} sebagai diterima? Stok bahan baku akan bertambah dan jurnal penerimaan dibuat otomatis.`
        : `Ubah status PO ${po.po_number} ke ${newStatus}?`,
      confirmLabel: newStatus === 'received' ? 'Terima Barang' : 'Ubah Status',
      danger: newStatus === 'cancelled',
    })
    if (!ok) return
    
    statusMutation.mutate({ po, newStatus })
  }

  const payMutation = useMutation({
    mutationFn: async (po: PurchaseOrder) => {
      // Jurnal Hutang Usaha / Kas + tanda lunas diproses atomik di database (lihat migration 009)
      const { error } = await supabase.rpc('pay_purchase_order', { p_po_id: po.id })
      if (error) throw error
    },
    onSuccess: () => {
      invalidatePostingQueries(queryClient)
      setIsDetailOpen(false)
      toast.success('Pelunasan ke supplier tercatat.')
    },
    onError: (err) => {
      console.error('Error paying PO:', err)
      toast.error(err?.message || 'Gagal mencatat pembayaran ke supplier')
    }
  })

  const handlePaySupplier = async (po: PurchaseOrder) => {
    const ok = await confirm({
      title: 'Bayar ke Supplier',
      message: `Catat pelunasan PO ${po.po_number} sebesar ${formatCurrency(po.total_amount)} ke supplier?`,
      confirmLabel: 'Catat Pelunasan',
    })
    if (!ok) return
    payMutation.mutate(po)
  }

  const totalPending = purchaseOrders.filter(po => ['sent', 'confirmed'].includes(po.status))
  const totalValue = purchaseOrders.reduce((s, po) => s + po.total_amount, 0)

  const handleExport = () => {
    const headers = ['No PO', 'Supplier', 'Tanggal Order', 'Estimasi Kedatangan', 'Status', 'Total Nilai']
    const csvData = purchaseOrders.map(po => [
      po.po_number,
      po.supplier?.name,
      formatDate(po.order_date),
      po.expected_date ? formatDate(po.expected_date) : '',
      po.status,
      po.total_amount
    ])
    exportToCSV(`purchase_orders_${new Date().toISOString().split('T')[0]}.csv`, headers, csvData)
  }

  return (
    <div className="page-modules">
      <div className="module-grid-stats">
        {[
          { label: 'Total PO', value: purchaseOrders.length, color: '#c9a84c' },
          { label: 'PO Pending', value: totalPending.length, color: '#f59e0b' },
          { label: 'PO Diterima', value: purchaseOrders.filter(p => p.status === 'received').length, color: '#22c55e' },
          { label: 'Total Nilai PO', value: formatCurrency(totalValue), color: '#3b82f6' },
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
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>Purchase Order</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Daftar semua purchase order ke supplier</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleExport} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Download size={14} /> Export Excel
            </button>
            <button onClick={handleCreateOpen} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Plus size={14} /> Buat PO Baru
            </button>
          </div>
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
                  <th>No. PO</th>
                  <th>Supplier</th>
                  <th>Tanggal Order</th>
                  <th>Exp. Terima</th>
                  <th>Total Nilai</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data Purchase Order.</td>
                  </tr>
                ) : (
                  purchaseOrders.map((po) => (
                    <tr key={po.id}>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#c9a84c', fontWeight: 600 }}>{po.po_number}</span></td>
                      <td>
                        <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{po.supplier?.name}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{po.supplier?.city}</div>
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>{formatDate(po.order_date)}</td>
                      <td style={{ fontSize: '0.8125rem' }}>{po.expected_date ? formatDate(po.expected_date) : '-'}</td>
                      <td><span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', fontWeight: 700 }}>{formatCurrency(po.total_amount)}</span></td>
                      <td><StatusBadge status={po.status} /></td>
                      <td>
                        <button onClick={() => handleViewDetails(po)} className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#94a3b8' }}>
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

      {/* Modal 1: Create PO */}
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
              <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec' }}>Buat Purchase Order Baru</h3>
              <button onClick={() => setIsCreateOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {/* Body — scrollable */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',  }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="form-label">Pilih Supplier *</label>
                  <select {...register('supplier_id')} className="input-base" style={{ background: '#0f172a' }}>
                    <option value="" disabled>-- Pilih Supplier --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                  <FormError message={errors.supplier_id?.message} />
                </div>
                <div>
                  <label className="form-label">Tanggal Estimasi Terima</label>
                  <input type="date" {...register('expected_date')} className="input-base" />
                  <FormError message={errors.expected_date?.message} />
                </div>
                <div>
                  <label className="form-label">Pembayaran *</label>
                  <select {...register('payment_term')} className="input-base" style={{ background: '#0f172a' }}>
                    <option value="credit">Tempo (Hutang)</option>
                    <option value="cash">Tunai saat diterima</option>
                  </select>
                  <FormError message={errors.payment_term?.message} />
                </div>
              </div>

              <div>
                <label className="form-label">Catatan PO</label>
                <input type="text" {...register('notes')} className="input-base" placeholder="Catatan tambahan untuk PO..." />
                <FormError message={errors.notes?.message} />
              </div>

              {/* Items Section */}
              <div style={{ border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '1rem', background: '#050811' }}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-3">
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8' }}>Daftar Item Material</span>
                  <button type="button" onClick={handleAddItemRow} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}>+ Tambah Row</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {itemFields.map((item, index) => (
                    <div key={item.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                      <div style={{ flex: 2 }}>
                        <select
                          {...register(`items.${index}.material_id`)}
                          onChange={(e) => handleMaterialChange(index, e.target.value)}
                          className="input-base"
                          style={{ background: '#0f172a' }}
                        >
                          <option value="" disabled>-- Pilih Material --</option>
                          {materials.map(m => (
                            <option key={m.id} value={m.id}>
                              {formatMaterialLabel(m)} — {formatCurrency(m.cost_price)}/{m.unit}
                            </option>
                          ))}
                        </select>
                        <FormError message={errors.items?.[index]?.material_id?.message} />
                      </div>
                      
                      <div style={{ flex: 1 }}>
                        <input
                          type="number"
                          min={1}
                          {...register(`items.${index}.quantity`)}
                          className="input-base"
                          placeholder="Qty"
                        />
                        <FormError message={errors.items?.[index]?.quantity?.message} />
                      </div>

                      <div style={{ flex: 1.5 }}>
                        <input
                          type="number"
                          min={0}
                          {...register(`items.${index}.unit_price`)}
                          className="input-base"
                          placeholder="Harga Satuan"
                        />
                        <FormError message={errors.items?.[index]?.unit_price?.message} />
                      </div>

                      <button
                        type="button"
                        onClick={() => remove(index)}
                        disabled={itemFields.length === 1}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: itemFields.length === 1 ? 'not-allowed' : 'pointer', padding: '0.25rem', marginTop: '0.5rem' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <FormError message={errors.items?.message} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', borderTop: '1px solid #1e293b', paddingTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>
                    Total Estimasi: <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 700, color: '#c9a84c' }}>{formatCurrency(calculateTotal())}</span>
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
                  Simpan PO (Draft)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: View Details & Actions */}
      {isDetailOpen && selectedPO && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)',
          overflowY: 'auto', padding: '3rem 1rem 10rem 1rem'
        }}>
          <div className="glass-gold" style={{
            background: '#090d16', borderRadius: '1rem', width: '100%', maxWidth: '38rem',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', margin: '0 auto'
          }}>
            {/* Header — tetap di atas */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-slate-800/50">
              <div>
                <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Detail PO <span style={{ fontFamily: 'monospace', color: '#c9a84c' }}>{selectedPO.po_number}</span>
                </h3>
                <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.125rem' }}>Dibuat pada {formatDate(selectedPO.order_date)}</div>
              </div>
              <button onClick={() => setIsDetailOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            {/* Body — scrollable */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',  }}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ background: '#050811', padding: '1rem', borderRadius: '0.5rem'}}>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplier</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0', marginTop: '0.25rem' }}>{selectedPO.supplier?.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{selectedPO.supplier?.contact_person} | {selectedPO.supplier?.phone}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status Saat Ini</div>
                  <div style={{ marginTop: '0.25rem' }}>
                    <StatusBadge status={selectedPO.status} />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pembayaran</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0', marginTop: '0.25rem' }}>
                    {selectedPO.payment_term === 'cash' ? 'Tunai' : 'Tempo (Hutang)'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: selectedPO.paid_at ? '#22c55e' : '#64748b' }}>
                    {selectedPO.paid_at
                      ? `Lunas ${formatDate(selectedPO.paid_at)}`
                      : selectedPO.status === 'received' ? 'Belum lunas' : 'Dibayar saat/setelah barang diterima'}
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem', fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase' }}>Material</th>
                      <th style={{ padding: '0.5rem', fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Qty Order</th>
                      <th style={{ padding: '0.5rem', fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Qty Diterima</th>
                      <th style={{ padding: '0.5rem', fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Harga Satuan</th>
                      <th style={{ padding: '0.5rem', fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPO.items?.map((item: PurchaseOrderItem & { material?: Material }) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(30, 41, 59, 0.4)' }}>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem' }}>
                          <div style={{ fontWeight: 500, color: '#e2e8f0' }}>
                            {formatMaterialLabel(item.material, { includeCode: false })}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{item.material?.code}</div>
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem', textAlign: 'right', color: '#cbd5e1' }}>{item.quantity} {item.material?.unit}</td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem', textAlign: 'right', color: item.received_quantity > 0 ? '#22c55e' : '#64748b' }}>
                          {item.received_quantity || 0} {item.material?.unit}
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem', textAlign: 'right', color: '#cbd5e1' }}>{formatCurrency(item.unit_price)}</td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8125rem', textAlign: 'right', fontWeight: 600, color: '#f8f4ec' }}>{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #1e293b', paddingTop: '1rem', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Catatan: {selectedPO.notes || '-'}</span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Total: <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 700, color: '#c9a84c' }}>{formatCurrency(selectedPO.total_amount)}</span></span>
              </div>

              {/* Action Buttons for PO Process */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.3)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                {selectedPO.status === 'draft' && (
                  <button onClick={() => handleUpdateStatus(selectedPO, 'sent')} className="btn btn-primary btn-sm">
                    Kirim ke Supplier (Sent)
                  </button>
                )}
                {selectedPO.status === 'sent' && (
                  <button onClick={() => handleUpdateStatus(selectedPO, 'confirmed')} className="btn btn-primary btn-sm">
                    Konfirmasi PO (Confirmed)
                  </button>
                )}
                {['sent', 'confirmed'].includes(selectedPO.status) && (
                  <button onClick={() => handleUpdateStatus(selectedPO, 'received')} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#22c55e', color: '#020617' }}>
                    <CheckCircle size={14} /> Terima Barang (Received)
                  </button>
                )}
                {selectedPO.status === 'received' && selectedPO.payment_term === 'credit' && !selectedPO.paid_at && (
                  <button onClick={() => handlePaySupplier(selectedPO)} disabled={payMutation.isPending} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {payMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />} Bayar ke Supplier
                  </button>
                )}
                {!['received', 'cancelled'].includes(selectedPO.status) && (
                  <button onClick={() => handleUpdateStatus(selectedPO, 'cancelled')} className="btn btn-danger btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <XCircle size={14} /> Batalkan PO
                  </button>
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


