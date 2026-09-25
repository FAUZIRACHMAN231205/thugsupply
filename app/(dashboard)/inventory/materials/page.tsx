'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { materialSchema, type MaterialFormValues } from '@/lib/validations/inventory'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase/supabase'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { formatCurrency, generateCode } from '@/lib/utils'
import { openFormModal } from '@/lib/open-form-modal'
import { Plus, Edit2, Trash2, X, Loader2, Download } from 'lucide-react'
import type { Material } from '@/types/database'
import { exportToCSV } from '@/lib/export'
import SizeBadge from '@/components/ui/SizeBadge'
import {
  MATERIAL_SIZE_OPTIONS,
  materialRequiresSize,
  normalizeSize,
  isDuplicateMaterialVariant,
} from '@/lib/inventory-size'

export default function MaterialsPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  
  // Modal states
  const [isOpen, setIsOpen] = useState(false)
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null)
  
  // Form states
  const form = useForm<MaterialFormValues>({
    resolver: zodResolver(materialSchema) as unknown as import('react-hook-form').Resolver<MaterialFormValues>,
    defaultValues: {
      code: '',
      name: '',
      description: '',
      size: '',
      category: 'Kain Utama',
      unit: 'meter',
      cost_price: 0,
      reorder_point: 0,
      current_stock: 0,
      is_active: true,
    }
  })
  const { register, handleSubmit, reset, formState: { errors } } = form
  const watchCategory = useWatch({ control: form.control, name: 'category' })
  const watchUnit = useWatch({ control: form.control, name: 'unit' })
  const sizeRequired = materialRequiresSize(watchCategory, watchUnit)
  const { data: materials = [], isLoading: loading } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('materials')
          .select('*')
          .order('created_at', { ascending: false })
        
        if (error) throw error
        return data || []
      } catch (err) {
        console.error('Fetch caught error:', err)
        throw err
      }
    }
  })

  // Open modal for add
  const handleAddOpen = () => {
    openFormModal(setIsOpen, () => {
      setEditingMaterial(null)
      reset({
        code: generateCode('MAT'),
        name: '',
        description: '',
        size: '',
        category: 'Kain Utama',
        unit: 'meter',
        cost_price: 0,
        reorder_point: 0,
        current_stock: 0,
        is_active: true,
      })
    })
  }

  const handleEditOpen = (material: Material) => {
    setEditingMaterial(material)
    openFormModal(setIsOpen, () => {
      reset({
        code: material.code,
        name: material.name,
        description: material.description || '',
        size: (material.size || '') as MaterialFormValues['size'],
        category: material.category || 'Kain Utama',
        unit: material.unit,
        cost_price: material.cost_price,
        reorder_point: material.reorder_point,
        current_stock: 0,
        is_active: material.is_active,
      })
    })
  }

  const saveMutation = useMutation({
    mutationFn: async (formData: MaterialFormValues) => {
      const initialStock = formData.current_stock || 0
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { current_stock, ...restData } = formData
      const payload = { ...restData, size: normalizeSize(restData.size) }

      if (
        isDuplicateMaterialVariant(
          materials,
          payload.name,
          payload.size,
          editingMaterial?.id
        )
      ) {
        throw new Error(
          'Material dengan nama dan ukuran yang sama sudah ada. Gunakan baris terpisah per ukuran.'
        )
      }

      if (editingMaterial) {
        const { error } = await supabase
          .from('materials')
          .update(payload)
          .eq('id', editingMaterial.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('materials')
          .insert([{ ...payload, current_stock: 0 }])
          .select()
        if (error) throw error
        
        if (Number(initialStock) > 0 && data && data[0]) {
          const { error: moveError } = await supabase
            .from('stock_movements')
            .insert([{
              material_id: data[0].id,
              movement_type: 'adjustment',
              quantity: Number(initialStock),
              notes: 'Stok awal material baru',
              stock_before: 0,
              stock_after: Number(initialStock)
            }])
          if (moveError) throw moveError
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      setIsOpen(false)
    },
    onError: (err: Error) => {
      const msg = err?.message || ''
      if (msg.includes('idx_materials_name_size_unique') || msg.includes('duplicate')) {
        toast.error('Material dengan nama dan ukuran yang sama sudah terdaftar.')
        return
      }
      toast.error('Gagal menyimpan data bahan baku: ' + msg)
    }
  })

  const onSubmit = (data: MaterialFormValues) => {
    saveMutation.mutate({
      ...data,
      ...(editingMaterial ? { updated_at: new Date().toISOString() } : {})
    })
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('materials').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materials'] })
    },
    onError: (err) => {
      console.error('Error deleting material:', err)
      toast.error('Gagal menghapus bahan baku. Kemungkinan sudah digunakan dalam transaksi.')
    }
  })

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Hapus Bahan Baku',
      message: 'Apakah Anda yakin ingin menghapus bahan baku ini?',
      confirmLabel: 'Hapus',
      danger: true,
    })
    if (!ok) return
    deleteMutation.mutate(id)
  }

  const submitting = saveMutation.isPending

  const handleExport = () => {
    const headers = ['Kode', 'Nama', 'Ukuran', 'Kategori', 'Satuan', 'Harga Beli', 'Stok Min', 'Stok Saat Ini', 'Status']
    const csvData = materials.map(mat => [
      mat.code,
      mat.name,
      mat.size || '',
      mat.category,
      mat.unit,
      mat.cost_price,
      mat.reorder_point,
      mat.current_stock,
      mat.is_active ? 'Aktif' : 'Nonaktif'
    ])
    exportToCSV(`materials_export_${new Date().toISOString().split('T')[0]}.csv`, headers, csvData)
  }

  return (
    <div className="page-modules">
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 border-b border-slate-800">
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>Master Bahan Baku</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Kelola semua jenis bahan baku produksi</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleExport} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Download size={14} /> Export Excel
            </button>
            <button onClick={handleAddOpen} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Plus size={14} /> Tambah Material
            </button>
          </div>
        </div>

          {loading && materials.length === 0 ? (
            <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
              <Loader2 size={24} className="animate-spin text-[#c9a84c]" />
              <span>Memuat data...</span>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s ease' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Nama</th>
                    <th>Ukuran</th>
                    <th>Kategori</th>
                    <th>Satuan</th>
                    <th>Harga Beli</th>
                    <th>Stok Min</th>
                    <th>Stok Saat Ini</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data bahan baku.</td>
                    </tr>
                  ) : (
                    materials.map((mat) => (
                      <tr key={mat.id}>
                        <td><span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#c9a84c' }}>{mat.code}</span></td>
                        <td>
                          <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{mat.name}</div>
                          {mat.description && (
                            <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{mat.description}</div>
                          )}
                        </td>
                        <td><SizeBadge size={mat.size} /></td>
                        <td><span className="badge badge-neutral" style={{ fontSize: '0.6875rem' }}>{mat.category}</span></td>
                        <td style={{ fontSize: '0.8125rem' }}>{mat.unit}</td>
                        <td style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{formatCurrency(mat.cost_price)}</td>
                        <td style={{ fontSize: '0.8125rem', color: '#64748b' }}>{mat.reorder_point}</td>
                        <td>
                          <span style={{
                            fontFamily: 'Cormorant Garamond, serif',
                            fontSize: '1rem',
                            fontWeight: 700,
                            color: mat.current_stock <= mat.reorder_point ? '#ef4444' : '#22c55e'
                          }}>
                            {mat.current_stock}
                          </span>
                        </td>
                        <td>
                          {mat.is_active
                            ? <span className="badge badge-success">Aktif</span>
                            : <span className="badge badge-neutral">Nonaktif</span>
                          }
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button onClick={() => handleEditOpen(mat)} className="btn btn-ghost btn-sm" style={{ padding: '0.25rem', color: '#94a3b8' }}>
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDelete(mat.id)} className="btn btn-ghost btn-sm" style={{ padding: '0.25rem', color: '#ef4444' }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {/* Modal Dialog Form */}
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
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-slate-800/50">
              <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec' }}>
                {editingMaterial ? 'Ubah Bahan Baku' : 'Tambah Bahan Baku Baru'}
              </h3>
              <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} className="hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
                <div>
                  <label className="form-label">Kode</label>
                  <input type="text" {...register('code')} readOnly className="input-base" style={{ background: '#1e293b', color: '#94a3b8', cursor: 'not-allowed' }} />
                  <FormError message={errors.code?.message} />
                </div>
                <div>
                  <label className="form-label">Nama Material *</label>
                  <input type="text" {...register('name')} className="input-base" placeholder="Contoh: Kain Cotton Premium" />
                  <FormError message={errors.name?.message} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">
                    Ukuran / Size {sizeRequired && <span style={{ color: '#c9a84c' }}>*</span>}
                  </label>
                  <select {...register('size')} className="input-base" style={{ background: '#0f172a' }}>
                    {MATERIAL_SIZE_OPTIONS.map((opt) => (
                      <option key={opt.value || 'none'} value={opt.value}>
                        {sizeRequired && opt.value === ''
                          ? '— Pilih ukuran —'
                          : opt.label}
                      </option>
                    ))}
                  </select>
                  <FormError message={errors.size?.message} />
                  {sizeRequired && (
                    <p style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem' }}>
                      Wajib untuk apparel blank (satu baris = satu ukuran).
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label">Deskripsi</label>
                  <textarea {...register('description')} className="input-base" style={{ height: '3.5rem', resize: 'none' }} placeholder="Detail bahan baku..." />
                  <FormError message={errors.description?.message} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Kategori</label>
                  <select {...register('category')} className="input-base" style={{ background: '#0f172a' }}>
                    <option value="Blank Apparel">Blank Apparel</option>
                    <option value="Kain Utama">Kain Utama</option>
                    <option value="Kain Pendukung">Kain Pendukung</option>
                    <option value="Benang">Benang</option>
                    <option value="Aksesori">Aksesori</option>
                    <option value="Label">Label</option>
                    <option value="Kemasan">Kemasan</option>
                  </select>
                  <FormError message={errors.category?.message} />
                </div>
                <div>
                  <label className="form-label">Satuan Ukuran</label>
                  <select {...register('unit')} className="input-base" style={{ background: '#0f172a' }}>
                    <option value="meter">meter</option>
                    <option value="yard">yard</option>
                    <option value="pcs">pcs</option>
                    <option value="cone">cone</option>
                    <option value="roll">roll</option>
                    <option value="kg">kg</option>
                  </select>
                  <FormError message={errors.unit?.message} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Harga Beli (HPP)</label>
                  <input type="number" min={0} {...register('cost_price')} className="input-base" />
                  <FormError message={errors.cost_price?.message} />
                </div>
                <div>
                  <label className="form-label">Stok Minimum Reorder</label>
                  <input type="number" min={0} {...register('reorder_point')} className="input-base" />
                  <FormError message={errors.reorder_point?.message} />
                </div>
              </div>

              {!editingMaterial && (
                <div>
                  <label className="form-label">Stok Awal Saat Ini</label>
                  <input type="number" min={0} {...register('current_stock')} className="input-base" placeholder="Isi jika ada stok awal" />
                  <FormError message={errors.current_stock?.message} />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input type="checkbox" id="isActive" {...register('is_active')} style={{ cursor: 'pointer' }} />
                <label htmlFor="isActive" style={{ fontSize: '0.8125rem', color: '#e2e8f0', cursor: 'pointer' }}>Status Aktif</label>
              </div>

              {/* Footer */}
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.3)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setIsOpen(false)} className="btn btn-secondary btn-sm" disabled={submitting}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} disabled={submitting}>
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  {editingMaterial ? 'Simpan Perubahan' : 'Tambah Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}



