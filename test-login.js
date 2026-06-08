const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://lmizfaolheljurnarome.supabase.co',
  'sb_publishable_NAJAJnM7SqsNCjPb4242Ug_f9XMKPSW'
);

async function test() {
  console.log("Starting login test...");
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'wrongpassword'
    });
    console.log("Result:", { error: error ? error.message : null });
  } catch (e) {
    console.error("Exception:", e);
  }
}
test();
