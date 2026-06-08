'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { bomSchema, type BomFormValues } from '@/lib/validations/manufacturing'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase/supabase'

import { Plus, ClipboardList, X, Loader2, Trash2 } from 'lucide-react'
import { formatMaterialLabel, formatProductLabel } from '@/lib/inventory-size'

export default function BomPage() {
  const queryClient = useQueryClient()

  // Modal states
  const [isOpen, setIsOpen] = useState(false)

  const form = useForm<BomFormValues>({
    resolver: zodResolver(bomSchema) as unknown as import('react-hook-form').Resolver<BomFormValues>,
    defaultValues: {
      product_id: '',
      version: 'v1.0',
      notes: '',
      is_active: true,
      items: []
    }
  })
  
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const { data, isLoading: loading } = useQuery({
    queryKey: ['boms_data'],
    queryFn: async () => {
      const [bomRes, prodRes, matRes] = await Promise.all([
        supabase
          .from('bill_of_materials')
          .select('*, product:products(*), items:bom_items(*, material:materials(*))')
          .order('created_at', { ascending: false }),
        supabase
          .from('products')
          .select('*')
          .eq('is_active', true),
        supabase
          .from('materials')
          .select('*')
          .eq('is_active', true)
      ])

      if (bomRes.error) throw bomRes.error
      if (prodRes.error) throw prodRes.error
      if (matRes.error) throw matRes.error

      return {
        boms: bomRes.data || [],
        products: prodRes.data || [],
        materials: matRes.data || []
      }
    }
  })

  const boms = data?.boms || []
  const products = data?.products || []
  const materials = data?.materials || []

  // Open Add Modal
  const handleAddOpen = () => {
    reset({
      product_id: products[0]?.id || '',
      version: 'v1.0',
      notes: '',
      is_active: true,
      items: [{ material_id: materials[0]?.id || '', quantity: 1, unit: materials[0]?.unit || 'meter' }]
    })
    setIsOpen(true)
  }

  // Add Item Row
  const handleAddItemRow = () => {
    const defaultMat = materials[0]
    append({ material_id: defaultMat?.id || '', quantity: 1, unit: defaultMat?.unit || 'meter' })
  }

  // Change Item Material
  const handleMaterialChange = (index: number, materialId: string) => {
    setValue(`items.${index}.material_id`, materialId)
    const mat = materials.find(m => m.id === materialId)
    if (mat) {
      setValue(`items.${index}.unit`, mat.unit)
    }
  }

  const submitMutation = useMutation({
    mutationFn: async (formData: BomFormValues) => {
      if (formData.is_active) {
        const { error: deactivateError } = await supabase
          .from('bill_of_materials')
          .update({ is_active: false })
          .eq('product_id', formData.product_id)
        
        if (deactivateError) throw deactivateError
      }

      const { data: bomData, error: bomError } = await supabase
        .from('bill_of_materials')
        .insert([{
          product_id: formData.product_id,
          version: formData.version,
          is_active: formData.is_active,
          notes: formData.notes || null
        }])
        .select()

      if (bomError) throw bomError
      const newBOM = bomData[0]

      const itemsToInsert = formData.items.map(item => ({
        bom_id: newBOM.id,
        material_id: item.material_id,
        quantity: item.quantity,
        unit: item.unit
      }))

      const { error: itemsError } = await supabase
        .from('bom_items')
        .insert(itemsToInsert)

      if (itemsError) throw itemsError
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms_data'] })
      setIsOpen(false)
    },
    onError: (err) => {
      console.error('Error creating BOM:', err)
      alert('Gagal membuat Bill of Materials')
    }
  })

  const onSubmit = (data: BomFormValues) => {
    submitMutation.mutate(data)
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bill_of_materials').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boms_data'] })
    },
    onError: (err) => {
      console.error('Error deleting BOM:', err)
      alert('Gagal menghapus BOM. Kemungkinan resep ini sedang aktif digunakan oleh Work Order.')
    }
  })

  const handleDeleteBOM = (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus BOM ini beserta semua resep di dalamnya?')) return
    deleteMutation.mutate(id)
  }

  const submitting = submitMutation.isPending

  return (
    <div className="page-modules">
      <div className="module-grid-split">
        {/* BOM List */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 border-b border-slate-800">
            <div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>Bill of Materials</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Resep produksi per produk jadi</div>
            </div>
            <button onClick={handleAddOpen} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Plus size={14} /> Tambah BOM
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
              <Loader2 size={24} className="animate-spin text-[#c9a84c]" />
              <span>Memuat resep...</span>
            </div>
          ) : (
            <div style={{ padding: '1rem', maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {boms.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data Bill of Materials.</div>
              ) : (
                boms.map((bom) => (
                  <div key={bom.id} style={{
                    background: '#1e293b',
                    borderRadius: '0.625rem',
                    padding: '1rem',
                    border: '1px solid #334155',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{bom.product?.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{bom.product?.code} · Versi {bom.version}</div>
                        {bom.notes && <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.25rem' }}>Catatan: {bom.notes}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {bom.is_active ? (
                          <span className="badge badge-success">Aktif</span>
                        ) : (
                          <span className="badge badge-neutral">Nonaktif</span>
                        )}
                        <button onClick={() => handleDeleteBOM(bom.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem' }} className="hover:opacity-80">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                      {bom.items?.map((item: import('@/types/database').BomItem & { material?: import('@/types/database').Material }, idx: number) => (
                        <div key={idx} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.375rem 0.625rem',
                          background: '#0f172a',
                          borderRadius: '0.375rem',
                        }}>
                          <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                            {formatMaterialLabel(item.material)}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c9a84c' }}>{item.quantity} {item.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Info Panel */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem', alignSelf: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <ClipboardList size={20} style={{ color: '#c9a84c' }} />
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>
              Tentang Bill of Materials
            </div>
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#94a3b8', lineHeight: 1.7 }}>
            <p style={{ marginBottom: '1rem' }}>
              Bill of Materials (BOM) adalah daftar komponen atau bahan baku yang diperlukan untuk memproduksi satu unit produk jadi.
            </p>
            <p style={{ marginBottom: '1rem' }}>
              BOM terintegrasi dengan sistem Work Order — ketika WO diselesaikan, sistem secara otomatis mengurangi stok bahan baku sesuai dengan resep yang ditentukan di BOM ini.
            </p>
            <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '0.5rem', padding: '1rem', marginTop: '1rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c9a84c', marginBottom: '0.5rem' }}>Integrasi Otomatis</div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {['BOM → Work Order → Pengurangan Stok Bahan Baku', 'WO Selesai → Penambahan Stok Produk Jadi', 'Pencatatan mutasi secara digital'].map(item => (
                  <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                    <span style={{ color: '#c9a84c' }}>→</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Create BOM */}
      {isOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)',
          overflowY: 'auto', padding: '3rem 1rem 10rem 1rem'
        }}>
          <div className="glass-gold" style={{
            background: '#090d16', borderRadius: '1rem', width: '100%', maxWidth: '40rem',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh'
          }}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-slate-800/50">
              <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec' }}>Buat Bill of Materials Baru</h3>
              <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            {/* Body */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                <div>
                  <label className="form-label">Pilih Produk Jadi *</label>
                  <select {...register('product_id')} className="input-base" style={{ background: '#0f172a' }}>
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
                  <label className="form-label">Versi *</label>
                  <input type="text" {...register('version')} className="input-base" placeholder="v1.0" />
                  <FormError message={errors.version?.message} />
                </div>
              </div>

              <div>
                <label className="form-label">Catatan Resep</label>
                <input type="text" {...register('notes')} className="input-base" placeholder="Catatan opsional..." />
                <FormError message={errors.notes?.message} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input type="checkbox" id="isDefaultActive" {...register('is_active')} style={{ cursor: 'pointer' }} />
                <label htmlFor="isDefaultActive" style={{ fontSize: '0.8125rem', color: '#e2e8f0', cursor: 'pointer' }}>Jadikan Versi Aktif Utama</label>
              </div>

              {/* Items Section */}
              <div style={{ border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '1rem', background: '#050811' }}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-3">
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8' }}>Daftar Bahan Baku (Komponen)</span>
                  <button type="button" onClick={handleAddItemRow} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}>+ Tambah Row</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {fields.map((field, index) => (
                    <div key={field.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <div style={{ flex: 2 }}>
                        <select
                          {...register(`items.${index}.material_id`)}
                          onChange={(e) => handleMaterialChange(index, e.target.value)}
                          className="input-base"
                          style={{ background: '#0f172a', width: '100%' }}
                        >
                          {materials.map(m => (
                            <option key={m.id} value={m.id}>
                              {formatMaterialLabel(m)}
                            </option>
                          ))}
                        </select>
                        <FormError message={errors.items?.[index]?.material_id?.message} />
                      </div>
                      
                      <div style={{ flex: 1 }}>
                        <input
                          type="number"
                          step="any"
                          {...register(`items.${index}.quantity`)}
                          className="input-base"
                          style={{ width: '100%' }}
                          placeholder="Qty"
                        />
                        <FormError message={errors.items?.[index]?.quantity?.message} />
                      </div>

                      <div style={{ flex: 0.8 }}>
                        <input
                          type="text"
                          {...register(`items.${index}.unit`)}
                          className="input-base"
                          style={{ width: '100%' }}
                          placeholder="Satuan"
                          readOnly
                        />
                        <FormError message={errors.items?.[index]?.unit?.message} />
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
              </div>

              {/* Footer */}
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.3)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setIsOpen(false)} className="btn btn-secondary btn-sm" disabled={submitting}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} disabled={submitting}>
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Simpan BOM Recipe
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


