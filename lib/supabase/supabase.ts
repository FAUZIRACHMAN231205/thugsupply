/**
 * Supabase Browser Client — untuk dipakai di Client Components ('use client')
 * Menggunakan @supabase/ssr yang SSR-safe dan cookie-aware.
 * 
 * Import: import { supabase } from '@/lib/supabase/supabase'
 * Atau:   import { createClient } from '@/lib/supabase/client'
 */
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Singleton instance — aman dipakai di Client Components
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)