'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { coaSchema, type CoaFormValues } from '@/lib/validations/accounting'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase/supabase'
import { formatCurrency } from '@/lib/utils'
import { Plus, BookOpen, X, Loader2 } from 'lucide-react'
import type { ChartOfAccount, AccountType } from '@/types/database'

const accountTypeLabels: Record<AccountType, string> = {
  asset: 'Aktiva',
  liability: 'Kewajiban',
  equity: 'Modal',
  revenue: 'Pendapatan',
  expense: 'Beban',
}

const accountTypeColors: Record<AccountType, string> = {
  asset: '#3b82f6',
  liability: '#ef4444',
  equity: '#a855f7',
  revenue: '#22c55e',
  expense: '#f59e0b',
}

export default function ChartOfAccountsPage() {
  const queryClient = useQueryClient()

  // Modal states
  const [isOpen, setIsOpen] = useState(false)

  const form = useForm<CoaFormValues>({
    resolver: zodResolver(coaSchema),
    defaultValues: {
      code: '',
      name: '',
      account_type: 'asset',
      parent_id: '',
      description: '',
      is_active: true
    }
  })
  
  const { register, handleSubmit, reset, formState: { errors } } = form

  const { data: accounts = [], isLoading: loading } = useQuery({
    queryKey: ['chart_of_accounts_data'],
    queryFn: async () => {
      const accountsRes = await supabase
        .from('chart_of_accounts')
        .select('*')
        .order('code', { ascending: true })

      if (accountsRes.error) throw accountsRes.error
      const accountsData = accountsRes.data || []

      const linesRes = await supabase
        .from('journal_lines')
        .select('account_id, debit, credit')

      if (linesRes.error) throw linesRes.error
      const linesData = linesRes.data || []

      return accountsData.map(acc => {
        const accLines = linesData.filter(l => l.account_id === acc.id)
        const totalDebit = accLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
        const totalCredit = accLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)

        let balance = 0
        if (['asset', 'expense'].includes(acc.account_type)) {
          balance = totalDebit - totalCredit
        } else {
          balance = totalCredit - totalDebit
        }

        return {
          ...acc,
          balance
        }
      })
    }
  })

  // Open modal
  const handleAddOpen = () => {
    reset({
      code: '',
      name: '',
      account_type: 'asset',
      parent_id: '',
      description: '',
      is_active: true
    })
    setIsOpen(true)
  }

  const submitMutation = useMutation({
    mutationFn: async (formData: CoaFormValues) => {
      const { error } = await supabase
        .from('chart_of_accounts')
        .insert([{
          code: formData.code,
          name: formData.name,
          account_type: formData.account_type,
          parent_id: formData.parent_id || null,
          description: formData.description || null,
          is_active: formData.is_active,
          balance: 0
        }])

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chart_of_accounts_data'] })
      setIsOpen(false)
    },
    onError: (err) => {
      console.error('Error creating COA:', err)
      alert('Gagal menyimpan akun baru')
    }
  })

  const onSubmit = (data: CoaFormValues) => {
    submitMutation.mutate(data)
  }

  const submitting = submitMutation.isPending

  // Group accounts by type
  const grouped = accounts.reduce((acc, coa) => {
    if (!acc[coa.account_type]) acc[coa.account_type] = []
    acc[coa.account_type].push(coa)
    return acc
  }, {} as Record<AccountType, ChartOfAccount[]>)

  return (
    <div className="page-modules">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={handleAddOpen} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <Plus size={14} /> Tambah Akun
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
          <Loader2 size={24} className="animate-spin text-[#c9a84c]" />
          <span>Memuat daftar akun...</span>
        </div>
      ) : (
        <div className="page-modules">
          {(Object.keys(accountTypeLabels) as AccountType[]).map((type) => {
            const list = grouped[type] || []
            return (
              <div key={type} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
                <div style={{
                  padding: '0.875rem 1.25rem',
                  borderBottom: '1px solid #1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  background: `${accountTypeColors[type]}08`,
                }}>
                  <BookOpen size={16} style={{ color: accountTypeColors[type] }} />
                  <span style={{ fontWeight: 700, color: accountTypeColors[type], fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {accountTypeLabels[type]}
                  </span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '15%' }}>Kode</th>
                      <th style={{ width: '40%' }}>Nama Akun</th>
                      <th style={{ width: '25%' }}>Deskripsi</th>
                      <th style={{ width: '12%' }}>Saldo</th>
                      <th style={{ width: '8%' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>Belum ada data untuk kategori ini.</td>
                      </tr>
                    ) : (
                      list.map((account: import('@/types/database').ChartOfAccount & { balance: number }) => (
                        <tr key={account.id}>
                          <td><span style={{ fontFamily: 'monospace', fontWeight: 700, color: accountTypeColors[type] }}>{account.code}</span></td>
                          <td style={{ fontWeight: account.parent_id ? 400 : 600, paddingLeft: account.parent_id ? '2rem' : undefined }}>
                            {account.parent_id && <span style={{ color: '#334155', marginRight: '0.5rem' }}>└</span>}
                            <span style={{ color: '#e2e8f0' }}>{account.name}</span>
                          </td>
                          <td style={{ fontSize: '0.75rem', color: '#64748b' }}>{account.description || '-'}</td>
                          <td>
                            <span style={{
                              fontFamily: 'Cormorant Garamond, serif',
                              fontSize: '1rem',
                              fontWeight: 700,
                              color: account.balance !== 0 ? '#f8f4ec' : '#64748b'
                            }}>
                              {formatCurrency(account.balance)}
                            </span>
                          </td>
                          <td>
                            {account.is_active
                              ? <span className="badge badge-success">Aktif</span>
                              : <span className="badge badge-neutral">Nonaktif</span>
                            }
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Dialog: Add Account */}
      {isOpen && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)', zIndex: 100,
          overflowY: 'auto', padding: '1.5rem 1rem'
        }}>
          <div className="glass-gold" style={{
            background: '#090d16', borderRadius: '1rem', width: '100%', maxWidth: '32rem',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', margin: '10vh auto'
          }}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-slate-800/50">
              <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec' }}>
                Tambah Akun COA Baru
              </h3>
              <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} className="hover:text-white">
                <X size={18} />
              </button>
            </div>
            
            {/* Body */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4">
                <div>
                  <label className="form-label">Kode Akun *</label>
                  <input type="text" {...register('code')} className="input-base" placeholder="Contoh: 1101" />
                  <FormError message={errors.code?.message} />
                </div>
                <div>
                  <label className="form-label">Nama Akun *</label>
                  <input type="text" {...register('name')} className="input-base" placeholder="Contoh: Kas Kecil" />
                  <FormError message={errors.name?.message} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Tipe Akun *</label>
                  <select {...register('account_type')} className="input-base" style={{ background: '#0f172a' }}>
                    {Object.entries(accountTypeLabels).map(([val, lbl]) => (
                      <option key={val} value={val}>{lbl}</option>
                    ))}
                  </select>
                  <FormError message={errors.account_type?.message} />
                </div>
                <div>
                  <label className="form-label">Parent Akun (Sub-akun dari)</label>
                  <select {...register('parent_id')} className="input-base" style={{ background: '#0f172a' }}>
                    <option value="">-- Tanpa Parent --</option>
                    {accounts.filter(a => !a.parent_id).map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                  <FormError message={errors.parent_id?.message} />
                </div>
              </div>

              <div>
                <label className="form-label">Deskripsi</label>
                <input type="text" {...register('description')} className="input-base" placeholder="Deskripsi akun..." />
                <FormError message={errors.description?.message} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input type="checkbox" id="isActive" {...register('is_active')} style={{ cursor: 'pointer' }} />
                <label htmlFor="isActive" style={{ fontSize: '0.8125rem', color: '#e2e8f0', cursor: 'pointer' }}>Akun Aktif</label>
              </div>

              {/* Footer */}
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.3)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setIsOpen(false)} className="btn btn-secondary btn-sm" disabled={submitting}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} disabled={submitting}>
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Simpan Akun
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


