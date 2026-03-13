import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo.admin.424863@saasresto.local";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getUserByEmail(email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;

    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function main() {
  const user = await getUserByEmail(DEMO_EMAIL);

  if (!user) {
    console.error(`No existe usuario para DEMO_EMAIL=${DEMO_EMAIL}`);
    process.exit(1);
  }

  const { error: rolesCheckError } = await supabase.from("roles").select("id").limit(1);
  if (rolesCheckError) {
    console.error("La base aun no tiene migraciones aplicadas (tabla 'roles' inexistente).");
    console.error("Primero ejecuta la migracion en Supabase SQL Editor: supabase/migrations/20260311_0001_base_saas.sql");
    process.exit(1);
  }

  const { error: superadminError } = await supabase
    .from("superadmin_users")
    .upsert({ user_id: user.id });
  if (superadminError) throw superadminError;

  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("code", "starter")
    .maybeSingle();

  const orgSlug = "demo-resto";
  let { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (!org) {
    const { data: createdOrg, error: createOrgError } = await supabase
      .from("organizations")
      .insert({
        name: "Demo Resto",
        slug: orgSlug,
        plan_id: plan?.id ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (createOrgError) throw createOrgError;
    org = createdOrg;
  }

  const { data: role } = await supabase
    .from("roles")
    .select("id")
    .eq("code", "company_admin")
    .single();

  const { error: membershipError } = await supabase.from("memberships").upsert(
    {
      organization_id: org.id,
      user_id: user.id,
      role_id: role.id,
      status: "active",
    },
    { onConflict: "organization_id,user_id" },
  );
  if (membershipError) throw membershipError;

  const { data: modules } = await supabase.from("module_catalog").select("id, is_core");
  if (modules?.length) {
    const { error: modulesError } = await supabase.from("organization_modules").upsert(
      modules.map((m) => ({
        organization_id: org.id,
        module_id: m.id,
        is_enabled: Boolean(m.is_core),
        enabled_at: m.is_core ? new Date().toISOString() : null,
      })),
      { onConflict: "organization_id,module_id" },
    );
    if (modulesError) throw modulesError;
  }

  console.log("OK: usuario demo preparado.");
  console.log(`- Email: ${DEMO_EMAIL}`);
  console.log(`- User ID: ${user.id}`);
  console.log(`- Org ID: ${org.id}`);
  console.log("- Superadmin: asignado");
  console.log("- Membership company_admin: asignada");
}

main().catch((error) => {
  console.error("ERROR setup-demo:", error.message);
  process.exit(1);
});
