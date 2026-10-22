-- Revierte esta parte de los permisos de cierre.
-- Hay que aplicar los tres rollbacks del más nuevo al más viejo, en este orden:
--   1. 20261022144519_permisos_cierre_informe_rollback.sql
--   2. 20261022144501_permisos_cierre_ejercicio_rollback.sql
--   3. 20261022144327_permisos_cierre_contable_rollback.sql
-- Si se deja el disparador y se restauran las funciones viejas, firmar o
-- reabrir un informe que mueve el período responde sin_permiso.
-- No deshace períodos ya cerrados ni asientos del cierre de ejercicio.

-- Revierte los permisos granulares de cierre contable.
--
-- Devuelve las funciones al control anterior: administrador (rol 1 o 2) o
-- accounting.reverse, vía fn_finanzas_exigir_permiso. Quita el disparador que
-- bloquea el cambio de estado.
--
-- No deshace períodos que ya se hayan cerrado o reabierto, ni asientos del
-- cierre de ejercicio. Borra las filas de finance_audit_log con action
-- close o reopen y entity fiscal_period o fiscal_year: sin eso no se puede
-- devolver el check de action. También quita los cuatro permisos de todos
-- los roles y cargos, no solo del administrador y de CONTADOR.

drop trigger if exists trg_fiscal_periods_bloquear_estado on public.fiscal_periods;
drop function if exists public.fn_fiscal_periods_bloquear_estado();
drop function if exists public.fn_auditar_cierre_contable(integer, text, text, text, jsonb);
drop function if exists public.fn_exigir_permiso_contable(integer, text);

create or replace function public.fn_conceder_permisos_contador(p_job_position_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select p_job_position_id, p.id, true
    from public.permissions p
   where p.code in ('accounting.reverse', 'finance.create')
  on conflict (job_position_id, permission_id) do nothing;
$$;
revoke all on function public.fn_conceder_permisos_contador(uuid) from public, anon, authenticated;

create or replace function public.fn_cierre_periodo(
  p_organization_id integer,
  p_period_id uuid,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_id uuid;
begin
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['accounting.reverse']);
  update public.fiscal_periods
     set status = 'closed',
         closed_at = now(),
         closed_by = auth.uid(),
         notes = coalesce(nullif(btrim(p_notas), ''), notes),
         updated_at = now()
   where id = p_period_id
     and organization_id = p_organization_id
     and status = 'open'
  returning id into v_id;
  if v_id is null then
    raise exception 'periodo_no_abierto' using errcode = '23514';
  end if;
  return jsonb_build_object('id', v_id, 'status', 'closed');
end;
$fn$;

revoke all on function public.fn_cierre_periodo(integer, uuid, text) from public, anon;
grant execute on function public.fn_cierre_periodo(integer, uuid, text) to authenticated;

create or replace function public.fn_reabrir_periodo(
  p_organization_id integer,
  p_period_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_id uuid;
begin
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['accounting.reverse']);
  update public.fiscal_periods
     set status = 'open',
         closed_at = null,
         closed_by = null,
         updated_at = now()
   where id = p_period_id
     and organization_id = p_organization_id
     and status = 'closed'
  returning id into v_id;
  if v_id is null then
    raise exception 'periodo_no_cerrado' using errcode = '23514';
  end if;
  return jsonb_build_object('id', v_id, 'status', 'open');
end;
$fn$;

revoke all on function public.fn_reabrir_periodo(integer, uuid) from public, anon;
grant execute on function public.fn_reabrir_periodo(integer, uuid) to authenticated;

delete from public.finance_audit_log
 where action in ('close', 'reopen')
   and entity in ('fiscal_period', 'fiscal_year');

alter table public.finance_audit_log drop constraint if exists finance_audit_log_action_check;
alter table public.finance_audit_log add constraint finance_audit_log_action_check
  check (action = any (array['insert'::text, 'update'::text, 'delete'::text, 'void'::text, 'approve'::text, 'reject'::text]));

delete from public.role_permissions rp
 using public.permissions p
 where rp.permission_id = p.id
   and p.code in (
     'accounting.period.close',
     'accounting.period.reopen',
     'accounting.fiscal_year.close',
     'accounting.fiscal_year.reopen'
   );

delete from public.job_position_permissions jpp
 using public.permissions p
 where jpp.permission_id = p.id
   and p.code in (
     'accounting.period.close',
     'accounting.period.reopen',
     'accounting.fiscal_year.close',
     'accounting.fiscal_year.reopen'
   );

delete from public.permissions
 where code in (
   'accounting.period.close',
   'accounting.period.reopen',
   'accounting.fiscal_year.close',
   'accounting.fiscal_year.reopen'
 );
