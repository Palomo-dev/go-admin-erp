-- Rollback de 20261021161024_correo_dominio_codigo_error.sql
--
-- Primero vuelve la funcion de reintento a la version anterior, que no
-- menciona error_code. Despues quita la restriccion y la columna.
-- Los codigos escritos se pierden. status y last_error no se tocan.
-- No reintenta trabajos ni llama al proveedor.

set lock_timeout = '10s';

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

alter table public.email_domains drop constraint if exists email_domains_error_code_check;
alter table public.email_domains drop column if exists error_code;

reset lock_timeout;
