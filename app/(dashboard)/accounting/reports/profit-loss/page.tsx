'use client'

import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from 'date-fns'
import { fetchAccountBalances, fetchMonthlyProfitSummary, formatMonthLabel } from '@/lib/reports'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { AccountBalance } from '@/types/database'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react'


interface PLItem {
  label: string
  amount: number
}

interface PLSection {
  category: string
  items: PLItem[]
  total: number
  type: 'revenue' | 'expense'
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; color: string; value: number }[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.75rem' }}>
        <p style={{ color: '#94a3b8', marginBottom: '0.5rem' }}>{label}</p>
        {payload.map((entry: { name: string; color: string; value: number }) => (
          <p key={entry.name} style={{ color: entry.color }}>{entry.name}: {formatCurrency(entry.value)}</p>
        ))}
      </div>
    )
  }
  return null
}

type PeriodPreset = 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'all' | 'custom'

const periodOptions: { value: PeriodPreset; label: string }[] = [
  { value: 'this_month', label: 'Bulan ini' },
  { value: 'last_month', label: 'Bulan lalu' },
  { value: 'this_year', label: 'Tahun ini' },
  { value: 'last_year', label: 'Tahun lalu' },
  { value: 'all', label: 'Semua waktu' },
  { value: 'custom', label: 'Kustom' },
]

interface Period {
  from?: string
  to?: string
}

const toDateStr = (d: Date) => format(d, 'yyyy-MM-dd')

function resolvePeriod(preset: PeriodPreset, customFrom: string, customTo: string): Period {
  const today = new Date()
  switch (preset) {
    case 'this_month':
      return { from: toDateStr(startOfMonth(today)), to: toDateStr(endOfMonth(today)) }
    case 'last_month': {
      const lastMonth = subMonths(today, 1)
      return { from: toDateStr(startOfMonth(lastMonth)), to: toDateStr(endOfMonth(lastMonth)) }
    }
    case 'this_year':
      return { from: toDateStr(startOfYear(today)), to: toDateStr(endOfYear(today)) }
    case 'last_year': {
      const lastYear = subYears(today, 1)
      return { from: toDateStr(startOfYear(lastYear)), to: toDateStr(endOfYear(lastYear)) }
    }
    case 'custom':
      return { from: customFrom || undefined, to: customTo || undefined }
    default:
      return {}
  }
}

function periodLabel({ from, to }: Period): string {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`
  if (from) return `Sejak ${formatDate(from)}`
  if (to) return `Sampai ${formatDate(to)}`
  return 'Semua waktu'
}

// HPP = akun beban berkode 5xxx, biaya operasional = akun beban berkode 6xxx
function buildSections(accounts: AccountBalance[]): PLSection[] {
  const revenueItems: PLItem[] = []
  const cogsItems: PLItem[] = []
  const expenseItems: PLItem[] = []

  accounts.forEach(acc => {
    if (acc.account_type === 'revenue') {
      revenueItems.push({ label: acc.name, amount: acc.balance })
    } else if (acc.account_type === 'expense' && acc.code.startsWith('5')) {
      cogsItems.push({ label: acc.name, amount: acc.balance })
    } else if (acc.account_type === 'expense' && acc.code.startsWith('6')) {
      expenseItems.push({ label: acc.name, amount: acc.balance })
    }
  })

  const total = (items: PLItem[]) => items.reduce((s, i) => s + i.amount, 0)

  return [
    { category: 'Pendapatan', items: revenueItems, total: total(revenueItems), type: 'revenue' },
    { category: 'Harga Pokok', items: cogsItems, total: total(cogsItems), type: 'expense' },
    { category: 'Biaya Operasional', items: expenseItems, total: total(expenseItems), type: 'expense' }
  ]
}

export default function ProfitLossPage() {
  const [preset, setPreset] = useState<PeriodPreset>('this_year')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const period = resolvePeriod(preset, customFrom, customTo)
  const invalidRange = !!(period.from && period.to && period.from > period.to)

  // Saldo akun per periode dihitung di database (lihat migration 010)
  const { data: plData = [], isLoading: loading, isFetching, error } = useQuery({
    queryKey: ['profit_loss_data', 'balances', period.from ?? null, period.to ?? null],
    queryFn: async () => buildSections(await fetchAccountBalances(period.from, period.to)),
    enabled: !invalidRange,
    placeholderData: keepPreviousData
  })

  // Grafik selalu 6 bulan terakhir, tidak mengikuti filter periode
  const { data: chartData = [] } = useQuery({
    queryKey: ['profit_loss_data', 'monthly'],
    queryFn: async () => (await fetchMonthlyProfitSummary(6)).map(m => ({
      key: m.month,
      month: formatMonthLabel(m.month),
      'Pendapatan': m.revenue,
      'Laba Kotor': m.revenue - m.cogs
    }))
  })

  if (error && plData.length === 0) {
    return (
      <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: '#ef4444', textAlign: 'center' }}>
        <span>Gagal memuat Laporan Laba Rugi.</span>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{error.message}</span>
      </div>
    )
  }

  if (loading || plData.length === 0) {
    return (
      <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
        <Loader2 size={24} className="animate-spin text-[#c9a84c]" />
        <span>Menghitung Laba Rugi...</span>
      </div>
    )
  }

  const revenueSection = plData[0]
  const cogsSection = plData[1]
  const expenseSection = plData[2]

  const grossProfit = revenueSection.total - cogsSection.total
  const netProfit = grossProfit - expenseSection.total
  const grossMargin = revenueSection.total > 0 ? ((grossProfit / revenueSection.total) * 100).toFixed(1) : '0'
  const netMargin = revenueSection.total > 0 ? ((netProfit / revenueSection.total) * 100).toFixed(1) : '0'

  return (
    <div className="page-modules">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4" style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
        <div>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem', fontWeight: 600, color: '#f8f4ec', marginBottom: '0.25rem' }}>
            Laporan Laba Rugi
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>Periode: {periodLabel(period)}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Diupdate langsung berdasarkan buku besar akuntansi</div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="form-label">Periode</label>
            <select value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)} className="input-base" style={{ background: '#0f172a' }}>
              {periodOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <label className="form-label">Dari Tanggal</label>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input-base" />
              </div>
              <div>
                <label className="form-label">Sampai Tanggal</label>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input-base" />
              </div>
            </>
          )}
        </div>
      </div>

      {invalidRange && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#ef4444', fontSize: '0.8125rem' }}>
          Tanggal awal harus sebelum atau sama dengan tanggal akhir. Angka di bawah masih dari periode sebelumnya.
        </div>
      )}

      <div className="module-grid-split" style={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 150ms' }}>
        {/* P&L Statement */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
          {plData.map((section) => (
            <div key={section.category}>
              <div style={{
                padding: '0.875rem 1.25rem',
                background: section.type === 'revenue' ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                borderBottom: '1px solid #1e293b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontWeight: 700, color: section.type === 'revenue' ? '#22c55e' : '#ef4444', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {section.category}
                </span>
              </div>
              
              {section.items.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.625rem 1.25rem', color: '#64748b', fontSize: '0.8125rem' }}>
                  <span>Tidak ada data</span>
                  <span>-</span>
                </div>
              ) : (
                section.items.map((item) => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.625rem 1.25rem', borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                    <span style={{ fontSize: '0.8125rem', color: '#94a3b8', paddingLeft: '0.75rem' }}>{item.label}</span>
                    <span style={{ fontSize: '0.8125rem', color: '#e2e8f0', fontWeight: 500 }}>{formatCurrency(item.amount)}</span>
                  </div>
                ))
              )}

              <div style={{
                display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1.25rem',
                borderBottom: '2px solid #1e293b',
                background: '#060d1f',
              }}>
                <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: '0.8125rem' }}>Total {section.category}</span>
                <span style={{ fontWeight: 700, color: section.type === 'revenue' ? '#22c55e' : '#ef4444', fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem' }}>
                  {section.type === 'expense' ? '(' : ''}{formatCurrency(section.total)}{section.type === 'expense' ? ')' : ''}
                </span>
              </div>
            </div>
          ))}

          {/* Gross Profit */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.875rem 1.25rem', background: 'rgba(201,168,76,0.06)', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>
            <span style={{ fontWeight: 700, color: '#c9a84c' }}>Laba Kotor</span>
            <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 700, color: '#c9a84c' }}>{formatCurrency(grossProfit)}</span>
          </div>

          {/* Net Profit */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 1.25rem', background: netProfit >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)' }}>
            <span style={{ fontWeight: 700, color: '#f8f4ec', fontSize: '1rem' }}>Laba Bersih</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.375rem', fontWeight: 700, color: netProfit >= 0 ? '#22c55e' : '#ef4444' }}>
                {formatCurrency(netProfit)}
              </span>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Margin: {netMargin}%</div>
            </div>
          </div>
        </div>

        {/* Chart + Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {[
              { label: 'Total Pendapatan', value: formatCurrency(revenueSection.total), icon: <TrendingUp size={16} />, color: '#22c55e' },
              { label: 'Total Biaya', value: formatCurrency(cogsSection.total + expenseSection.total), icon: <TrendingDown size={16} />, color: '#ef4444' },
              { label: 'Margin Kotor', value: `${grossMargin}%`, icon: <TrendingUp size={16} />, color: '#c9a84c' },
              { label: 'Margin Bersih', value: `${netMargin}%`, icon: <TrendingUp size={16} />, color: '#3b82f6' },
            ].map(s => (
              <div key={s.label} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.625rem', padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: s.color }}>{s.icon}<span style={{ fontSize: '0.6875rem', color: '#64748b' }}>{s.label}</span></div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Bar Chart */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.25rem', flex: 1 }}>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', fontWeight: 600, color: '#f8f4ec', marginBottom: '1rem' }}>
              Tren Bulanan
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000000).toFixed(0)}jt`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Pendapatan" fill="#22c55e" radius={[4,4,0,0]} fillOpacity={0.7} />
                <Bar dataKey="Laba Kotor" fill="#c9a84c" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}


