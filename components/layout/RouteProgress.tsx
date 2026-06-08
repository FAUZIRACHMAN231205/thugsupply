'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function RouteProgress() {
  const pathname = usePathname()
  const [active, setActive] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setActive(true), 0)
    const timer = window.setTimeout(() => setActive(false), 500)
    return () => { clearTimeout(t); window.clearTimeout(timer) }
  }, [pathname])

  if (!active) return null

  return <div className="route-progress" aria-hidden="true" />
}
