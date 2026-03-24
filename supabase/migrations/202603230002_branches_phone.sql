alter table public.branches
  add column if not exists phone text;

update public.branches
set phone = nullif(trim(split_part(address, 'Phone:', 2)), '')
where (phone is null or phone = '')
  and address like '%Phone:%';

update public.branches
set address = nullif(rtrim(trim(split_part(address, 'Phone:', 1)), '. '), '')
where address like '%Phone:%';
