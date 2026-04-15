const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: catData, error: catError } = await supabase.from('module_catalog').select('code, name');
  console.log('MODULES:', catData);
  
  const { data: vData, error: vError } = await supabase.from('vendors').select('id').limit(1);
  console.log('VENDORS TABLE ERROR?', vError ? vError.message : 'OK');
}
run();
