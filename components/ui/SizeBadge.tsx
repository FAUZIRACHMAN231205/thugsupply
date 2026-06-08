export default function SizeBadge({ size }: { size?: string | null }) {
  if (!size) {
    return <span style={{ fontSize: '0.6875rem', color: '#64748b' }}>—</span>
  }
  return (
    <span
      className="badge badge-gold"
      style={{ fontSize: '0.6875rem', fontWeight: 600, minWidth: '2rem', justifyContent: 'center' }}
    >
      {size}
    </span>
  )
}
