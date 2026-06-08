'use client'

import { useState, useEffect } from 'react'
import { Bell, Search, Menu, LogOut, User } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/components/providers/UserProvider'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'

const breadcrumbMap: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/inventory': 'Stok Barang',
  '/inventory/materials': 'Bahan Baku',
  '/inventory/purchase-orders': 'Purchase Order',
  '/inventory/suppliers': 'Supplier',
  '/inventory/movements': 'Mutasi Stok',
  '/sales/products': 'Produk',
  '/sales/customers': 'Customer',
  '/sales/quotations': 'Penawaran Harga',
  '/sales/invoices': 'Invoice',
  '/manufacturing/bom': 'Bill of Materials',
  '/manufacturing/work-orders': 'Work Order',
  '/accounting/chart-of-accounts': 'Daftar Akun (COA)',
  '/accounting/journal': 'Jurnal',
  '/accounting/reports/profit-loss': 'Laporan Laba Rugi',
  '/accounting/reports/balance-sheet': 'Neraca',
}

interface TopbarProps {
  onMenuClick: () => void
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const pageName = breadcrumbMap[pathname] || 'Thug Supply ERP'
  const { email: userEmail, initial: userInitial } = useUser()
  const [dateStr, setDateStr] = useState('')

  useEffect(() => {
    setTimeout(() => {
      setDateStr(
        new Date().toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      )
    }, 0)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-14 border-b border-slate-700/40 bg-slate-925/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Left: Page Name & Mobile Menu Toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden hover:text-gold-500 hover:bg-slate-900 transition-all duration-200 text-slate-400 p-1.5 rounded-md flex items-center justify-center"
        >
          <Menu size={20} />
        </button>
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground leading-none">
            {pageName}
          </h1>
          <div className="text-[11px] text-slate-500 mt-0.5 min-h-[16px]">
            {dateStr}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="hidden sm:block relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Cari..."
            className="input-base !pl-9 !py-1.5 !w-48"
          />
        </div>

        {/* Notifications */}
        <button className="relative bg-surface border border-slate-800 rounded-lg p-2 text-slate-500 hover:text-slate-300 flex items-center justify-center transition-colors">
          <Bell size={16} />
        </button>

        {/* User avatar dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-500 to-gold-700 flex items-center justify-center text-xs font-bold text-slate-950 cursor-pointer outline-none hover:ring-2 hover:ring-gold-500/50 transition-all">
              {userInitial}
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[200px] bg-surface border border-slate-800 rounded-lg p-1 shadow-xl animate-fade-in z-50 mr-4 mt-2"
              sideOffset={5}
            >
              <div className="px-3 py-2 border-b border-slate-800/50 mb-1">
                <p className="text-xs text-slate-500">Masuk sebagai</p>
                <p className="text-sm font-medium text-foreground truncate">{userEmail || 'Memuat...'}</p>
              </div>
              
              <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-md cursor-pointer outline-none">
                <User size={14} />
                Profil Saya
              </DropdownMenu.Item>
              
              <DropdownMenu.Separator className="h-px bg-slate-800/50 my-1" />
              
              <DropdownMenu.Item 
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 hover:text-danger rounded-md cursor-pointer outline-none"
              >
                <LogOut size={14} />
                Keluar
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
