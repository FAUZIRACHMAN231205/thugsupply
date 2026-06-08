import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'IDR'): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('id-ID').format(num)
}

export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr))
}

export function formatDatetime(dateStr: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

export function generateCode(prefix: string): string {
  const date = new Date()
  const year = date.getFullYear().toString().slice(-2)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `${prefix}${year}${month}${random}`
}

export function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    // Generic
    draft: 'neutral',
    active: 'success',
    inactive: 'neutral',
    // PO & WO
    sent: 'info',
    confirmed: 'gold',
    received: 'success',
    completed: 'success',
    cancelled: 'danger',
    on_hold: 'warning',
    in_progress: 'info',
    pending: 'warning',
    // Quotation
    accepted: 'success',
    rejected: 'danger',
    expired: 'neutral',
    // Invoice
    paid: 'success',
    partial: 'warning',
    overdue: 'danger',
  }
  return statusColors[status] || 'neutral'
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    sent: 'Terkirim',
    confirmed: 'Dikonfirmasi',
    received: 'Diterima',
    cancelled: 'Dibatalkan',
    accepted: 'Diterima',
    rejected: 'Ditolak',
    expired: 'Kadaluarsa',
    paid: 'Lunas',
    partial: 'Sebagian',
    overdue: 'Jatuh Tempo',
    in_progress: 'Dalam Proses',
    completed: 'Selesai',
    on_hold: 'Ditunda',
    pending: 'Menunggu',
    skipped: 'Dilewati',
    active: 'Aktif',
    inactive: 'Nonaktif',
  }
  return labels[status] || status
}

export function truncate(str: string, maxLength = 40): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '...'
}

export function daysUntil(dateStr: string): number {
  const now = new Date()
  const target = new Date(dateStr)
  const diffMs = target.getTime() - now.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}
