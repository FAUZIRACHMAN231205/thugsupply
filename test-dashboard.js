const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
let url, key;
env.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
});
const supabase = createClient(url, key);

async function test() {
  const startOfMonthStr = '2026-05-01';
  console.log('Starting queries...');
  try {
    const [
      invoicesRes, poRes, woRes, matRes, pendingInvRes, quoRes, custRes, suppRes, linesRes
    ] = await Promise.all([
      supabase.from('invoices').select('total_amount').gte('issue_date', startOfMonthStr),
      supabase.from('purchase_orders').select('total_amount').gte('order_date', startOfMonthStr).eq('status', 'received'),
      supabase.from('work_orders').select('*, product:products(name, code)').eq('status', 'in_progress').order('created_at', { ascending: false }).limit(5),
      supabase.from('materials').select('*').eq('is_active', true),
      supabase.from('invoices').select('*, customer:customers(name)').in('status', ['sent', 'overdue', 'partial']).order('due_date', { ascending: true }).limit(5),
      supabase.from('quotations').select('*', { count: 'exact', head: true }).in('status', ['draft', 'sent']),
      supabase.from('customers').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('suppliers').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('journal_lines').select('debit, credit, account_id, entry:journal_entries(entry_date, entry_type)')
    ]);
    console.log('Done!');
    const errors = [invoicesRes, poRes, woRes, matRes, pendingInvRes, quoRes, custRes, suppRes, linesRes]
        .filter(r => r.error)
        .map(r => r.error.message);
    if (errors.length > 0) console.error('Errors:', errors);
    else console.log('All queries succeeded.');
  } catch (e) {
    console.error('Promise.all failed:', e);
  }
}
test();
