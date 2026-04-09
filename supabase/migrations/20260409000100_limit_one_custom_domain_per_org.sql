with ranked as (
  select
    id,
    row_number() over (
      partition by organization_id
      order by
        is_primary desc,
        (status = 'active') desc,
        created_at desc,
        id desc
    ) as rn
  from public.organization_domains
)
delete from public.organization_domains d
using ranked r
where d.id = r.id
  and r.rn > 1;

create unique index if not exists organization_domains_one_per_org_idx
  on public.organization_domains(organization_id);
