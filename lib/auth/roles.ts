import type { User } from '@supabase/supabase-js'

function metadataValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  return []
}

export function isAdminUser(user: User | null | undefined): boolean {
  if (!user) return false

  // Hanya percayai app_metadata. user_metadata bisa diubah sendiri oleh user
  // via supabase.auth.updateUser(), sehingga tidak aman untuk otorisasi role.
  const appMetadata = user.app_metadata ?? {}

  const roleValues = [
    ...metadataValues(appMetadata.role),
    ...metadataValues(appMetadata.roles),
    ...metadataValues(appMetadata.user_role),
    ...metadataValues(appMetadata.user_roles),
  ]

  return roleValues.some((role) => role.toLowerCase() === 'admin')
}
