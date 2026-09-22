'use client'

import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { formatMonthLabel } from '@/lib/reports'
import type { MonthlyProfitSummary } from '@/types/database'
import StatusBadge from '@/components/ui/StatusBadge'
import PageSkeleton from '@/components/ui/PageSkeleton'
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Factory,
  AlertTriangle,
  FileText,
  Users,
  Package,
  ArrowUpRight,
  ArrowRight,
  Loader2,
  RefreshCw
} from 'lucide-react'
import Link from 'next/link'


const DashboardCharts = dynamic(() => import('@/components/dashboard/DashboardCharts'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center text-slate-500">
      <Loader2 size={24} className="animate-spin text-gold-500" />
    </div>
  ),
})

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  trend?: { value: string; up: boolean }
  color: string
  href?: string
}

function StatCard({ label, value, icon, trend, color, href }: StatCardProps) {
  const cardContent = (
    <div className="card-hover" style={{
      background: '#0f172a',
      border: '1px solid #1e293b',
      borderRadius: '0.75rem',
      padding: '1.5rem',
      cursor: href ? 'pointer' : 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ background: `${color}18`, borderRadius: '0.625rem', padding: '0.625rem', color }}>
          {icon}
        </div>
        {trend && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: trend.up ? '#22c55e' : '#ef4444' }}>
            {trend.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend.value}
          </div>
        )}
        {href && <ArrowUpRight size={14} style={{ color: '#334155' }} />}
      </div>
      <div style={{ fontSize: '1.625rem', fontWeight: 700, color: '#f8f4ec', lineHeight: 1, marginBottom: '0.375rem', fontFamily: 'Cormorant Garamond, serif' }}>
        {value}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>{label}</div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: 'none' }}>
        {cardContent}
      </Link>
    )
  }
  return <>{cardContent}</>
}

export default function DashboardPage() {
  const { data, isLoading: loading, error, refetch } = useQuery({
    queryKey: ['dashboard_data'],
    queryFn: async () => {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)
      const startOfMonthStr = startOfMonth.toISOString().split('T')[0]

      // ✅ Semua 9 query jalan PARALEL dengan Promise.all
      try {
        const [
          invoicesRes,
          poRes,
          woRes,
          matRes,
          pendingInvRes,
          quoRes,
          custRes,
          suppRes,
          monthlyRes,
        ] = await Promise.all([
          supabase.from('invoices').select('total_amount, issue_date').gte('issue_date', startOfMonthStr),
          supabase.from('purchase_orders').select('total_amount').gte('order_date', startOfMonthStr).eq('status', 'received'),
          supabase.from('work_orders').select('*, product:products(name, code)').eq('status', 'in_progress').order('created_at', { ascending: false }).limit(5),
          supabase.from('materials').select('*').eq('is_active', true),
          supabase.from('invoices').select('*, customer:customers(name)').in('status', ['sent', 'overdue', 'partial']).order('due_date', { ascending: true }).limit(5),
          supabase.from('quotations').select('*', { count: 'exact', head: true }).in('status', ['draft', 'sent']),
          supabase.from('customers').select('*', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('is_active', true),
          // Ringkasan bulanan dihitung di database (lihat migration 010)
          supabase.rpc('monthly_profit_summary', { p_months: 5 }),
        ]);

        // Cek error dari semua query
        const errors = [invoicesRes, poRes, woRes, matRes, pendingInvRes, quoRes, custRes, suppRes, monthlyRes]
          .filter(r => r.error)
          .map(r => r.error!.message)
        
        if (errors.length > 0) {
          console.error('Ada error di query Supabase:', errors);
          throw new Error(errors.join('; '));
        }

      // Hitung revenue bulan ini
      const monthlyRevenue = (invoicesRes.data || []).reduce(
        (sum, inv) => sum + (Number(inv.total_amount) || 0), 0
      )

      // Hitung total pembelian bulan ini
      const monthlyPurchase = (poRes.data || []).reduce(
        (sum, po) => sum + (Number(po.total_amount) || 0), 0
      )

      // Filter low stock materials
      const allMaterials = matRes.data || []
      const lowMaterials = allMaterials.filter(
        m => (m.current_stock || 0) <= (m.reorder_point || 0)
      )

      // Grafik 5 bulan terakhir dari jurnal
      const monthly = ((monthlyRes.data || []) as MonthlyProfitSummary[]).map(m => ({
        month: m.month,
        revenue: Number(m.revenue) || 0,
        cogs: Number(m.cogs) || 0,
      }))

      // Jika belum ada jurnal sama sekali (Supabase baru), pakai total invoice
      // bulan ini sebagai proxy pendapatan
      const hasJournal = monthly.some(m => m.revenue !== 0 || m.cogs !== 0)
      if (!hasJournal && monthly.length > 0) {
        monthly[monthly.length - 1].revenue = monthlyRevenue
      }

      const rawChart = monthly.map(m => ({
        month: formatMonthLabel(m.month),
        pendapatan: m.revenue,
        hppb: m.cogs,
      }))

      return {
        stats: {
          total_revenue_month: monthlyRevenue,
          total_purchase_month: monthlyPurchase,
          active_work_orders: (woRes.data || []).length,
          low_stock_items: lowMaterials.length,
          pending_invoices: (pendingInvRes.data || []).length,
          pending_quotations: quoRes.count || 0,
          total_customers: custRes.count || 0,
          total_suppliers: suppRes.count || 0,
        },
        lowStockMaterials: lowMaterials.slice(0, 4),
        pendingInvoices: (pendingInvRes.data || []).slice(0, 4),
        activeWOs: (woRes.data || []).slice(0, 4),
        chartData: rawChart
      }
      } catch (err: unknown) {
        console.error('FATAL ERROR saat memuat data:', err);
        throw new Error((err as Error).message || 'Terjadi kesalahan sistem yang tidak diketahui saat memuat data');
      }
    }
  })

  const stats = data?.stats || {
    total_revenue_month: 0,
    total_purchase_month: 0,
    active_work_orders: 0,
    low_stock_items: 0,
    pending_invoices: 0,
    pending_quotations: 0,
    total_customers: 0,
    total_suppliers: 0,
  }
  const lowStockMaterials = data?.lowStockMaterials || []
  const pendingInvoices = data?.pendingInvoices || []
  const activeWOs = data?.activeWOs || []
  const chartData = data?.chartData || []

  if (loading && !data) {
    return <PageSkeleton />
  }

  if (error) {
    return (
      <div style={{ padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: '#ef4444' }}>
        <AlertTriangle size={48} />
        <span style={{ fontWeight: 'bold' }}>Gagal memuat data dashboard.</span>
        <span style={{ fontSize: '0.875rem', background: 'rgba(239,68,68,0.1)', padding: '0.5rem', borderRadius: '0.25rem', fontFamily: 'monospace' }}>
          {(error as Error)?.message || 'Terjadi kesalahan pada koneksi Supabase.'}
        </span>
        <button onClick={() => refetch()} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <RefreshCw size={14} /> Coba Lagi
        </button>
      </div>
    )
  }

  return (
    <div className="page-modules">
      {/* Welcome Banner */}
      <div 
        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          border: '1px solid rgba(201,168,76,0.15)',
          borderRadius: '0.875rem',
          padding: '1.5rem 2rem',
      }}>
        <div style={{
          position: 'absolute',
          top: '-3rem',
          right: '-3rem',
          width: '12rem',
          height: '12rem',
          background: 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)',
          borderRadius: '50%',
        }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.625rem', fontWeight: 600, color: '#f8f4ec' }}>
            Selamat Datang, <span style={{ color: '#c9a84c' }}>Admin</span>
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.25rem' }}>
            Berikut adalah ringkasan operasional Thug Supply hari ini
          </div>
        </div>
        <button onClick={() => refetch()} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', position: 'relative', zIndex: 10 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="module-grid-stats">
        <StatCard
          label="Pendapatan Bulan Ini"
          value={formatCurrency(stats.total_revenue_month)}
          icon={<TrendingUp size={18} />}
          trend={{ value: '+12.4%', up: true }}
          color="#c9a84c"
          href="/sales/invoices"
        />
        <StatCard
          label="Pembelian Bulan Ini"
          value={formatCurrency(stats.total_purchase_month)}
          icon={<ShoppingCart size={18} />}
          trend={{ value: '+8.2%', up: false }}
          color="#3b82f6"
          href="/inventory/purchase-orders"
        />
        <StatCard
          label="Work Order Aktif"
          value={stats.active_work_orders}
          icon={<Factory size={18} />}
          color="#a855f7"
          href="/manufacturing/work-orders"
        />
        <StatCard
          label="Stok Hampir Habis"
          value={stats.low_stock_items}
          icon={<AlertTriangle size={18} />}
          color="#ef4444"
          href="/inventory"
        />
        <StatCard
          label="Invoice Pending"
          value={stats.pending_invoices}
          icon={<FileText size={18} />}
          color="#f59e0b"
          href="/sales/invoices"
        />
        <StatCard
          label="Penawaran Aktif"
          value={stats.pending_quotations}
          icon={<FileText size={18} />}
          color="#06b6d4"
          href="/sales/quotations"
        />
        <StatCard
          label="Total Customer"
          value={stats.total_customers}
          icon={<Users size={18} />}
          color="#22c55e"
          href="/sales/customers"
        />
        <StatCard
          label="Total Supplier"
          value={stats.total_suppliers}
          icon={<Package size={18} />}
          color="#8b5cf6"
          href="/inventory/suppliers"
        />
      </div>

      {/* Charts + Tables Row */}
      <div className="module-grid-chart">
        {/* Revenue Chart */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>
                Tren Pendapatan vs HPP
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>5 bulan terakhir</div>
            </div>
            <span className="badge badge-success">Live</span>
          </div>
          <DashboardCharts data={chartData} />
        </div>

        {/* Active Work Orders */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>
              Work Order Aktif
            </div>
            <Link href="/manufacturing/work-orders" style={{ fontSize: '0.75rem', color: '#c9a84c', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              Lihat Semua <ArrowRight size={12} />
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeWOs.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>Tidak ada Work Order aktif</div>
            ) : (
              activeWOs.map((wo) => {
                const progress = wo.status === 'completed' ? 100 : wo.status === 'in_progress' ? 60 : 20
                return (
                  <div key={wo.id} style={{
                    background: '#1e293b',
                    borderRadius: '0.5rem',
                    padding: '0.875rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#e2e8f0' }}>{wo.product?.name}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{wo.wo_number} · {wo.quantity} pcs</div>
                      </div>
                      <StatusBadge status={wo.status} size="sm" />
                    </div>
                    <div style={{ background: '#0f172a', borderRadius: '999px', height: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #c9a84c, #e5b528)', borderRadius: '999px', transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ fontSize: '0.625rem', color: '#475569', marginTop: '0.375rem' }}>
                      Target: {formatDate(wo.target_date)} · {progress}% selesai
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="module-grid-2">
        {/* Low Stock Alert */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={16} style={{ color: '#ef4444' }} />
              <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>
                Peringatan Stok Rendah
              </span>
            </div>
            <Link href="/inventory" style={{ fontSize: '0.75rem', color: '#c9a84c', textDecoration: 'none' }}>
              Lihat Semua
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {lowStockMaterials.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>Semua stok bahan baku aman</div>
            ) : (
              lowStockMaterials.map((mat) => (
                <div key={mat.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: 'rgba(239,68,68,0.05)',
                  border: '1px solid rgba(239,68,68,0.12)',
                  borderRadius: '0.5rem',
                }}>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#e2e8f0' }}>{mat.name}</div>
                    <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{mat.code} · Min: {mat.reorder_point} {mat.unit}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ef4444', fontFamily: 'Cormorant Garamond, serif' }}>
                      {mat.current_stock}
                    </div>
                    <div style={{ fontSize: '0.625rem', color: '#64748b' }}>{mat.unit}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending Invoices */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>
              Invoice Pending
            </div>
            <Link href="/sales/invoices" style={{ fontSize: '0.75rem', color: '#c9a84c', textDecoration: 'none' }}>
              Lihat Semua
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {pendingInvoices.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>Tidak ada invoice pending</div>
            ) : (
              pendingInvoices.map((inv) => (
                <div key={inv.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  background: '#1e293b',
                  borderRadius: '0.5rem',
                }}>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#e2e8f0' }}>{inv.customer?.name}</div>
                    <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{inv.invoice_number} · Jatuh tempo: {formatDate(inv.due_date)}</div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#f8f4ec', fontFamily: 'Cormorant Garamond, serif' }}>
                      {formatCurrency(inv.total_amount - inv.paid_amount)}
                    </div>
                    <StatusBadge status={inv.status} size="sm" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


