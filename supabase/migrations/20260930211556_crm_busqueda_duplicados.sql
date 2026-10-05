-- La comparación definitiva de teléfonos reutiliza phoneNormalize.ts en el
-- worker. La RPC trae candidatos por sufijo sin topes de PostgREST ni N+1.
create index if not exists customer_merges_primary_idx on public.customer_merges(primary_customer_id);
create index if not exists customer_merges_author_idx on public.customer_merges(merged_by);
create index if not exists customer_merges_undo_author_idx on public.customer_merges(undone_by);
create table if not exists public.customer_merge_exclusions (
  organization_id integer not null references public.organizations(id),
  customer_a uuid not null references public.customers(id),
  customer_b uuid not null references public.customers(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (organization_id,customer_a,customer_b), check(customer_a<customer_b)
);
create index if not exists customer_merge_exclusions_a_idx on public.customer_merge_exclusions(customer_a);
create index if not exists customer_merge_exclusions_b_idx on public.customer_merge_exclusions(customer_b);
create index if not exists customer_merge_exclusions_author_idx on public.customer_merge_exclusions(created_by);
alter table public.customer_merge_exclusions enable row level security;
drop policy if exists crm_merge_exclusions_read on public.customer_merge_exclusions;
create policy crm_merge_exclusions_read on public.customer_merge_exclusions for select to authenticated using (
  public.user_belongs_to_organization((select auth.uid()),organization_id)
  and public.fn_crm_tiene_permiso(organization_id,'crm.customers.view')
);
revoke all on public.customer_merge_exclusions from anon,authenticated;
grant select on public.customer_merge_exclusions to authenticated;

create table if not exists public.customer_duplicate_scans (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id),
  requested_by uuid not null references public.profiles(id),
  job_id uuid references public.outbound_jobs(id) on delete set null,
  groups jsonb not null default '[]'::jsonb,
  processed integer not null default 0,
  total integer not null default 0,
  status text not null default 'queued' check(status in ('queued','running','done','failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists customer_duplicate_scans_org_idx on public.customer_duplicate_scans(organization_id,created_at desc);
create index if not exists customer_duplicate_scans_author_idx on public.customer_duplicate_scans(requested_by);
create index if not exists customer_duplicate_scans_job_idx on public.customer_duplicate_scans(job_id);
alter table public.customer_duplicate_scans enable row level security;
drop policy if exists crm_duplicate_scans_read on public.customer_duplicate_scans;
create policy crm_duplicate_scans_read on public.customer_duplicate_scans for select to authenticated using (
  public.user_belongs_to_organization((select auth.uid()),organization_id)
  and public.fn_crm_tiene_permiso(organization_id,'crm.customers.view')
);
revoke all on public.customer_duplicate_scans from anon,authenticated;
grant select on public.customer_duplicate_scans to authenticated;
grant select,insert,update on public.customer_duplicate_scans to service_role;

create or replace function public.crm_find_duplicates(p_org integer) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_result jsonb;
begin
  perform public.fn_crm_exigir_permiso(p_org,array['crm.customers.view']);
  with base as materialized (
    select id,full_name,first_name,last_name,email,phone,company_name,trade_name,
      identification_type,identification_number,address,city,created_at,
      regexp_replace(coalesce(phone,''),'[^0-9]','','g') as digits
    from public.customers where organization_id=p_org and status<>'merged'
  ), keys as (
    select id,'phone' as kind,right(digits,8) as key from base where length(digits)>=8
    union all select id,'email',lower(trim(email)) from base where nullif(trim(email),'') is not null and email not ilike '%@widget.local'
    union all select id,'document',trim(identification_number) from base where nullif(trim(identification_number),'') is not null
  ), groups as (
    select kind,key,array_agg(id order by id) as ids from keys group by kind,key having count(*)>1
  ), involved as (select unnest(ids) as id from groups),
  conv as (select customer_id,count(*) as n from public.conversations where organization_id=p_org and customer_id in (select id from involved) group by customer_id),
  opp as (select customer_id,count(*) as n from public.opportunities where organization_id=p_org and customer_id in (select id from involved) group by customer_id)
  select coalesce(jsonb_agg(jsonb_build_object('identity_type',g.kind,'identity_value',g.key,'customers',
    (select jsonb_agg(to_jsonb(b)-'digits'||jsonb_build_object('conversations_count',coalesce(c.n,0),'opportunities_count',coalesce(o.n,0)))
     from base b left join conv c on c.customer_id=b.id left join opp o on o.customer_id=b.id where b.id=any(g.ids)))),'[]'::jsonb)
    into v_result from groups g;
  return v_result;
end; $$;
revoke all on function public.crm_find_duplicates(integer) from public,anon;
grant execute on function public.crm_find_duplicates(integer) to authenticated,service_role;

create or replace function public.crm_exclude_customer_pair(p_org integer,p_a uuid,p_b uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.fn_crm_exigir_permiso(p_org,array['crm.customers.merge']);
  if auth.uid() is null then raise exception using errcode='42501',message='sin_sesion'; end if;
  if p_a=p_b then raise exception using errcode='22023',message='seleccion_invalida'; end if;
  perform id from public.customers where organization_id=p_org and id in(p_a,p_b) order by id for update;
  if (select count(*) from public.customers where organization_id=p_org and id in(p_a,p_b))<>2 then
    raise exception using errcode='P0002',message='cliente_no_encontrado';
  end if;
  insert into public.customer_merge_exclusions(organization_id,customer_a,customer_b,created_by)
    values(p_org,least(p_a,p_b),greatest(p_a,p_b),auth.uid()) on conflict do nothing;
end; $$;
revoke all on function public.crm_exclude_customer_pair(integer,uuid,uuid) from public,anon;
grant execute on function public.crm_exclude_customer_pair(integer,uuid,uuid) to authenticated;

create or replace function public.crm_start_duplicate_scan(p_org integer) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_job uuid;
begin
  perform public.fn_crm_exigir_permiso(p_org,array['crm.customers.merge']);
  if auth.uid() is null then raise exception using errcode='42501',message='sin_sesion'; end if;
  perform pg_advisory_xact_lock(71001,p_org);
  select s.id into v_id from public.customer_duplicate_scans s join public.outbound_jobs j on j.id=s.job_id
    where s.organization_id=p_org and j.organization_id=p_org and j.status in('queued','running') order by s.created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.customer_duplicate_scans(organization_id,requested_by) values(p_org,auth.uid()) returning id into v_id;
  v_job:=public.fn_enqueue_job(p_org,'maintenance',jsonb_build_object('operation','crm_duplicate_scan','scan_id',v_id),now(),'crm_duplicate_scan:'||p_org,3);
  update public.customer_duplicate_scans set job_id=v_job where id=v_id and organization_id=p_org;
  return v_id;
end; $$;
revoke all on function public.crm_start_duplicate_scan(integer) from public,anon;
grant execute on function public.crm_start_duplicate_scan(integer) to authenticated;
