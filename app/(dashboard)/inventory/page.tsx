'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/supabase'
import { formatCurrency } from '@/lib/utils'
import { Package, AlertTriangle, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import Link from 'next/link'
import SizeBadge from '@/components/ui/SizeBadge'

function StockIndicator({ current, reorder }: { current: number; reorder: number }) {
  const ratio = reorder > 0 ? current / reorder : current
  const isLow = ratio <= 1
  const isWarning = ratio > 1 && ratio <= 1.5

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: '5rem', background: '#1e293b', borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, (reorder > 0 ? (current / (reorder * 2)) : 0.5) * 100)}%`,
          height: '100%',
          background: isLow ? '#ef4444' : isWarning ? '#f59e0b' : '#22c55e',
          borderRadius: '999px',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: isLow ? '#ef4444' : isWarning ? '#f59e0b' : '#22c55e' }}>
        {current}
      </span>
    </div>
  )
}

export default function InventoryPage() {
  const { data: materials = [], isLoading: loading } = useQuery({
    queryKey: ['inventory_dashboard_materials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      return data || []
    }
  })

  const lowStock = materials.filter(m => m.current_stock <= m.reorder_point)
  const totalValue = materials.reduce((sum, m) => sum + (m.current_stock * m.cost_price), 0)

  return (
    <div className="page-modules">
      <div className="module-grid-stats">
        {[
          { label: 'Total Item', value: materials.length, icon: <Package size={18} />, color: '#c9a84c' },
          { label: 'Stok Rendah', value: lowStock.length, icon: <AlertTriangle size={18} />, color: '#ef4444' },
          { label: 'Nilai Bahan Baku', value: formatCurrency(totalValue), icon: <TrendingUp size={18} />, color: '#22c55e' },
          { label: 'Item Aktif', value: materials.filter(m => m.is_active).length, icon: <TrendingDown size={18} />, color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ background: `${s.color}18`, borderRadius: '0.5rem', padding: '0.5rem', color: s.color }}>{s.icon}</div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>{s.label}</span>
            </div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.5rem', fontWeight: 700, color: '#f8f4ec' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '0.75rem', overflow: 'hidden' }}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 border-b border-slate-800">
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.125rem', fontWeight: 600, color: '#f8f4ec' }}>Stok Bahan Baku</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Level stok semua material</div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Link href="/inventory/movements" className="btn btn-secondary btn-sm">Lihat Mutasi</Link>
            <Link href="/inventory/materials" className="btn btn-primary btn-sm">Kelola Material</Link>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', color: '#64748b' }}>
            <Loader2 size={24} className="animate-spin text-[#c9a84c]" />
            <span>Memuat data...</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama Material</th>
                  <th>Ukuran</th>
                  <th>Kategori</th>
                  <th>Satuan</th>
                  <th>Stok Sekarang</th>
                  <th>Min. Reorder</th>
                  <th>Harga Beli</th>
                  <th>Nilai Stok</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {materials.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Belum ada data stok barang.</td>
                  </tr>
                ) : (
                  materials.map((mat) => {
                    const isLow = mat.current_stock <= mat.reorder_point
                    const isWarning = mat.current_stock > mat.reorder_point && mat.current_stock <= mat.reorder_point * 1.5
                    return (
                      <tr key={mat.id}>
                        <td><span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#c9a84c' }}>{mat.code}</span></td>
                        <td><span style={{ fontWeight: 500, color: '#e2e8f0' }}>{mat.name}</span></td>
                        <td><SizeBadge size={mat.size} /></td>
                        <td><span style={{ fontSize: '0.75rem', color: '#64748b' }}>{mat.category}</span></td>
                        <td><span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{mat.unit}</span></td>
                        <td><StockIndicator current={mat.current_stock} reorder={mat.reorder_point} /></td>
                        <td><span style={{ fontSize: '0.8125rem', color: '#64748b' }}>{mat.reorder_point}</span></td>
                        <td><span style={{ fontSize: '0.8125rem' }}>{formatCurrency(mat.cost_price)}</span></td>
                        <td><span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{formatCurrency(mat.current_stock * mat.cost_price)}</span></td>
                        <td>
                          {isLow
                            ? <span className="badge badge-danger">Kritis</span>
                            : isWarning
                            ? <span className="badge badge-warning">Rendah</span>
                            : <span className="badge badge-success">Aman</span>
                          }
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}


