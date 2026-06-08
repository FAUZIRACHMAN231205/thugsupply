'use client'

import Link from 'next/link'
import { useLinkStatus } from 'next/link'
import { Loader2 } from 'lucide-react'

interface NavLinkProps {
  href: string
  label: string
  icon: React.ReactNode
  active: boolean
  onNavigate?: () => void
}

function NavLinkInner({
  label,
  icon,
  active,
  pending,
}: Pick<NavLinkProps, 'label' | 'icon' | 'active'> & { pending: boolean }) {
  return (
    <>
      <span className={`shrink-0 ${active ? 'text-gold-500' : 'text-slate-500'}`}>
        {pending ? <Loader2 size={16} className="animate-spin text-gold-500" /> : icon}
      </span>
      <span className="sidebar-label">{label}</span>
    </>
  )
}

function NavLinkStatus({ label, icon, active }: NavLinkProps) {
  const { pending } = useLinkStatus()
  return <NavLinkInner label={label} icon={icon} active={active} pending={pending} />
}

export default function NavLink({ href, label, icon, active, onNavigate }: NavLinkProps) {
  return (
    <Link
      href={href}
      prefetch
      scroll
      onClick={onNavigate}
      className={`sidebar-link ${active ? 'active' : ''}`}
      title={label}
    >
      <NavLinkStatus href={href} label={label} icon={icon} active={active} onNavigate={onNavigate} />
    </Link>
  )
}
