export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>{message}</span>
}
