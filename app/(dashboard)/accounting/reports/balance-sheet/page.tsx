'use client'


import { useQuery } from '@tanstack/react-query'
import { fetchAccountBalances } from '@/lib/reports'
import { formatCurrency } from '@/lib/utils'
import { Loader2, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react'


export default function BalanceSheetPage() {

  const { data: accounts = [], isLoading: loading, error, refetch } = useQuery({
    queryKey: ['balance_sheet_data'],
    // Saldo dihitung di database (lihat migration 010)
    queryFn: () => fetchAccountBalances()
  })

  if (loading) {
    return (
      <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
        <Loader2 size={24} className="animate-spin text-[#c9a84c]" />
        <span>Menghitung Neraca Keuangan...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: '#ef4444' }}>
        <AlertCircle size={32} />
        <span>Gagal memuat data neraca keuangan. Silakan coba lagi.</span>
        <button onClick={() => refetch()} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <RefreshCw size={14} /> Coba Lagi
        </button>
      </div>
    )
  }

  // Filter accounts
  const rawAssets = accounts.filter(a => a.account_type === 'asset')
  const assets = rawAssets.some(a => a.parent_id !== null) 
    ? rawAssets.filter(a => a.parent_id !== null)
    : rawAssets

  const rawLiabilities = accounts.filter(a => a.account_type === 'liability')
  const liabilities = rawLiabilities.some(l => l.parent_id !== null)
    ? rawLiabilities.filter(l => l.parent_id !== null)
    : rawLiabilities

  // Equity accounts (exclude group account if any, code '3000' is group account in standard config)
  const equity = accounts.filter(a => a.account_type === 'equity' && a.code !== '3000')

  // Calculate retained earnings (Revenue - Expense)
  const totalRevenue = accounts
    .filter(a => a.account_type === 'revenue')
    .reduce((sum, a) => sum + (a.balance || 0), 0)

  const totalExpense = accounts
    .filter(a => a.account_type === 'expense')
    .reduce((sum, a) => sum + (a.balance || 0), 0)

  const retainedEarnings = totalRevenue - totalExpense

  // Totals
  const totalAssets = assets.reduce((s, a) => s + (a.balance || 0), 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + (a.balance || 0), 0)
  const totalEquity = equity.reduce((s, a) => s + (a.balance || 0), 0) + retainedEarnings

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity
  const diff = Math.abs(totalAssets - totalLiabilitiesAndEquity)
  const isBalanced = diff < 1 // exact balance or negligible rounding difference

  // Format today's date
  const today = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })

  return (
    <div className="page-modules">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
        <div>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem', fontWeight: 600, color: '#f8f4ec', marginBottom: '0.25rem' }}>
            Neraca Keuangan
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Per: {today}</div>
        </div>
        <button onClick={() => refetch()} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="module-grid-2">
        {/* AKTIVA (Left) */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ padding: '1rem 1.25rem', background: 'rgba(59,130,246,0.08)', borderBottom: '1px solid #1e293b' }}>
              <div style={{ fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.875rem' }}>AKTIVA</div>
            </div>
            <div style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.6875rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem', padding: '0 0.25rem' }}>
                Daftar Aktiva
              </div>
              {assets.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>Tidak ada data akun Aktiva</div>
              ) : (
                assets.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.625rem', marginBottom: '0.125rem', borderRadius: '0.375rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.8125rem', color: '#e2e8f0' }}>{a.name}</span>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', fontFamily: 'monospace' }}>{a.code}</span>
                    </div>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#e2e8f0', alignSelf: 'center' }}>{formatCurrency(a.balance || 0)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div style={{ padding: '1rem', borderTop: '1px solid #1e293b', background: '#0a0f1d' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.625rem' }}>
              <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.8125rem' }}>Total Aktiva</span>
              <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 700, color: '#3b82f6' }}>{formatCurrency(totalAssets)}</span>
            </div>
          </div>
        </div>

        {/* KEWAJIBAN + MODAL (Right) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Kewajiban */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid #1e293b' }}>
              <div style={{ fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.875rem' }}>KEWAJIBAN</div>
            </div>
            <div style={{ padding: '1rem' }}>
              {liabilities.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>Tidak ada data akun Kewajiban</div>
              ) : (
                liabilities.map(a => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.625rem', marginBottom: '0.125rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.8125rem', color: '#e2e8f0' }}>{a.name}</span>
                      <span style={{ fontSize: '0.6875rem', color: '#64748b', fontFamily: 'monospace' }}>{a.code}</span>
                    </div>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#e2e8f0', alignSelf: 'center' }}>{formatCurrency(a.balance || 0)}</span>
                  </div>
                ))
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0.625rem', borderTop: '1px solid #1e293b', marginTop: '0.5rem' }}>
                <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.8125rem' }}>Total Kewajiban</span>
                <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', fontWeight: 700, color: '#ef4444' }}>{formatCurrency(totalLiabilities)}</span>
              </div>
            </div>
          </div>

          {/* Modal / Ekuitas */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.25rem', background: 'rgba(168,85,247,0.08)', borderBottom: '1px solid #1e293b' }}>
              <div style={{ fontWeight: 700, color: '#a855f7', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.875rem' }}>MODAL</div>
            </div>
            <div style={{ padding: '1rem' }}>
              {equity.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.625rem', marginBottom: '0.125rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.8125rem', color: '#e2e8f0' }}>{a.name}</span>
                    <span style={{ fontSize: '0.6875rem', color: '#64748b', fontFamily: 'monospace' }}>{a.code}</span>
                  </div>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#e2e8f0', alignSelf: 'center' }}>{formatCurrency(a.balance || 0)}</span>
                </div>
              ))}
              {/* Dynamic Retained Earnings */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.625rem', marginBottom: '0.125rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>Laba Ditahan (Berjalan)</span>
                  <span style={{ fontSize: '0.6875rem', color: '#64748b', fontFamily: 'monospace' }}>RET-EARN</span>
                </div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: retainedEarnings >= 0 ? '#22c55e' : '#ef4444', alignSelf: 'center' }}>
                  {formatCurrency(retainedEarnings)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0.625rem', borderTop: '1px solid #1e293b', marginTop: '0.5rem' }}>
                <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.8125rem' }}>Total Modal</span>
                <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', fontWeight: 700, color: '#a855f7' }}>{formatCurrency(totalEquity)}</span>
              </div>
            </div>
          </div>

          {/* Balance Check */}
          <div style={{
            background: isBalanced ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${isBalanced ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            borderRadius: '0.625rem',
            padding: '1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isBalanced ? (
                <CheckCircle2 size={16} className="text-[#22c55e]" />
              ) : (
                <AlertCircle size={16} className="text-[#ef4444]" />
              )}
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#f8f4ec' }}>
                {isBalanced ? 'Neraca Seimbang' : `Neraca Selisih: ${formatCurrency(diff)}`}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>Total Kewajiban + Modal</div>
              <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 700, color: isBalanced ? '#22c55e' : '#ef4444' }}>
                {formatCurrency(totalLiabilitiesAndEquity)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


