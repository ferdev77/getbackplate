const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function updatePlans() {
  const { error: error1 } = await supabase
    .from('plans')
    .update({ description: 'Ideal para restaurantes pequeños que están comenzando su digitalización.' })
    .match({ name: 'plan basico' });

  const { error: error2 } = await supabase
    .from('plans')
    .update({ description: 'La solución completa para potenciar y escalar tu restaurante al máximo.' })
    .match({ name: 'plan pro' });

  if (error1 || error2) {
    console.error('Error updating plans:', error1, error2);
  } else {
    console.log('Plans updated successfully!');
  }
}

updatePlans();
