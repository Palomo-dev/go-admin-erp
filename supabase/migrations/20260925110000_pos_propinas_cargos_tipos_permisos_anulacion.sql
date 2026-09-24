-- POS · Propinas y cargos de servicio: tipos, permisos y anulación con reverso
--
-- Hallazgos que corrige (docs/design/POS-PROMOCIONES-CUPONES-CARGOS-PROPINAS.md §1):
--   #4/#5  tips_tip_type_check solo admitía cash/card/split/pooled: las propinas
--          por transferencia y las de pedidos web ('online') no se podían guardar.
--   #7     trg_auto_journal_tip solo corre en INSERT: editar el importe o borrar
--          una propina dejaba el asiento vivo. Decisión del dueño (ADR-CC-012):
--          un asiento automático se revierte anulando su documento, nunca
--          editando ni borrando el asiento. Aquí «borrar» pasa a ser «anular».
--   #14    RLS ALL por pertenencia: cualquier miembro creaba, editaba, borraba,
--          liquidaba e importaba. Ahora la escritura exige permiso, resuelto en
--          la base con el usuario de la sesión.
--   #19    «Meseros» eran todos los miembros activos, sin mirar la sucursal.
--
-- Permisos:
--   pos.create               registrar y corregir propinas (ya existía).
--   pos.void                 anular propinas (ya existía).
--   pos.propinas.liquidar    NUEVO: marcar propinas como distribuidas. Rol
--                            «Admin de organización» (2) y «Manager» (5).
--   billing_management       crear, editar, activar, borrar e importar cargos
--                            de servicio (ya existía; es el mismo permiso que
--                            protege los métodos de pago en la configuración
--                            del POS).
--
-- Aditiva: el CHECK se amplía (no quita valores), las columnas nuevas son NULL
-- y ninguna fila existente cambia.

-- ── 1. Tipos de propina ─────────────────────────────────────────────────────
alter table public.tips drop constraint if exists tips_tip_type_check;
alter table public.tips add constraint tips_tip_type_check
  check (tip_type = any (array['cash', 'card', 'split', 'pooled', 'transfer', 'online']));

-- ── 2. Anulación: quién, cuándo y por qué ───────────────────────────────────
alter table public.tips add column if not exists voided_at timestamptz;
alter table public.tips add column if not exists voided_by uuid references auth.users(id);
alter table public.tips add column if not exists void_reason text;

comment on column public.tips.voided_at is
  'Momento de la anulación. Una propina anulada no se edita; su asiento se revirtió con un contra-asiento (fn_propina_anular).';

-- ── 3. Permiso nuevo: liquidar propinas ─────────────────────────────────────
insert into public.permissions (code, name, description, module, category)
select 'pos.propinas.liquidar', 'Liquidar propinas',
       'Marcar propinas como distribuidas al personal', 'pos', 'pos'
where not exists (select 1 from public.permissions where code = 'pos.propinas.liquidar');

insert into public.role_permissions (role_id, permission_id, allowed)
select r.role_id, p.id, true
  from public.permissions p
  cross join (values (2), (5)) as r(role_id)
 where p.code = 'pos.propinas.liquidar'
   and not exists (select 1 from public.role_permissions rp
                    where rp.role_id = r.role_id and rp.permission_id = p.id);

-- ── 4. Guarda de la tabla tips ──────────────────────────────────────────────
-- Vale para cualquier camino (página, POS, pedidos web, service role):
--   * una propina distribuida o anulada no cambia ni se borra;
--   * distribuir y anular solo por sus funciones (app.propinas_rpc = 'on');
--   * el importe y la sucursal no cambian si hay un asiento vivo: se anula y
--     se registra otra;
--   * la organización nunca cambia.
-- Vía de escape de mantenimiento, la misma de los asientos:
--   set local app.contabilidad_mantenimiento = 'on';
create or replace function public.fn_tips_guarda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rpc boolean := coalesce(current_setting('app.propinas_rpc', true), '') = 'on';
  v_mant boolean := coalesce(current_setting('app.contabilidad_mantenimiento', true), '') = 'on';
  v_tip public.tips%rowtype;
  v_con_asiento boolean;
begin
  if v_mant then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if not v_rpc and (coalesce(new.is_distributed, false) or new.distributed_at is not null
                      or new.distribution_batch_id is not null or new.voided_at is not null
                      or new.voided_by is not null) then
      raise exception 'PROPINA_ESTADO_INICIAL: una propina nace pendiente y sin anular' using errcode = '22023';
    end if;
    return new;
  end if;

  v_tip := old;

  if v_tip.voided_at is not null then
    raise exception 'PROPINA_ANULADA: la propina % está anulada y no cambia', v_tip.id using errcode = '22023';
  end if;
  if coalesce(v_tip.is_distributed, false) then
    raise exception 'PROPINA_DISTRIBUIDA: la propina % ya se distribuyó; no se edita ni se anula', v_tip.id
      using errcode = '22023';
  end if;

  v_con_asiento := exists (
    select 1 from public.journal_entries je
     where je.organization_id = v_tip.organization_id
       and je.source = 'tips' and je.source_id = v_tip.id::text
       and coalesce(je.posted, false)
       and not exists (select 1 from public.journal_entries r
                        where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id));

  if tg_op = 'DELETE' then
    if v_con_asiento then
      raise exception 'PROPINA_CON_ASIENTO: la propina % tiene asiento contable; se anula, no se borra', v_tip.id
        using errcode = '22023';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.organization_id is distinct from old.organization_id then
    raise exception 'PROPINA_ORGANIZACION_INMUTABLE' using errcode = '42501';
  end if;
  if not v_rpc and (new.is_distributed is distinct from old.is_distributed
                    or new.distributed_at is distinct from old.distributed_at
                    or new.distribution_batch_id is distinct from old.distribution_batch_id) then
    raise exception 'PROPINA_DISTRIBUIR_POR_FUNCION: use fn_propinas_liquidar' using errcode = '42501';
  end if;
  if not v_rpc and (new.voided_at is distinct from old.voided_at
                    or new.voided_by is distinct from old.voided_by
                    or new.void_reason is distinct from old.void_reason) then
    raise exception 'PROPINA_ANULAR_POR_FUNCION: use fn_propina_anular' using errcode = '42501';
  end if;
  if v_con_asiento and (new.amount is distinct from old.amount or new.branch_id is distinct from old.branch_id) then
    raise exception 'PROPINA_CON_ASIENTO: la propina % ya tiene asiento; para cambiar el importe o la sucursal anúlela y registre otra', v_tip.id
      using errcode = '22023';
  end if;

  return new;
end;
$$;

revoke all on function public.fn_tips_guarda() from public, anon, authenticated;

drop trigger if exists trg_tips_guarda on public.tips;
create trigger trg_tips_guarda
  before insert or update or delete on public.tips
  for each row execute function public.fn_tips_guarda();

-- ── 5. Anular una propina con reverso contable ──────────────────────────────
-- Transaccional: revierte cada asiento vivo de la propina con un contra-asiento
-- fechado hoy (el día de la anulación, en un periodo abierto) y marca la
-- propina como anulada. Si el periodo de hoy está cerrado, falla sin cambiar nada.
create or replace function public.fn_propina_anular(p_tip_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_tip public.tips%rowtype;
  v_je record;
  v_n integer := 0;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;

  select * into v_tip from public.tips where id = p_tip_id for update;
  if not found then
    raise exception 'PROPINA_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_tip.organization_id);
  if not public.fn_tiene_permiso(v_tip.organization_id, 'pos.void') then
    raise exception 'SIN_PERMISO: anular propinas requiere el permiso pos.void' using errcode = '42501';
  end if;
  if v_tip.voided_at is not null then
    return jsonb_build_object('tip_id', p_tip_id, 'ya_anulada', true, 'asientos_revertidos', 0);
  end if;
  if coalesce(v_tip.is_distributed, false) then
    raise exception 'PROPINA_DISTRIBUIDA: una propina distribuida no se anula' using errcode = '22023';
  end if;

  for v_je in
    select je.id
      from public.journal_entries je
     where je.organization_id = v_tip.organization_id
       and je.source = 'tips' and je.source_id = v_tip.id::text
       and coalesce(je.posted, false)
       and not exists (select 1 from public.journal_entries r
                        where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
     order by je.id
  loop
    if v_n = 0 and not public.fn_is_period_open(v_tip.organization_id,
                                                public.fn_today_for(v_tip.organization_id, v_tip.branch_id)) then
      raise exception 'PERIODO_CERRADO: el periodo contable de hoy está cerrado' using errcode = '22023';
    end if;
    perform public.fn_revertir_asiento_en_fecha(v_je.id, 'anulacion', 'propina-' || v_tip.id, now(), v_uid);
    v_n := v_n + 1;
  end loop;

  perform set_config('app.propinas_rpc', 'on', true);
  update public.tips
     set voided_at = now(), voided_by = v_uid, void_reason = nullif(btrim(coalesce(p_motivo, '')), '')
   where id = p_tip_id;
  perform set_config('app.propinas_rpc', 'off', true);

  return jsonb_build_object('tip_id', p_tip_id, 'ya_anulada', false, 'asientos_revertidos', v_n);
end;
$$;
revoke all on function public.fn_propina_anular(uuid, text) from public, anon;
grant execute on function public.fn_propina_anular(uuid, text) to authenticated;

-- ── 6. Liquidar (marcar distribuidas) ───────────────────────────────────────
-- Solo toca propinas de la organización, pendientes y sin anular: un doble clic
-- o dos cajeros a la vez no liquidan dos veces (el segundo encuentra la fila
-- bloqueada y, al soltarse, ya distribuida).
create or replace function public.fn_propinas_liquidar(p_organization_id integer, p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_lote uuid := gen_random_uuid();
  v_n integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'pos.propinas.liquidar') then
    raise exception 'SIN_PERMISO: liquidar propinas requiere el permiso pos.propinas.liquidar' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return jsonb_build_object('liquidadas', 0, 'omitidas', 0, 'lote', null);
  end if;

  perform set_config('app.propinas_rpc', 'on', true);
  with liquidadas as (
    update public.tips
       set is_distributed = true, distributed_at = now(), distribution_batch_id = v_lote
     where organization_id = p_organization_id
       and id = any (p_ids)
       and not coalesce(is_distributed, false)
       and voided_at is null
    returning id
  )
  select count(*) into v_n from liquidadas;
  perform set_config('app.propinas_rpc', 'off', true);

  return jsonb_build_object(
    'liquidadas', v_n,
    'omitidas', cardinality(p_ids) - v_n,
    'lote', case when v_n > 0 then v_lote end
  );
end;
$$;
revoke all on function public.fn_propinas_liquidar(integer, uuid[]) from public, anon;
grant execute on function public.fn_propinas_liquidar(integer, uuid[]) to authenticated;

-- ── 7. Meseros = miembros activos con acceso a la sucursal ──────────────────
-- Misma regla que app_branch_access: super admin o rol de administración,
-- sucursal asignada en member_branches, o ninguna sucursal asignada en la
-- organización (sin restricción). Sin sucursal: todos los miembros activos.
create or replace function public.fn_propinas_meseros(p_organization_id integer, p_branch_id integer default null)
returns table (user_id uuid, first_name text, last_name text, email text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_branch_id is not null and not exists (select 1 from public.branches b
                                              where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'SUCURSAL_INVALIDA' using errcode = '22023';
  end if;

  return query
  select om.user_id, p.first_name::text, p.last_name::text, p.email::text
    from public.organization_members om
    left join public.profiles p on p.id = om.user_id
   where om.organization_id = p_organization_id
     and om.is_active
     and (
       p_branch_id is null
       or coalesce(om.is_super_admin, false)
       or om.role_id in (select r.id from public.roles r
                          where r.name = any (array['Super Admin', 'Admin de organización']))
       or exists (select 1 from public.member_branches mb
                   where mb.organization_member_id = om.id and mb.branch_id = p_branch_id)
       or not exists (select 1 from public.member_branches mb
                        join public.branches b on b.id = mb.branch_id
                       where mb.organization_member_id = om.id and b.organization_id = p_organization_id)
     )
   order by p.first_name, p.last_name;
end;
$$;
revoke all on function public.fn_propinas_meseros(integer, integer) from public, anon;
grant execute on function public.fn_propinas_meseros(integer, integer) to authenticated;

-- ── 8. RLS de tips: leer por pertenencia, escribir con pos.create ───────────
-- Sin política de DELETE: una propina se anula con fn_propina_anular.
drop policy if exists tips_org_isolation on public.tips;
drop policy if exists tips_lectura on public.tips;
drop policy if exists tips_registro on public.tips;
drop policy if exists tips_edicion on public.tips;

create policy tips_lectura on public.tips
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

create policy tips_registro on public.tips
  for insert to authenticated
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active
       and public.check_user_permission((select auth.uid()), om.organization_id, 'pos.create')));

create policy tips_edicion on public.tips
  for update to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active
       and public.check_user_permission((select auth.uid()), om.organization_id, 'pos.create')))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active
       and public.check_user_permission((select auth.uid()), om.organization_id, 'pos.create')));

revoke delete, truncate on public.tips from authenticated;
revoke all on public.tips from anon;

-- ── 9. RLS de service_charges: leer por pertenencia, escribir con billing_management
drop policy if exists service_charges_org_isolation on public.service_charges;
drop policy if exists service_charges_lectura on public.service_charges;
drop policy if exists service_charges_escritura on public.service_charges;

create policy service_charges_lectura on public.service_charges
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

create policy service_charges_escritura on public.service_charges
  for all to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active
       and public.check_user_permission((select auth.uid()), om.organization_id, 'billing_management')))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active
       and public.check_user_permission((select auth.uid()), om.organization_id, 'billing_management')));

revoke truncate on public.service_charges from authenticated;
revoke all on public.service_charges from anon;
