import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Akuntansi' }

export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
