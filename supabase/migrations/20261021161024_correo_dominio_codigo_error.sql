-- El panel no decide fallido leyendo el texto de last_error.
-- error_code = plan_domain_limit es el aviso de cupo del plan.
-- Un reintento o un exito limpian last_error y error_code.
-- No reencola los trabajos que ya estan en failed.

set lock_timeout = '10s';

alter table public.email_domains
  add column if not exists error_code text;

comment on column public.email_domains.error_code is
  'Codigo estable del fallo. plan_domain_limit: el plan del proveedor no admite mas dominios. El panel no lo infiere del texto de last_error.';

alter table public.email_domains
  drop constraint if exists email_domains_error_code_check;

alter table public.email_domains
  add constraint email_domains_error_code_check
  check (error_code is null or error_code = 'plan_domain_limit');

update public.email_domains
   set error_code = 'plan_domain_limit'
 where status = 'failed'
   and error_code is null
   and (
     last_error ilike '%domain limit%'
     or last_error ilike '%no admite más dominios%'
     or last_error ilike '%no admite mas dominios%'
   );

create or replace function public.fn_reintentar_correo_tienda(
  p_organization_id integer,
  p_domain_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $rei$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.organization_domains d
     where d.id = p_domain_id
       and d.organization_id = p_organization_id
       and public.fn_correo_dominio_califica(d)
  ) then
    return;
  end if;
  update public.email_domains
     set status = 'pending',
         check_attempts = 0,
         last_error = null,
         error_code = null,
         updated_at = now()
   where organization_id = p_organization_id
     and organization_domain_id = p_domain_id
     and status = 'failed';
  insert into public.email_domain_jobs (organization_id, organization_domain_id, accion, status, run_after)
  values (p_organization_id, p_domain_id, 'provisionar_correo', 'pending', now())
  on conflict (organization_domain_id, accion)
    where status in ('pending', 'running') and organization_domain_id is not null
    do update set
      run_after = now(),
      last_error = null,
      created_at = now(),
      attempts = 0,
      updated_at = now();
end;
$rei$;

revoke all on function public.fn_reintentar_correo_tienda(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_reintentar_correo_tienda(integer, uuid) to service_role;

do $prueba$
declare
  n integer;
  v_def text;
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'email_domains'
       and column_name = 'error_code'
  ) then
    raise exception 'falta error_code';
  end if;

  select count(*) into n
    from public.email_domains
   where status = 'failed'
     and (
       last_error ilike '%domain limit%'
       or last_error ilike '%no admite más dominios%'
       or last_error ilike '%no admite mas dominios%'
     )
     and error_code is distinct from 'plan_domain_limit';
  if n <> 0 then
    raise exception 'el limite del plan quedo sin codigo';
  end if;

  select count(*) into n
    from public.email_domains
   where status is distinct from 'failed'
     and error_code is not null;
  if n <> 0 then
    raise exception 'un dominio que no fallo no debe tener codigo';
  end if;

  v_def := pg_get_functiondef('public.fn_reintentar_correo_tienda(integer,uuid)'::regprocedure);
  if position('error_code = null' in v_def) = 0 or position('last_error = null' in v_def) = 0 then
    raise exception 'el reintento no limpia last_error y error_code';
  end if;
end
$prueba$;

reset lock_timeout;
