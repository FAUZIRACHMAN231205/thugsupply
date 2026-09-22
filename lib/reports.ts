import { supabase } from '@/lib/supabase/supabase'
import type { AccountBalance, MonthlyProfitSummary } from '@/types/database'

// Perhitungan laporan dilakukan di database (migration 010), bukan dengan
// mengambil semua journal_lines ke browser yang terpotong limit baris Supabase.

export async function fetchAccountBalances(from?: string, to?: string): Promise<AccountBalance[]> {
  const { data, error } = await supabase.rpc('account_balances', {
    p_from: from ?? null,
    p_to: to ?? null,
  })
  if (error) throw error
  return ((data || []) as AccountBalance[]).map(row => ({
    ...row,
    total_debit: Number(row.total_debit) || 0,
    total_credit: Number(row.total_credit) || 0,
    balance: Number(row.balance) || 0,
  }))
}

export async function fetchMonthlyProfitSummary(months: number): Promise<MonthlyProfitSummary[]> {
  const { data, error } = await supabase.rpc('monthly_profit_summary', { p_months: months })
  if (error) throw error
  return ((data || []) as MonthlyProfitSummary[]).map(row => ({
    month: row.month,
    revenue: Number(row.revenue) || 0,
    cogs: Number(row.cogs) || 0,
    expense: Number(row.expense) || 0,
  }))
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

// '2026-09-01' → 'Sep 26'
export function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-')
  return `${monthNames[parseInt(m, 10) - 1]} ${year.slice(-2)}`
}
