// Thug Supply Database Types
// Generated from Supabase PostgreSQL schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ============================================================
// ENUMS
// ============================================================

export type PurchaseOrderStatus = 'draft' | 'sent' | 'confirmed' | 'received' | 'cancelled'
export type PaymentTerm = 'credit' | 'cash'
export type StockMovementType = 'purchase_in' | 'sale_out' | 'production_in' | 'production_out' | 'adjustment'
export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled'
export type WorkOrderStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold'
export type WorkOrderStageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'
export type JournalEntryType = 'manual' | 'purchase' | 'sale' | 'production' | 'adjustment'
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

// ============================================================
// PURCHASE & INVENTORY MODULE
// ============================================================

export interface Supplier {
  id: string
  code: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  payment_terms_days: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Material {
  id: string
  code: string
  name: string
  description: string | null
  size: string | null
  unit: string // e.g., 'meter', 'kg', 'pcs', 'yard'
  category: string | null
  cost_price: number
  reorder_point: number
  current_stock: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id: string | null
  supplier?: Supplier
  order_date: string
  expected_date: string | null
  status: PurchaseOrderStatus
  notes: string | null
  total_amount: number
  payment_term: PaymentTerm
  paid_at: string | null
  items?: PurchaseOrderItem[]
  created_at: string
  updated_at: string
}

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  material_id: string
  material?: Material
  quantity: number
  unit_price: number
  received_quantity: number
  subtotal: number
}

export interface StockMovement {
  id: string
  material_id: string | null
  material?: Material
  product_id: string | null
  product?: Product
  movement_type: StockMovementType
  quantity: number // positive = in, negative = out
  reference_id: string | null // PO id, WO id, Invoice id
  reference_type: string | null
  notes: string | null
  stock_before: number
  stock_after: number
  created_at: string
  created_by: string | null
}

// ============================================================
// SALES MODULE
// ============================================================

export interface Customer {
  id: string
  code: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  payment_terms_days: number
  credit_limit: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  code: string
  name: string
  description: string | null
  size: string | null
  category: string | null
  unit: string
  selling_price: number
  cost_price: number
  current_stock: number
  reorder_point: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Quotation {
  id: string
  quotation_number: string
  customer_id: string
  customer?: Customer
  issue_date: string
  valid_until: string | null
  status: QuotationStatus
  notes: string | null
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  items?: QuotationItem[]
  created_at: string
  updated_at: string
}

export interface QuotationItem {
  id: string
  quotation_id: string
  product_id: string
  product?: Product
  quantity: number
  unit_price: number
  discount_percent: number
  subtotal: number
}

export interface Invoice {
  id: string
  invoice_number: string
  quotation_id: string | null
  quotation?: Quotation
  customer_id: string
  customer?: Customer
  issue_date: string
  due_date: string | null
  status: InvoiceStatus
  notes: string | null
  sale_type?: 'ready_stock' | 'pre_order'
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  paid_amount: number
  items?: InvoiceItem[]
  created_at: string
  updated_at: string
}

export interface InvoiceItem {
  id: string
  invoice_id: string
  product_id: string
  product?: Product
  quantity: number
  unit_price: number
  discount_percent: number
  subtotal: number
}

// ============================================================
// MANUFACTURING MODULE
// ============================================================

export interface BillOfMaterials {
  id: string
  product_id: string
  product?: Product
  version: string
  is_active: boolean
  notes: string | null
  items?: BomItem[]
  created_at: string
  updated_at: string
}

export interface BomItem {
  id: string
  bom_id: string
  material_id: string
  material?: Material
  quantity: number
  unit: string
  notes: string | null
}

export interface WorkOrder {
  id: string
  wo_number: string
  product_id: string
  product?: Product
  bom_id: string | null
  bom?: BillOfMaterials
  quantity: number
  status: WorkOrderStatus
  order_type?: 'ready_stock' | 'pre_order'
  start_date: string | null
  target_date: string | null
  completed_date: string | null
  notes: string | null
  stages?: WorkOrderStage[]
  created_at: string
  updated_at: string
}

export interface WorkOrderStage {
  id: string
  work_order_id: string
  stage_name: string
  stage_order: number
  status: WorkOrderStageStatus
  assigned_to: string | null
  started_at: string | null
  completed_at: string | null
  notes: string | null
}

// ============================================================
// ACCOUNTING MODULE
// ============================================================

export interface ChartOfAccount {
  id: string
  code: string
  name: string
  account_type: AccountType
  parent_id: string | null
  parent?: ChartOfAccount
  description: string | null
  is_active: boolean
  balance: number
  created_at: string
  updated_at: string
}

// Hasil RPC account_balances (migration 010)
export interface AccountBalance {
  id: string
  code: string
  name: string
  account_type: AccountType
  parent_id: string | null
  description: string | null
  is_active: boolean
  total_debit: number
  total_credit: number
  balance: number
}

// Hasil RPC monthly_profit_summary (migration 010); month = tanggal 1 tiap bulan (YYYY-MM-DD)
export interface MonthlyProfitSummary {
  month: string
  revenue: number
  cogs: number
  expense: number
}

// Hasil RPC dashboard_summary (migration 011)
export interface DashboardSummary {
  revenue_month: number
  revenue_prev_month: number
  purchase_month: number
  purchase_prev_month: number
  active_work_orders: number
  pending_invoices: number
  pending_quotations: number
  total_customers: number
  total_suppliers: number
  low_stock_items: number
  low_stock_materials: Pick<Material, 'id' | 'code' | 'name' | 'size' | 'unit' | 'current_stock' | 'reorder_point'>[]
}

// Akun yang dipakai jurnal otomatis (migration 009)
export interface AccountMapping {
  key: string
  label: string
  expected_type: AccountType
  account_id: string | null
  sort_order: number
  updated_at: string
}

export interface JournalEntry {
  id: string
  entry_number: string
  entry_date: string
  entry_type: JournalEntryType
  description: string
  reference_id: string | null
  reference_type: string | null
  total_debit: number
  total_credit: number
  is_balanced: boolean
  lines?: JournalLine[]
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface JournalLine {
  id: string
  journal_entry_id: string
  account_id: string
  account?: ChartOfAccount
  description: string | null
  debit: number
  credit: number
}

// ============================================================
// DASHBOARD STATS
// ============================================================

export interface DashboardStats {
  total_revenue_month: number
  total_purchase_month: number
  active_work_orders: number
  low_stock_items: number
  pending_invoices: number
  pending_quotations: number
  total_customers: number
  total_suppliers: number
}
