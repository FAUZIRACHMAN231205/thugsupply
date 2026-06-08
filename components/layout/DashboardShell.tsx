'use client'

import { useState } from 'react'
import { UserProvider } from '@/components/providers/UserProvider'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import RouteProgress from './RouteProgress'

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <UserProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#020617' }}>
        <RouteProgress />
        <Sidebar
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          mobileOpen={mobileOpen}
          setMobileOpen={setMobileOpen}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Topbar onMenuClick={() => setMobileOpen(true)} />
          <main className="p-4 md:p-6" style={{ flex: 1, overflowY: 'auto' }}>
            {children}
          </main>
        </div>
      </div>
    </UserProvider>
  )
}
