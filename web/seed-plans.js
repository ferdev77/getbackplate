const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const plans = [
  {
    code: 'starter',
    name: 'Starter',
    description: 'Plan base para empresas pequeñas con gestión esencial.',
    price_amount: 49.00,
    currency_code: 'USD',
    billing_period: 'monthly',
    max_branches: 1,
    max_users: 25,
    max_employees: 80,
    max_storage_mb: 500,
    is_active: true
  },
  {
    code: 'growth',
    name: 'Growth',
    description: 'La solución completa para equipos y sucursales en crecimiento.',
    price_amount: 129.00,
    currency_code: 'USD',
    billing_period: 'monthly',
    max_branches: 5,
    max_users: null,
    max_employees: null,
    max_storage_mb: 2048,
    is_active: true
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Potencia total para grandes cadenas y grupos gastronómicos.',
    price_amount: 399.00,
    currency_code: 'USD',
    billing_period: 'monthly',
    max_branches: null,
    max_users: null,
    max_employees: null,
    max_storage_mb: 10240,
    is_active: true
  }
];

async function seed() {
  console.log("Seeding plans...");
  for (const plan of plans) {
    const { data, error } = await supabase
      .from('plans')
      .upsert(plan, { onConflict: 'code' });

    if (error) {
      console.error(`Error seeding ${plan.code}:`, error);
    } else {
      console.log(`Successfully seeded/updated ${plan.code}`);
    }
  }
}

seed();
