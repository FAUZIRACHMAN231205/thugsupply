'use client'

import { useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function SignUpPage() {

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('Password dan konfirmasi password tidak cocok.')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password harus minimal 6 karakter.')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      console.error('Sign up error:', error.message)
      setError(`Gagal mendaftar: ${error.message}`)
      setLoading(false)
    } else {
      console.log('Sign up success, confirmation email sent.')
      setSuccess(true)
      setLoading(false)
    }
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
            <p className="text-slate-400 text-sm">Registrasi Akun ERP Baru</p>
          </div>

          {success ? (
            <div className="text-center space-y-6 py-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-success/10 border border-success/20 flex items-center justify-center text-success">
                  <CheckCircle2 size={36} />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-slate-100">Registrasi Berhasil!</h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Kami telah mengirimkan email konfirmasi ke <strong className="text-gold-400">{email}</strong>. 
                  Silakan periksa inbox atau folder spam Anda untuk memverifikasi akun sebelum masuk ke sistem.
                </p>
              </div>
              <div className="pt-4">
                <Link
                  href="/login"
                  className="btn btn-secondary w-full flex justify-center items-center h-11"
                >
                  <ArrowLeft size={16} className="mr-2" />
                  Kembali ke Login
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-5">
              {error && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm text-center">
                  {error}
                </div>
              )}

              <div>
                <label className="form-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  className="input-base"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div>
                <label className="form-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  className="input-base"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div>
                <label className="form-label" htmlFor="confirmPassword">Konfirmasi Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  className="input-base"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full mt-4 flex justify-center items-center h-11"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin mr-2" />
                    Memproses...
                  </>
                ) : (
                  'Daftar Sekarang'
                )}
              </button>

              <div className="text-center pt-2">
                <p className="text-xs text-slate-400">
                  Sudah memiliki akun?{' '}
                  <Link href="/login" className="text-gold-500 hover:text-gold-400 transition-colors font-medium">
                    Masuk ke Sistem
                  </Link>
                </p>
              </div>
            </form>
          )}

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
