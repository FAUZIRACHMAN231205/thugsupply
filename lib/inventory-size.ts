import type { Material, Product } from '@/types/database'

/** Ukuran standar garmen */
export const MATERIAL_SIZE_OPTIONS = [
  { value: '', label: '— Tanpa ukuran —' },
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
  { value: 'XL', label: 'XL' },
  { value: 'XXL', label: 'XXL' },
  { value: 'XXXL', label: 'XXXL' },
  { value: '4XL', label: '4XL' },
  { value: '5XL', label: '5XL' },
  { value: 'One Size', label: 'One Size' },
] as const

export const MATERIAL_SIZE_VALUES = [
  '',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
  '4XL',
  '5XL',
  'One Size',
] as const

/** Kategori bahan yang wajib punya ukuran */
export const APPAREL_MATERIAL_CATEGORIES = ['Blank Apparel', 'Kain Utama'] as const

export function materialRequiresSize(
  category?: string | null,
  unit?: string | null
): boolean {
  if (category === 'Blank Apparel') return true
  if (category === 'Kain Utama' && unit === 'pcs') return true
  return false
}

/** Produk jadi selalu per ukuran */
export function productRequiresSize(): boolean {
  return true
}

export function normalizeSize(size?: string | null): string | null {
  if (!size || size.trim() === '') return null
  return size.trim()
}

export function formatMaterialLabel(
  material: Pick<Material, 'name' | 'code' | 'size'> | null | undefined,
  options?: { includeCode?: boolean; stock?: number }
): string {
  if (!material) return '—'
  const namePart = material.size ? `${material.name} [${material.size}]` : material.name
  const parts = [namePart]
  if (options?.includeCode !== false && material.code) {
    parts.push(`(${material.code})`)
  }
  if (options?.stock !== undefined) {
    parts.push(`Stok: ${options.stock}`)
  }
  return parts.join(' ')
}

export function formatProductLabel(
  product: Pick<Product, 'name' | 'code' | 'size'> | null | undefined,
  options?: { includeCode?: boolean; stock?: number; price?: number }
): string {
  if (!product) return '—'
  const namePart = product.size ? `${product.name} [${product.size}]` : product.name
  const parts = [namePart]
  if (options?.includeCode !== false && product.code) {
    parts.push(`(${product.code})`)
  }
  if (options?.price !== undefined) {
    parts.push(`@ ${options.price}`)
  }
  if (options?.stock !== undefined) {
    parts.push(`Stok: ${options.stock}`)
  }
  return parts.join(' ')
}

export function isDuplicateMaterialVariant(
  materials: Material[],
  name: string,
  size: string | null,
  excludeId?: string
): boolean {
  const key = `${name.trim().toLowerCase()}::${size ?? ''}`
  return materials.some(
    (m) =>
      m.id !== excludeId &&
      `${m.name.trim().toLowerCase()}::${m.size ?? ''}` === key
  )
}

export function isDuplicateProductVariant(
  products: Product[],
  name: string,
  size: string | null,
  excludeId?: string
): boolean {
  const key = `${name.trim().toLowerCase()}::${size ?? ''}`
  return products.some(
    (p) =>
      p.id !== excludeId &&
      `${p.name.trim().toLowerCase()}::${p.size ?? ''}` === key
  )
}
