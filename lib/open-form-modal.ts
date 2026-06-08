import { startTransition } from 'react'

/** Buka modal dulu agar UI langsung merespons, lalu siapkan form di background. */
export function openFormModal(setOpen: (open: boolean) => void, prepare?: () => void) {
  setOpen(true)
  if (prepare) {
    startTransition(prepare)
  }
}
