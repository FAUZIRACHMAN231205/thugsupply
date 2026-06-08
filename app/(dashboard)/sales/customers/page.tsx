'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { customerSchema, type CustomerFormValues } from '@/lib/validations/sales'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase/supabase'
import { formatCurrency, generateCode } from '@/lib/utils'
import { openFormModal } from '@/lib/open-form-modal'
import { Plus, Edit2, Trash2, X, Loader2 } from 'lucide-react'
import type { Customer } from '@/types/database'

export default function CustomersPage() {
  const queryClient = useQueryClient()
  
  // Modal states
  const [isOpen, setIsOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema) as unknown as import('react-hook-form').Resolver<CustomerFormValues>,
    defaultValues: {
      code: '',
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      payment_terms_days: 30,
      credit_limit: 10000000,
      is_active: true,
    }
  })
  const { register, handleSubmit, reset, formState: { errors } } = form
  const { data: customers = [], isLoading: loading } = useQuery({
    queryKey: ['customers_data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data || []
    }
  })

  // Open modal for add
  const handleAddOpen = () => {
    openFormModal(setIsOpen, () => {
      setEditingCustomer(null)
      reset({
        code: generateCode('CST'),
        name: '',
        contact_person: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        payment_terms_days: 30,
        credit_limit: 10000000,
        is_active: true,
      })
    })
  }

  const handleEditOpen = (customer: Customer) => {
    setEditingCustomer(customer)
    openFormModal(setIsOpen, () => {
      reset({
        code: customer.code,
        name: customer.name,
        contact_person: customer.contact_person || '',
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        city: customer.city || '',
        payment_terms_days: customer.payment_terms_days,
        credit_limit: customer.credit_limit,
        is_active: customer.is_active,
      })
    })
  }

  const saveMutation = useMutation({
    mutationFn: async (formData: CustomerFormValues) => {
      const payload = {
        ...formData,
        email: formData.email || null,
        contact_person: formData.contact_person || null,
        phone: formData.phone || null,
        address: formData.address || null,
        city: formData.city || null,
      }
      
      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', editingCustomer.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('customers')
          .insert([payload])
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers_data'] })
      setIsOpen(false)
    },
    onError: (err) => {
      console.error('Error saving customer:', err)
      alert('Gagal menyimpan data customer')
    }
  })

  const onSubmit = (data: CustomerFormValues) => {
    saveMutation.mutate({
      ...data,
      ...(editingCustomer ? { updated_at: new Date().toISOString() } : {})
    })
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers_data'] })
    },
    onError: (err) => {
      console.error('Error deleting customer:', err)
      alert('Gagal menghapus customer. Kemungkinan sudah digunakan dalam transaksi.')
    }
  })

  const handleDelete = (id: string) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus customer ini?')) return
    deleteMutation.mutate(id)
  }

  const submitting = saveMutation.isPending

  return (
    <div className="page-modules">
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 border-b border-slate-800">
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>Data Customer</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Kelola semua data pelanggan bisnis</div>
          </div>
          <button onClick={handleAddOpen} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Plus size={14} /> Tambah Customer
          </button>
        </div>

        {loading && customers.length === 0 ? (
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
                  <th>Nama Customer</th>
                  <th>Kontak</th>
                  <th>Kota</th>
                  <th>Credit Limit</th>
                  <th>Terms</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data customer.</td>
                  </tr>
                ) : (
                  customers.map((cst) => (
                    <tr key={cst.id}>
                      <td><span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#c9a84c' }}>{cst.code}</span></td>
                      <td>
                        <div style={{ fontWeight: 500, color: '#e2e8f0' }}>{cst.name}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{cst.email || '-'}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8125rem' }}>{cst.contact_person || '-'}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{cst.phone || '-'}</div>
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>{cst.city || '-'}</td>
                      <td style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{formatCurrency(cst.credit_limit)}</td>
                      <td><span className="badge badge-neutral">{cst.payment_terms_days} hari</span></td>
                      <td>
                        {cst.is_active
                          ? <span className="badge badge-success">Aktif</span>
                          : <span className="badge badge-neutral">Nonaktif</span>
                        }
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button onClick={() => handleEditOpen(cst)} className="btn btn-ghost btn-sm" style={{ padding: '0.25rem', color: '#94a3b8' }}>
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDelete(cst.id)} className="btn btn-ghost btn-sm" style={{ padding: '0.25rem', color: '#ef4444' }}>
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

      {/* Modal Dialog: Add/Edit Customer */}
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
                {editingCustomer ? 'Ubah Customer' : 'Tambah Customer Baru'}
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
                  <label className="form-label">Nama Customer *</label>
                  <input type="text" {...register('name')} className="input-base" placeholder="Distro Urban Jakarta" />
                  <FormError message={errors.name?.message} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Nama Kontak Person</label>
                  <input type="text" {...register('contact_person')} className="input-base" placeholder="Reza Mahendra" />
                  <FormError message={errors.contact_person?.message} />
                </div>
                <div>
                  <label className="form-label">No. Telepon / HP</label>
                  <input type="text" {...register('phone')} className="input-base" placeholder="021-8889999" />
                  <FormError message={errors.phone?.message} />
                </div>
              </div>

              <div>
                <label className="form-label">Email Pelanggan</label>
                <input type="email" {...register('email')} className="input-base" placeholder="reza@urbanjakarta.com" />
                <FormError message={errors.email?.message} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                <div>
                  <label className="form-label">Alamat Lengkap</label>
                  <input type="text" {...register('address')} className="input-base" placeholder="Jl. Jaksa No. 15" />
                  <FormError message={errors.address?.message} />
                </div>
                <div>
                  <label className="form-label">Kota</label>
                  <input type="text" {...register('city')} className="input-base" placeholder="Jakarta" />
                  <FormError message={errors.city?.message} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Batas Kredit (Credit Limit)</label>
                  <input type="number" min={0} {...register('credit_limit')} className="input-base" />
                  <FormError message={errors.credit_limit?.message} />
                </div>
                <div>
                  <label className="form-label">Payment Terms (Hari)</label>
                  <input type="number" min={0} {...register('payment_terms_days')} className="input-base" />
                  <FormError message={errors.payment_terms_days?.message} />
                </div>
              </div>

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
                  {editingCustomer ? 'Simpan Perubahan' : 'Tambah Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


