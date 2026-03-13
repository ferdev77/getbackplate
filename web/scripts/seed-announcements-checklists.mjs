import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query("begin");

    const { rows: orgRows } = await client.query(
      "select id, name from public.organizations order by created_at asc limit 1",
    );
    if (!orgRows[0]) {
      throw new Error("No hay organizaciones");
    }

    const orgId = orgRows[0].id;

    const { rows: actorRows } = await client.query(
      "select m.user_id, m.branch_id from public.memberships m where m.organization_id = $1 and m.status = 'active' order by m.created_at asc limit 1",
      [orgId],
    );
    const actorId = actorRows[0]?.user_id ?? null;
    const defaultBranch = actorRows[0]?.branch_id ?? null;

    const announcements = [
      { title: "Actualizacion Operativa Semanal", kind: "general", featured: true, daysToExpire: null },
      { title: "Recordatorio de Seguridad e Higiene", kind: "urgent", featured: false, daysToExpire: 5 },
      { title: "Capacitacion Interna de Servicio", kind: "reminder", featured: false, daysToExpire: 8 },
      { title: "Cambio de Procedimiento de Cierre", kind: "general", featured: false, daysToExpire: 10 },
      { title: "Semana de Reconocimiento al Equipo", kind: "celebration", featured: false, daysToExpire: null },
    ];

    for (const item of announcements) {
      const expiresAt =
        typeof item.daysToExpire === "number"
          ? new Date(Date.now() + item.daysToExpire * 24 * 60 * 60 * 1000).toISOString()
          : null;

      const body =
        item.title +
        ": comunicado interno generado para entorno demo, con audiencia real y persistencia en base.";

      const { rows: insertedAnnouncement } = await client.query(
        "insert into public.announcements (organization_id, branch_id, created_by, title, body, kind, is_featured, publish_at, expires_at, target_scope) values ($1,$2,$3,$4,$5,$6,$7,timezone('utc', now()),$8,$9::jsonb) returning id",
        [
          orgId,
          defaultBranch,
          actorId,
          item.title,
          body,
          item.kind,
          item.featured,
          expiresAt,
          JSON.stringify({ locations: [], department_ids: [], users: [] }),
        ],
      );

      const announcementId = insertedAnnouncement[0].id;

      await client.query(
        "insert into public.announcement_audiences (organization_id, announcement_id, branch_id, user_id) values ($1,$2,null,null)",
        [orgId, announcementId],
      );
    }

    const { rows: branchRows } = await client.query(
      "select id, name from public.branches where organization_id = $1 and is_active = true order by created_at asc limit 1",
      [orgId],
    );
    const branchId = branchRows[0]?.id ?? defaultBranch;
    const branchName = branchRows[0]?.name ?? "Sucursal";

    const { rows: deptRows } = await client.query(
      "select id, name from public.organization_departments where organization_id = $1 and is_active = true order by created_at asc limit 1",
      [orgId],
    );
    const deptId = deptRows[0]?.id ?? null;
    const deptName = deptRows[0]?.name ?? "General";

    for (let i = 1; i <= 5; i += 1) {
      const checklistName = `Checklist Demo ${i} - ${branchName}`;

      const { rows: insertedTemplate } = await client.query(
        "insert into public.checklist_templates (organization_id, branch_id, name, checklist_type, is_active, shift, department, department_id, repeat_every, target_scope, created_by) values ($1,$2,$3,'custom',true,'1er Shift',$4,$5,'daily',$6::jsonb,$7) returning id",
        [
          orgId,
          branchId,
          checklistName,
          deptName,
          deptId,
          JSON.stringify({
            locations: branchId ? [branchId] : [],
            department_ids: deptId ? [deptId] : [],
            users: [],
            notify_via: ["whatsapp"],
          }),
          actorId,
        ],
      );

      const templateId = insertedTemplate[0].id;

      const { rows: insertedSection } = await client.query(
        "insert into public.checklist_template_sections (organization_id, template_id, name, sort_order) values ($1,$2,'General',0) returning id",
        [orgId, templateId],
      );

      const sectionId = insertedSection[0].id;
      const labels = [
        `Revisar apertura de caja (${i})`,
        `Validar limpieza de area (${i})`,
        `Confirmar stock critico (${i})`,
        `Verificar equipo y herramientas (${i})`,
        `Registrar observaciones (${i})`,
      ];

      for (let j = 0; j < labels.length; j += 1) {
        await client.query(
          "insert into public.checklist_template_items (organization_id, section_id, label, priority, sort_order) values ($1,$2,$3,$4,$5)",
          [orgId, sectionId, labels[j], j < 2 ? "high" : "medium", j],
        );
      }
    }

    await client.query("commit");

    const { rows: counts } = await client.query(
      "select (select count(*) from public.announcements where organization_id = $1) as announcements, (select count(*) from public.checklist_templates where organization_id = $1) as checklist_templates",
      [orgId],
    );

    console.log("OK seed announcements/checklists", {
      organization: orgRows[0].name,
      announcements: counts[0].announcements,
      checklist_templates: counts[0].checklist_templates,
    });
  } catch (error) {
    await client.query("rollback");
    console.error("ERROR seed-announcements-checklists:", error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
