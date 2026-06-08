'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { workOrderSchema, type WorkOrderFormValues } from '@/lib/validations/manufacturing'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase/supabase'
import { formatDate, generateCode } from '@/lib/utils'
import StatusBadge from '@/components/ui/StatusBadge'
import { Plus, Eye, Clock, AlertCircle, CheckCircle2, X, Loader2, Download } from 'lucide-react'
import type { WorkOrder, Product, BillOfMaterials, BomItem, Material } from '@/types/database'

type WorkOrderWithDetails = WorkOrder & {
  product?: Product;
  bom?: BillOfMaterials & {
    items?: (BomItem & { material?: Material })[]
  }
}
import { exportToCSV } from '@/lib/export'
import { formatMaterialLabel, formatProductLabel } from '@/lib/inventory-size'

const stages = ['Cutting', 'Sewing', 'Finishing', 'QC', 'Packaging']

function StageProgress({ status }: { status: string }) {
  const progressMap: Record<string, number> = {
    draft: 0,
    in_progress: 3,
    completed: 5,
    on_hold: 1,
    cancelled: 0,
  }
  const currentStage = progressMap[status] ?? 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      {stages.map((stage, i) => (
        <div key={stage} style={{ display: 'flex', alignItems: 'center' }}>
          <div
            title={stage}
            style={{
              width: '1.5rem',
              height: '1.5rem',
              borderRadius: '50%',
              background: i < currentStage ? '#c9a84c' : i === currentStage ? 'rgba(201,168,76,0.2)' : '#1e293b',
              border: i === currentStage ? '2px solid #c9a84c' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.5rem',
              color: i < currentStage ? '#020617' : '#64748b',
              cursor: 'help',
            }}
          >
            {i < currentStage ? '✓' : i + 1}
          </div>
          {i < stages.length - 1 && (
            <div style={{ width: '1rem', height: '1px', background: i < currentStage - 1 ? '#c9a84c' : '#1e293b' }} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function WorkOrdersPage() {
  const queryClient = useQueryClient()
  // const [loadingAction, setLoadingAction] = useState(false)

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedWO, setSelectedWO] = useState<WorkOrderWithDetails | null>(null)

  const form = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderSchema) as unknown as import('react-hook-form').Resolver<WorkOrderFormValues>,
    defaultValues: {
      product_id: '',
      bom_id: '',
      quantity: 1,
      target_date: '',
      order_type: 'ready_stock',
      notes: ''
    }
  })
  
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = form
  const watchProductId = useWatch({ control, name: 'product_id' })

  const { data, isLoading: loading } = useQuery({
    queryKey: ['work_orders_data'],
    queryFn: async () => {
      const [woRes, prodRes, bomRes] = await Promise.all([
        supabase
          .from('work_orders')
          .select('*, product:products(*), bom:bill_of_materials(*)')
          .order('created_at', { ascending: false }),
        supabase
          .from('products')
          .select('*')
          .eq('is_active', true),
        supabase
          .from('bill_of_materials')
          .select('*, product:products(*)')
          .eq('is_active', true)
      ])

      if (woRes.error) throw woRes.error
      if (prodRes.error) throw prodRes.error
      if (bomRes.error) throw bomRes.error

      return {
        workOrders: woRes.data || [],
        products: prodRes.data || [],
        boms: bomRes.data || []
      }
    }
  })

  const workOrders = data?.workOrders || []
  const products = data?.products || []
  const boms = data?.boms || []

  // Filter BOMs by selected product
  const availableBoms = boms.filter(b => b.product_id === watchProductId)

  // Handle Product Change in form
  const handleProductChange = (prodId: string) => {
    setValue('product_id', prodId)
    const matchedBoms = boms.filter(b => b.product_id === prodId)
    setValue('bom_id', matchedBoms[0]?.id || '')
  }

  // Open Create Modal
  const handleCreateOpen = () => {
    const defaultProduct = products[0]?.id || ''
    const matchedBoms = boms.filter(b => b.product_id === defaultProduct)
    
    reset({
      product_id: defaultProduct,
      bom_id: matchedBoms[0]?.id || '',
      quantity: 10,
      target_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days later
      order_type: 'ready_stock',
      notes: ''
    })
    setIsCreateOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: async (formData: WorkOrderFormValues) => {
      const wo_number = 'WO' + generateCode('')

      const { error } = await supabase
        .from('work_orders')
        .insert([{
          wo_number,
          product_id: formData.product_id,
          bom_id: formData.bom_id,
          quantity: formData.quantity,
          status: 'draft',
          order_type: formData.order_type,
          start_date: new Date().toISOString().split('T')[0],
          target_date: formData.target_date,
          notes: formData.notes || null
        }])

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work_orders_data'] })
      setIsCreateOpen(false)
    },
    onError: (err) => {
      console.error('Error creating WO:', err)
      alert('Gagal membuat Work Order')
    }
  })

  const onSubmit = (data: WorkOrderFormValues) => {
    createMutation.mutate(data)
  }

  const submitting = createMutation.isPending

  const handleViewDetails = async (wo: WorkOrder) => {
    try {
      // setLoadingAction(true)
      const { data, error } = await supabase
        .from('work_orders')
        .select('*, product:products(*), bom:bill_of_materials(*, items:bom_items(*, material:materials(*)))')
        .eq('id', wo.id)
        .single()

      if (error) throw error
      setSelectedWO(data)
      setIsDetailOpen(true)
    } catch (err) {
      console.error('Error fetching WO details:', err)
      alert('Gagal memuat detail Work Order')
    } finally {
      // setLoadingAction(false)
    }
  }

  const statusMutation = useMutation({
    mutationFn: async ({ wo, newStatus }: { wo: WorkOrderWithDetails, newStatus: 'in_progress' | 'completed' | 'cancelled' }) => {
      if (newStatus === 'completed') {
        const bomItems = wo.bom?.items || []

        const shortages: string[] = []
        for (const item of bomItems) {
          const totalNeeded = item.quantity * wo.quantity
          const stock = item.material?.current_stock ?? 0
          if (stock < totalNeeded) {
            shortages.push(
              `${formatMaterialLabel(item.material)}: butuh ${totalNeeded}, stok ${stock}`
            )
          }
        }
        if (shortages.length > 0) {
          throw new Error(`Stok bahan baku tidak cukup:\n${shortages.join('\n')}`)
        }

        for (const item of bomItems) {
          const qtyToDeduct = item.quantity * wo.quantity
          const { error: matMoveError } = await supabase
            .from('stock_movements')
            .insert([{
              material_id: item.material_id,
              movement_type: 'production_out',
              quantity: -qtyToDeduct,
              reference_id: wo.id,
              reference_type: 'work_order',
              notes: `Bahan baku produksi WO ${wo.wo_number}`,
              stock_before: 0,
              stock_after: 0
            }])
          if (matMoveError) throw matMoveError
        }

        const { error: prodMoveError } = await supabase
          .from('stock_movements')
          .insert([{
            product_id: wo.product_id,
            movement_type: 'production_in',
            quantity: wo.quantity,
            reference_id: wo.id,
            reference_type: 'work_order',
            notes: `Produk selesai dari WO ${wo.wo_number}`,
            stock_before: 0,
            stock_after: 0
          }])
        if (prodMoveError) throw prodMoveError
      }

      const { error: woError } = await supabase
        .from('work_orders')
        .update({
          status: newStatus,
          completed_date: newStatus === 'completed' ? new Date().toISOString().split('T')[0] : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', wo.id)

      if (woError) throw woError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work_orders_data'] })
      setIsDetailOpen(false)
    },
    onError: (err: Error) => {
      alert(err?.message || 'Gagal memproses perubahan status Work Order')
    }
  })

  const handleUpdateStatus = (wo: WorkOrderWithDetails, newStatus: 'in_progress' | 'completed' | 'cancelled') => {
    const confirmMsg = `Ubah status Work Order ke ${newStatus}?`
    if (!window.confirm(confirmMsg)) return
    statusMutation.mutate({ wo, newStatus })
  }

  const activeCount = workOrders.filter(wo => wo.status === 'in_progress').length
  const completedCount = workOrders.filter(wo => wo.status === 'completed').length
  const totalQty = workOrders.reduce((s, wo) => s + wo.quantity, 0)

  const handleExport = () => {
    const headers = ['No WO', 'Produk', 'Qty', 'Jenis Order', 'Tgl Mulai', 'Target Selesai', 'Status']
    const csvData = workOrders.map(wo => [
      wo.wo_number,
      wo.product?.name,
      wo.quantity,
      wo.order_type === 'ready_stock' ? 'Ready Stock' : 'Pre Order',
      formatDate(wo.start_date),
      formatDate(wo.target_date),
      wo.status
    ])
    exportToCSV(`work_orders_${new Date().toISOString().split('T')[0]}.csv`, headers, csvData)
  }

  return (
    <div className="page-modules">
      <div className="module-grid-stats">
        {[
          { label: 'Total Work Order', value: workOrders.length, color: '#c9a84c', icon: <Clock size={18} /> },
          { label: 'Sedang Berjalan', value: activeCount, color: '#3b82f6', icon: <AlertCircle size={18} /> },
          { label: 'Selesai', value: completedCount, color: '#22c55e', icon: <CheckCircle2 size={18} /> },
          { label: 'Total Unit', value: totalQty, color: '#a855f7', icon: <CheckCircle2 size={18} /> },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ background: `${s.color}18`, borderRadius: '0.5rem', padding: '0.375rem', color: s.color }}>{s.icon}</div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.label}</span>
            </div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 border-b border-slate-800">
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>Work Order Produksi</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Perintah kerja & tracking proses produksi</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleExport} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Download size={14} /> Export Excel
            </button>
            <button onClick={handleCreateOpen} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Plus size={14} /> Buat Work Order
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
            <Loader2 size={24} className="animate-spin text-[#c9a84c]" />
            <span>Memuat perintah kerja...</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>No. WO</th>
                  <th>Produk</th>
                  <th>Qty</th>
                  <th>Jenis Order</th>
                  <th>Tgl Mulai</th>
                  <th>Target Selesai</th>
                  <th>Tahapan Produksi</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data Work Order.</td>
                  </tr>
                ) : (
                  workOrders.map((wo) => (
                    <tr key={wo.id}>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#c9a84c', fontWeight: 600 }}>{wo.wo_number}</span></td>
                      <td>
                        <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{wo.product?.name}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{wo.product?.code}</div>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 700, color: '#f8f4ec' }}>{wo.quantity}</span>
                        <span style={{ fontSize: '0.6875rem', color: '#64748b' }}> pcs</span>
                      </td>
                      <td>
                        <span className={`badge ${wo.order_type === 'ready_stock' ? 'badge-neutral' : 'badge-gold'}`} style={{ fontSize: '0.625rem' }}>
                          {wo.order_type === 'ready_stock' ? 'Ready Stock' : 'Pre Order'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>{formatDate(wo.start_date)}</td>
                      <td style={{ fontSize: '0.8125rem' }}>{formatDate(wo.target_date)}</td>
                      <td><StageProgress status={wo.status} /></td>
                      <td><StatusBadge status={wo.status} /></td>
                      <td>
                        <button onClick={() => handleViewDetails(wo)} className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#94a3b8' }}>
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

      {/* Modal 1: Create WO */}
      {isCreateOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)',
          overflowY: 'auto', padding: '3rem 1rem 10rem 1rem'
        }}>
          <div className="glass-gold" style={{
            background: '#090d16', borderRadius: '1rem', width: '100%', maxWidth: '32rem',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden'
          }}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-slate-800/50">
              <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec' }}>Buat Work Order Baru</h3>
              <button onClick={() => setIsCreateOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            {/* Body */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="form-label">Pilih Produk Jadi *</label>
                <select
                  {...register('product_id')}
                  onChange={(e) => handleProductChange(e.target.value)}
                  className="input-base"
                  style={{ background: '#0f172a' }}
                >
                  <option value="" disabled>-- Pilih Produk --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {formatProductLabel(p)}
                    </option>
                  ))}
                </select>
                <FormError message={errors.product_id?.message} />
              </div>

              <div>
                <label className="form-label">Pilih Bill of Materials (BOM) *</label>
                <select {...register('bom_id')} className="input-base" style={{ background: '#0f172a' }}>
                  <option value="" disabled>-- Pilih BOM Recipe --</option>
                  {availableBoms.map(b => <option key={b.id} value={b.id}>Versi {b.version} ({b.notes || 'Aktif'})</option>)}
                </select>
                <FormError message={errors.bom_id?.message} />
                {watchProductId && availableBoms.length === 0 && (
                  <span style={{ fontSize: '0.6875rem', color: '#ef4444', marginTop: '0.25rem', display: 'block' }}>
                    Peringatan: Produk ini tidak memiliki BOM aktif. Buat BOM dulu di modul Manufaktur.
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Kuantitas Produksi (Pcs) *</label>
                  <input type="number" {...register('quantity')} className="input-base" />
                  <FormError message={errors.quantity?.message} />
                </div>
                <div>
                  <label className="form-label">Tipe Order *</label>
                  <select {...register('order_type')} className="input-base" style={{ background: '#0f172a' }}>
                    <option value="ready_stock">Ready Stock (Restock Gudang)</option>
                    <option value="pre_order">Pre-Order (Pesanan Khusus)</option>
                  </select>
                  <FormError message={errors.order_type?.message} />
                </div>
              </div>

              <div>
                <label className="form-label">Target Tanggal Selesai *</label>
                <input type="date" {...register('target_date')} className="input-base" />
                <FormError message={errors.target_date?.message} />
              </div>

              <div>
                <label className="form-label">Catatan</label>
                <input type="text" {...register('notes')} className="input-base" placeholder="Catatan instruksi produksi..." />
                <FormError message={errors.notes?.message} />
              </div>

              {/* Footer */}
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.3)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setIsCreateOpen(false)} className="btn btn-secondary btn-sm" disabled={submitting}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} disabled={submitting}>
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Mulai Produksi (Draft)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Details & Status Process */}
      {isDetailOpen && selectedWO && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)',
          overflowY: 'auto', padding: '3rem 1rem 10rem 1rem'
        }}>
          <div className="glass-gold" style={{
            background: '#090d16', borderRadius: '1rem', width: '100%', maxWidth: '36rem',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflowY: 'auto', maxHeight: 'calc(100vh - 3rem)'
          }}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-slate-800/50">
              <div>
                <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Detail Work Order <span style={{ fontFamily: 'monospace', color: '#c9a84c' }}>{selectedWO.wo_number}</span>
                </h3>
                <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.125rem' }}>Mulai: {formatDate(selectedWO.start_date || '')} · Target: {formatDate(selectedWO.target_date || '')}</div>
              </div>
              <button onClick={() => setIsDetailOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            {/* Body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" style={{ background: '#050811', padding: '1rem', borderRadius: '0.5rem'}}>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase' }}>Produk Jadi</div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#e2e8f0', marginTop: '0.25rem' }}>{selectedWO.product?.name}</div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Qty: {selectedWO.quantity} pcs</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase' }}>Resep (BOM)</div>
                  <div style={{ fontSize: '0.8125rem', color: '#cbd5e1', marginTop: '0.25rem' }}>BOM Versi {selectedWO.bom?.version || 'Aktif'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#64748b', textTransform: 'uppercase' }}>Status</div>
                  <div style={{ marginTop: '0.25rem' }}>
                    <StatusBadge status={selectedWO.status} />
                  </div>
                </div>
              </div>

              {/* Component breakdown based on BOM */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8', marginBottom: '0.5rem' }}>Kebutuhan Bahan Baku Produksi</div>
                <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {selectedWO.bom?.items?.map((item, idx: number) => {
                    const totalNeeded = item.quantity * selectedWO.quantity
                    const hasStock = (item.material?.current_stock || 0) >= totalNeeded

                    return (
                      <div key={idx} style={{
                        display: 'flex', justifySelf: 'stretch', justifyContent: 'space-between',
                        padding: '0.5rem', background: '#050811', borderRadius: '0.375rem', fontSize: '0.75rem'
                      }}>
                        <div>
                          <div style={{ fontWeight: 500, color: '#cbd5e1' }}>
                            {formatMaterialLabel(item.material, { includeCode: false })}
                          </div>
                          <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Per unit: {item.quantity} {item.unit}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 600, color: '#f8f4ec' }}>Total: {totalNeeded} {item.unit}</div>
                          <div style={{ fontSize: '0.6875rem', color: hasStock ? '#22c55e' : '#ef4444' }}>
                            Stok saat ini: {item.material?.current_stock}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {selectedWO.notes && <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Catatan: {selectedWO.notes}</div>}

              {/* Status Update Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.3)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                {selectedWO.status === 'draft' && (
                  <button onClick={() => handleUpdateStatus(selectedWO, 'in_progress')} className="btn btn-primary btn-sm">
                    Mulai Produksi (In Progress)
                  </button>
                )}
                {selectedWO.status === 'in_progress' && (
                  <>
                    <button onClick={() => handleUpdateStatus(selectedWO, 'completed')} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#22c55e', color: '#020617' }}>
                      <CheckCircle2 size={14} /> Selesaikan Produksi
                    </button>
                    <button onClick={() => handleUpdateStatus(selectedWO, 'cancelled')} className="btn btn-danger btn-sm">
                      Batalkan WO
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


