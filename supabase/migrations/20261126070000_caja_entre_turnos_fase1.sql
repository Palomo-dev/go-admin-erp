-- GO-pos · «Caja — lo que sale entre turnos», fase 1 (servidor). Encargo aprobado por el dueño el
-- 2026-11-25 (Figma EAvjINVRnlzFM70GVoWXgl, sección 3316:209317; lámina 3322:211186).
-- Reversión: supabase/rollbacks/20261126070000_caja_entre_turnos_fase1_rollback.sql
--
-- QUÉ HACE
--   1. Cierre en dos pasos en UNA transacción (pos_caja_cerrar_turno): contar y decir a dónde va el
--      efectivo CONTADO. Destinos: base (se queda en la caja, sin asiento), consignar (con foto del
--      comprobante, por fn_consignacion_caja_banco__aplicar → Bancos), trasladar (a otra caja
--      abierta), dueño (retiro), gasto (51/52 con soporte) y salida sin soporte · por legalizar. La
--      suma de destinos tiene que ser igual a lo contado. La base que se deja queda en
--      cash_sessions.base_dejada.
--   2. Cierre ciego y descuadre: tolerancia por caja (organization_settings 'pos_caja_entre_turnos',
--      por defecto 1.000). Dentro de la tolerancia: sin novedad. Por encima: la base pide UN reconteo
--      (guarda el primer conteo como arqueo 'partial' y no revela el esperado ni el sentido de la
--      diferencia a quien no tiene pos.cajas.ver_esperado). Si persiste, cierra con
--      descuadre_estado = 'por_revisar' (no bloquea la caja) y un supervisor lo aprueba con nota
--      (pos_caja_revisar_descuadre). El sobrante/faltante lo sigue asentando el disparador de cierre
--      (fn_auto_journal_cash_session, cambiado por otra sesión en 20261126040000 a 42958102 /
--      53959502: NO se toca aquí). Si la organización cobra faltantes al cajero y el propio cajero lo
--      acepta al cerrar (solo sin cierre ciego), se reclasifica 53959502 → 136525 con el cajero como
--      tercero.
--   3. Apertura con base sugerida (pos_caja_abrir / pos_caja_base_sugerida): la base sugerida es la
--      base dejada por el cierre anterior de la misma caja (o lo contado, en cierres anteriores a
--      esta fase). Abrir con otro monto no se impide: motivo obligatorio, queda como «Diferencia de
--      apertura» (movimiento de la apertura + asiento del motivo) y, salvo retiro/aporte del dueño,
--      con alerta 'por_explicar'. La primera apertura con base exige el origen (banco, dueño o
--      traslado).
--   4. Cuenta del dueño según el tipo de organización (fn_caja_turno_config): persona natural →
--      3130 con el NIT de la organización; sociedad → 2380 (retiro) / 1325 (sin soporte) con la cédula
--      del socio. Salida sin soporte de una caja que manejaba otra persona → 136525 con esa persona.
--   5. Permiso nuevo pos.cajas.explicar_diferencias (aprobar descuadres y, en la fase 3, explicar
--      diferencias pasadas) y bitácora cash_session_revisiones (quién, cuándo, nota).
--
-- QUÉ CAMBIA DE LO EXISTENTE (create or replace conserva firmas y ACL)
--   · pos_caja__esperado_calculo: los movimientos con destino_cierre (los destinos del cierre, la
--     diferencia y el origen de la apertura) no entran al esperado: el esperado de un turno cerrado no
--     cambia después del cierre y la diferencia de apertura no se cuenta dos veces.
--   · fn_asiento_movimiento_caja: omite 'destinoCierre' y 'trasladoCaja' (su asiento lo hace la RPC,
--     con la cuenta auxiliar de la caja y el tercero), como ya omitía 'consignacionBanco'.
--   · fn_consignacion_caja_banco: mismo comportamiento; su cuerpo pasa a
--     fn_consignacion_caja_banco__aplicar (sin el permiso de Finanzas, solo invocable por funciones
--     del servidor) para que el cierre consigne sin duplicar la lógica.
--   · Guarda (fn_caja_turno_guarda): las columnas nuevas y destino_cierre solo se escriben desde estas
--     RPC (app.caja_turno_rpc), nunca con un insert/update directo de la sesión del usuario.
-- El POS de hoy (apertura por insert, cierre por pos_caja_cerrar, outbox del Desktop) sigue igual.

-- ── 1. Columnas (aditivas, NULL-ables) ──────────────────────────────────────────────────────────
alter table public.cash_sessions
  add column if not exists base_dejada numeric(14, 2),
  add column if not exists base_sugerida numeric(14, 2),
  add column if not exists diferencia_apertura numeric(14, 2),
  add column if not exists diferencia_apertura_motivo text,
  add column if not exists diferencia_apertura_nota text,
  add column if not exists diferencia_apertura_estado text,
  add column if not exists origen_base jsonb,
  add column if not exists reconteo_pedido_at timestamptz,
  add column if not exists descuadre_estado text,
  add column if not exists descuadre_revisado_por uuid,
  add column if not exists descuadre_revisado_at timestamptz,
  add column if not exists descuadre_nota text,
  add column if not exists tolerancia_aplicada numeric(14, 2),
  add column if not exists faltante_a_cargo text;

alter table public.cash_sessions drop constraint if exists cash_sessions_diferencia_apertura_estado_chk;
alter table public.cash_sessions add constraint cash_sessions_diferencia_apertura_estado_chk
  check (diferencia_apertura_estado is null or diferencia_apertura_estado in ('por_explicar', 'explicada'));
alter table public.cash_sessions drop constraint if exists cash_sessions_diferencia_apertura_motivo_chk;
alter table public.cash_sessions add constraint cash_sessions_diferencia_apertura_motivo_chk
  check (diferencia_apertura_motivo is null or diferencia_apertura_motivo in
         ('error_conteo', 'consignacion', 'retiro_dueno', 'aporte_dueno', 'gasto', 'traslado', 'no_se'));
alter table public.cash_sessions drop constraint if exists cash_sessions_descuadre_estado_chk;
alter table public.cash_sessions add constraint cash_sessions_descuadre_estado_chk
  check (descuadre_estado is null or descuadre_estado in ('sin_novedad', 'por_revisar', 'aprobado'));
alter table public.cash_sessions drop constraint if exists cash_sessions_faltante_a_cargo_chk;
alter table public.cash_sessions add constraint cash_sessions_faltante_a_cargo_chk
  check (faltante_a_cargo is null or faltante_a_cargo in ('tienda', 'cajero'));

comment on column public.cash_sessions.base_dejada is
  'Efectivo que el cierre dejó como base para el siguiente turno (destino «base»). La apertura siguiente lo sugiere.';
comment on column public.cash_sessions.diferencia_apertura is
  'Monto de apertura menos la base sugerida (base dejada por el cierre anterior de la misma caja).';
comment on column public.cash_sessions.descuadre_estado is
  'sin_novedad: la diferencia del cierre está dentro de la tolerancia · por_revisar: persistió tras el reconteo · aprobado: un supervisor la revisó.';

alter table public.cash_movements add column if not exists destino_cierre text;
alter table public.cash_movements drop constraint if exists cash_movements_destino_cierre_chk;
alter table public.cash_movements add constraint cash_movements_destino_cierre_chk
  check (destino_cierre is null or destino_cierre in
         ('consignar', 'trasladar', 'dueno', 'gasto', 'sin_soporte', 'apertura', 'origen_base'));
comment on column public.cash_movements.destino_cierre is
  'Movimiento creado por el cierre (destino del efectivo) o por la apertura (diferencia / origen de la base). No entra al esperado del turno.';

-- ── 2. Bitácora de revisiones ───────────────────────────────────────────────────────────────────
create table if not exists public.cash_session_revisiones (
  id bigserial primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  cash_session_id integer not null references public.cash_sessions(id) on delete cascade,
  tipo text not null check (tipo in ('descuadre', 'apertura', 'salto', 'base_inicial')),
  accion text not null check (accion in ('aprobar', 'explicar')),
  monto numeric(14, 2),
  nota text not null check (length(btrim(nota)) between 1 and 2000),
  detalle jsonb,
  fecha_asiento timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists cash_session_revisiones_org_sesion_idx
  on public.cash_session_revisiones (organization_id, cash_session_id);
alter table public.cash_session_revisiones enable row level security;
revoke all on public.cash_session_revisiones from anon;
revoke insert, update, delete on public.cash_session_revisiones from authenticated;
grant select on public.cash_session_revisiones to authenticated;
drop policy if exists cash_session_revisiones_select on public.cash_session_revisiones;
-- Los montos de la bitácora revelan la diferencia: solo quien ve el esperado o revisa diferencias.
create policy cash_session_revisiones_select on public.cash_session_revisiones
  for select to authenticated
  using (
    organization_id in (select om.organization_id from public.organization_members om
                         where om.user_id = (select auth.uid()) and om.is_active)
    and (public.fn_caja_ve_esperado(organization_id)
         or public.fn_caja_puede(organization_id, 'pos.cajas.explicar_diferencias'))
  );
comment on table public.cash_session_revisiones is
  'Bitácora de quién aprobó un descuadre o explicó una diferencia de caja, cuándo y con qué nota. Solo la escriben las RPC.';

-- ── 3. Permiso nuevo ────────────────────────────────────────────────────────────────────────────
insert into public.permissions (code, name, description, module, category)
select 'pos.cajas.explicar_diferencias', 'Explicar diferencias de caja',
       'Aprobar descuadres de cierre y explicar diferencias entre un cierre y la apertura siguiente (genera asientos)',
       'pos', 'pos'
 where not exists (select 1 from public.permissions p where p.code = 'pos.cajas.explicar_diferencias');
-- Rol 2 (Admin de organización). El contador u otro cargo lo recibe asignándolo.
insert into public.role_permissions (role_id, permission_id, allowed)
select 2, p.id, true
  from public.permissions p
 where p.code = 'pos.cajas.explicar_diferencias'
   and not exists (select 1 from public.role_permissions rp where rp.role_id = 2 and rp.permission_id = p.id);

-- ── 4. Guarda de columnas ───────────────────────────────────────────────────────────────────────
create or replace function public.fn_caja_turno_guarda()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or coalesce(current_setting('app.caja_turno_rpc', true), '') = 'on' then
    return new;
  end if;
  if tg_table_name = 'cash_sessions' then
    if tg_op = 'INSERT' then
      if row(new.base_dejada, new.base_sugerida, new.diferencia_apertura, new.diferencia_apertura_motivo,
             new.diferencia_apertura_nota, new.diferencia_apertura_estado, new.origen_base, new.reconteo_pedido_at,
             new.descuadre_estado, new.descuadre_revisado_por, new.descuadre_revisado_at, new.descuadre_nota,
             new.tolerancia_aplicada, new.faltante_a_cargo)
         is distinct from row(null::numeric, null::numeric, null::numeric, null::text, null::text, null::text,
             null::jsonb, null::timestamptz, null::text, null::uuid, null::timestamptz, null::text, null::numeric, null::text) then
        raise exception 'campos_de_turno_solo_por_rpc' using errcode = '42501';
      end if;
    elsif row(new.base_dejada, new.base_sugerida, new.diferencia_apertura, new.diferencia_apertura_motivo,
              new.diferencia_apertura_nota, new.diferencia_apertura_estado, new.origen_base, new.reconteo_pedido_at,
              new.descuadre_estado, new.descuadre_revisado_por, new.descuadre_revisado_at, new.descuadre_nota,
              new.tolerancia_aplicada, new.faltante_a_cargo)
          is distinct from row(old.base_dejada, old.base_sugerida, old.diferencia_apertura, old.diferencia_apertura_motivo,
              old.diferencia_apertura_nota, old.diferencia_apertura_estado, old.origen_base, old.reconteo_pedido_at,
              old.descuadre_estado, old.descuadre_revisado_por, old.descuadre_revisado_at, old.descuadre_nota,
              old.tolerancia_aplicada, old.faltante_a_cargo) then
      raise exception 'campos_de_turno_solo_por_rpc' using errcode = '42501';
    end if;
  else
    if (tg_op = 'INSERT' and new.destino_cierre is not null)
       or (tg_op = 'UPDATE' and new.destino_cierre is distinct from old.destino_cierre) then
      raise exception 'destino_cierre_solo_por_rpc' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_caja_turno_guarda() from public, anon, authenticated;

drop trigger if exists trg_caja_turno_guarda on public.cash_sessions;
create trigger trg_caja_turno_guarda before insert or update on public.cash_sessions
  for each row execute function public.fn_caja_turno_guarda();
drop trigger if exists trg_caja_turno_guarda on public.cash_movements;
create trigger trg_caja_turno_guarda before insert or update on public.cash_movements
  for each row execute function public.fn_caja_turno_guarda();

-- ── 5. Esperado sin los movimientos del cierre ni de la apertura ────────────────────────────────
create or replace function public.pos_caja__esperado_calculo(p_session_id integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  s public.cash_sessions%rowtype;
  v_hasta timestamptz;
  v_por_cajero boolean;
  v_ventas_ef numeric := 0;
  v_vuelto numeric := 0;
  v_abonos_ef numeric := 0;
  v_compras_ef numeric := 0;
  v_devoluciones numeric := 0;
  v_entradas numeric := 0;
  v_salidas numeric := 0;
  v_efectivo numeric := 0;
  v_por_metodo jsonb := '{}'::jsonb;
begin
  select * into s from public.cash_sessions where id = p_session_id;
  if not found then
    raise exception 'La caja no existe' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(s.organization_id);
  if auth.uid() is not null and not public.app_branch_access(s.branch_id) then
    raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
  end if;

  v_hasta := coalesce(s.closed_at, now());
  v_por_cajero := coalesce(
    (select os.settings->>'mode' from public.organization_settings os
      where os.organization_id = s.organization_id and os.key = 'pos_cash_session_mode'),
    'branch') = 'user';

  with p as (
    select coalesce(pay.method, 'other') as metodo,
           coalesce(pay.amount, 0) as monto,
           coalesce(pay.change_amount, 0) as vuelto,
           coalesce(pay.source, '') as origen
      from public.payments pay
     where pay.organization_id = s.organization_id
       and pay.status = 'completed'
       and pay.created_at >= s.opened_at
       and pay.created_at <= v_hasta
       and (s.branch_id is null or pay.branch_id = s.branch_id)
       and (not v_por_cajero or pay.created_by = s.opened_by)
  )
  select
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(vuelto) filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen = 'account_receivable'), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen in ('invoice_purchase', 'account_payable')), 0),
    coalesce(
      (select jsonb_object_agg(x.metodo, x.total)
         from (select metodo, sum(monto) as total from p
                where metodo <> 'cash' and origen not in ('invoice_purchase', 'account_payable')
                group by metodo) x),
      '{}'::jsonb)
    into v_ventas_ef, v_vuelto, v_abonos_ef, v_compras_ef, v_por_metodo
    from p;

  -- Devoluciones heredadas (anteriores a procesar_devolucion): se restan como
  -- antes. Las nuevas en efectivo ya son una salida en cash_movements y las de
  -- saldo a favor no sacan efectivo.
  select coalesce(sum(r.total_refund), 0) into v_devoluciones
    from public.returns r
   where r.organization_id = s.organization_id
     and r.status = 'processed'
     and r.refund_method is null
     and r.created_at >= s.opened_at
     and r.created_at <= v_hasta
     and (s.branch_id is null or r.branch_id = s.branch_id)
     and (not v_por_cajero or r.user_id = s.opened_by);

  -- 20261126070000: los destinos del cierre y la diferencia/origen de la apertura no son
  -- movimientos del turno (salen del conteo o ya están en la base).
  select coalesce(sum(m.amount) filter (where m.type = 'in'), 0),
         coalesce(sum(m.amount) filter (where m.type = 'out'), 0)
    into v_entradas, v_salidas
    from public.cash_movements m
   where m.cash_session_id = s.id
     and m.destino_cierre is null;

  v_efectivo := coalesce(s.initial_amount, 0)
              + (v_ventas_ef - v_vuelto)
              + v_abonos_ef
              + v_entradas - v_salidas
              - v_compras_ef
              - v_devoluciones;

  return jsonb_build_object(
    'session_id', s.id,
    'organization_id', s.organization_id,
    'status', s.status,
    'efectivo_esperado', round(v_efectivo, 2),
    'por_metodo', v_por_metodo || jsonb_build_object('cash', round(v_efectivo, 2)),
    'detalle', jsonb_build_object(
      'inicial', coalesce(s.initial_amount, 0),
      'ventas_efectivo', v_ventas_ef - v_vuelto,
      'vuelto', v_vuelto,
      'abonos_efectivo', v_abonos_ef,
      'entradas', v_entradas,
      'salidas', v_salidas,
      'compras_efectivo', v_compras_ef,
      'devoluciones', v_devoluciones
    ),
    'por_cajero', v_por_cajero,
    'hasta', v_hasta
  );
end;
$function$;

-- ── 6. Los movimientos del cierre los asienta la RPC ────────────────────────────────────────────
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
  -- liquidacionPropinas: el egreso (y su reingreso al anular) es la salida
  -- física del dinero. El asiento lo hace fn_propinas_liquidacion_crear, uno
  -- por trabajador (Débito 28150501 / Crédito caja), con su tercero.
  -- destinoCierre / trasladoCaja (20261126070000): el asiento lo hacen pos_caja_cerrar_turno y
  -- pos_caja_abrir con la cuenta auxiliar de la caja y el tercero.
  if v_clave in ('cambioEfectivo', 'consignacionBanco', 'liquidacionPropinas', 'destinoCierre', 'trasladoCaja') then
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

-- ── 7. Consignación: núcleo sin el permiso de Finanzas ──────────────────────────────────────────
create or replace function public.fn_consignacion_caja_banco__aplicar(p_id uuid, p_organization_id integer, p_sesion_id integer, p_cuenta_banco integer, p_monto numeric, p_comision numeric DEFAULT 0, p_fecha date DEFAULT NULL::date, p_referencia text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_comision numeric := round(coalesce(p_comision, 0), 2);
  s record;
  b public.bank_accounts%rowtype;
  v_previa public.bank_transactions%rowtype;
  v_caja text;
  v_gasto text;
  v_tz text;
  v_fecha timestamptz;
  v_moneda_base text;
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_mov jsonb;
  v_tx public.bank_transactions%rowtype;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_id is null or p_organization_id is null or p_sesion_id is null or p_cuenta_banco is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);

  perform pg_advisory_xact_lock(hashtextextended('fn_consignacion_caja_banco:' || p_id::text, 0));
  select * into v_previa
    from public.bank_transactions
   where organization_id = p_organization_id
     and import_source = 'consignacion'
     and import_id = p_id::text
   limit 1;
  if found then
    return jsonb_build_object('id', p_id, 'repetida', true, 'bank_transaction_id', v_previa.id);
  end if;

  if v_monto <= 0 or v_monto > 1e12 or v_comision < 0 or v_comision > v_monto then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  select id, organization_id, branch_id, status into s
    from public.cash_sessions where id = p_sesion_id for share;
  if not found or s.organization_id <> p_organization_id then
    raise exception 'caja_no_encontrada' using errcode = 'P0002';
  end if;
  if s.status <> 'open' then
    raise exception 'caja_cerrada' using errcode = '55000';
  end if;

  select * into b from public.bank_accounts where id = p_cuenta_banco for update;
  if b.id is null or b.organization_id <> p_organization_id then
    raise exception 'cuenta_no_encontrada' using errcode = 'P0002';
  end if;
  if not coalesce(b.is_active, true) then
    raise exception 'cuenta_inactiva' using errcode = '22023';
  end if;
  perform public.fn_fc_acceso_sucursal(b.branch_id);
  v_moneda_base := upper(btrim(public.fn_moneda_base_organizacion(p_organization_id)));
  if upper(btrim(coalesce(b.currency, v_moneda_base))) <> v_moneda_base then
    raise exception 'moneda_distinta' using errcode = '22023';
  end if;

  if p_fecha is null then
    v_fecha := now();
  else
    if p_fecha > public.fn_today_for(p_organization_id, s.branch_id) then
      raise exception 'fecha_futura' using errcode = '22023';
    end if;
    v_tz := public.fn_timezone_for(p_organization_id, s.branch_id);
    v_fecha := ((p_fecha + (now() at time zone v_tz)::time) at time zone v_tz);
  end if;

  v_caja := public.fn_primera_cuenta_detalle(p_organization_id, array['1105']);
  if v_caja is null then
    raise exception 'cuenta_no_es_de_movimiento' using errcode = '22023', detail = 'sin cuenta de caja 1105';
  end if;

  v_mov := public.pos_caja_registrar_movimiento(
    p_session_id := p_sesion_id,
    p_tipo := 'out',
    p_monto := v_monto,
    p_concepto := 'Consignación a ' || coalesce(nullif(btrim(b.name), ''), b.bank_name, 'banco'),
    p_concept_code := 'consignacionBanco',
    p_referencia := v_ref,
    p_notas := null,
    p_uuid := p_id
  );

  insert into public.bank_transactions (
    organization_id, branch_id, bank_account_id, trans_date, description, amount,
    reference, transaction_type, status, import_source, import_id, cuenta_contable
  ) values (
    p_organization_id, coalesce(s.branch_id, b.branch_id), b.id, v_fecha,
    'Consignación de caja #' || p_sesion_id, v_monto,
    v_ref, 'deposit', 'unmatched', 'consignacion', p_id::text, v_caja
  ) returning * into v_tx;

  if v_comision > 0 then
    v_gasto := public.fn_primera_cuenta_detalle(p_organization_id, array['530505', '5305']);
    if v_gasto is null then
      raise exception 'cuenta_no_es_de_movimiento' using errcode = '22023', detail = 'sin cuenta de gastos bancarios 5305';
    end if;
    perform public.pos_caja_registrar_movimiento(
      p_session_id := p_sesion_id,
      p_tipo := 'out',
      p_monto := v_comision,
      p_concepto := 'Comisión de consignación',
      p_referencia := v_ref,
      p_uuid := public.fn_uuid_desde_texto('consignacion-comision:' || p_id::text),
      p_cuenta_contable := v_gasto
    );
  end if;

  return jsonb_build_object(
    'id', p_id,
    'repetida', false,
    'cash_movement_id', (v_mov->>'id')::integer,
    'bank_transaction_id', v_tx.id,
    'monto', v_monto,
    'comision', v_comision
  );
end;
$function$;
revoke all on function public.fn_consignacion_caja_banco__aplicar(uuid, integer, integer, integer, numeric, numeric, date, text)
  from public, anon, authenticated;

create or replace function public.fn_consignacion_caja_banco(p_id uuid, p_organization_id integer, p_sesion_id integer, p_cuenta_banco integer, p_monto numeric, p_comision numeric DEFAULT 0, p_fecha date DEFAULT NULL::date, p_referencia text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_id is null or p_organization_id is null or p_sesion_id is null or p_cuenta_banco is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.create']);
  return public.fn_consignacion_caja_banco__aplicar(p_id, p_organization_id, p_sesion_id, p_cuenta_banco,
                                                     p_monto, p_comision, p_fecha, p_referencia);
end;
$function$;

-- ── 8. Configuración, tipo de organización, cuentas y terceros ──────────────────────────────────
-- Persona natural o sociedad. Primero lo que diga la configuración; si no, la razón social o el
-- NIT (las personas jurídicas se numeran en 800/830/860/890/900/901; la sigla societaria es
-- obligatoria en el nombre). Sin datos: persona natural.
create or replace function public.fn_org_tipo_persona(p_org integer)
returns text
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select case when os.settings->>'tipo_persona' in ('natural', 'sociedad') then os.settings->>'tipo_persona' end
       from public.organization_settings os
      where os.organization_id = p_org and os.key = 'pos_caja_entre_turnos'),
    (select case
       when coalesce(o.legal_name, o.name, '') ~* '(\ms\.?\s?a\.?\s?s(\M|\.|$)|\ms\.?\s?a\.?$|\mltda\M|\mlimitada\M|\me\.?\s?u\.?$|\ms\.?\s?en\s?c\M|\msociedad\M|\mcorporaci|\mfundaci|\masociaci|\mcooperativ)'
         or left(regexp_replace(coalesce(o.nit, o.tax_id, ''), '\D', '', 'g'), 1) in ('8', '9')
       then 'sociedad' else 'natural' end
       from public.organizations o where o.id = p_org),
    'natural');
$$;
revoke all on function public.fn_org_tipo_persona(integer) from public, anon, authenticated;

-- Configuración efectiva de la caja de una sucursal (la de la sucursal pisa la general).
create or replace function public.fn_caja_turno_config(p_org integer, p_branch integer)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
  v_suc jsonb;
  v_tol numeric;
  v_tope numeric;
begin
  perform public.fn_assert_acceso_org(p_org);
  select os.settings into v from public.organization_settings os
   where os.organization_id = p_org and os.key = 'pos_caja_entre_turnos';
  v := coalesce(v, '{}'::jsonb);
  v_suc := case when p_branch is not null then v->'por_sucursal'->(p_branch::text) end;
  v_tol := coalesce(
    case when jsonb_typeof(v_suc->'tolerancia') = 'number' and (v_suc->>'tolerancia')::numeric >= 0 then (v_suc->>'tolerancia')::numeric end,
    case when jsonb_typeof(v->'tolerancia') = 'number' and (v->>'tolerancia')::numeric >= 0 then (v->>'tolerancia')::numeric end,
    1000);
  v_tope := coalesce(
    case when jsonb_typeof(v_suc->'tope') = 'number' and (v_suc->>'tope')::numeric > 0 then (v_suc->>'tope')::numeric end,
    case when jsonb_typeof(v->'tope') = 'number' and (v->>'tope')::numeric > 0 then (v->>'tope')::numeric end);
  return jsonb_build_object(
    'tolerancia', v_tol,
    'tope', v_tope,
    'cobrar_faltante_cajero', coalesce((v->>'cobrar_faltante_cajero')::boolean, false),
    'tipo_persona', public.fn_org_tipo_persona(p_org),
    'socio', case when jsonb_typeof(v->'socio') = 'object' and nullif(btrim(v->'socio'->>'nit'), '') is not null
                  then jsonb_build_object('nit', btrim(v->'socio'->>'nit'), 'nombre', nullif(btrim(v->'socio'->>'nombre'), '')) end
  );
end;
$$;
revoke all on function public.fn_caja_turno_config(integer, integer) from public, anon;

-- Cuenta auxiliar de la caja (la de la sesión, la de la sede o la primera de detalle de la 1105).
create or replace function public.fn_caja_turno_cuenta_caja(p_org integer, p_branch integer, p_preferida text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v text;
begin
  v := public.fn_cuenta_caja_existente(p_org, p_branch, p_preferida);
  if v is null or v not like '1105%' then
    v := public.fn_primera_cuenta_detalle(p_org, array['1105']);
  end if;
  if v is null then
    v := public.fn_cuenta_caja(p_org, p_branch, null);
  end if;
  return public.fn_puc_cuenta_de_sede(p_org, p_branch, v);
end;
$$;
revoke all on function public.fn_caja_turno_cuenta_caja(integer, integer, text) from public, anon, authenticated;

-- Cuentas de los destinos (Contador 2026-11-25). Si no existen de movimiento, se crean con el
-- mecanismo del plan (fn_puc_asegurar_cuenta).
create or replace function public.fn_caja_turno_cuenta(p_org integer, p_clave text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v text;
begin
  v := case p_clave
    when 'dueno_natural' then public.fn_primera_cuenta_detalle(p_org, array['3130'])
    when 'dueno_sociedad' then public.fn_primera_cuenta_detalle(p_org, array['2380'])
    when 'cxc_socios' then public.fn_primera_cuenta_detalle(p_org, array['1325'])
    when 'cxc_trabajadores' then public.fn_primera_cuenta_detalle(p_org, array['136525', '1365'])
    when 'faltantes' then public.fn_primera_cuenta_detalle(p_org, array['53959502'])
  end;
  if v is not null then
    return v;
  end if;
  begin
    v := case p_clave
      when 'dueno_natural' then public.fn_puc_asegurar_cuenta(p_org, '3130', 'Capital de personas naturales', true)
      when 'dueno_sociedad' then public.fn_puc_asegurar_cuenta(p_org, '2380', 'Acreedores varios', true)
      when 'cxc_socios' then public.fn_puc_asegurar_cuenta(p_org, '1325', 'Cuentas por cobrar a socios y accionistas', true)
      when 'cxc_trabajadores' then public.fn_puc_asegurar_cuenta(p_org, '136525', 'Cuentas por cobrar a trabajadores', true)
      when 'faltantes' then public.fn_puc_asegurar_cuenta(p_org, '53959502', 'Faltantes de caja', true)
    end;
  exception when others then
    v := null;
  end;
  return v;
end;
$$;
revoke all on function public.fn_caja_turno_cuenta(integer, text) from public, anon, authenticated;

-- Documento y nombre de una persona de la organización (HRM; si no, el perfil sin documento).
create or replace function public.fn_caja_turno_tercero_persona(p_org integer, p_user uuid, out nit text, out nombre text)
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
begin
  select nullif(btrim(i.doc_number), ''), public.fn_hr_nombre_persona(hp.id)
    into nit, nombre
    from public.hr_people hp
    left join public.hr_people_identification i on i.person_id = hp.id
   where hp.organization_id = p_org and hp.user_id = p_user
   order by (i.doc_number is null), hp.created_at
   limit 1;
  if nombre is null then
    select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into nombre
      from public.profiles p where p.id = p_user;
  end if;
end;
$$;
revoke all on function public.fn_caja_turno_tercero_persona(integer, uuid) from public, anon, authenticated;

-- Contrapartida y tercero de un destino. p_clave: 'dueno' | 'sin_soporte' | 'entrada' (dinero que
-- entró sin soporte). p_responsable: quien manejaba la caja (para la salida sin soporte).
create or replace function public.fn_caja_turno_contrapartida(
  p_org integer, p_clave text, p_responsable uuid, p_tercero_nit text, p_tercero_nombre text, p_estricto boolean,
  out cuenta text, out tercero_nit text, out tercero_nombre text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg jsonb := public.fn_caja_turno_config(p_org, null);
  v_natural boolean := (v_cfg->>'tipo_persona') = 'natural';
  v_owner uuid;
  v_onit text;
  v_onombre text;
begin
  select o.owner_user_id, nullif(btrim(coalesce(o.nit, o.tax_id)), ''), coalesce(nullif(btrim(o.legal_name), ''), o.name)
    into v_owner, v_onit, v_onombre
    from public.organizations o where o.id = p_org;

  if p_clave = 'sin_soporte' and p_responsable is not null and p_responsable is distinct from v_owner then
    cuenta := public.fn_caja_turno_cuenta(p_org, 'cxc_trabajadores');
    select t.nit, t.nombre into tercero_nit, tercero_nombre
      from public.fn_caja_turno_tercero_persona(p_org, p_responsable) t;
    return;
  end if;

  if v_natural then
    cuenta := public.fn_caja_turno_cuenta(p_org, 'dueno_natural');
    tercero_nit := v_onit;
    tercero_nombre := v_onombre;
    return;
  end if;

  cuenta := public.fn_caja_turno_cuenta(p_org, case when p_clave = 'sin_soporte' then 'cxc_socios' else 'dueno_sociedad' end);
  tercero_nit := coalesce(nullif(btrim(p_tercero_nit), ''), v_cfg->'socio'->>'nit');
  tercero_nombre := coalesce(nullif(btrim(p_tercero_nombre), ''), v_cfg->'socio'->>'nombre');
  if tercero_nit is null and p_estricto then
    raise exception 'falta_socio' using errcode = '22023',
      detail = 'Sociedad: el retiro o la salida sin soporte va a nombre del socio (cédula).';
  end if;
  -- La apertura no se bloquea por esto (decisión 3): queda a nombre del dueño de la cuenta.
  if tercero_nit is null then
    select t.nit, t.nombre into tercero_nit, tercero_nombre
      from public.fn_caja_turno_tercero_persona(p_org, v_owner) t;
  end if;
end;
$$;
revoke all on function public.fn_caja_turno_contrapartida(integer, text, uuid, text, text, boolean) from public, anon, authenticated;

-- Movimiento de la caja marcado como destino + su asiento (fuente cash_movements: el tercero de
-- las líneas sale del movimiento por fn_trg_tercero_linea_asiento). Sin contrapartida: solo el
-- movimiento (el asiento lo hizo otra función o no lo lleva).
create or replace function public.fn_caja_turno_movimiento(
  p_session_id integer, p_tipo text, p_monto numeric, p_concepto text, p_concept_code text,
  p_destino text, p_contra text, p_tercero_nit text, p_tercero_nombre text, p_soporte text,
  p_referencia text, p_notas text, p_uuid uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s public.cash_sessions%rowtype;
  v_mov jsonb;
  v_id integer;
  v_caja text;
begin
  select * into s from public.cash_sessions where id = p_session_id;
  v_mov := public.pos_caja_registrar_movimiento(
    p_session_id := p_session_id, p_tipo := p_tipo, p_monto := p_monto, p_concepto := p_concepto,
    p_concept_code := p_concept_code, p_referencia := p_referencia, p_notas := p_notas, p_uuid := p_uuid,
    p_tercero_nit := p_tercero_nit, p_tercero_nombre := p_tercero_nombre, p_soporte_path := p_soporte);
  v_id := (v_mov->>'id')::integer;
  if p_destino is not null then
    update public.cash_movements set destino_cierre = p_destino where id = v_id and destino_cierre is distinct from p_destino;
  end if;
  if p_contra is not null and coalesce((v_mov->>'ya_registrado')::boolean, false) is false then
    v_caja := public.fn_caja_turno_cuenta_caja(s.organization_id, s.branch_id, s.account_code);
    perform public.fn_create_journal_entry(
      p_organization_id := s.organization_id,
      p_branch_id := coalesce(s.branch_id, 0),
      p_entry_date := now(),
      p_memo := 'Caja #' || s.id || ' · ' || p_concepto,
      p_source := 'cash_movements',
      p_source_id := v_id::text,
      p_debit_account := case when p_tipo = 'out' then p_contra else v_caja end,
      p_credit_account := case when p_tipo = 'out' then v_caja else p_contra end,
      p_amount := p_monto,
      p_created_by := auth.uid(),
      p_fact_key := 'cash_move:' || v_id::text,
      p_cuenta_sin_centro := v_caja);
  elsif p_contra is null and p_concept_code = 'destinoCierre' then
    perform public.fn_log_journal_failure(s.organization_id, s.branch_id, now(), 'cash_movements', v_id::text,
      'cash_move:' || v_id::text, null, null, p_monto, 'sin_cuenta',
      'Destino de caja sin cuenta de contrapartida (3130, 2380, 1325 o 136525)');
  end if;
  return v_id;
end;
$$;
revoke all on function public.fn_caja_turno_movimiento(integer, text, numeric, text, text, text, text, text, text, text, text, text, uuid)
  from public, anon, authenticated;

-- Asiento de dos líneas con tercero propio (reclasificación del faltante al cajero). Mismas
-- guardas que fn_create_journal_entry: idempotente por fact_key y sin escribir en período cerrado.
create or replace function public.fn_caja_turno_asiento_tercero(
  p_org integer, p_branch integer, p_fecha timestamptz, p_memo text, p_source text, p_source_id text,
  p_fact_key text, p_debito text, p_d_nit text, p_d_nombre text, p_credito text, p_c_nit text,
  p_c_nombre text, p_monto numeric)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id integer;
  v_monto numeric := round(coalesce(p_monto, 0), 0);
  v_branch integer := p_branch;
begin
  select id into v_id from public.journal_entries where organization_id = p_org and fact_key = p_fact_key limit 1;
  if v_id is not null then
    return v_id;
  end if;
  if v_monto <= 0 or p_debito is null or p_credito is null or p_debito = p_credito then
    perform public.fn_log_journal_failure(p_org, p_branch, p_fecha, p_source, p_source_id, p_fact_key,
      p_debito, p_credito, p_monto, 'account_null', 'Reclasificación de caja sin cuentas o sin importe');
    return null;
  end if;
  if not public.fn_is_period_open(p_org, p_fecha::date) then
    perform public.fn_log_journal_failure(p_org, p_branch, p_fecha, p_source, p_source_id, p_fact_key,
      p_debito, p_credito, p_monto, 'period_closed', 'Periodo contable cerrado para la fecha ' || p_fecha::date);
    return null;
  end if;
  if v_branch is null or not exists (select 1 from public.branches where id = v_branch and organization_id = p_org) then
    select id into v_branch from public.branches where organization_id = p_org order by is_main desc nulls last, id limit 1;
  end if;
  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key)
  values (p_org, v_branch, p_fecha, left(p_memo, 500), p_source, p_source_id, true, auth.uid(), p_fact_key)
  returning id into v_id;
  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre, cost_center_id)
  values (v_id, p_debito, left(p_memo, 500), v_monto, 0, p_d_nit, p_d_nombre,
          public.fn_centro_para_cuenta(p_org, v_branch, p_debito, null, null));
  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre, cost_center_id)
  values (v_id, p_credito, left(p_memo, 500), 0, v_monto, p_c_nit, p_c_nombre,
          public.fn_centro_para_cuenta(p_org, v_branch, p_credito, null, null));
  return v_id;
end;
$$;
revoke all on function public.fn_caja_turno_asiento_tercero(integer, integer, timestamptz, text, text, text, text, text, text, text, text, text, text, numeric)
  from public, anon, authenticated;

-- ── 9. Cierre del turno con destinos, tolerancia y reconteo ─────────────────────────────────────
create or replace function public.pos_caja_cerrar_turno(
  p_session_id integer,
  p_efectivo_contado numeric,
  p_destinos jsonb,
  p_contado_por_metodo jsonb default '{}'::jsonb,
  p_denominaciones jsonb default null,
  p_notas text default null,
  p_faltante_cajero boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s public.cash_sessions%rowtype;
  v_dest public.cash_sessions%rowtype;
  v_contado numeric := round(p_efectivo_contado, 2);
  v_cfg jsonb;
  v_tol numeric;
  v_ve boolean;
  v_esperado numeric;
  v_dif numeric;
  v_d jsonb;
  v_n integer;
  v_tipo text;
  v_monto numeric;
  v_suma numeric := 0;
  v_base numeric := 0;
  v_arqueo public.cash_counts%rowtype;
  v_cons jsonb;
  v_contra record;
  v_caja text;
  v_caja_dest text;
  v_mov integer;
  v_estado text;
  v_cobra_cajero boolean := false;
  v_cajero record;
  v_faltantes text;
  v_tipos constant text[] := array['base', 'consignar', 'trasladar', 'dueno', 'gasto', 'sin_soporte'];
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado' using errcode = '42501';
  end if;
  if v_contado is null or v_contado < 0 or v_contado > 1e12 then
    raise exception 'Efectivo contado inválido' using errcode = '22023';
  end if;
  if p_notas is not null and length(p_notas) > 5000 then
    raise exception 'Notas demasiado largas' using errcode = '22023';
  end if;
  if p_destinos is null or jsonb_typeof(p_destinos) <> 'array' or jsonb_array_length(p_destinos) > 20 then
    raise exception 'destinos_invalidos' using errcode = '22023';
  end if;

  select * into s from public.cash_sessions where id = p_session_id for update;
  if not found then
    raise exception 'caja_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(s.organization_id);
  if not public.app_branch_access(s.branch_id) then
    raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
  end if;
  if s.status <> 'open' then
    return jsonb_build_object('estado', 'ya_cerrada', 'ya_cerrada', true, 'session_id', s.id, 'status', s.status);
  end if;
  if s.opened_by <> v_uid and not public.fn_caja_puede(s.organization_id, 'pos.cajas.cerrar_ajenas') then
    raise exception 'sin_permiso' using errcode = '42501',
      detail = 'Solo el cajero que abrió la caja o quien tenga pos.cajas.cerrar_ajenas puede cerrarla.';
  end if;

  v_cfg := public.fn_caja_turno_config(s.organization_id, s.branch_id);
  v_tol := (v_cfg->>'tolerancia')::numeric;
  v_ve := public.fn_caja_ve_esperado(s.organization_id);

  -- 1) Destinos: tipos, datos obligatorios y que sumen lo CONTADO (lo único que conoce el cajero).
  for v_d in select e from jsonb_array_elements(p_destinos) e loop
    if jsonb_typeof(v_d) <> 'object' then
      raise exception 'destinos_invalidos' using errcode = '22023';
    end if;
    v_tipo := v_d->>'tipo';
    if v_tipo is null or not (v_tipo = any (v_tipos)) then
      raise exception 'destino_invalido' using errcode = '22023';
    end if;
    if jsonb_typeof(v_d->'monto') is distinct from 'number' then
      raise exception 'destino_sin_monto' using errcode = '22023';
    end if;
    v_monto := round((v_d->>'monto')::numeric, 2);
    if v_monto < 0 or v_monto > 1e12 or (v_monto = 0 and v_tipo <> 'base') then
      raise exception 'destino_sin_monto' using errcode = '22023';
    end if;
    if v_tipo = 'consignar' then
      if jsonb_typeof(v_d->'cuenta_banco_id') is distinct from 'number' then
        raise exception 'consignacion_sin_cuenta' using errcode = '22023';
      end if;
      if nullif(btrim(v_d->>'soporte_path'), '') is null then
        raise exception 'consignacion_sin_soporte' using errcode = '22023',
          detail = 'Sin comprobante no va a Bancos: regístralo como salida sin soporte · por legalizar.';
      end if;
    elsif v_tipo = 'trasladar' then
      if jsonb_typeof(v_d->'sesion_destino_id') is distinct from 'number' then
        raise exception 'traslado_sin_caja' using errcode = '22023';
      end if;
    elsif v_tipo = 'gasto' then
      if coalesce(v_d->>'cuenta_gasto', '') !~ '^5[12][0-9]*$' then
        raise exception 'gasto_sin_cuenta' using errcode = '22023';
      end if;
      if nullif(btrim(v_d->>'soporte_path'), '') is null then
        raise exception 'gasto_sin_soporte' using errcode = '22023';
      end if;
    end if;
    v_suma := v_suma + v_monto;
  end loop;
  if v_suma <> v_contado then
    raise exception 'destinos_no_suman' using errcode = '22023',
      detail = 'La suma de los destinos tiene que ser igual al efectivo contado.';
  end if;

  -- 2) Tolerancia y reconteo: una sola vez, sin revelar el esperado a quien no puede verlo.
  v_esperado := (public.pos_caja__esperado_calculo(s.id)->>'efectivo_esperado')::numeric;
  v_dif := round(v_contado - v_esperado, 2);
  if abs(v_dif) > v_tol and s.reconteo_pedido_at is null then
    perform set_config('app.caja_turno_rpc', 'on', true);
    update public.cash_sessions set reconteo_pedido_at = now() where id = s.id;
    perform set_config('app.caja_turno_rpc', 'off', true);
    perform public.pos_caja__arqueo_insertar(s.id, 'partial', v_contado, p_contado_por_metodo, p_denominaciones,
      'Primer conteo del cierre: no coincide con el sistema; se pidió volver a contar');
    return jsonb_build_object('estado', 'reconteo', 'ya_cerrada', false, 'session_id', s.id, 'oculto', not v_ve)
        || case when v_ve then jsonb_build_object('difference', v_dif, 'expected_amount', v_esperado, 'tolerancia', v_tol)
                else '{}'::jsonb end;
  end if;

  -- 3) Ventana del esperado y arqueo de cierre (como pos_caja_cerrar).
  update public.cash_sessions set closed_at = greatest(now(), s.opened_at) where id = s.id;
  v_arqueo := public.pos_caja__arqueo_insertar(s.id, 'closing', v_contado, p_contado_por_metodo, p_denominaciones, p_notas);
  v_dif := round(v_contado - coalesce(v_arqueo.expected_amount, 0), 2);

  -- 4) Destinos (la caja sigue abierta hasta el paso 5).
  perform set_config('app.caja_turno_rpc', 'on', true);
  v_caja := public.fn_caja_turno_cuenta_caja(s.organization_id, s.branch_id, s.account_code);
  v_n := 0;
  for v_d in select e from jsonb_array_elements(p_destinos) e loop
    v_n := v_n + 1;
    v_tipo := v_d->>'tipo';
    v_monto := round((v_d->>'monto')::numeric, 2);
    if v_tipo = 'base' then
      v_base := v_base + v_monto;
    elsif v_tipo = 'consignar' then
      v_cons := public.fn_consignacion_caja_banco__aplicar(
        public.fn_uuid_desde_texto('caja_turno:' || s.id || ':' || v_n), s.organization_id, s.id,
        (v_d->>'cuenta_banco_id')::integer, v_monto, 0, null, left(v_d->>'referencia', 120));
      update public.cash_movements
         set destino_cierre = 'consignar', soporte_path = btrim(v_d->>'soporte_path')
       where id = (v_cons->>'cash_movement_id')::integer;
    elsif v_tipo = 'trasladar' then
      select * into v_dest from public.cash_sessions
       where id = (v_d->>'sesion_destino_id')::integer and organization_id = s.organization_id
       for update;
      if not found or v_dest.status <> 'open' or v_dest.id = s.id then
        raise exception 'traslado_caja_invalida' using errcode = '22023';
      end if;
      v_mov := public.fn_caja_turno_movimiento(s.id, 'out', v_monto, 'Traslado a la caja #' || v_dest.id,
        'trasladoCaja', 'trasladar', null, null, null, null, null, nullif(btrim(v_d->>'nota'), ''),
        public.fn_uuid_desde_texto('caja_turno:' || s.id || ':' || v_n));
      perform public.pos_caja_registrar_movimiento(
        p_session_id := v_dest.id, p_tipo := 'in', p_monto := v_monto,
        p_concepto := 'Traslado desde la caja #' || s.id, p_concept_code := 'trasladoCaja',
        p_uuid := public.fn_uuid_desde_texto('caja_turno:' || s.id || ':' || v_n || ':recibe'));
      v_caja_dest := public.fn_caja_turno_cuenta_caja(v_dest.organization_id, v_dest.branch_id, v_dest.account_code);
      if v_caja_dest is distinct from v_caja then
        perform public.fn_create_journal_entry(
          p_organization_id := s.organization_id, p_branch_id := coalesce(s.branch_id, 0), p_entry_date := now(),
          p_memo := 'Traslado de la caja #' || s.id || ' a la caja #' || v_dest.id,
          p_source := 'cash_movements', p_source_id := v_mov::text,
          p_debit_account := v_caja_dest, p_credit_account := v_caja, p_amount := v_monto,
          p_created_by := v_uid, p_fact_key := 'cash_move:' || v_mov::text, p_cuenta_sin_centro := v_caja);
      end if;
    elsif v_tipo = 'gasto' then
      v_mov := (public.pos_caja_registrar_movimiento(
        p_session_id := s.id, p_tipo := 'out', p_monto := v_monto,
        p_concepto := coalesce(nullif(btrim(v_d->>'nota'), ''), 'Gasto pagado con el efectivo del cierre'),
        p_referencia := left(v_d->>'referencia', 120),
        p_uuid := public.fn_uuid_desde_texto('caja_turno:' || s.id || ':' || v_n),
        p_cuenta_contable := v_d->>'cuenta_gasto',
        p_tercero_nit := v_d->>'tercero_nit', p_tercero_nombre := v_d->>'tercero_nombre',
        p_soporte_path := btrim(v_d->>'soporte_path'))->>'id')::integer;
      update public.cash_movements set destino_cierre = 'gasto' where id = v_mov;
    else
      -- dueno | sin_soporte
      select c.cuenta, c.tercero_nit, c.tercero_nombre into v_contra
        from public.fn_caja_turno_contrapartida(s.organization_id, v_tipo, s.opened_by,
                                                v_d->>'tercero_nit', v_d->>'tercero_nombre', v_tipo = 'dueno') c;
      perform public.fn_caja_turno_movimiento(s.id, 'out', v_monto,
        case
          when v_tipo = 'dueno' and v_contra.cuenta like '3130%' then 'Retiro del propietario'
          when v_tipo = 'dueno' then 'Retiro del socio'
          when v_contra.cuenta like '3130%' then 'Retiro del propietario · por legalizar'
          else 'Salida de caja sin soporte · por legalizar'
        end,
        'destinoCierre', v_tipo, v_contra.cuenta, v_contra.tercero_nit, v_contra.tercero_nombre,
        nullif(btrim(v_d->>'soporte_path'), ''), null, nullif(btrim(v_d->>'nota'), ''),
        public.fn_uuid_desde_texto('caja_turno:' || s.id || ':' || v_n));
    end if;
  end loop;

  -- 5) Cierre. El disparador asienta el sobrante (42958102) o el faltante (53959502).
  v_estado := case when abs(v_dif) <= v_tol then 'sin_novedad' else 'por_revisar' end;
  v_cobra_cajero := coalesce(p_faltante_cajero, false) and v_dif < 0 and v_ve
                    and coalesce((v_cfg->>'cobrar_faltante_cajero')::boolean, false)
                    and v_uid = s.opened_by;
  update public.cash_sessions
     set status = 'closed',
         closed_by = v_uid,
         final_amount = v_contado,
         difference = v_dif,
         notes = coalesce(nullif(btrim(coalesce(p_notas, '')), ''), s.notes),
         base_dejada = v_base,
         descuadre_estado = v_estado,
         tolerancia_aplicada = v_tol,
         faltante_a_cargo = case when v_dif < 0 then case when v_cobra_cajero then 'cajero' else 'tienda' end end
   where id = s.id
  returning * into s;

  -- 6) Faltante que asume el cajero (lo confirmó él al cerrar): 53959502 → 136525 con su documento.
  if v_cobra_cajero then
    select t.nit, t.nombre into v_cajero from public.fn_caja_turno_tercero_persona(s.organization_id, s.opened_by) t;
    v_faltantes := public.fn_caja_turno_cuenta(s.organization_id, 'faltantes');
    perform public.fn_caja_turno_asiento_tercero(
      s.organization_id, s.branch_id, s.closed_at,
      'Faltante de caja a cargo del cajero · sesión ' || s.id, 'cash_sessions', s.id::text,
      'caja_turno:' || s.id || ':faltante_cajero',
      public.fn_caja_turno_cuenta(s.organization_id, 'cxc_trabajadores'), v_cajero.nit, v_cajero.nombre,
      v_faltantes, null, null, abs(v_dif));
  end if;
  perform set_config('app.caja_turno_rpc', 'off', true);

  return jsonb_build_object(
    'estado', 'cerrada',
    'ya_cerrada', false,
    'session_id', s.id,
    'uuid', s.uuid,
    'status', s.status,
    'opened_by', s.opened_by,
    'opened_at', s.opened_at,
    'closed_at', s.closed_at,
    'closed_by', s.closed_by,
    'branch_id', s.branch_id,
    'initial_amount', s.initial_amount,
    'final_amount', s.final_amount,
    'base_dejada', s.base_dejada,
    'difference', case when v_ve then s.difference end,
    'expected_amount', case when v_ve then v_arqueo.expected_amount end,
    'descuadre_estado', case when v_ve then s.descuadre_estado end,
    'faltante_a_cargo', case when v_ve then s.faltante_a_cargo end,
    'arqueo_id', v_arqueo.id,
    'oculto', not v_ve
  );
end;
$$;
revoke all on function public.pos_caja_cerrar_turno(integer, numeric, jsonb, jsonb, jsonb, text, boolean) from public, anon;
grant execute on function public.pos_caja_cerrar_turno(integer, numeric, jsonb, jsonb, jsonb, text, boolean) to authenticated;

-- ── 10. Apertura: base sugerida, diferencia y origen ────────────────────────────────────────────
-- Cierre anterior de la MISMA caja: misma sucursal (o «todas») y, en modo por cajero, el mismo cajero.
create or replace function public.fn_caja_turno_anterior(p_org integer, p_branch integer, p_user uuid)
returns public.cash_sessions
language sql
stable security definer
set search_path = public, pg_temp
as $$
  select cs.*
    from public.cash_sessions cs
   where cs.organization_id = p_org
     and cs.status = 'closed'
     and cs.branch_id is not distinct from p_branch
     and (coalesce((select os.settings->>'mode' from public.organization_settings os
                     where os.organization_id = p_org and os.key = 'pos_cash_session_mode'), 'branch') <> 'user'
          or cs.opened_by = p_user)
   order by cs.closed_at desc nulls last, cs.id desc
   limit 1;
$$;
revoke all on function public.fn_caja_turno_anterior(integer, integer, uuid) from public, anon, authenticated;

create or replace function public.pos_caja_base_sugerida(p_organization_id integer, p_branch_id integer)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  p public.cash_sessions%rowtype;
  v_cfg jsonb;
  v_nombre text;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_branch_id is not null and not public.app_branch_access(p_branch_id) then
    raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
  end if;
  v_cfg := public.fn_caja_turno_config(p_organization_id, p_branch_id);
  p := public.fn_caja_turno_anterior(p_organization_id, p_branch_id, v_uid);
  if p.id is null then
    return jsonb_build_object('primera_apertura', true, 'base_sugerida', null, 'anterior', null,
                              'tipo_persona', v_cfg->>'tipo_persona', 'tope', v_cfg->'tope',
                              'socio', v_cfg->'socio');
  end if;
  select nullif(btrim(concat_ws(' ', pr.first_name, pr.last_name)), '') into v_nombre
    from public.profiles pr where pr.id = coalesce(p.closed_by, p.opened_by);
  -- La base dejada es plata que el cajero dejó en el cajón: se muestra aunque haya cierre ciego.
  return jsonb_build_object(
    'primera_apertura', false,
    'base_sugerida', coalesce(p.base_dejada, p.final_amount, 0),
    'anterior', jsonb_build_object(
      'id', p.id, 'uuid', p.uuid, 'closed_at', p.closed_at, 'cerro', v_nombre,
      'base_dejada', p.base_dejada, 'con_destinos', p.base_dejada is not null),
    'tipo_persona', v_cfg->>'tipo_persona', 'tope', v_cfg->'tope', 'socio', v_cfg->'socio');
end;
$$;
revoke all on function public.pos_caja_base_sugerida(integer, integer) from public, anon;
grant execute on function public.pos_caja_base_sugerida(integer, integer) to authenticated;

create or replace function public.pos_caja_abrir(
  p_organization_id integer,
  p_branch_id integer,
  p_monto numeric,
  p_notas text default null,
  p_motivo text default null,
  p_nota_diferencia text default null,
  p_origen jsonb default null,
  p_tercero_nit text default null,
  p_tercero_nombre text default null,
  p_uuid uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_monto numeric := round(p_monto, 2);
  v_modo text;
  p public.cash_sessions%rowtype;
  s public.cash_sessions%rowtype;
  o public.cash_sessions%rowtype;
  b public.bank_accounts%rowtype;
  v_sugerida numeric;
  v_dif numeric;
  v_estado text;
  v_contra record;
  v_cuenta text;
  v_tipo_origen text;
  v_mov integer;
  v_caja text;
  v_caja_otra text;
  v_motivos constant text[] := array['error_conteo', 'consignacion', 'retiro_dueno', 'aporte_dueno', 'gasto', 'traslado', 'no_se'];
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado' using errcode = '42501';
  end if;
  if v_monto is null or v_monto < 0 or v_monto > 1e12 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  v_modo := coalesce((select os.settings->>'mode' from public.organization_settings os
                       where os.organization_id = p_organization_id and os.key = 'pos_cash_session_mode'), 'branch');
  if p_branch_id is null and v_modo = 'user' then
    raise exception 'sin_sucursal' using errcode = '22023';
  end if;
  if p_branch_id is not null then
    if not exists (select 1 from public.branches br where br.id = p_branch_id and br.organization_id = p_organization_id) then
      raise exception 'sin_sucursal' using errcode = '22023';
    end if;
    if not public.app_branch_access(p_branch_id) then
      raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
    end if;
  end if;

  if p_uuid is not null then
    select * into s from public.cash_sessions where organization_id = p_organization_id and uuid = p_uuid;
    if found then
      return to_jsonb(s) || jsonb_build_object('ya_abierta', true);
    end if;
  end if;

  p := public.fn_caja_turno_anterior(p_organization_id, p_branch_id, v_uid);
  if p.id is not null then
    v_sugerida := coalesce(p.base_dejada, p.final_amount, 0);
    v_dif := round(v_monto - v_sugerida, 2);
    if abs(v_dif) < 0.5 then
      v_dif := null;
    end if;
  end if;

  if v_dif is not null then
    if p_motivo is null or not (p_motivo = any (v_motivos)) then
      raise exception 'motivo_requerido' using errcode = '22023',
        detail = jsonb_build_object('base_sugerida', v_sugerida)::text;
    end if;
    if (p_motivo = 'retiro_dueno' and v_dif > 0) or (p_motivo = 'aporte_dueno' and v_dif < 0) then
      raise exception 'motivo_no_coincide' using errcode = '22023';
    end if;
    v_estado := case when p_motivo in ('retiro_dueno', 'aporte_dueno') then 'explicada' else 'por_explicar' end;
  elsif p.id is null and v_monto > 0 then
    v_tipo_origen := p_origen->>'tipo';
    if p_origen is null or jsonb_typeof(p_origen) <> 'object' or v_tipo_origen is null
       or v_tipo_origen not in ('banco', 'dueno', 'traslado') then
      raise exception 'origen_requerido' using errcode = '22023';
    end if;
    if v_tipo_origen = 'banco' and (jsonb_typeof(p_origen->'cuenta_banco_id') is distinct from 'number'
                                    or nullif(btrim(p_origen->>'referencia'), '') is null) then
      raise exception 'origen_banco_incompleto' using errcode = '22023';
    end if;
    if v_tipo_origen = 'traslado' and jsonb_typeof(p_origen->'sesion_origen_id') is distinct from 'number' then
      raise exception 'traslado_sin_caja' using errcode = '22023';
    end if;
  end if;

  perform set_config('app.caja_turno_rpc', 'on', true);
  insert into public.cash_sessions (
    organization_id, branch_id, opened_by, initial_amount, notes, status, uuid,
    base_sugerida, diferencia_apertura, diferencia_apertura_motivo, diferencia_apertura_nota,
    diferencia_apertura_estado, origen_base
  ) values (
    p_organization_id, p_branch_id, v_uid, v_monto, coalesce(nullif(btrim(p_notas), ''), 'Apertura de caja'), 'open',
    coalesce(p_uuid, gen_random_uuid()),
    v_sugerida, v_dif, case when v_dif is not null then p_motivo end,
    case when v_dif is not null then left(nullif(btrim(p_nota_diferencia), ''), 2000) end,
    v_estado, case when v_tipo_origen is not null then p_origen end
  ) returning * into s;

  v_caja := public.fn_caja_turno_cuenta_caja(s.organization_id, s.branch_id, s.account_code);

  -- Diferencia de apertura: movimiento de la apertura (fuera del esperado) + asiento del motivo.
  if v_dif is not null then
    select c.cuenta, c.tercero_nit, c.tercero_nombre into v_contra
      from public.fn_caja_turno_contrapartida(
        s.organization_id,
        case when p_motivo in ('retiro_dueno', 'aporte_dueno') or v_dif > 0 then 'dueno' else 'sin_soporte' end,
        coalesce(p.closed_by, p.opened_by), p_tercero_nit, p_tercero_nombre, false) c;
    perform public.fn_caja_turno_movimiento(s.id, case when v_dif < 0 then 'out' else 'in' end, abs(v_dif),
      'Diferencia de apertura · ' || case p_motivo
        when 'error_conteo' then 'se contó mal al cerrar el turno anterior'
        when 'consignacion' then 'se llevó al banco y no se registró al cerrar'
        when 'retiro_dueno' then 'la retiró el dueño o un socio'
        when 'aporte_dueno' then 'la puso el dueño o un socio'
        when 'gasto' then 'se pagó un gasto'
        when 'traslado' then 'se trasladó a otra caja'
        else 'por explicar' end
        || case when v_estado = 'por_explicar' then ' · por legalizar' else '' end,
      'destinoCierre', 'apertura', v_contra.cuenta, v_contra.tercero_nit, v_contra.tercero_nombre,
      null, null, left(nullif(btrim(p_nota_diferencia), ''), 2000),
      public.fn_uuid_desde_texto('caja_turno:apertura:' || s.id));
  end if;

  -- Primera apertura: de dónde sale la base.
  if v_tipo_origen = 'banco' then
    select * into b from public.bank_accounts
     where id = (p_origen->>'cuenta_banco_id')::integer and organization_id = s.organization_id;
    if b.id is null or not coalesce(b.is_active, true) then
      raise exception 'cuenta_no_encontrada' using errcode = 'P0002';
    end if;
    v_cuenta := coalesce(nullif(btrim(b.account_code), ''),
                         public.fn_cuenta_por_clave(s.organization_id, s.branch_id, 'bancos'),
                         public.fn_primera_cuenta_detalle(s.organization_id, array['1110']));
    perform public.fn_caja_turno_movimiento(s.id, 'in', v_monto,
      'Base inicial · retiro de ' || coalesce(nullif(btrim(b.name), ''), b.bank_name, 'banco'),
      'destinoCierre', 'origen_base', v_cuenta, null, null,
      nullif(btrim(p_origen->>'soporte_path'), ''), left(p_origen->>'referencia', 120), null,
      public.fn_uuid_desde_texto('caja_turno:origen:' || s.id));
  elsif v_tipo_origen = 'dueno' then
    select c.cuenta, c.tercero_nit, c.tercero_nombre into v_contra
      from public.fn_caja_turno_contrapartida(s.organization_id, 'dueno', null, p_tercero_nit, p_tercero_nombre, true) c;
    perform public.fn_caja_turno_movimiento(s.id, 'in', v_monto,
      case when v_contra.cuenta like '3130%' then 'Base inicial · aporte del propietario' else 'Base inicial · aporte del socio' end,
      'destinoCierre', 'origen_base', v_contra.cuenta, v_contra.tercero_nit, v_contra.tercero_nombre,
      null, null, null, public.fn_uuid_desde_texto('caja_turno:origen:' || s.id));
  elsif v_tipo_origen = 'traslado' then
    select * into o from public.cash_sessions
     where id = (p_origen->>'sesion_origen_id')::integer and organization_id = s.organization_id for update;
    if not found or o.status <> 'open' or o.id = s.id then
      raise exception 'traslado_caja_invalida' using errcode = '22023';
    end if;
    perform public.pos_caja_registrar_movimiento(
      p_session_id := o.id, p_tipo := 'out', p_monto := v_monto,
      p_concepto := 'Traslado a la caja #' || s.id || ' (base inicial)', p_concept_code := 'trasladoCaja',
      p_uuid := public.fn_uuid_desde_texto('caja_turno:origen:' || s.id || ':entrega'));
    v_mov := public.fn_caja_turno_movimiento(s.id, 'in', v_monto, 'Base inicial · traslado desde la caja #' || o.id,
      'trasladoCaja', 'origen_base', null, null, null, null, null, null,
      public.fn_uuid_desde_texto('caja_turno:origen:' || s.id));
    v_caja_otra := public.fn_caja_turno_cuenta_caja(o.organization_id, o.branch_id, o.account_code);
    if v_caja_otra is distinct from v_caja then
      perform public.fn_create_journal_entry(
        p_organization_id := s.organization_id, p_branch_id := coalesce(s.branch_id, 0), p_entry_date := now(),
        p_memo := 'Base inicial de la caja #' || s.id || ' desde la caja #' || o.id,
        p_source := 'cash_movements', p_source_id := v_mov::text,
        p_debit_account := v_caja, p_credit_account := v_caja_otra, p_amount := v_monto,
        p_created_by := v_uid, p_fact_key := 'cash_move:' || v_mov::text, p_cuenta_sin_centro := v_caja);
    end if;
  end if;
  perform set_config('app.caja_turno_rpc', 'off', true);

  return to_jsonb(s) || jsonb_build_object('ya_abierta', false);
end;
$$;
revoke all on function public.pos_caja_abrir(integer, integer, numeric, text, text, text, jsonb, text, text, uuid) from public, anon;
grant execute on function public.pos_caja_abrir(integer, integer, numeric, text, text, text, jsonb, text, text, uuid) to authenticated;

-- ── 11. Aprobar un descuadre (supervisor, con nota y bitácora) ──────────────────────────────────
create or replace function public.pos_caja_revisar_descuadre(p_session_id integer, p_nota text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  s public.cash_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_nota, '')), '') is null or length(p_nota) > 2000 then
    raise exception 'nota_requerida' using errcode = '22023';
  end if;
  select * into s from public.cash_sessions where id = p_session_id for update;
  if not found then
    raise exception 'caja_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(s.organization_id);
  if not public.app_branch_access(s.branch_id) then
    raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
  end if;
  if not public.fn_caja_puede(s.organization_id, 'pos.cajas.explicar_diferencias') then
    raise exception 'sin_permiso' using errcode = '42501',
      detail = 'Aprobar un descuadre requiere pos.cajas.explicar_diferencias.';
  end if;
  if s.descuadre_estado is distinct from 'por_revisar' then
    raise exception 'descuadre_no_pendiente' using errcode = '55000';
  end if;

  perform set_config('app.caja_turno_rpc', 'on', true);
  update public.cash_sessions
     set descuadre_estado = 'aprobado', descuadre_revisado_por = v_uid, descuadre_revisado_at = now(),
         descuadre_nota = btrim(p_nota)
   where id = s.id
  returning * into s;
  perform set_config('app.caja_turno_rpc', 'off', true);

  insert into public.cash_session_revisiones (organization_id, cash_session_id, tipo, accion, monto, nota, created_by)
  values (s.organization_id, s.id, 'descuadre', 'aprobar', s.difference, btrim(p_nota), v_uid);

  return jsonb_build_object('session_id', s.id, 'descuadre_estado', s.descuadre_estado,
                            'revisado_at', s.descuadre_revisado_at);
end;
$$;
revoke all on function public.pos_caja_revisar_descuadre(integer, text) from public, anon;
grant execute on function public.pos_caja_revisar_descuadre(integer, text) to authenticated;
