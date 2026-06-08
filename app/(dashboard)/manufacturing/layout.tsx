import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Manufaktur' }

export default function ManufacturingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
