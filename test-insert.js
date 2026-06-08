const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY';

// Load from .env.local
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
let url, key;
env.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
});

const supabase = createClient(url, key);

async function testInsert() {
  const { data, error } = await supabase
    .from('materials')
    .insert([{
      code: 'MATTEST123',
      name: 'Test Material',
      description: 'Test',
      category: 'Kain Utama',
      unit: 'meter',
      cost_price: 100,
      reorder_point: 10,
      current_stock: 0,
      is_active: true
    }])
    .select();

  console.log('Result:', { data, error });
  
  if (!error && data) {
    const { error: moveError } = await supabase
      .from('stock_movements')
      .insert([{
        material_id: data[0].id,
        movement_type: 'adjustment',
        quantity: 10,
        notes: 'Stok awal material baru',
        stock_before: 0,
        stock_after: 10
      }])
    console.log('Move Error:', moveError);
  }
}

testInsert();
