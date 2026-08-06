import pg from "pg";

const target = process.argv[2];
const refs = {
  dev: "uubdslmtfxwraszinpao",
  production: "mfhyemwypuzsqjqxtbjf",
};
const expectedRef = refs[target];
if (!expectedRef) throw new Error("Pass dev or production");

const databaseUrl = process.env.SUPABASE_DB_POOLER_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!databaseUrl.includes(expectedRef) || !apiUrl.includes(expectedRef)) {
  throw new Error(`Notification copy audit refused: expected ${target} project`);
}

const regionalTerms = [
  "vos", "sos", "tenés", "podés", "querés", "debés", "sabés", "necesitás",
  "hacé", "ingresá", "seleccioná", "elegí", "completá", "configurá", "agregá",
  "revisá", "verificá", "activá", "desactivá", "guardá", "confirmá", "cancelá",
  "creá", "editá", "eliminá", "descargá", "subí", "iniciá", "probá", "usá",
  "consultá", "contactá", "enviá", "volvé", "continuá", "accedé", "conectá",
  "administrá", "gestioná", "mantené", "obtené", "permití", "definí", "registrá",
  "recordá", "buscá", "cargá", "actualizá", "cambiá", "copiá", "pegá", "arrastrá",
  "mostrá", "cerrá", "sumá", "comprá", "contratá", "solicitá", "programá", "publicá",
  "asigná", "indicá", "mirá", "dejá", "seguí", "decidí", "recibí", "descubrí",
  "conocé", "resolvé", "intentá", "empezá", "poné", "vení", "andá", "decime",
  "avisame", "fijate", "sacá", "mandá", "abrí", "salí", "acá", "legajo", "legajos",
];
const regionalPattern = regionalTerms.join("|");

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin transaction read only");
  await client.query("set local statement_timeout = '30s'");
  const { rows } = await client.query(`
    select source, channel, count(*)::integer as count
    from public.notifications
    where concat_ws(' ', title, body) ~* $1
    group by source, channel
    order by source, channel
  `, [`\\m(${regionalPattern})\\M`]);
  const { rows: termRows } = await client.query(`
    select notifications.source, notifications.channel, term, count(*)::integer as count
    from public.notifications notifications
    cross join unnest($1::text[]) term
    where lower(concat_ws(' ', notifications.title, notifications.body))
      ~* ('\\m' || term || '\\M')
    group by notifications.source, notifications.channel, term
    order by notifications.source, notifications.channel, term
  `, [regionalTerms]);
  console.log(JSON.stringify({
    target,
    total: rows.reduce((sum, row) => sum + row.count, 0),
    bySource: rows,
    byTerm: termRows,
  }, null, 2));
  await client.query("rollback");
} catch (error) {
  try { await client.query("rollback"); } catch {}
  throw error;
} finally {
  await client.end();
}
