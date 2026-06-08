'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useUser } from '@/components/providers/UserProvider'
import NavLink from './NavLink'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  BarChart3,
  Factory,
  Users,
  FileText,
  TrendingUp,
  Warehouse,
  ClipboardList,
  Receipt,
  BookOpen,
  Scale,
  ChevronDown,
  Menu,
  X,
  Layers,
  ScrollText,
  Truck
} from 'lucide-react'

const navGroups = [
  {
    label: 'Utama',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard size={16} /> },
    ]
  },
  {
    label: 'Pembelian & Inventori',
    items: [
      { label: 'Stok Barang', href: '/inventory', icon: <Warehouse size={16} /> },
      { label: 'Bahan Baku', href: '/inventory/materials', icon: <Package size={16} /> },
      { label: 'Purchase Order', href: '/inventory/purchase-orders', icon: <ShoppingCart size={16} /> },
      { label: 'Supplier', href: '/inventory/suppliers', icon: <Truck size={16} /> },
      { label: 'Mutasi Stok', href: '/inventory/movements', icon: <TrendingUp size={16} /> },
    ]
  },
  {
    label: 'Penjualan',
    items: [
      { label: 'Produk', href: '/sales/products', icon: <Layers size={16} /> },
      { label: 'Customer', href: '/sales/customers', icon: <Users size={16} /> },
      { label: 'Penawaran Harga', href: '/sales/quotations', icon: <FileText size={16} /> },
      { label: 'Invoice', href: '/sales/invoices', icon: <Receipt size={16} /> },
    ]
  },
  {
    label: 'Manufaktur',
    items: [
      { label: 'Bill of Materials', href: '/manufacturing/bom', icon: <ClipboardList size={16} /> },
      { label: 'Work Order', href: '/manufacturing/work-orders', icon: <Factory size={16} /> },
    ]
  },
  {
    label: 'Akuntansi',
    items: [
      { label: 'Daftar Akun (COA)', href: '/accounting/chart-of-accounts', icon: <BookOpen size={16} /> },
      { label: 'Jurnal', href: '/accounting/journal', icon: <ScrollText size={16} /> },
      { label: 'Laba Rugi', href: '/accounting/reports/profit-loss', icon: <BarChart3 size={16} /> },
      { label: 'Neraca', href: '/accounting/reports/balance-sheet', icon: <Scale size={16} /> },
    ]
  },
]

interface SidebarProps {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
}

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }: SidebarProps) {
  const pathname = usePathname()
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'Utama': true,
    'Pembelian & Inventori': true,
    'Penjualan': true,
    'Manufaktur': true,
    'Akuntansi': true,
  })
  const { email: userEmail, initial: userInitial } = useUser()

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const toggleGroup = (groupLabel: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupLabel]: !prev[groupLabel]
    }))
  }

  return (
    <>
      {/* Sidebar Container */}
      <aside className={`sidebar-container ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="flex flex-col h-full bg-slate-925/80 backdrop-blur-xl border-r border-slate-800">
          {/* Logo Section */}
          <div className="h-14 flex items-center justify-between px-6 border-b border-slate-800/50 flex-shrink-0 relative overflow-hidden">
            {/* Subtle glow */}
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-gold-500/20 to-transparent"></div>
            
            <div className="sidebar-logo-text flex flex-col">
              <div className="font-display text-[1.375rem] font-bold tracking-tight text-gold-500 leading-none">
                THUG SUPPLY
              </div>
              <div className="text-[0.625rem] text-slate-500 tracking-[0.15em] uppercase mt-0.5 font-medium">
                Management System
              </div>
            </div>
            
            <div className="sidebar-logo-collapsed">
              <div className="font-display text-xl font-bold text-gold-500">TS</div>
            </div>

            {/* Toggle Collapse Button (Desktop Only) */}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="desktop-collapse-toggle text-slate-500 hover:text-gold-500 hover:bg-slate-800/50 p-1 rounded-md transition-all duration-200"
            >
              <Menu size={16} />
            </button>

            {/* Close Button (Mobile Only) */}
            <button
              onClick={() => setMobileOpen(false)}
              className="mobile-close-btn hidden md:hidden text-slate-500 hover:text-gold-500 hover:bg-slate-800/50 p-1 rounded-md transition-all duration-200"
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation Section */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1 custom-scrollbar">
            {navGroups.map((group) => {
              const isExpanded = expandedGroups[group.label] !== false
              return (
                <div key={group.label} className="sidebar-group mb-3">
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="w-full flex items-center justify-between text-[0.625rem] font-bold text-slate-500 uppercase tracking-widest px-3 py-1.5 mb-1 text-left hover:text-gold-400 sidebar-group-header transition-colors duration-200"
                  >
                    <span className="sidebar-group-header-text">{group.label}</span>
                    <ChevronDown
                      size={12}
                      className="sidebar-group-chevron text-slate-600 transition-transform duration-300"
                      style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    />
                  </button>
                  
                  {/* Items wrapper */}
                  <div className={`sidebar-group-items space-y-0.5 ${isExpanded ? 'expanded' : 'collapsed'}`}>
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        href={item.href || '#'}
                        label={item.label}
                        icon={item.icon}
                        active={isActive(item.href || '')}
                        onNavigate={() => {
                          if (mobileOpen) setMobileOpen(false)
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </nav>

          {/* User Info Section */}
          <div className="p-4 border-t border-slate-800/50 flex items-center gap-3 shrink-0 bg-slate-900/30">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold-500 to-gold-700 flex items-center justify-center shrink-0 text-xs font-bold text-slate-950 shadow-[0_0_10px_rgba(201,168,76,0.2)]">
              {userInitial}
            </div>
            <div className="sidebar-profile-details flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-200 truncate">{userEmail || 'Memuat...'}</div>
              <div className="text-xs text-slate-500">Administrator</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="sidebar-overlay fixed inset-0 bg-slate-950/80 z-40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  )
}
