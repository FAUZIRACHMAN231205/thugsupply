'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isAdminUser } from '@/lib/auth/roles'
import { Loader2, Mail, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

function LoginFormContent() {

  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  
  const [resendLoading, setResendLoading] = useState(false)
  const [showResendOption, setShowResendOption] = useState(false)

  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'verification_failed') {
      setTimeout(() => {
        setError('Verifikasi email gagal atau tautan telah kedaluwarsa. Silakan masukkan email Anda dan klik "Kirim Ulang Email Verifikasi" di bawah.')
        setShowResendOption(true)
      }, 0)
    } else if (errorParam === 'auth_failed') {
      setTimeout(() => {
        setError('Autentikasi gagal. Silakan coba masuk kembali.')
      }, 0)
    } else if (errorParam === 'unauthorized') {
      setTimeout(() => {
        setError('Akun Anda belum memiliki akses admin untuk masuk ke sistem ini.')
      }, 0)
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfoMessage(null)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error('Login error:', error.message)
      if (error.message === 'Email not confirmed') {
        setError('Email belum diverifikasi. Silakan cek inbox Anda atau kirim ulang tautan verifikasi.')
        setShowResendOption(true)
      } else if (error.message === 'Invalid login credentials') {
        setError('Email atau password salah.')
      } else if (error.message === 'Failed to fetch') {
        setError('Tidak bisa menghubungi server autentikasi Supabase. Periksa koneksi internet dan konfigurasi NEXT_PUBLIC_SUPABASE_URL di .env.local.')
      } else {
        setError(`Gagal login: ${error.message}`)
      }
      setLoading(false)
    } else {
      if (!isAdminUser(data.user)) {
        await supabase.auth.signOut()
        setError('Akun Anda belum memiliki akses admin untuk masuk ke sistem ini.')
        setLoading(false)
        return
      }

      console.log('Login success, redirecting...')
      // Menggunakan window.location untuk force hard reload agar cookie terbaca sempurna oleh server/middleware
      window.location.href = '/dashboard'
    }
  }

  const handleResend = async () => {
    if (!email) {
      setError('Silakan masukkan email Anda pada kolom input di atas terlebih dahulu.')
      return
    }
    setResendLoading(true)
    setError(null)
    setInfoMessage(null)

    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(`Gagal mengirim ulang verifikasi: ${error.message}`)
    } else {
      setInfoMessage(`Link verifikasi baru telah dikirim ke ${email}. Silakan cek inbox Anda.`)
    }
    setResendLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] px-4 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#c9a84c] rounded-full mix-blend-multiply filter blur-[128px] opacity-20 animate-pulse-gold"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#8a6620] rounded-full mix-blend-multiply filter blur-[128px] opacity-20"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="glass-gold rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl font-bold text-gold-gradient mb-2">Thug Supply</h1>
            <p className="text-slate-400 text-sm">Sistem Manajemen ERP Terintegrasi</p>
          </div>

          {error && (
            <div className="mb-6 p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm text-center">
              {error}
            </div>
          )}

          {infoMessage && (
            <div className="mb-6 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm text-center flex items-center justify-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{infoMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                name="email"
                required
                className="input-base"
                placeholder="admin@thugsupply.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || resendLoading}
              />
            </div>
            <div>
              <label className="form-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                name="password"
                required
                className="input-base"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading || resendLoading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || resendLoading}
              className="btn btn-primary w-full mt-4 flex justify-center items-center h-11"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin mr-2" />
                  Memproses...
                </>
              ) : (
                'Masuk ke Sistem'
              )}
            </button>
          </form>

          {showResendOption && (
            <div className="mt-4 pt-4 border-t border-slate-800/40 text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading || loading}
                className="btn btn-secondary w-full flex justify-center items-center h-10 gap-2 cursor-pointer"
              >
                {resendLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Mail size={16} />
                )}
                Kirim Ulang Email Verifikasi
              </button>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-xs text-slate-400">
              Belum memiliki akun?{' '}
              <Link href="/signup" className="text-gold-500 hover:text-gold-400 transition-colors font-medium">
                Daftar Akun Baru
              </Link>
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800/50 text-center">
            <p className="text-xs text-slate-500">
              &copy; {new Date().getFullYear()} Thug Supply. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#020617] px-4">
        <Loader2 className="animate-spin text-gold-500" size={32} />
      </div>
    }>
      <LoginFormContent />
    </Suspense>
  )
}
