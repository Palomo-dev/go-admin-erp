-- Permisos granulares de cierre contable.
--
-- Cerrar o reabrir un período o el ejercicio ya no depende del rol ni del
-- cargo, ni de accounting.reverse. Cada acción exige su código, el mismo que
-- se asigna en la pantalla de roles y cargos:
--   accounting.period.close        cerrar un período
--   accounting.period.reopen       reabrir un período que no es anual
--   accounting.fiscal_year.close   cerrar el ejercicio
--   accounting.fiscal_year.reopen  reabrir un período anual
-- No existe fn_reabrir_ejercicio. Reabrir el período yearly pasa por
-- fn_reabrir_periodo y pide accounting.fiscal_year.reopen.
--
-- fn_finanzas_exigir_permiso deja pasar al rol 1 y al rol 2 sin mirar el
-- código. Estas acciones no la usan: llaman fn_exigir_permiso_contable, que
-- solo acepta check_user_permission. Un super administrador (is_super_admin)
-- sigue entrando porque esa función ya lo trata así. Sin sesión (service
-- role) tampoco hay usuario que autorizar: misma salida que la guarda de
-- finanzas, después de fn_assert_acceso_org.
--
-- El backfill entrega los cuatro códigos al rol Admin de organización (id 2)
-- y a los cargos cuyo code es CONTADOR. A nadie más. Un cargo CONTADOR que
-- se cree después los recibe por el disparador que ya existía.
--
-- Cualquier miembro podía cambiar fiscal_periods.status por la política ALL.
-- El disparador lo rechaza si la transacción no marcó finanzas.cierre_autorizado.
-- Firmar o reabrir un informe también mueve ese estado: además de
-- finance.approve o accounting.reverse, pide el permiso del período y deja
-- la misma marca. Así accounting.reverse solo no reabre el período.
--
-- La auditoría queda en finance_audit_log (entity fiscal_period o
-- fiscal_year, action close o reopen, user_id y timestamp). event_time es
-- generada y no se escribe.

alter table public.finance_audit_log drop constraint if exists finance_audit_log_action_check;
alter table public.finance_audit_log add constraint finance_audit_log_action_check
  check (action = any (array[
    'insert'::text, 'update'::text, 'delete'::text, 'void'::text,
    'approve'::text, 'reject'::text, 'close'::text, 'reopen'::text
  ]));

insert into public.permissions (code, name, description, module, category)
values
  ('accounting.period.close', 'Cerrar período contable',
   'Cierra un período contable abierto para que no reciba movimientos.', 'finance', 'finance'),
  ('accounting.period.reopen', 'Reabrir período contable',
   'Reabre un período contable que estaba cerrado.', 'finance', 'finance'),
  ('accounting.fiscal_year.close', 'Cerrar ejercicio contable',
   'Cierra el ejercicio: cancela el resultado del año y cierra sus períodos.', 'finance', 'finance'),
  ('accounting.fiscal_year.reopen', 'Reabrir ejercicio contable',
   'Reabre un ejercicio o un período anual que estaba cerrado.', 'finance', 'finance')
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      module = excluded.module,
      category = excluded.category;

insert into public.role_permissions (role_id, permission_id, allowed)
select 2, p.id, true
  from public.permissions p
 where p.code in (
   'accounting.period.close',
   'accounting.period.reopen',
   'accounting.fiscal_year.close',
   'accounting.fiscal_year.reopen'
 )
   and not exists (
     select 1 from public.role_permissions rp
      where rp.role_id = 2 and rp.permission_id = p.id
   );

create or replace function public.fn_conceder_permisos_contador(p_job_position_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select p_job_position_id, p.id, true
    from public.permissions p
   where p.code in (
     'accounting.reverse',
     'finance.create',
     'accounting.period.close',
     'accounting.period.reopen',
     'accounting.fiscal_year.close',
     'accounting.fiscal_year.reopen'
   )
  on conflict (job_position_id, permission_id) do nothing;
$$;

revoke all on function public.fn_conceder_permisos_contador(uuid) from public, anon, authenticated;

select public.fn_conceder_permisos_contador(j.id)
  from public.job_positions j
 where j.code = 'CONTADOR';

create or replace function public.fn_exigir_permiso_contable(p_org integer, p_codigo text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return;
  end if;
  if public.check_user_permission(v_uid, p_org, p_codigo) then
    return;
  end if;
  raise exception 'sin_permiso' using errcode = '42501',
    detail = jsonb_build_object('permiso', p_codigo)::text;
end;
$function$;

comment on function public.fn_exigir_permiso_contable(integer, text) is
  'Exige un permiso contable concreto. No acepta por ser admin ni por accounting.reverse. Sin sesión (service role) sale después de comprobar la organización.';

revoke all on function public.fn_exigir_permiso_contable(integer, text) from public, anon, authenticated;

create or replace function public.fn_auditar_cierre_contable(
  p_org integer,
  p_entity text,
  p_entity_id text,
  p_action text,
  p_diff jsonb
)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff)
  values (p_org, p_entity, p_entity_id, p_action, auth.uid(), p_diff);
$function$;

comment on function public.fn_auditar_cierre_contable(integer, text, text, text, jsonb) is
  'Deja en finance_audit_log quién cerró o reabrió un período o un ejercicio. No escribe event_time: es generada.';

revoke all on function public.fn_auditar_cierre_contable(integer, text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.fn_fiscal_periods_bloquear_estado()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'open'
       and coalesce(current_setting('finanzas.cierre_autorizado', true), '') <> '1' then
      raise exception 'sin_permiso' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status
     and coalesce(current_setting('finanzas.cierre_autorizado', true), '') <> '1' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_fiscal_periods_bloquear_estado() from public, anon, authenticated;

drop trigger if exists trg_fiscal_periods_bloquear_estado on public.fiscal_periods;
create trigger trg_fiscal_periods_bloquear_estado
  before insert or update of status on public.fiscal_periods
  for each row execute function public.fn_fiscal_periods_bloquear_estado();

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
  v_tipo text;
  v_anio integer;
begin
  perform public.fn_exigir_permiso_contable(p_organization_id, 'accounting.period.close');
  perform set_config('finanzas.cierre_autorizado', '1', true);
  update public.fiscal_periods
     set status = 'closed',
         closed_at = now(),
         closed_by = auth.uid(),
         notes = coalesce(nullif(btrim(p_notas), ''), notes),
         updated_at = now()
   where id = p_period_id
     and organization_id = p_organization_id
     and status = 'open'
  returning id, period_type, year into v_id, v_tipo, v_anio;
  if v_id is null then
    raise exception 'periodo_no_abierto' using errcode = '23514';
  end if;
  perform public.fn_auditar_cierre_contable(
    p_organization_id,
    'fiscal_period',
    v_id::text,
    'close',
    jsonb_build_object('anio', v_anio, 'period_type', v_tipo, 'origen', 'fn_cierre_periodo')
  );
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
  v_tipo text;
  v_anio integer;
  v_codigo text;
begin
  select fp.period_type, fp.year
    into v_tipo, v_anio
    from public.fiscal_periods fp
   where fp.id = p_period_id
     and fp.organization_id = p_organization_id
     and fp.status = 'closed';
  if v_tipo is null then
    perform public.fn_exigir_permiso_contable(p_organization_id, 'accounting.period.reopen');
    raise exception 'periodo_no_cerrado' using errcode = '23514';
  end if;
  v_codigo := case
    when v_tipo = 'yearly' then 'accounting.fiscal_year.reopen'
    else 'accounting.period.reopen'
  end;
  perform public.fn_exigir_permiso_contable(p_organization_id, v_codigo);
  perform set_config('finanzas.cierre_autorizado', '1', true);
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
  perform public.fn_auditar_cierre_contable(
    p_organization_id,
    case when v_tipo = 'yearly' then 'fiscal_year' else 'fiscal_period' end,
    v_id::text,
    'reopen',
    jsonb_build_object('anio', v_anio, 'period_type', v_tipo, 'origen', 'fn_reabrir_periodo')
  );
  return jsonb_build_object('id', v_id, 'status', 'open');
end;
$fn$;

revoke all on function public.fn_reabrir_periodo(integer, uuid) from public, anon;
grant execute on function public.fn_reabrir_periodo(integer, uuid) to authenticated;
