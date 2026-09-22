import type { QueryClient } from '@tanstack/react-query'

// Query yang terpengaruh transaksi yang mengubah stok dan membuat jurnal otomatis
// (terima PO, bayar supplier, selesai WO, invoice lunas).
const POSTING_QUERY_KEYS = [
  'purchase_orders_data',
  'work_orders_data',
  'invoices_data',
  'materials',
  'products_data',
  'movements_data',
  'inventory_dashboard_materials',
  'journal_entries_data',
  'chart_of_accounts_data',
  'profit_loss_data',
  'balance_sheet_data',
  'dashboard_data',
]

export function invalidatePostingQueries(queryClient: QueryClient) {
  for (const key of POSTING_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] })
  }
}
