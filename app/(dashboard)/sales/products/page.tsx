'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { productSchema, type ProductFormValues } from '@/lib/validations/sales'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase/supabase'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { formatCurrency, generateCode } from '@/lib/utils'
import { openFormModal } from '@/lib/open-form-modal'
import { Plus, Edit2, Trash2, X, Loader2, Download } from 'lucide-react'
import type { Product } from '@/types/database'
import { exportToCSV } from '@/lib/export'
import SizeBadge from '@/components/ui/SizeBadge'
import {
  MATERIAL_SIZE_OPTIONS,
  normalizeSize,
  isDuplicateProductVariant,
} from '@/lib/inventory-size'

export default function ProductsPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  
  // Modal states
  const [isOpen, setIsOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema) as unknown as import('react-hook-form').Resolver<ProductFormValues>,
    defaultValues: {
      code: '',
      name: '',
      description: '',
      size: '',
      category: 'T-Shirt',
      unit: 'pcs',
      selling_price: 0,
      cost_price: 0,
      reorder_point: 0,
      current_stock: 0,
      is_active: true,
    }
  })
  const { register, handleSubmit, reset, formState: { errors } } = form
  const { data: products = [], isLoading: loading } = useQuery({
    queryKey: ['products_data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    }
  })

  // Open modal for add
  const handleAddOpen = () => {
    openFormModal(setIsOpen, () => {
      setEditingProduct(null)
      reset({
        code: generateCode('PRD'),
        name: '',
        description: '',
        size: 'M',
        category: 'T-Shirt',
        unit: 'pcs',
        selling_price: 0,
        cost_price: 0,
        reorder_point: 0,
        current_stock: 0,
        is_active: true,
      })
    })
  }

  const handleEditOpen = (product: Product) => {
    setEditingProduct(product)
    openFormModal(setIsOpen, () => {
      reset({
        code: product.code,
        name: product.name,
        description: product.description || '',
        size: (product.size || '') as ProductFormValues['size'],
        category: product.category || 'T-Shirt',
        unit: product.unit,
        selling_price: product.selling_price,
        cost_price: product.cost_price,
        reorder_point: product.reorder_point,
        current_stock: 0,
        is_active: product.is_active,
      })
    })
  }

  const saveMutation = useMutation({
    mutationFn: async (formData: ProductFormValues) => {
      const initialStock = formData.current_stock || 0
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { current_stock, ...restData } = formData
      const payload = { ...restData, size: normalizeSize(restData.size) }

      if (
        isDuplicateProductVariant(
          products,
          payload.name,
          payload.size,
          editingProduct?.id
        )
      ) {
        throw new Error(
          'Produk dengan nama dan ukuran yang sama sudah ada. Buat baris terpisah per ukuran.'
        )
      }

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProduct.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert([{ ...payload, current_stock: 0 }])
          .select()
        if (error) throw error
        
        if (Number(initialStock) > 0 && data && data[0]) {
          const { error: moveError } = await supabase
            .from('stock_movements')
            .insert([{
              product_id: data[0].id,
              movement_type: 'adjustment',
              quantity: Number(initialStock),
              notes: 'Stok awal produk baru',
              stock_before: 0,
              stock_after: Number(initialStock)
            }])
          if (moveError) throw moveError
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products_data'] })
      setIsOpen(false)
    },
    onError: (err) => {
      console.error('Error saving product:', err)
      toast.error('Gagal menyimpan data produk')
    }
  })

  const onSubmit = (data: ProductFormValues) => {
    saveMutation.mutate({
      ...data,
      ...(editingProduct ? { updated_at: new Date().toISOString() } : {})
    })
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products_data'] })
    },
    onError: (err) => {
      console.error('Error deleting product:', err)
      toast.error('Gagal menghapus produk. Kemungkinan sudah digunakan dalam transaksi.')
    }
  })

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Hapus Produk',
      message: 'Apakah Anda yakin ingin menghapus produk ini?',
      confirmLabel: 'Hapus',
      danger: true,
    })
    if (!ok) return
    deleteMutation.mutate(id)
  }

  const submitting = saveMutation.isPending

  const totalStockValue = products.reduce((s, p) => s + (p.current_stock * p.cost_price), 0)
  const totalRevPotential = products.reduce((s, p) => s + (p.current_stock * p.selling_price), 0)

  const handleExport = () => {
    const headers = ['Kode', 'Nama Produk', 'Ukuran', 'Kategori', 'Satuan', 'Harga Pokok', 'Harga Jual', 'Stok Min', 'Stok Saat Ini', 'Status']
    const csvData = products.map(prod => [
      prod.code,
      prod.name,
      prod.size || '',
      prod.category,
      prod.unit,
      prod.cost_price,
      prod.selling_price,
      prod.reorder_point,
      prod.current_stock,
      prod.is_active ? 'Aktif' : 'Nonaktif'
    ])
    exportToCSV(`products_export_${new Date().toISOString().split('T')[0]}.csv`, headers, csvData)
  }

  return (
    <div className="page-modules">
      <div className="module-grid-stats">
        {[
          { label: 'Total SKU', value: products.length, color: '#c9a84c' },
          { label: 'Stok Rendah', value: products.filter(p => p.current_stock <= p.reorder_point).length, color: '#ef4444' },
          { label: 'Nilai Stok (HPP)', value: formatCurrency(totalStockValue), color: '#3b82f6' },
          { label: 'Potensi Penjualan', value: formatCurrency(totalRevPotential), color: '#22c55e' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.5rem' }}>{s.label}</div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 border-b border-slate-800">
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>Master Produk</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Semua produk jadi Thug Supply</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleExport} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Download size={14} /> Export Excel
            </button>
            <button onClick={handleAddOpen} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Plus size={14} /> Tambah Produk
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
                  <th>Kode</th>
                  <th>Nama Produk</th>
                  <th>Ukuran</th>
                  <th>Kategori</th>
                  <th>Harga Jual</th>
                  <th>Harga Pokok</th>
                  <th>Margin</th>
                  <th>Stok</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data produk.</td>
                  </tr>
                ) : (
                  products.map((prod) => {
                    const margin = prod.selling_price > 0 
                      ? ((prod.selling_price - prod.cost_price) / prod.selling_price * 100).toFixed(0) 
                      : '0'
                    return (
                      <tr key={prod.id}>
                        <td><span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#c9a84c' }}>{prod.code}</span></td>
                        <td>
                          <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{prod.name}</div>
                          {prod.description && (
                            <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{prod.description}</div>
                          )}
                        </td>
                        <td><SizeBadge size={prod.size} /></td>
                        <td><span className="badge badge-gold" style={{ fontSize: '0.6875rem' }}>{prod.category}</span></td>
                        <td style={{ fontWeight: 600, fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem' }}>{formatCurrency(prod.selling_price)}</td>
                        <td style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>{formatCurrency(prod.cost_price)}</td>
                        <td>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#22c55e' }}>{margin}%</span>
                        </td>
                        <td>
                          <span style={{
                            fontFamily: 'Cormorant Garamond, serif',
                            fontSize: '1rem',
                            fontWeight: 700,
                            color: prod.current_stock <= prod.reorder_point ? '#ef4444' : '#22c55e'
                          }}>
                            {prod.current_stock}
                          </span>
                          <span style={{ fontSize: '0.6875rem', color: '#64748b' }}> {prod.unit}</span>
                        </td>
                        <td>
                          {prod.is_active
                            ? <span className="badge badge-success">Aktif</span>
                            : <span className="badge badge-neutral">Nonaktif</span>
                          }
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button onClick={() => handleEditOpen(prod)} className="btn btn-ghost btn-sm" style={{ padding: '0.25rem', color: '#94a3b8' }}>
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDelete(prod.id)} className="btn btn-ghost btn-sm" style={{ padding: '0.25rem', color: '#ef4444' }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialog: Add/Edit Product */}
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
                {editingProduct ? 'Ubah Produk' : 'Tambah Produk Baru'}
              </h3>
              <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} className="hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Body — scrollable */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',  }}>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
                <div>
                  <label className="form-label">Kode</label>
                  <input type="text" {...register('code')} readOnly className="input-base" style={{ background: '#1e293b', color: '#94a3b8', cursor: 'not-allowed' }} />
                  <FormError message={errors.code?.message} />
                </div>
                <div>
                  <label className="form-label">Nama Produk *</label>
                  <input type="text" {...register('name')} className="input-base" placeholder="Signature Hooded Fleece" />
                  <FormError message={errors.name?.message} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Ukuran / Size <span style={{ color: '#c9a84c' }}>*</span></label>
                  <select {...register('size')} className="input-base" style={{ background: '#0f172a' }}>
                    {MATERIAL_SIZE_OPTIONS.filter((o) => o.value !== '').map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <FormError message={errors.size?.message} />
                  <p style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem' }}>
                    Satu baris produk = satu ukuran (SKU).
                  </p>
                </div>
                <div>
                  <label className="form-label">Deskripsi</label>
                  <textarea {...register('description')} className="input-base" style={{ height: '3.5rem', resize: 'none' }} placeholder="Detail spesifikasi produk..." />
                  <FormError message={errors.description?.message} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Kategori</label>
                  <select {...register('category')} className="input-base" style={{ background: '#0f172a' }}>
                    <option value="T-Shirt">T-Shirt</option>
                    <option value="Jaket">Jaket</option>
                    <option value="Celana">Celana</option>
                    <option value="Hoodie">Hoodie</option>
                    <option value="Aksesori">Aksesori</option>
                  </select>
                  <FormError message={errors.category?.message} />
                </div>
                <div>
                  <label className="form-label">Satuan</label>
                  <select {...register('unit')} className="input-base" style={{ background: '#0f172a' }}>
                    <option value="pcs">pcs</option>
                    <option value="set">set</option>
                    <option value="lusin">lusin</option>
                  </select>
                  <FormError message={errors.unit?.message} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Harga Jual (Retail)</label>
                  <input type="number" min={0} {...register('selling_price')} className="input-base" />
                  <FormError message={errors.selling_price?.message} />
                </div>
                <div>
                  <label className="form-label">Harga Pokok (HPP)</label>
                  <input type="number" min={0} {...register('cost_price')} className="input-base" />
                  <FormError message={errors.cost_price?.message} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Min. Reorder Point</label>
                  <input type="number" min={0} {...register('reorder_point')} className="input-base" />
                  <FormError message={errors.reorder_point?.message} />
                </div>
                {!editingProduct ? (
                  <div>
                    <label className="form-label">Stok Awal</label>
                    <input type="number" min={0} {...register('current_stock')} className="input-base" />
                    <FormError message={errors.current_stock?.message} />
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.625rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input type="checkbox" id="isActive" {...register('is_active')} style={{ cursor: 'pointer' }} />
                      <label htmlFor="isActive" style={{ fontSize: '0.8125rem', color: '#e2e8f0', cursor: 'pointer' }}>Status Aktif</label>
                    </div>
                  </div>
                )}
              </div>

              {editingProduct && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" id="isActive" {...register('is_active')} style={{ cursor: 'pointer' }} />
                  <label htmlFor="isActive" style={{ fontSize: '0.8125rem', color: '#e2e8f0', cursor: 'pointer' }}>Status Aktif</label>
                </div>
              )}

              {/* Footer */}
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.3)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setIsOpen(false)} className="btn btn-secondary btn-sm" disabled={submitting}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} disabled={submitting}>
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  {editingProduct ? 'Simpan Perubahan' : 'Tambah Produk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


