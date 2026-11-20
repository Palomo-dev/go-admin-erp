-- Reversión de 20261120200000_pos_propinas_liquidaciones.sql
--
-- OJO: borra las liquidaciones registradas (tablas tip_settlements y
-- tip_settlement_lines). Las propinas que quedaron liquidadas conservan
-- is_distributed y su distribution_batch_id (que apuntaba a la liquidación);
-- los egresos y reingresos de caja (concepto liquidacionPropinas) y los
-- asientos de reclasificación por transferencia NO se borran. Antes de revertir
-- en una base con liquidaciones reales, exporte las tablas.

-- Funciones nuevas
drop function if exists public.fn_propinas_liquidacion_detalle(uuid);
drop function if exists public.fn_propinas_liquidaciones_listado(integer, integer, text, text, text, timestamptz, timestamptz, integer, integer);
drop function if exists public.fn_propinas_liquidacion_anular(uuid, text);
drop function if exists public.fn_propinas_liquidacion_crear(integer, integer, jsonb);
drop function if exists public.fn_propinas_cifras(integer, integer, timestamptz, timestamptz, timestamptz, timestamptz);
drop function if exists public.fn_propinas_listado(integer, integer, text, timestamptz, timestamptz, text, text, uuid, text, text, integer, integer);
drop function if exists public.fn_propinas_sucursales(integer, integer);
drop function if exists public.fn_propinas_persona(integer, uuid);

-- Tablas nuevas
drop index if exists public.tips_distribution_batch_idx;
drop table if exists public.tip_settlement_lines;
drop table if exists public.tip_settlements;

comment on function public.fn_propinas_liquidar(integer, uuid[]) is null;

-- fn_asiento_movimiento_caja: sin el concepto liquidacionPropinas
create or replace function public.fn_asiento_movimiento_caja(p_organization_id integer, p_tipo text, p_concept_code text)
 returns table(accion text, debito text, credito text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text := case when p_tipo in ('in', 'deposit', 'income') then 'in' else 'out' end;
  v_clave text := coalesce(p_concept_code, '');
  v_caja text;
  v_contra text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_clave in ('cambioEfectivo', 'consignacionBanco') then
    accion := 'omitir';
    debito := null;
    credito := null;
    return next;
    return;
  end if;

  v_caja := public.fn_cuenta_caja_existente(p_organization_id, null, null);

  if v_tipo = 'out' then
    v_contra := case v_clave
      when 'pagoProveedor' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['22050501', '2205', '2105']))
      when 'prestamoEmpleado' then public.fn_primera_cuenta_detalle(p_organization_id, array['1365'])
      when 'retiroConsignacion' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
      when 'retiroEfectivo' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
      else public.fn_primera_cuenta_detalle(p_organization_id, array['5195', '5135', '5305', '5105'])
    end;
    if v_contra is not null and left(v_contra, 1) = '4' then
      v_contra := null;
    end if;
    if v_caja is null or v_contra is null then
      accion := 'sin_cuenta';
      debito := v_contra;
      credito := v_caja;
      return next;
      return;
    end if;
    accion := 'asiento';
    debito := v_contra;
    credito := v_caja;
    return next;
    return;
  end if;

  v_contra := case v_clave
    when 'ventaContadoEspecial' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'ventas_productos'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['4135', '414015', '4145', '4235', '4105']))
    when 'fondoAdicional' then public.fn_primera_cuenta_detalle(p_organization_id, array['3105', '3115', '3605'])
    when 'prestamoInterno' then public.fn_primera_cuenta_detalle(p_organization_id, array['2380', '2305', '2195'])
    when 'devolucionRecibida' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['22050501', '2205', '2105']))
    else public.fn_primera_cuenta_detalle(p_organization_id, array[public.fn_cuenta_ingresos_diversos(p_organization_id, null)])
  end;
  if v_clave is distinct from 'ventaContadoEspecial' and v_contra is not null and left(v_contra, 4) = '4105' then
    v_contra := null;
  end if;
  if v_caja is null or v_contra is null then
    accion := 'sin_cuenta';
    debito := v_caja;
    credito := v_contra;
    return next;
    return;
  end if;
  accion := 'asiento';
  debito := v_caja;
  credito := v_contra;
  return next;
end;
$function$;

-- fn_tips_guarda: versión de 20260925110000 (sin la vuelta a «por liquidar»)
create or replace function public.fn_tips_guarda()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
$function$;

-- fn_propina_anular: versión de 20260925110000 (motivo opcional)
create or replace function public.fn_propina_anular(p_tip_id uuid, p_motivo text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
$function$;
