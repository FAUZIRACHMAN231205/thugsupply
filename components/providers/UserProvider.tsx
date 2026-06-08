'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UserContextValue {
  email: string | null
  initial: string
  loading: boolean
}

const UserContext = createContext<UserContextValue>({
  email: null,
  initial: 'A',
  loading: true,
})

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      if (data.user) {
        setEmail(data.user.email ?? 'user@thugsupply.com')
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const initial = email ? email.charAt(0).toUpperCase() : 'A'

  return (
    <UserContext.Provider value={{ email, initial, loading }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
