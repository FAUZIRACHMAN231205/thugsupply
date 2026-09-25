'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import * as RadixToast from '@radix-ui/react-toast'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  title?: string
  variant: ToastVariant
}

interface ToastApi {
  success: (message: string, title?: string) => void
  error: (message: string, title?: string) => void
  info: (message: string, title?: string) => void
}

const noop = () => {}
const ToastContext = createContext<ToastApi>({ success: noop, error: noop, info: noop })

const variantStyles: Record<ToastVariant, { color: string; icon: React.ReactNode; defaultTitle: string }> = {
  success: { color: '#22c55e', icon: <CheckCircle2 size={18} />, defaultTitle: 'Berhasil' },
  error: { color: '#ef4444', icon: <AlertCircle size={18} />, defaultTitle: 'Gagal' },
  info: { color: '#3b82f6', icon: <Info size={18} />, defaultTitle: 'Informasi' },
}

let seq = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id))
  }, [])

  const api = useMemo<ToastApi>(() => {
    const push = (variant: ToastVariant) => (message: string, title?: string) => {
      seq += 1
      setItems(prev => [...prev, { id: seq, message, title, variant }])
    }
    return { success: push('success'), error: push('error'), info: push('info') }
  }, [])

  return (
    <ToastContext.Provider value={api}>
      <RadixToast.Provider swipeDirection="right">
        {children}

        {items.map(item => {
          const style = variantStyles[item.variant]
          return (
            <RadixToast.Root
              key={item.id}
              open
              // Error ditampilkan lebih lama karena biasanya perlu dibaca
              duration={item.variant === 'error' ? 9000 : 5000}
              onOpenChange={(open) => { if (!open) remove(item.id) }}
              style={{
                background: '#090d16',
                border: `1px solid ${style.color}40`,
                borderLeft: `3px solid ${style.color}`,
                borderRadius: '0.625rem',
                padding: '0.875rem 1rem',
                boxShadow: '0 20px 40px -12px rgba(0,0,0,0.6)',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: '0.75rem',
                alignItems: 'start',
              }}
            >
              <span style={{ color: style.color, marginTop: '0.125rem' }}>{style.icon}</span>
              <div>
                <RadixToast.Title style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#f8f4ec', marginBottom: '0.125rem' }}>
                  {item.title || style.defaultTitle}
                </RadixToast.Title>
                <RadixToast.Description style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                  {item.message}
                </RadixToast.Description>
              </div>
              <RadixToast.Close
                aria-label="Tutup"
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0 }}
              >
                <X size={14} />
              </RadixToast.Close>
            </RadixToast.Root>
          )
        })}

        <RadixToast.Viewport
          style={{
            position: 'fixed',
            bottom: '1rem',
            right: '1rem',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            width: 'min(24rem, calc(100vw - 2rem))',
            maxWidth: '100vw',
            margin: 0,
            padding: 0,
            listStyle: 'none',
            outline: 'none',
          }}
        />
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
