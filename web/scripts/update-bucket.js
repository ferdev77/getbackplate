const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: '.env.local' });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log("Updating checklist-evidence bucket to be public...");
  const { data, error } = await admin.storage.updateBucket('checklist-evidence', {
    public: true,
  });

  if (error) {
    console.error("Error updating bucket:", error);
  } else {
    console.log("Successfully updated bucket:", data);
  }
}

main();
