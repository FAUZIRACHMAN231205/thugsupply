'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/supabase'
import { formatCurrency } from '@/lib/utils'
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

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

export default function ProfitLossPage() {
  const { data, isLoading: loading } = useQuery({
    queryKey: ['profit_loss_data'],
    queryFn: async () => {
      // 1. Fetch COA accounts
      const accountsRes = await supabase.from('chart_of_accounts').select('*')
      if (accountsRes.error) throw accountsRes.error
      const accounts = accountsRes.data || []

      // 2. Fetch Journal Lines joining Journal Entries to get dates
      const linesRes = await supabase
        .from('journal_lines')
        .select('*, entry:journal_entries(entry_date)')
      if (linesRes.error) throw linesRes.error
      const lines = linesRes.data || []

      // 3. Compute balances dynamically
      const accountBalances: Record<string, number> = {}
      accounts.forEach(acc => {
        const accLines = lines.filter(l => l.account_id === acc.id)
        const debit = accLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0)
        const credit = accLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0)

        if (['asset', 'expense'].includes(acc.account_type)) {
          accountBalances[acc.id] = debit - credit
        } else {
          accountBalances[acc.id] = credit - debit
        }
      })

      // 4. Construct P&L sections
      const revenueItems: PLItem[] = []
      const cogsItems: PLItem[] = []
      const expenseItems: PLItem[] = []

      accounts.forEach(acc => {
        const amount = accountBalances[acc.id] || 0
        if (acc.account_type === 'revenue') {
          revenueItems.push({ label: acc.name, amount })
        } else if (acc.account_type === 'expense' && acc.code.startsWith('5')) {
          cogsItems.push({ label: acc.name, amount })
        } else if (acc.account_type === 'expense' && acc.code.startsWith('6')) {
          expenseItems.push({ label: acc.name, amount })
        }
      })

      const totalRevenue = revenueItems.reduce((s, i) => s + i.amount, 0)
      const totalCogs = cogsItems.reduce((s, i) => s + i.amount, 0)
      const totalExpense = expenseItems.reduce((s, i) => s + i.amount, 0)

      const sections: PLSection[] = [
        { category: 'Pendapatan', items: revenueItems, total: totalRevenue, type: 'revenue' },
        { category: 'Harga Pokok', items: cogsItems, total: totalCogs, type: 'expense' },
        { category: 'Biaya Operasional', items: expenseItems, total: totalExpense, type: 'expense' }
      ]

      // 5. Generate dynamic monthly chart data
      // Group by Month/Year of journal entries
      const monthlyGroups: Record<string, { revenue: number; cogs: number }> = {}

      // Seed current year months
      for (let i = 0; i < 6; i++) { // show last 6 months
        const date = new Date()
        date.setMonth(date.getMonth() - i)
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`
        monthlyGroups[monthKey] = { revenue: 0, cogs: 0 }
      }

      lines.forEach((line: { debit: number; credit: number; account_id: string; entry?: { entry_date: string } }) => {
        if (!line.entry?.entry_date) return
        const date = new Date(line.entry.entry_date)
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`
        
        // If not in our seed range, ignore
        if (monthlyGroups[monthKey] === undefined) return

        const acc = accounts.find(a => a.id === line.account_id)
        if (!acc) return

        const debit = Number(line.debit) || 0
        const credit = Number(line.credit) || 0

        if (acc.account_type === 'revenue') {
          monthlyGroups[monthKey].revenue += (credit - debit)
        } else if (acc.account_type === 'expense' && acc.code.startsWith('5')) {
          monthlyGroups[monthKey].cogs += (debit - credit)
        }
      })

      const rawChart = Object.entries(monthlyGroups).map(([key, vals]) => {
        const [year, month] = key.split('-')
        const monthIndex = parseInt(month, 10) - 1
        return {
          key,
          month: `${monthNames[monthIndex]} ${year.slice(-2)}`,
          'Pendapatan': vals.revenue,
          'Laba Kotor': vals.revenue - vals.cogs
        }
      }).reverse()

      return {
        plData: sections,
        chartData: rawChart
      }
    }
  })

  const plData = data?.plData || []
  const chartData = data?.chartData || []

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
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem', fontWeight: 600, color: '#f8f4ec', marginBottom: '0.25rem' }}>
          Laporan Laba Rugi
        </div>
        <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Diupdate langsung berdasarkan buku besar akuntansi</div>
      </div>

      <div className="module-grid-split">
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


