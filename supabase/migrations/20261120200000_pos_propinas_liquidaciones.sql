-- POS · Propinas: liquidación como documento (LIQ-000001) con reparto, pago y
-- anulación reversible. Diseño aprobado el 2026-11-20 (Figma `1087:712124` y
-- paso 1 `2695:190611`); propuesta en docs/design/POS-PAGINAS-FALTANTES-FIGMA.md
-- §3.A y POS-PROMOCIONES-CUPONES-CARGOS-PROPINAS.md §7.5.
--
-- Qué cambia:
--   1. Tablas `tip_settlements` (la liquidación) y `tip_settlement_lines` (el
--      reparto por persona). Solo lectura por pertenencia; se escriben
--      únicamente con las funciones de abajo.
--   2. `fn_propinas_liquidacion_crear`: en UNA transacción bloquea las
--      propinas, valida (pendientes, sin anular, de la sucursal, venta
--      cobrada), calcula el reparto en la base, numera, registra el egreso de
--      caja con `pos_caja_registrar_movimiento` (el mecanismo de Cajas, no una
--      copia) y marca las propinas liquidadas (`distribution_batch_id` = id de
--      la liquidación). Permiso `pos.propinas.liquidar`.
--   3. `fn_propinas_liquidacion_anular`: motivo obligatorio; devuelve el
--      efectivo a la caja con un ingreso, revierte el asiento (si lo hubo) y
--      deja las propinas otra vez por liquidar. Permisos
--      `pos.propinas.liquidar` y `pos.void`.
--   4. `fn_propina_anular`: el motivo pasa a ser obligatorio (≥ 3 caracteres,
--      el mismo mínimo de `pos_anular_venta_v1`, que ya lo manda siempre).
--   5. `fn_tips_guarda`: deja que la anulación de una liquidación devuelva sus
--      propinas a «por liquidar» (solo los campos de distribución, solo desde
--      la función, con `app.propinas_revertir = 'on'`).
--   6. `fn_asiento_movimiento_caja`: el concepto `liquidacionPropinas` no genera
--      asiento. Motivo: la regla contable de la propina (`fn_auto_journal_tip`,
--      origen `tip`) ya acredita caja (1105) por el importe de cada propina en
--      el momento del cobro. El egreso de la liquidación es la salida FÍSICA de
--      ese dinero; si también se contabilizara, caja quedaría acreditada dos
--      veces. Con transferencia no sale efectivo: la liquidación hace la
--      reclasificación caja → bancos (débito caja, crédito bancos).
--   7. Lecturas para la pantalla, acotadas a la organización y a las sucursales
--      con acceso: `fn_propinas_listado`, `fn_propinas_cifras`,
--      `fn_propinas_liquidaciones_listado`, `fn_propinas_liquidacion_detalle`.
--
-- Decisiones conservadoras (reportadas al dueño):
--   * Reparto: «a quien atendió» (por defecto) y «pozo por porcentaje». «Pozo
--     por horas» queda en el CHECK pero la función lo rechaza hasta que existan
--     turnos de HRM que lo sustenten.
--   * Pago: efectivo de la caja abierta (sale TODO, también lo de tarjeta: «el
--     efectivo que sale de la caja las compensa»), transferencia (referencia por
--     persona) o «liquidada sin pago» (con motivo; no mueve dinero). Nómina
--     queda en el CHECK pero la función la rechaza hasta integrarla con HRM.
--   * Sin comisión del datáfono sobre las propinas con tarjeta.
--   * La propina de una venta todavía sin cobrar (estado distinto de pagada)
--     no se liquida.
--
-- Aditiva: tablas nuevas, funciones nuevas, y `create or replace` de tres
-- funciones existentes sin cambiar su firma. Ninguna fila existente cambia.
-- Reversión: supabase/rollbacks/20261120200000_pos_propinas_liquidaciones_rollback.sql

-- ── 1. Tablas ───────────────────────────────────────────────────────────────
create table if not exists public.tip_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id),
  branch_id integer not null references public.branches(id),
  number integer not null,
  code text generated always as ('LIQ-' || lpad(number::text, 6, '0')) stored,
  period_from date,
  period_to date,
  distribution_method text not null
    check (distribution_method = any (array['atendio', 'horas', 'porcentaje'])),
  payment_method text not null
    check (payment_method = any (array['efectivo', 'transferencia', 'nomina', 'sin_pago'])),
  total numeric(14, 2) not null check (total > 0),
  cash_tips numeric(14, 2) not null default 0,
  bank_tips numeric(14, 2) not null default 0,
  tips_count integer not null check (tips_count > 0),
  tip_ids uuid[] not null,
  adjustment_reason text,
  notes text,
  cash_session_id integer references public.cash_sessions(id),
  cash_movement_id integer references public.cash_movements(id),
  status text not null default 'pagada' check (status = any (array['pagada', 'anulada'])),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,
  reversal_cash_movement_id integer references public.cash_movements(id),
  request_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint tip_settlements_numero_unico unique (organization_id, number),
  constraint tip_settlements_solicitud_unica unique (organization_id, request_id)
);

comment on table public.tip_settlements is
  'Liquidación de propinas (LIQ-000001): reparto, pago y anulación. Se escribe solo con fn_propinas_liquidacion_crear y fn_propinas_liquidacion_anular.';
comment on column public.tip_settlements.cash_tips is 'Parte de las propinas cobradas en efectivo.';
comment on column public.tip_settlements.tip_ids is 'Propinas liquidadas. Se conservan aunque la liquidación se anule (las propinas vuelven a «por liquidar»).';
comment on column public.tip_settlements.bank_tips is 'Parte de las propinas cobradas con tarjeta, transferencia o en línea (entró al banco).';

create index if not exists tip_settlements_org_fecha_idx on public.tip_settlements (organization_id, created_at desc);
create index if not exists tip_settlements_branch_idx on public.tip_settlements (branch_id);

create table if not exists public.tip_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.tip_settlements(id) on delete restrict,
  organization_id integer not null references public.organizations(id),
  person_id uuid not null references auth.users(id),
  base numeric(14, 2) not null default 0,
  share_pct numeric(7, 4) not null default 0,
  calculated numeric(14, 2) not null default 0,
  adjustment numeric(14, 2) not null default 0,
  amount numeric(14, 2) not null check (amount >= 0),
  transfer_reference text,
  constraint tip_settlement_lines_persona_unica unique (settlement_id, person_id)
);

comment on table public.tip_settlement_lines is
  'Reparto de una liquidación de propinas: base (sus propinas), participación, calculado, ajuste (suman cero) y a pagar.';

create index if not exists tip_settlement_lines_org_idx on public.tip_settlement_lines (organization_id);
create index if not exists tip_settlement_lines_persona_idx on public.tip_settlement_lines (person_id);
create index if not exists tips_distribution_batch_idx on public.tips (distribution_batch_id) where distribution_batch_id is not null;

alter table public.tip_settlements enable row level security;
alter table public.tip_settlement_lines enable row level security;

drop policy if exists tip_settlements_lectura on public.tip_settlements;
create policy tip_settlements_lectura on public.tip_settlements
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

drop policy if exists tip_settlement_lines_lectura on public.tip_settlement_lines;
create policy tip_settlement_lines_lectura on public.tip_settlement_lines
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));

revoke all on public.tip_settlements from anon, public;
revoke all on public.tip_settlement_lines from anon, public;
revoke insert, update, delete, truncate on public.tip_settlements from authenticated;
revoke insert, update, delete, truncate on public.tip_settlement_lines from authenticated;
grant select on public.tip_settlements to authenticated;
grant select on public.tip_settlement_lines to authenticated;

-- ── 2. El egreso de la liquidación no se contabiliza dos veces ──────────────
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
  -- liquidacionPropinas: el asiento de cada propina (fn_auto_journal_tip) ya
  -- acreditó caja al cobrarla; el egreso (y su reingreso al anular) es solo
  -- la salida física del dinero.
  if v_clave in ('cambioEfectivo', 'consignacionBanco', 'liquidacionPropinas') then
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

-- ── 3. Guarda de tips: la anulación de una liquidación devuelve sus propinas ─
create or replace function public.fn_tips_guarda()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rpc boolean := coalesce(current_setting('app.propinas_rpc', true), '') = 'on';
  v_revertir boolean := coalesce(current_setting('app.propinas_revertir', true), '') = 'on';
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

  -- Anular una liquidación (fn_propinas_liquidacion_anular): la propina vuelve
  -- a «por liquidar». Solo cambian los tres campos de distribución.
  if tg_op = 'UPDATE' and v_rpc and v_revertir
     and coalesce(old.is_distributed, false) and old.voided_at is null
     and not coalesce(new.is_distributed, false) and new.distributed_at is null and new.distribution_batch_id is null
     and (new.organization_id, new.branch_id, new.sale_id, new.payment_id, new.server_id, new.amount, new.tip_type,
          new.notes, new.voided_at, new.voided_by, new.void_reason, new.created_at)
         is not distinct from
         (old.organization_id, old.branch_id, old.sale_id, old.payment_id, old.server_id, old.amount, old.tip_type,
          old.notes, old.voided_at, old.voided_by, old.void_reason, old.created_at) then
    return new;
  end if;

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
    raise exception 'PROPINA_DISTRIBUIR_POR_FUNCION: use fn_propinas_liquidacion_crear' using errcode = '42501';
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

-- ── 4. Anular una propina: motivo obligatorio ───────────────────────────────
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
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
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
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'MOTIVO_REQUERIDO: anular una propina exige un motivo' using errcode = '22023';
  end if;
  if coalesce(v_tip.is_distributed, false) then
    raise exception 'PROPINA_DISTRIBUIDA: una propina liquidada no se anula; anule primero la liquidación' using errcode = '22023';
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
     set voided_at = now(), voided_by = v_uid, void_reason = v_motivo
   where id = p_tip_id;
  perform set_config('app.propinas_rpc', 'off', true);

  return jsonb_build_object('tip_id', p_tip_id, 'ya_anulada', false, 'asientos_revertidos', v_n);
end;
$function$;

-- ── 5. Persona: nombre y cargo (para listados) ──────────────────────────────
create or replace function public.fn_propinas_persona(p_organization_id integer, p_user uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', p_user,
    'nombre', coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email),
    'cargo', coalesce(jp.name, r.name))
    from (select p_user as uid) x
    left join public.profiles p on p.id = x.uid
    left join public.organization_members om on om.user_id = x.uid and om.organization_id = p_organization_id
    left join public.job_positions jp on jp.id = om.job_position_id
    left join public.roles r on r.id = om.role_id;
$function$;

-- ── 6. Sucursales visibles (misma regla de pos_ventas_listado) ──────────────
create or replace function public.fn_propinas_sucursales(p_organization_id integer, p_branch_id integer)
 returns integer[]
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v integer[];
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_branch_id is not null then
    if not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
      raise exception 'SUCURSAL_INVALIDA' using errcode = '22023';
    end if;
    if auth.uid() is not null and not public.app_branch_access(p_branch_id) then
      raise exception 'SIN_PERMISO: sin acceso a la sucursal' using errcode = '42501';
    end if;
    return array[p_branch_id];
  end if;
  select coalesce(array_agg(b.id), array[]::integer[]) into v
    from public.branches b
   where b.organization_id = p_organization_id
     and (auth.uid() is null or public.app_branch_access(b.id));
  return v;
end;
$function$;

-- ── 7. Listado de propinas ─────────────────────────────────────────────────
-- p_vista: por_liquidar · liquidadas · anuladas · todas.
create or replace function public.fn_propinas_listado(
  p_organization_id integer,
  p_branch_id integer default null,
  p_vista text default 'por_liquidar',
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_busqueda text default null,
  p_tipo text default null,
  p_persona uuid default null,
  p_orden text default 'fecha',
  p_direccion text default 'desc',
  p_limite integer default 20,
  p_desplazamiento integer default 0)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sucursales integer[] := public.fn_propinas_sucursales(p_organization_id, p_branch_id);
  v_patron text;
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 500);
  v_desp integer := greatest(coalesce(p_desplazamiento, 0), 0);
  v_total integer;
  v_filas jsonb;
begin
  if p_vista is null or p_vista not in ('por_liquidar', 'liquidadas', 'anuladas', 'todas') then
    raise exception 'FILTROS_INVALIDOS: vista' using errcode = '22023';
  end if;
  if p_busqueda is not null and btrim(p_busqueda) <> '' then
    v_patron := '%' || replace(replace(replace(left(btrim(p_busqueda), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with base as (
    select t.*,
           s.status as venta_estado, s.payment_status as venta_estado_pago, s.web_order_id, s.table_session_id, s.source as venta_origen,
           (select i.number from public.invoice_sales i
             where i.sale_id = s.id and coalesce(i.document_type, 'invoice') <> 'credit_note'
             order by (i.status in ('void', 'voided', 'cancelled')), i.created_at desc limit 1) as factura_numero,
           wo.order_number as pedido_numero,
           rt.name as mesa, rt.id as mesa_id,
           coalesce(nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), pr.email) as persona_nombre
      from public.tips t
      left join public.sales s on s.id = t.sale_id
      left join public.web_orders wo on wo.id = s.web_order_id
      left join public.table_sessions ts on ts.id = s.table_session_id
      left join public.restaurant_tables rt on rt.id = ts.restaurant_table_id
      left join public.profiles pr on pr.id = t.server_id
     where t.organization_id = p_organization_id
       and t.branch_id = any (v_sucursales)
       and (p_desde is null or t.created_at >= p_desde)
       and (p_hasta is null or t.created_at <= p_hasta)
       and (p_tipo is null or t.tip_type = p_tipo)
       and (p_persona is null or t.server_id = p_persona)
       and case p_vista
             when 'por_liquidar' then t.voided_at is null and not coalesce(t.is_distributed, false)
             when 'liquidadas' then t.voided_at is null and coalesce(t.is_distributed, false)
             when 'anuladas' then t.voided_at is not null
             else true
           end
  ),
  filtrada as (
    select b.* from base b
     where v_patron is null
        or b.factura_numero ilike v_patron or b.pedido_numero ilike v_patron
        or b.mesa ilike v_patron or b.persona_nombre ilike v_patron or b.notes ilike v_patron
  ),
  ordenada as (
    select f.*, row_number() over (
             order by
               case when p_orden = 'monto' and p_direccion = 'asc' then f.amount end asc nulls last,
               case when p_orden = 'monto' and p_direccion <> 'asc' then f.amount end desc nulls last,
               case when p_orden = 'fecha' and p_direccion = 'asc' then f.created_at end asc nulls last,
               f.created_at desc, f.id) as n,
           count(*) over () as total
      from filtrada f
  )
  select coalesce(max(o.total), 0)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id,
           'fecha', o.created_at,
           'monto', o.amount,
           'tipo', o.tip_type,
           'estado', case when o.voided_at is not null then 'anulada'
                          when coalesce(o.is_distributed, false) then 'liquidada' else 'por_liquidar' end,
           'sucursal_id', o.branch_id,
           'notas', o.notes,
           'anulada_en', o.voided_at,
           'motivo_anulacion', o.void_reason,
           'liquidada_en', o.distributed_at,
           'liquidacion', (select jsonb_build_object('id', ts2.id, 'codigo', ts2.code)
                             from public.tip_settlements ts2
                            where ts2.id = o.distribution_batch_id and ts2.organization_id = p_organization_id),
           'persona', public.fn_propinas_persona(p_organization_id, o.server_id),
           'venta', case when o.sale_id is null then null else jsonb_build_object(
             'id', o.sale_id,
             'numero', coalesce(o.factura_numero, o.pedido_numero),
             'tipo_numero', case when o.factura_numero is not null then 'factura'
                                 when o.pedido_numero is not null then 'pedido' end,
             'origen', case when o.web_order_id is not null or o.venta_origen = 'web' then 'web'
                            when o.table_session_id is not null then 'mesa' else 'pos' end,
             'mesa', o.mesa,
             'mesa_id', o.mesa_id,
             'abierta', coalesce(o.venta_estado, '') not in ('void', 'cancelled')
                        and coalesce(nullif(o.venta_estado_pago, ''), o.venta_estado, '') <> 'paid')
           end
         ) order by o.n), '[]'::jsonb)
    into v_total, v_filas
    from ordenada o
   where o.n > v_desp and o.n <= v_desp + v_limite;

  return jsonb_build_object('total', coalesce(v_total, 0), 'filas', v_filas);
end;
$function$;

-- ── 8. Cifras de la cabecera ───────────────────────────────────────────────
create or replace function public.fn_propinas_cifras(
  p_organization_id integer,
  p_branch_id integer default null,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_mes_desde timestamptz default null,
  p_mes_hasta timestamptz default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sucursales integer[] := public.fn_propinas_sucursales(p_organization_id, p_branch_id);
  v jsonb;
begin
  select jsonb_build_object(
    'por_liquidar', (select jsonb_build_object('monto', coalesce(sum(t.amount), 0), 'cantidad', count(*),
                                               'personas', count(distinct t.server_id))
                       from public.tips t
                      where t.organization_id = p_organization_id and t.branch_id = any (v_sucursales)
                        and t.voided_at is null and not coalesce(t.is_distributed, false)),
    'liquidado_mes', (select jsonb_build_object('monto', coalesce(sum(s.total), 0), 'liquidaciones', count(*))
                        from public.tip_settlements s
                       where s.organization_id = p_organization_id and s.branch_id = any (v_sucursales)
                         and s.status = 'pagada'
                         and (p_mes_desde is null or s.created_at >= p_mes_desde)
                         and (p_mes_hasta is null or s.created_at <= p_mes_hasta)),
    'promedio', (select jsonb_build_object('monto', coalesce(round(avg(t.amount), 2), 0), 'cantidad', count(*))
                   from public.tips t
                  where t.organization_id = p_organization_id and t.branch_id = any (v_sucursales)
                    and t.voided_at is null
                    and (p_desde is null or t.created_at >= p_desde)
                    and (p_hasta is null or t.created_at <= p_hasta)),
    'ventas', (select jsonb_build_object('total', count(*),
                                         'con_propina', count(*) filter (where coalesce(s.tip_amount, 0) > 0))
                 from public.sales s
                where s.organization_id = p_organization_id and s.branch_id = any (v_sucursales)
                  and s.status not in ('void', 'cancelled', 'draft')
                  and (p_desde is null or s.sale_date >= p_desde)
                  and (p_hasta is null or s.sale_date <= p_hasta)),
    'por_persona', (select coalesce(jsonb_agg(x order by (x->>'monto')::numeric desc), '[]'::jsonb)
                      from (select public.fn_propinas_persona(p_organization_id, t.server_id)
                                   || jsonb_build_object('monto', sum(t.amount), 'cantidad', count(*)) as x
                              from public.tips t
                             where t.organization_id = p_organization_id and t.branch_id = any (v_sucursales)
                               and t.voided_at is null and not coalesce(t.is_distributed, false)
                               and (p_desde is null or t.created_at >= p_desde)
                               and (p_hasta is null or t.created_at <= p_hasta)
                             group by t.server_id) q),
    'conteos', jsonb_build_object(
      'por_liquidar', (select count(*) from public.tips t
                        where t.organization_id = p_organization_id and t.branch_id = any (v_sucursales)
                          and t.voided_at is null and not coalesce(t.is_distributed, false)
                          and (p_desde is null or t.created_at >= p_desde)
                          and (p_hasta is null or t.created_at <= p_hasta)),
      'liquidaciones', (select count(*) from public.tip_settlements s
                         where s.organization_id = p_organization_id and s.branch_id = any (v_sucursales)),
      'anuladas', (select count(*) from public.tips t
                    where t.organization_id = p_organization_id and t.branch_id = any (v_sucursales)
                      and t.voided_at is not null
                      and (p_desde is null or t.created_at >= p_desde)
                      and (p_hasta is null or t.created_at <= p_hasta)))
  ) into v;
  return v;
end;
$function$;

-- ── 9. Crear la liquidación ────────────────────────────────────────────────
-- p_datos: { solicitud uuid, propinas uuid[], reparto 'atendio'|'porcentaje',
--   participaciones [{persona, pct}], ajustes [{persona, monto}], motivo_ajuste,
--   medio 'efectivo'|'transferencia'|'sin_pago', referencias [{persona, referencia}],
--   motivo, desde date, hasta date }
create or replace function public.fn_propinas_liquidacion_crear(p_organization_id integer, p_branch_id integer, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_solicitud uuid;
  v_ids uuid[];
  v_reparto text := coalesce(p_datos->>'reparto', 'atendio');
  v_medio text := p_datos->>'medio';
  v_motivo_ajuste text := left(nullif(btrim(coalesce(p_datos->>'motivo_ajuste', '')), ''), 500);
  v_motivo text := left(nullif(btrim(coalesce(p_datos->>'motivo', '')), ''), 500);
  v_existente public.tip_settlements%rowtype;
  v_n_encontradas integer;
  v_n_validas integer;
  v_abiertas integer;
  v_total numeric(14, 2);
  v_efectivo numeric(14, 2);
  v_banco numeric(14, 2);
  v_lineas jsonb := '[]'::jsonb;
  v_linea jsonb;
  v_suma_pct numeric;
  v_suma_ajustes numeric(14, 2);
  v_suma_calc numeric(14, 2);
  v_hay_ajuste boolean;
  v_numero integer;
  v_id uuid := gen_random_uuid();
  v_codigo text;
  v_sesion integer;
  v_mov jsonb;
  v_mov_id integer;
  v_caja text;
  v_bancos text;
  v_rec record;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'pos.propinas.liquidar') then
    raise exception 'SIN_PERMISO: liquidar propinas requiere el permiso pos.propinas.liquidar' using errcode = '42501';
  end if;
  if p_branch_id is null or not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'SIN_SUCURSAL: la liquidación es de una sucursal' using errcode = '22023';
  end if;
  if not public.app_branch_access(p_branch_id) then
    raise exception 'SIN_PERMISO: sin acceso a la sucursal' using errcode = '42501';
  end if;

  begin
    v_solicitud := (p_datos->>'solicitud')::uuid;
  exception when others then
    v_solicitud := null;
  end;
  if v_solicitud is null then
    raise exception 'SOLICITUD_REQUERIDA' using errcode = '22023';
  end if;

  -- Reintento de la misma solicitud: devuelve la liquidación ya creada.
  select * into v_existente from public.tip_settlements
   where organization_id = p_organization_id and request_id = v_solicitud;
  if found then
    return jsonb_build_object('id', v_existente.id, 'codigo', v_existente.code, 'total', v_existente.total,
                              'ya_registrada', true);
  end if;

  select coalesce(array_agg(distinct x::uuid), array[]::uuid[]) into v_ids
    from jsonb_array_elements_text(coalesce(p_datos->'propinas', '[]'::jsonb)) x;
  if cardinality(v_ids) = 0 then
    raise exception 'SIN_PROPINAS: elija al menos una propina' using errcode = '22023';
  end if;

  if v_reparto not in ('atendio', 'porcentaje') then
    raise exception 'REPARTO_INVALIDO: reparto %', v_reparto using errcode = '22023';
  end if;
  if v_medio is null or v_medio not in ('efectivo', 'transferencia', 'sin_pago') then
    raise exception 'MEDIO_INVALIDO: medio %', coalesce(v_medio, '(vacío)') using errcode = '22023';
  end if;

  -- Bloquea las propinas (orden estable para no cruzarse con otra liquidación).
  perform 1 from public.tips t
   where t.organization_id = p_organization_id and t.id = any (v_ids)
   order by t.id
   for update;

  select count(*),
         count(*) filter (where t.branch_id = p_branch_id and t.voided_at is null and not coalesce(t.is_distributed, false)),
         count(*) filter (where s.id is not null and coalesce(s.status, '') not in ('void', 'cancelled')
                                and coalesce(nullif(s.payment_status, ''), s.status, '') <> 'paid'),
         coalesce(sum(t.amount), 0),
         coalesce(sum(t.amount) filter (where t.tip_type = 'cash'), 0),
         coalesce(sum(t.amount) filter (where t.tip_type <> 'cash'), 0)
    into v_n_encontradas, v_n_validas, v_abiertas, v_total, v_efectivo, v_banco
    from public.tips t
    left join public.sales s on s.id = t.sale_id
   where t.organization_id = p_organization_id and t.id = any (v_ids);

  if v_n_encontradas <> cardinality(v_ids) or v_n_validas <> cardinality(v_ids) then
    raise exception 'PROPINAS_NO_DISPONIBLES: % de % propinas ya no están por liquidar en esta sucursal',
      cardinality(v_ids) - v_n_validas, cardinality(v_ids) using errcode = '22023';
  end if;
  if v_abiertas > 0 then
    raise exception 'VENTA_ABIERTA: % propinas son de ventas sin cobrar', v_abiertas using errcode = '22023';
  end if;
  if v_total <= 0 then
    raise exception 'SIN_PROPINAS: el total a liquidar es cero' using errcode = '22023';
  end if;

  -- ── Reparto: calculado por persona ──
  if v_reparto = 'atendio' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'persona', q.server_id, 'base', q.base,
             'pct', round(q.base * 100 / v_total, 4), 'calculado', q.base) order by q.base desc, q.server_id), '[]'::jsonb)
      into v_lineas
      from (select t.server_id, sum(t.amount)::numeric(14, 2) as base
              from public.tips t where t.organization_id = p_organization_id and t.id = any (v_ids)
             group by t.server_id) q;
  else
    if jsonb_typeof(p_datos->'participaciones') is distinct from 'array'
       or jsonb_array_length(p_datos->'participaciones') = 0 then
      raise exception 'PORCENTAJES_INVALIDOS: faltan las participaciones' using errcode = '22023';
    end if;
    select sum((x->>'pct')::numeric) into v_suma_pct from jsonb_array_elements(p_datos->'participaciones') x;
    if v_suma_pct is null or abs(v_suma_pct - 100) > 0.01
       or exists (select 1 from jsonb_array_elements(p_datos->'participaciones') x where (x->>'pct')::numeric < 0)
       or (select count(distinct x->>'persona') from jsonb_array_elements(p_datos->'participaciones') x)
          <> jsonb_array_length(p_datos->'participaciones') then
      raise exception 'PORCENTAJES_INVALIDOS: las participaciones deben sumar 100 %%' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_datos->'participaciones') x
                where not exists (select 1 from public.organization_members om
                                   where om.organization_id = p_organization_id and om.is_active
                                     and om.user_id = (x->>'persona')::uuid)) then
      raise exception 'PERSONA_INVALIDA: una persona del reparto no es miembro activo' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'persona', (x->>'persona')::uuid,
             'base', coalesce((select sum(t.amount) from public.tips t
                                where t.organization_id = p_organization_id and t.id = any (v_ids)
                                  and t.server_id = (x->>'persona')::uuid), 0),
             'pct', round((x->>'pct')::numeric, 4),
             'calculado', round(v_total * (x->>'pct')::numeric / 100, 2))
             order by (x->>'pct')::numeric desc, x->>'persona'), '[]'::jsonb)
      into v_lineas
      from jsonb_array_elements(p_datos->'participaciones') x;
    -- El redondeo va a la primera línea (la de mayor participación).
    select coalesce(sum((l->>'calculado')::numeric), 0) into v_suma_calc from jsonb_array_elements(v_lineas) l;
    if v_suma_calc <> v_total then
      v_lineas := jsonb_set(v_lineas, '{0,calculado}',
                            to_jsonb(((v_lineas->0->>'calculado')::numeric + (v_total - v_suma_calc))::numeric(14, 2)));
    end if;
  end if;

  -- ── Ajustes: suman cero y llevan motivo ──
  if jsonb_typeof(p_datos->'ajustes') = 'array' then
    if exists (select 1 from jsonb_array_elements(p_datos->'ajustes') a
                where coalesce((a->>'monto')::numeric, 0) <> 0
                  and not exists (select 1 from jsonb_array_elements(v_lineas) l where l->>'persona' = a->>'persona')) then
      raise exception 'PERSONA_INVALIDA: un ajuste es de alguien fuera del reparto' using errcode = '22023';
    end if;
    select coalesce(sum(round((a->>'monto')::numeric, 2)), 0), bool_or(coalesce((a->>'monto')::numeric, 0) <> 0)
      into v_suma_ajustes, v_hay_ajuste
      from jsonb_array_elements(p_datos->'ajustes') a;
  else
    v_suma_ajustes := 0;
    v_hay_ajuste := false;
  end if;
  if v_suma_ajustes <> 0 then
    raise exception 'AJUSTES_NO_SUMAN_CERO: los ajustes suman %', v_suma_ajustes using errcode = '22023';
  end if;
  if coalesce(v_hay_ajuste, false) and (v_motivo_ajuste is null or length(v_motivo_ajuste) < 3) then
    raise exception 'MOTIVO_AJUSTE_REQUERIDO: un valor ajustado a mano exige motivo' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(l || jsonb_build_object(
           'ajuste', coalesce((select sum(round((a->>'monto')::numeric, 2)) from jsonb_array_elements(coalesce(p_datos->'ajustes', '[]'::jsonb)) a
                                where a->>'persona' = l->>'persona'), 0))), '[]'::jsonb)
    into v_lineas
    from jsonb_array_elements(v_lineas) l;

  if exists (select 1 from jsonb_array_elements(v_lineas) l
              where (l->>'calculado')::numeric + (l->>'ajuste')::numeric < 0) then
    raise exception 'AJUSTE_NEGATIVO: nadie puede quedar con un valor negativo' using errcode = '22023';
  end if;

  -- ── Medio de pago ──
  if v_medio = 'transferencia' then
    if exists (select 1 from jsonb_array_elements(v_lineas) l
                where (l->>'calculado')::numeric + (l->>'ajuste')::numeric > 0
                  and coalesce(btrim((select r->>'referencia' from jsonb_array_elements(coalesce(p_datos->'referencias', '[]'::jsonb)) r
                                       where r->>'persona' = l->>'persona' limit 1)), '') = '') then
      raise exception 'REFERENCIA_REQUERIDA: cada transferencia lleva su referencia' using errcode = '22023';
    end if;
  elsif v_medio = 'sin_pago' then
    if v_motivo is null or length(v_motivo) < 3 then
      raise exception 'MOTIVO_REQUERIDO: marcar liquidada sin pago exige un motivo' using errcode = '22023';
    end if;
  elsif v_medio = 'efectivo' then
    v_sesion := public.fn_caja_abierta_para(p_organization_id, p_branch_id, v_uid);
    if v_sesion is null then
      raise exception 'CAJA_CERRADA: abra la caja para pagar en efectivo' using errcode = '55000';
    end if;
  end if;

  if v_medio = 'transferencia'
     and not public.fn_is_period_open(p_organization_id, public.fn_today_for(p_organization_id, p_branch_id)) then
    raise exception 'PERIODO_CERRADO: el periodo contable de hoy está cerrado' using errcode = '22023';
  end if;

  -- ── Número ──
  perform pg_advisory_xact_lock(hashtext('tip_settlements'), p_organization_id);
  select coalesce(max(number), 0) + 1 into v_numero from public.tip_settlements where organization_id = p_organization_id;
  v_codigo := 'LIQ-' || lpad(v_numero::text, 6, '0');

  insert into public.tip_settlements (
    id, organization_id, branch_id, number, period_from, period_to, distribution_method, payment_method,
    total, cash_tips, bank_tips, tips_count, tip_ids, adjustment_reason, notes, cash_session_id, request_id, created_by
  ) values (
    v_id, p_organization_id, p_branch_id, v_numero,
    nullif(p_datos->>'desde', '')::date, nullif(p_datos->>'hasta', '')::date,
    v_reparto, v_medio, v_total, v_efectivo, v_banco, cardinality(v_ids), v_ids,
    case when v_hay_ajuste then v_motivo_ajuste end, v_motivo, v_sesion, v_solicitud, v_uid
  );

  insert into public.tip_settlement_lines (settlement_id, organization_id, person_id, base, share_pct, calculated, adjustment, amount, transfer_reference)
  select v_id, p_organization_id, (l->>'persona')::uuid, (l->>'base')::numeric, (l->>'pct')::numeric,
         (l->>'calculado')::numeric, (l->>'ajuste')::numeric,
         (l->>'calculado')::numeric + (l->>'ajuste')::numeric,
         case when v_medio = 'transferencia' then
           nullif(btrim((select r->>'referencia' from jsonb_array_elements(coalesce(p_datos->'referencias', '[]'::jsonb)) r
                          where r->>'persona' = l->>'persona' limit 1)), '') end
    from jsonb_array_elements(v_lineas) l;

  perform set_config('app.propinas_rpc', 'on', true);
  update public.tips
     set is_distributed = true, distributed_at = now(), distribution_batch_id = v_id
   where organization_id = p_organization_id and id = any (v_ids);
  perform set_config('app.propinas_rpc', 'off', true);

  -- ── Pago ──
  if v_medio = 'efectivo' then
    v_mov := public.pos_caja_registrar_movimiento(
      p_session_id := v_sesion,
      p_tipo := 'out',
      p_monto := v_total,
      p_concepto := 'Liquidación de propinas ' || v_codigo,
      p_concept_code := 'liquidacionPropinas',
      p_referencia := v_codigo,
      p_notas := null,
      p_uuid := v_solicitud);
    v_mov_id := (v_mov->>'id')::integer;
    update public.tip_settlements set cash_movement_id = v_mov_id where id = v_id;
  elsif v_medio = 'transferencia' then
    -- Reclasificación: la propina acreditó caja al cobrarse, pero el dinero
    -- sale del banco.
    v_caja := public.fn_cuenta_caja_existente(p_organization_id, p_branch_id, null);
    v_bancos := coalesce(public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'bancos'),
                         public.fn_primera_cuenta_detalle(p_organization_id, array['1110']));
    if v_caja is null or v_bancos is null then
      perform public.fn_log_journal_failure(p_organization_id, p_branch_id, now(), 'tip_settlements', v_id::text,
        'tip_settlement:' || v_id::text, v_caja, v_bancos, v_total, 'sin_cuenta',
        'Liquidación de propinas por transferencia sin cuenta de caja o de bancos');
    else
      perform public.fn_create_journal_entry(
        p_organization_id := p_organization_id,
        p_branch_id := p_branch_id,
        p_entry_date := now(),
        p_memo := 'Liquidación de propinas ' || v_codigo || ' por transferencia',
        p_source := 'tip_settlements',
        p_source_id := v_id::text,
        p_debit_account := v_caja,
        p_credit_account := v_bancos,
        p_amount := v_total,
        p_created_by := v_uid,
        p_fact_key := 'tip_settlement:' || v_id::text);
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'total', v_total, 'ya_registrada', false,
                            'movimiento_caja', v_mov_id, 'sesion_caja', v_sesion);
end;
$function$;

-- ── 10. Anular la liquidación ──────────────────────────────────────────────
create or replace function public.fn_propinas_liquidacion_anular(p_settlement_id uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_s public.tip_settlements%rowtype;
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
  v_sesion integer;
  v_mov jsonb;
  v_mov_id integer;
  v_je record;
  v_n_asientos integer := 0;
  v_n integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_s from public.tip_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'LIQUIDACION_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_s.organization_id);
  if not public.fn_tiene_permiso(v_s.organization_id, 'pos.propinas.liquidar')
     or not public.fn_tiene_permiso(v_s.organization_id, 'pos.void') then
    raise exception 'SIN_PERMISO: anular una liquidación requiere pos.propinas.liquidar y pos.void' using errcode = '42501';
  end if;
  if not public.app_branch_access(v_s.branch_id) then
    raise exception 'SIN_PERMISO: sin acceso a la sucursal' using errcode = '42501';
  end if;
  if v_s.status = 'anulada' then
    return jsonb_build_object('id', v_s.id, 'codigo', v_s.code, 'ya_anulada', true);
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'MOTIVO_REQUERIDO: anular una liquidación exige un motivo' using errcode = '22023';
  end if;

  -- El efectivo vuelve a la caja: la del egreso si sigue abierta; si no, la
  -- caja abierta de quien anula en la sucursal.
  if v_s.cash_movement_id is not null then
    select cs.id into v_sesion
      from public.cash_movements cm join public.cash_sessions cs on cs.id = cm.cash_session_id
     where cm.id = v_s.cash_movement_id and cs.status = 'open';
    if v_sesion is null then
      v_sesion := public.fn_caja_abierta_para(v_s.organization_id, v_s.branch_id, v_uid);
    end if;
    if v_sesion is null then
      raise exception 'CAJA_CERRADA: abra una caja para devolver el efectivo' using errcode = '55000';
    end if;
  end if;

  for v_je in
    select je.id from public.journal_entries je
     where je.organization_id = v_s.organization_id
       and je.source = 'tip_settlements' and je.source_id = v_s.id::text
       and coalesce(je.posted, false)
       and not exists (select 1 from public.journal_entries r
                        where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
     order by je.id
  loop
    if v_n_asientos = 0 and not public.fn_is_period_open(v_s.organization_id, public.fn_today_for(v_s.organization_id, v_s.branch_id)) then
      raise exception 'PERIODO_CERRADO: el periodo contable de hoy está cerrado' using errcode = '22023';
    end if;
    perform public.fn_revertir_asiento_en_fecha(v_je.id, 'anulacion', 'liquidacion-propinas-' || v_s.id, now(), v_uid);
    v_n_asientos := v_n_asientos + 1;
  end loop;

  if v_sesion is not null then
    v_mov := public.pos_caja_registrar_movimiento(
      p_session_id := v_sesion,
      p_tipo := 'in',
      p_monto := v_s.total,
      p_concepto := 'Anulación de la liquidación de propinas ' || v_s.code,
      p_concept_code := 'liquidacionPropinas',
      p_referencia := v_s.code,
      p_notas := v_motivo);
    v_mov_id := (v_mov->>'id')::integer;
  end if;

  perform set_config('app.propinas_rpc', 'on', true);
  perform set_config('app.propinas_revertir', 'on', true);
  update public.tips
     set is_distributed = false, distributed_at = null, distribution_batch_id = null
   where organization_id = v_s.organization_id and distribution_batch_id = v_s.id and voided_at is null;
  get diagnostics v_n = row_count;
  perform set_config('app.propinas_revertir', 'off', true);
  perform set_config('app.propinas_rpc', 'off', true);

  update public.tip_settlements
     set status = 'anulada', voided_at = now(), voided_by = v_uid, void_reason = v_motivo,
         reversal_cash_movement_id = v_mov_id
   where id = v_s.id;

  return jsonb_build_object('id', v_s.id, 'codigo', v_s.code, 'ya_anulada', false,
                            'propinas_devueltas', v_n, 'asientos_revertidos', v_n_asientos,
                            'movimiento_caja', v_mov_id);
end;
$function$;

-- ── 11. Listado de liquidaciones ───────────────────────────────────────────
create or replace function public.fn_propinas_liquidaciones_listado(
  p_organization_id integer,
  p_branch_id integer default null,
  p_busqueda text default null,
  p_estado text default null,
  p_medio text default null,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_limite integer default 20,
  p_desplazamiento integer default 0)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sucursales integer[] := public.fn_propinas_sucursales(p_organization_id, p_branch_id);
  v_patron text;
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 100);
  v_desp integer := greatest(coalesce(p_desplazamiento, 0), 0);
  v_total integer;
  v_filas jsonb;
begin
  if p_busqueda is not null and btrim(p_busqueda) <> '' then
    v_patron := '%' || replace(replace(replace(left(btrim(p_busqueda), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with base as (
    select s.*, count(*) over () as total_filas,
           row_number() over (order by s.created_at desc, s.number desc) as n
      from public.tip_settlements s
     where s.organization_id = p_organization_id
       and s.branch_id = any (v_sucursales)
       and (p_estado is null or s.status = p_estado)
       and (p_medio is null or s.payment_method = p_medio)
       and (p_desde is null or s.created_at >= p_desde)
       and (p_hasta is null or s.created_at <= p_hasta)
       and (v_patron is null or s.code ilike v_patron
            or exists (select 1 from public.tip_settlement_lines l
                         join public.profiles pr on pr.id = l.person_id
                        where l.settlement_id = s.id
                          and coalesce(nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), pr.email) ilike v_patron))
  )
  select coalesce(max(b.total_filas), 0)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'codigo', b.code, 'creada_en', b.created_at,
           'desde', b.period_from, 'hasta', b.period_to,
           'personas', (select count(*) from public.tip_settlement_lines l where l.settlement_id = b.id),
           'reparto', b.distribution_method, 'medio', b.payment_method,
           'total', b.total, 'estado', b.status, 'anulada_en', b.voided_at,
           'sesion_caja', b.cash_session_id, 'movimiento_caja', b.cash_movement_id,
           'referencias', (select string_agg(l.transfer_reference, ', ') from public.tip_settlement_lines l
                            where l.settlement_id = b.id and l.transfer_reference is not null)
         ) order by b.n), '[]'::jsonb)
    into v_total, v_filas
    from base b
   where b.n > v_desp and b.n <= v_desp + v_limite;

  return jsonb_build_object('total', coalesce(v_total, 0), 'filas', v_filas);
end;
$function$;

-- ── 12. Detalle de una liquidación ─────────────────────────────────────────
create or replace function public.fn_propinas_liquidacion_detalle(p_settlement_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_s public.tip_settlements%rowtype;
begin
  select * into v_s from public.tip_settlements where id = p_settlement_id;
  if not found then
    raise exception 'LIQUIDACION_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_s.organization_id);
  if auth.uid() is not null and not public.app_branch_access(v_s.branch_id) then
    raise exception 'SIN_PERMISO: sin acceso a la sucursal' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', v_s.id, 'codigo', v_s.code, 'estado', v_s.status,
    'sucursal', (select jsonb_build_object('id', b.id, 'nombre', b.name) from public.branches b where b.id = v_s.branch_id),
    'desde', v_s.period_from, 'hasta', v_s.period_to,
    'reparto', v_s.distribution_method, 'medio', v_s.payment_method,
    'total', v_s.total, 'efectivo', v_s.cash_tips, 'banco', v_s.bank_tips, 'cantidad', v_s.tips_count,
    'motivo_ajuste', v_s.adjustment_reason, 'notas', v_s.notes,
    'creada_en', v_s.created_at, 'creada_por', public.fn_propinas_persona(v_s.organization_id, v_s.created_by),
    'anulada_en', v_s.voided_at, 'motivo_anulacion', v_s.void_reason,
    'anulada_por', case when v_s.voided_by is not null then public.fn_propinas_persona(v_s.organization_id, v_s.voided_by) end,
    'sesion_caja', v_s.cash_session_id,
    'movimiento_caja', case when v_s.cash_movement_id is not null then
      (select jsonb_build_object('id', m.id, 'sesion', m.cash_session_id, 'fecha', m.created_at)
         from public.cash_movements m where m.id = v_s.cash_movement_id) end,
    'reingreso_caja', case when v_s.reversal_cash_movement_id is not null then
      (select jsonb_build_object('id', m.id, 'sesion', m.cash_session_id, 'fecha', m.created_at)
         from public.cash_movements m where m.id = v_s.reversal_cash_movement_id) end,
    'asientos', (select coalesce(jsonb_agg(jsonb_build_object('id', je.id, 'fecha', je.entry_date,
                                   'prefijo', je.comprobante_prefijo, 'numero', je.comprobante_numero) order by je.id), '[]'::jsonb)
                   from public.journal_entries je
                  where je.organization_id = v_s.organization_id
                    and je.source = 'tip_settlements' and je.source_id = v_s.id::text),
    'lineas', (select coalesce(jsonb_agg(public.fn_propinas_persona(v_s.organization_id, l.person_id) || jsonb_build_object(
                                 'base', l.base, 'pct', l.share_pct, 'calculado', l.calculated,
                                 'ajuste', l.adjustment, 'monto', l.amount, 'referencia', l.transfer_reference)
                               order by l.amount desc), '[]'::jsonb)
                 from public.tip_settlement_lines l where l.settlement_id = v_s.id),
    'propinas', (select coalesce(jsonb_agg(x order by (x->>'fecha') desc), '[]'::jsonb) from (
                   select jsonb_build_object(
                     'id', t.id, 'fecha', t.created_at, 'monto', t.amount, 'tipo', t.tip_type,
                     'persona', public.fn_propinas_persona(v_s.organization_id, t.server_id),
                     'venta', case when t.sale_id is null then null else jsonb_build_object(
                       'id', t.sale_id,
                       'numero', coalesce((select i.number from public.invoice_sales i
                                            where i.sale_id = t.sale_id and coalesce(i.document_type, 'invoice') <> 'credit_note'
                                            order by (i.status in ('void', 'voided', 'cancelled')), i.created_at desc limit 1),
                                          (select wo.order_number from public.web_orders wo join public.sales s on s.web_order_id = wo.id
                                            where s.id = t.sale_id)),
                       'tipo_numero', case when exists (select 1 from public.invoice_sales i where i.sale_id = t.sale_id
                                                          and coalesce(i.document_type, 'invoice') <> 'credit_note') then 'factura'
                                           else 'pedido' end) end) as x
                     from public.tips t
                    where t.organization_id = v_s.organization_id
                      and t.id = any (v_s.tip_ids)
                    limit 500) q)
  );
end;
$function$;

-- ── 13. Permisos de ejecución ──────────────────────────────────────────────
revoke all on function public.fn_propinas_persona(integer, uuid) from anon, public;
revoke all on function public.fn_propinas_sucursales(integer, integer) from anon, public;
revoke all on function public.fn_propinas_listado(integer, integer, text, timestamptz, timestamptz, text, text, uuid, text, text, integer, integer) from anon, public;
revoke all on function public.fn_propinas_cifras(integer, integer, timestamptz, timestamptz, timestamptz, timestamptz) from anon, public;
revoke all on function public.fn_propinas_liquidacion_crear(integer, integer, jsonb) from anon, public;
revoke all on function public.fn_propinas_liquidacion_anular(uuid, text) from anon, public;
revoke all on function public.fn_propinas_liquidaciones_listado(integer, integer, text, text, text, timestamptz, timestamptz, integer, integer) from anon, public;
revoke all on function public.fn_propinas_liquidacion_detalle(uuid) from anon, public;
revoke all on function public.fn_propina_anular(uuid, text) from anon, public;

grant execute on function public.fn_propinas_persona(integer, uuid) to authenticated;
grant execute on function public.fn_propinas_sucursales(integer, integer) to authenticated;
grant execute on function public.fn_propinas_listado(integer, integer, text, timestamptz, timestamptz, text, text, uuid, text, text, integer, integer) to authenticated;
grant execute on function public.fn_propinas_cifras(integer, integer, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
grant execute on function public.fn_propinas_liquidacion_crear(integer, integer, jsonb) to authenticated;
grant execute on function public.fn_propinas_liquidacion_anular(uuid, text) to authenticated;
grant execute on function public.fn_propinas_liquidaciones_listado(integer, integer, text, text, text, timestamptz, timestamptz, integer, integer) to authenticated;
grant execute on function public.fn_propinas_liquidacion_detalle(uuid) to authenticated;
grant execute on function public.fn_propina_anular(uuid, text) to authenticated;

comment on function public.fn_propinas_liquidar(integer, uuid[]) is
  'Heredada: marca propinas como distribuidas sin documento ni caja. La pantalla usa fn_propinas_liquidacion_crear (medio sin_pago para «Marcar liquidada sin pago»).';
