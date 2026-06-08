const { createClient } = require('@supabase/supabase-js');

const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf-8');
let url, key;
env.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
});

const supabase = createClient(url, key);

async function testQuery() {
  console.log('Testing query on materials table...');
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Query error:', error);
  } else {
    console.log('Query successful, rows:', data.length);
  }
}

testQuery();
