'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle } from 'lucide-react'

export interface ConfirmOptions {
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Aksi merusak (hapus, batalkan) — tombol konfirmasi berwarna merah */
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(async () => false)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve
    })
  }, [])

  const close = (result: boolean) => {
    resolveRef.current?.(result)
    resolveRef.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <Dialog.Root open={!!options} onOpenChange={(open) => { if (!open) close(false) }}>
        <Dialog.Portal>
          <Dialog.Overlay style={{
            position: 'fixed', inset: 0, zIndex: 9998,
            background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(4px)',
          }} />
          <Dialog.Content
            className="glass-gold"
            style={{
              position: 'fixed', zIndex: 9999,
              top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              background: '#090d16', borderRadius: '1rem',
              width: 'min(26rem, calc(100vw - 2rem))',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <span style={{ color: options?.danger ? '#ef4444' : '#c9a84c', marginTop: '0.125rem' }}>
                <AlertTriangle size={20} />
              </span>
              <div>
                <Dialog.Title style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', fontWeight: 600, color: '#f8f4ec', marginBottom: '0.375rem' }}>
                  {options?.title || 'Konfirmasi'}
                </Dialog.Title>
                <Dialog.Description style={{ fontSize: '0.8125rem', color: '#94a3b8', whiteSpace: 'pre-line', lineHeight: 1.6 }}>
                  {options?.message}
                </Dialog.Description>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" onClick={() => close(false)} className="btn btn-secondary btn-sm">
                {options?.cancelLabel || 'Batal'}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                autoFocus
                className={options?.danger ? 'btn btn-danger btn-sm' : 'btn btn-primary btn-sm'}
              >
                {options?.confirmLabel || 'Lanjutkan'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  return useContext(ConfirmContext)
}
