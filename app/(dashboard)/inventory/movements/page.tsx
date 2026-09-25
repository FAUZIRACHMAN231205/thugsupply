'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { stockMovementSchema, type StockMovementFormValues } from '@/lib/validations/inventory'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase/supabase'
import { useToast } from '@/components/ui/Toast'
import { formatDatetime, formatNumber } from '@/lib/utils'
import { TrendingUp, TrendingDown, Plus, X, Loader2, Download } from 'lucide-react'

import { exportToCSV } from '@/lib/export'
import { formatMaterialLabel, formatProductLabel } from '@/lib/inventory-size'
import SizeBadge from '@/components/ui/SizeBadge'

const movementLabels: Record<string, string> = {
  purchase_in: 'Pembelian Masuk',
  sale_out: 'Penjualan Keluar',
  production_in: 'Produksi Masuk',
  production_out: 'Produksi Keluar',
  adjustment: 'Penyesuaian',
}

export default function MovementsPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  
  const form = useForm<StockMovementFormValues>({
    resolver: zodResolver(stockMovementSchema) as unknown as import('react-hook-form').Resolver<StockMovementFormValues>,
    defaultValues: {
      item_type: 'material',
      item_id: '',
      quantity: 0,
      notes: ''
    }
  })
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = form
  const watchItemType = useWatch({ control, name: 'item_type' })

  const { data, isLoading: loading } = useQuery({
    queryKey: ['movements_data'],
    queryFn: async () => {
      const [moveRes, matRes, prodRes] = await Promise.all([
        supabase
          .from('stock_movements')
          .select('*, material:materials(*), product:products(*)')
          .order('created_at', { ascending: false }),
        supabase
          .from('materials')
          .select('*')
          .eq('is_active', true),
        supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
      ])

      if (moveRes.error) throw moveRes.error
      if (matRes.error) throw matRes.error
      if (prodRes.error) throw prodRes.error

      return {
        movements: moveRes.data || [],
        materials: matRes.data || [],
        products: prodRes.data || []
      }
    }
  })

  const movements = data?.movements || []
  const materials = data?.materials || []
  const products = data?.products || []

  // Open modal
  const handleOpenModal = () => {
    reset({
      item_type: 'material',
      item_id: materials[0]?.id || '',
      quantity: 0,
      notes: ''
    })
    setIsOpen(true)
  }

  // Handle item type change in modal
  const handleItemTypeChange = (type: 'material' | 'product') => {
    setValue('item_type', type)
    if (type === 'material') {
      setValue('item_id', materials[0]?.id || '')
    } else {
      setValue('item_id', products[0]?.id || '')
    }
  }

  const adjustMutation = useMutation({
    mutationFn: async (formData: StockMovementFormValues) => {
      const movementRow: Partial<import('@/types/database').StockMovement> = {
        movement_type: 'adjustment',
        quantity: formData.quantity,
        notes: formData.notes || 'Manual Adjustment'
      }

      if (formData.item_type === 'material') {
        movementRow.material_id = formData.item_id
      } else {
        movementRow.product_id = formData.item_id
      }

      const { error } = await supabase
        .from('stock_movements')
        .insert([movementRow])

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movements_data'] })
      setIsOpen(false)
    },
    onError: (err) => {
      console.error('Error creating adjustment:', err)
      toast.error(err?.message || 'Gagal membuat penyesuaian stok')
    }
  })

  const onSubmit = (data: StockMovementFormValues) => {
    adjustMutation.mutate(data)
  }

  const submitting = adjustMutation.isPending

  const handleExport = () => {
    const headers = ['Tanggal', 'Barang / Material', 'Kode', 'Tipe Inventori', 'Jenis Mutasi', 'Kuantitas', 'Stok Sebelum', 'Stok Sesudah', 'Catatan']
    const csvData = movements.map(mv => {
      const isMaterial = !!mv.material_id
      const name = isMaterial ? mv.material?.name : mv.product?.name
      const code = isMaterial ? mv.material?.code : mv.product?.code
      const tipeMutasi = movementLabels[mv.movement_type] || mv.movement_type
      
      return [
        formatDatetime(mv.created_at),
        name,
        code,
        isMaterial ? 'Bahan Baku' : 'Produk Jadi',
        tipeMutasi,
        mv.quantity,
        mv.stock_before,
        mv.stock_after,
        mv.notes || ''
      ]
    })
    exportToCSV(`stock_movements_${new Date().toISOString().split('T')[0]}.csv`, headers, csvData)
  }

  return (
    <div className="page-modules">
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 border-b border-slate-800">
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>Mutasi Stok</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Riwayat pergerakan stok bahan baku & produk jadi</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleExport} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Download size={14} /> Export Excel
            </button>
            <button onClick={handleOpenModal} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Plus size={14} /> Adjustment Stok
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
                  <th>Tanggal</th>
                  <th>Barang / Material</th>
                  <th>Tipe</th>
                  <th>Jenis Mutasi</th>
                  <th>Catatan / Ref</th>
                  <th>Kuantitas</th>
                  <th>Stok Sebelum</th>
                  <th>Stok Sesudah</th>
                </tr>
              </thead>
              <tbody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data mutasi stok.</td>
                  </tr>
                ) : (
                  movements.map((mv) => {
                    const isIn = mv.quantity > 0
                    const isMaterial = !!mv.material_id
                    const label = isMaterial
                      ? formatMaterialLabel(mv.material, { includeCode: false })
                      : formatProductLabel(mv.product, { includeCode: false })
                    const code = isMaterial ? mv.material?.code : mv.product?.code
                    const itemSize = isMaterial ? mv.material?.size : mv.product?.size

                    return (
                      <tr key={mv.id}>
                        <td style={{ fontSize: '0.75rem' }}>{formatDatetime(mv.created_at)}</td>
                        <td>
                          <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{label || 'Unknown'}</div>
                          <div style={{ fontSize: '0.6875rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            {code}
                            {itemSize && <SizeBadge size={itemSize} />}
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${isMaterial ? 'badge-gold' : 'badge-neutral'}`} style={{ fontSize: '0.625rem' }}>
                            {isMaterial ? 'Bahan Baku' : 'Produk Jadi'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${isIn ? 'badge-success' : 'badge-danger'}`} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content' }}>
                            {isIn ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {movementLabels[mv.movement_type]}
                          </span>
                        </td>
                        <td>
                          {mv.notes && <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>{mv.notes}</span>}
                        </td>
                        <td>
                          <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', fontWeight: 700, color: isIn ? '#22c55e' : '#ef4444' }}>
                            {isIn ? '+' : ''}{formatNumber(mv.quantity)}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>{formatNumber(mv.stock_before)}</td>
                        <td style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#e2e8f0' }}>{formatNumber(mv.stock_after)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialog: Adjustment Stok */}
      {isOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)',
          overflowY: 'auto', padding: '3rem 1rem 10rem 1rem'
        }}>
          <div className="glass-gold" style={{
            background: '#090d16', borderRadius: '1rem', width: '100%', maxWidth: '32rem',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', margin: '0 auto'
          }}>
            {/* Header — tetap di atas */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-slate-800/50">
              <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec' }}>
                Adjustment / Penyesuaian Stok
              </h3>
              <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} className="hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Body — scrollable */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',  }}>
              <div>
                <label className="form-label">Tipe Inventori</label>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                    <input type="radio" value="material" {...register('item_type')} onChange={() => handleItemTypeChange('material')} />
                    Bahan Baku (Material)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                    <input type="radio" value="product" {...register('item_type')} onChange={() => handleItemTypeChange('product')} />
                    Produk Jadi (Product)
                  </label>
                </div>
              </div>

              <div>
                <label className="form-label">Pilih Item *</label>
                <select {...register('item_id')} className="input-base" style={{ background: '#0f172a' }}>
                  <option value="" disabled>-- Pilih --</option>
                  {watchItemType === 'material' ? (
                    materials.map(m => (
                      <option key={m.id} value={m.id}>
                        {formatMaterialLabel(m, { stock: m.current_stock })}
                      </option>
                    ))
                  ) : (
                    products.map(p => (
                      <option key={p.id} value={p.id}>
                        {formatProductLabel(p, { stock: p.current_stock })}
                      </option>
                    ))
                  )}
                </select>
                <FormError message={errors.item_id?.message} />
              </div>

              <div>
                <label className="form-label">Kuantitas Penyesuaian *</label>
                <input
                  type="number"
                  {...register('quantity')}
                  className="input-base"
                  placeholder="Gunakan tanda minus (-) untuk mengurangi stok"
                />
                <FormError message={errors.quantity?.message} />
                <span style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                  Contoh: +10 untuk menambah stok, -5 untuk mengurangi stok.
                </span>
              </div>

              <div>
                <label className="form-label">Keterangan / Alasan Penyesuaian</label>
                <input
                  type="text"
                  {...register('notes')}
                  className="input-base"
                  placeholder="Contoh: Stok opname Mei 2026, Penemuan barang rusak"
                />
                <FormError message={errors.notes?.message} />
              </div>

              {/* Footer */}
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.3)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setIsOpen(false)} className="btn btn-secondary btn-sm" disabled={submitting}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} disabled={submitting}>
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Simpan Penyesuaian
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


