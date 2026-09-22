'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { journalEntrySchema, type JournalEntryFormValues } from '@/lib/validations/accounting'
import { FormError } from '@/components/ui/FormError'
import { supabase } from '@/lib/supabase/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, X, Loader2, ChevronDown, ChevronUp, Trash2, Download } from 'lucide-react'

import { exportToCSV } from '@/lib/export'

const typeColors: Record<string, string> = {
  sale: '#22c55e',
  purchase: '#3b82f6',
  production: '#a855f7',
  manual: '#f59e0b',
  adjustment: '#ef4444'
}

const typeLabels: Record<string, string> = {
  sale: 'Penjualan',
  purchase: 'Pembelian',
  production: 'Produksi',
  manual: 'Manual',
  adjustment: 'Penyesuaian'
}

const accountTypeLabels: Record<string, string> = {
  asset: 'Aktiva',
  liability: 'Kewajiban',
  equity: 'Modal',
  revenue: 'Pendapatan',
  expense: 'Beban',
}

export default function JournalPage() {
  const queryClient = useQueryClient()

  // Expand state
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({})

  // Modal states
  const [isOpen, setIsOpen] = useState(false)

  const form = useForm<JournalEntryFormValues>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: {
      description: '',
      entry_date: '',
      entry_type: 'manual',
      lines: []
    }
  })
  
  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })
  const watchLines = useWatch({ control, name: 'lines' }) || []

  const { data, isLoading: loading } = useQuery({
    queryKey: ['journal_entries_data'],
    queryFn: async () => {
      const [journalRes, accountsRes] = await Promise.all([
        supabase
          .from('journal_entries')
          .select('*, lines:journal_lines(*, account:chart_of_accounts(*))')
          .order('entry_date', { ascending: false }),
        supabase
          .from('chart_of_accounts')
          .select('*')
          .eq('is_active', true)
          .order('code', { ascending: true })
      ])

      if (journalRes.error) throw journalRes.error
      if (accountsRes.error) throw accountsRes.error

      return {
        journals: journalRes.data || [],
        accounts: accountsRes.data || []
      }
    }
  })

  const journals = data?.journals || []
  const accounts = data?.accounts || []

  // Toggle expanded entry row
  const toggleExpand = (id: string) => {
    setExpandedEntries(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  // Open Create Modal
  const handleCreateOpen = () => {
    const firstAcc = accounts[0]?.id || ''
    reset({
      description: '',
      entry_date: new Date().toISOString().split('T')[0],
      entry_type: 'manual',
      lines: [
        { account_id: firstAcc, debit: 0, credit: 0, notes: '' },
        { account_id: firstAcc, debit: 0, credit: 0, notes: '' }
      ]
    })
    setIsOpen(true)
  }

  // Add line row
  const handleAddLineRow = () => {
    const firstAcc = accounts[0]?.id || ''
    append({ account_id: firstAcc, debit: 0, credit: 0, notes: '' })
  }

  // Change line fields
  const handleLineChange = (index: number, field: 'debit' | 'credit', value: string) => {
    const numValue = Number(value)
    if (field === 'debit') {
      setValue(`lines.${index}.debit`, numValue)
      setValue(`lines.${index}.credit`, 0)
    } else {
      setValue(`lines.${index}.credit`, numValue)
      setValue(`lines.${index}.debit`, 0)
    }
  }

  // Calculations
  const calculateSums = () => {
    const totalDebit = watchLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
    const totalCredit = watchLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)
    return { totalDebit, totalCredit }
  }

  const submitMutation = useMutation({
    mutationFn: async (formData: JournalEntryFormValues) => {
      const { totalDebit, totalCredit } = calculateSums()

      const { data: entryData, error: entryErr } = await supabase
        .from('journal_entries')
        .insert([{
          entry_date: formData.entry_date,
          entry_type: formData.entry_type,
          description: formData.description,
          total_debit: totalDebit,
          total_credit: totalCredit,
          is_balanced: true
        }])
        .select()

      if (entryErr) throw entryErr
      const newEntry = entryData[0]

      const linesToInsert = formData.lines.map(l => ({
        journal_entry_id: newEntry.id,
        account_id: l.account_id,
        debit: l.debit,
        credit: l.credit,
        description: l.notes || formData.description
      }))

      const { error: linesErr } = await supabase
        .from('journal_lines')
        .insert(linesToInsert)

      if (linesErr) throw linesErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal_entries_data'] })
      queryClient.invalidateQueries({ queryKey: ['chart_of_accounts_data'] })
      setIsOpen(false)
    },
    onError: (err) => {
      console.error('Error saving journal entry:', err)
      alert('Gagal menyimpan jurnal akuntansi')
    }
  })

  const onSubmit = (data: JournalEntryFormValues) => {
    const { totalDebit, totalCredit } = calculateSums()
    if (totalDebit === 0) return alert('Total nilai transaksi tidak boleh nol')
    if (totalDebit !== totalCredit) {
      return alert(`Jurnal tidak seimbang! Total Debit (${formatCurrency(totalDebit)}) harus sama dengan Total Kredit (${formatCurrency(totalCredit)})`)
    }
    submitMutation.mutate(data)
  }

  const submitting = submitMutation.isPending

  const { totalDebit: currentDebit, totalCredit: currentCredit } = calculateSums()
  const isBalanced = currentDebit > 0 && currentDebit === currentCredit

  const handleExport = () => {
    const headers = ['No Jurnal', 'Tanggal', 'Keterangan', 'Jenis', 'Akun', 'Debit', 'Kredit']
    const csvData: (string | number)[][] = []

    journals.forEach(je => {
      const typeStr = typeLabels[je.entry_type] || je.entry_type
      
      // If there are no lines somehow, just add the header
      if (!je.lines || je.lines.length === 0) {
        csvData.push([
          je.entry_number,
          formatDate(je.entry_date),
          je.description,
          typeStr,
          '',
          je.total_debit,
          je.total_credit
        ])
      } else {
        // Add each line
        je.lines.forEach((line: import('@/types/database').JournalLine & { account?: import('@/types/database').ChartOfAccount }) => {
          csvData.push([
            je.entry_number,
            formatDate(je.entry_date),
            je.description,
            typeStr,
            `[${line.account?.code}] ${line.account?.name}`,
            line.debit,
            line.credit
          ])
        })
      }
    })

    exportToCSV(`journal_entries_${new Date().toISOString().split('T')[0]}.csv`, headers, csvData)
  }

  return (
    <div className="page-modules">
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 border-b border-slate-800">
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>Jurnal Akuntansi</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Catatan transaksi double-entry bookkeeping</div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleExport} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Download size={14} /> Export Excel
            </button>
            <button onClick={handleCreateOpen} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Plus size={14} /> Jurnal Manual
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
            <Loader2 size={24} className="animate-spin text-[#c9a84c]" />
            <span>Memuat jurnal...</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '4%' }}></th>
                  <th style={{ width: '15%' }}>No. Jurnal</th>
                  <th style={{ width: '12%' }}>Tanggal</th>
                  <th style={{ width: '35%' }}>Keterangan</th>
                  <th style={{ width: '12%' }}>Jenis</th>
                  <th style={{ width: '12%' }}>Total Debit</th>
                  <th style={{ width: '10%' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {journals.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data jurnal.</td>
                  </tr>
                ) : (
                  journals.map((je) => {
                    const isExpanded = !!expandedEntries[je.id]
                    return (
                      <>
                        <tr key={je.id} onClick={() => toggleExpand(je.id)} style={{ cursor: 'pointer' }}>
                          <td>
                            {isExpanded ? <ChevronUp size={14} style={{ color: '#64748b' }} /> : <ChevronDown size={14} style={{ color: '#64748b' }} />}
                          </td>
                          <td><span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#c9a84c', fontWeight: 600 }}>{je.entry_number}</span></td>
                          <td style={{ fontSize: '0.8125rem' }}>{formatDate(je.entry_date)}</td>
                          <td style={{ color: '#e2e8f0' }}>{je.description}</td>
                          <td>
                            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: typeColors[je.entry_type], background: `${typeColors[je.entry_type]}15`, padding: '0.2rem 0.5rem', borderRadius: '999px', border: `1px solid ${typeColors[je.entry_type]}25` }}>
                              {typeLabels[je.entry_type]}
                            </span>
                          </td>
                          <td><span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', fontWeight: 700 }}>{formatCurrency(je.total_debit)}</span></td>
                          <td>
                            {je.is_balanced
                              ? <span className="badge badge-success">Seimbang</span>
                              : <span className="badge badge-danger">Tdk Seimbang</span>
                            }
                          </td>
                        </tr>
                        {/* Collapsible detail lines */}
                        {isExpanded && (
                          <tr style={{ background: 'rgba(2, 6, 23, 0.4)' }}>
                            <td colSpan={7} style={{ padding: '1rem 2rem' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#64748b' }}>
                                    <th style={{ padding: '0.375rem' }}>Akun</th>
                                    <th style={{ padding: '0.375rem', textAlign: 'right' }}>Debit</th>
                                    <th style={{ padding: '0.375rem', textAlign: 'right' }}>Kredit</th>
                                    <th style={{ padding: '0.375rem' }}>Keterangan Item</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {je.lines?.map((line: import('@/types/database').JournalLine & { account?: import('@/types/database').ChartOfAccount }) => (
                                    <tr key={line.id} style={{ borderBottom: '1px solid rgba(30, 41, 59, 0.3)' }}>
                                      <td style={{ padding: '0.375rem', fontWeight: 500 }}>
                                        <span style={{ color: '#c9a84c', marginRight: '0.5rem', fontFamily: 'monospace' }}>[{line.account?.code}]</span>
                                        <span style={{ color: '#cbd5e1' }}>{line.account?.name}</span>
                                      </td>
                                      <td style={{ padding: '0.375rem', textAlign: 'right', color: line.debit > 0 ? '#f8f4ec' : '#475569' }}>
                                        {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                                      </td>
                                      <td style={{ padding: '0.375rem', textAlign: 'right', color: line.credit > 0 ? '#f8f4ec' : '#475569' }}>
                                        {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                                      </td>
                                      <td style={{ padding: '0.375rem', color: '#94a3b8' }}>{line.description || '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create Journal Entry */}
      {isOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)',
          overflowY: 'auto', padding: '3rem 1rem 10rem 1rem'
        }}>
          <div className="glass-gold" style={{
            background: '#090d16', borderRadius: '1rem', width: '100%', maxWidth: '44rem',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh'
          }}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-6 py-5 border-b border-slate-800/50">
              <h3 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec' }}>Buat Jurnal Umum Baru</h3>
              <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            {/* Body */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
              <div>
                <label className="form-label">Keterangan Jurnal *</label>
                <input type="text" {...register('description')} className="input-base" placeholder="Contoh: Pembayaran sewa kantor, Biaya listrik" />
                <FormError message={errors.description?.message} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Tanggal Transaksi *</label>
                  <input type="date" {...register('entry_date')} className="input-base" />
                  <FormError message={errors.entry_date?.message} />
                </div>
                <div>
                  <label className="form-label">Jenis Jurnal *</label>
                  <select {...register('entry_type')} className="input-base" style={{ background: '#0f172a' }}>
                    <option value="manual">Manual Jurnal</option>
                    <option value="purchase">Pembelian</option>
                    <option value="sale">Penjualan</option>
                    <option value="production">Produksi</option>
                    <option value="adjustment">Penyesuaian (Adjustment)</option>
                  </select>
                  <FormError message={errors.entry_type?.message} />
                </div>
              </div>

              {/* Journal Lines Ledger */}
              <div style={{ border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '1rem', background: '#050811' }}>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-3">
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8' }}>Daftar Akun Ledger</span>
                  <button type="button" onClick={handleAddLineRow} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }}>+ Tambah Baris</button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {fields.map((field, index) => (
                    <div key={field.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <div style={{ flex: 2 }}>
                        <select
                          {...register(`lines.${index}.account_id`)}
                          className="input-base"
                          style={{ background: '#0f172a', width: '100%' }}
                        >
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.code} - {a.name} ({accountTypeLabels[a.account_type]})</option>)}
                        </select>
                        <FormError message={errors.lines?.[index]?.account_id?.message} />
                      </div>
                      
                      <div style={{ flex: 1 }}>
                        <input
                          type="number"
                          step="any"
                          {...register(`lines.${index}.debit`)}
                          onChange={(e) => handleLineChange(index, 'debit', e.target.value)}
                          className="input-base"
                          style={{ width: '100%' }}
                          placeholder="Debit"
                        />
                        <FormError message={errors.lines?.[index]?.debit?.message} />
                      </div>

                      <div style={{ flex: 1 }}>
                        <input
                          type="number"
                          step="any"
                          {...register(`lines.${index}.credit`)}
                          onChange={(e) => handleLineChange(index, 'credit', e.target.value)}
                          className="input-base"
                          style={{ width: '100%' }}
                          placeholder="Kredit"
                        />
                        <FormError message={errors.lines?.[index]?.credit?.message} />
                      </div>

                      <div style={{ flex: 1.5 }}>
                        <input
                          type="text"
                          {...register(`lines.${index}.notes`)}
                          className="input-base"
                          style={{ width: '100%' }}
                          placeholder="Keterangan Baris"
                        />
                        <FormError message={errors.lines?.[index]?.notes?.message} />
                      </div>

                      <button
                        type="button"
                        onClick={() => remove(index)}
                        disabled={fields.length <= 2}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: fields.length <= 2 ? 'not-allowed' : 'pointer', padding: '0.25rem', marginBottom: errors.lines?.[index] ? '1.5rem' : '0' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {errors.lines?.root && <FormError message={errors.lines.root.message} />}
                </div>

                {/* Balanced validation footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', borderTop: '1px solid #1e293b', paddingTop: '0.75rem', fontSize: '0.8125rem' }}>
                  <div style={{ color: isBalanced ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                    {isBalanced ? '✓ Jurnal Seimbang' : '✗ Debit & Kredit Harus Seimbang'}
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', color: '#94a3b8' }}>
                    <div>Total Debit: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{formatCurrency(currentDebit)}</span></div>
                    <div>Total Kredit: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{formatCurrency(currentCredit)}</span></div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{ marginTop: '0.5rem', borderTop: '1px solid rgba(51, 65, 85, 0.3)', paddingTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button type="button" onClick={() => setIsOpen(false)} className="btn btn-secondary btn-sm" disabled={submitting}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} disabled={submitting || !isBalanced}>
                  {submitting && <Loader2 size={12} className="animate-spin" />}
                  Simpan Jurnal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}


