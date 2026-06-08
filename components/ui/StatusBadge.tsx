import { getStatusColor, getStatusLabel } from '@/lib/utils'

interface BadgeProps {
  status: string
  size?: 'sm' | 'default'
}

export default function StatusBadge({ status, size = 'default' }: BadgeProps) {
  const color = getStatusColor(status)
  const label = getStatusLabel(status)

  return (
    <span className={`badge badge-${color}`} style={size === 'sm' ? { fontSize: '0.625rem', padding: '0.125rem 0.5rem' } : {}}>
      <span style={{
        width: '0.375rem',
        height: '0.375rem',
        borderRadius: '50%',
        background: 'currentColor',
        display: 'inline-block',
        flexShrink: 0,
      }} />
      {label}
    </span>
  )
}
