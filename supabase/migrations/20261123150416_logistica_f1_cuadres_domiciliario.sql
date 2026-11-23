-- Logística Fase 1 — 4/5: cuadre del domiciliario contra la caja de la sede.
--
-- courier_settlements (uno abierto por domiciliario) y courier_settlement_lines (un envío
-- contraentrega por línea; un envío solo puede estar en un cuadre vigente). El cuadre se liga a la
-- caja abierta de la sede (cash_sessions) que resuelve fn_caja_abierta_para, la misma regla del POS.
--
-- Recibir dinero NO reimplementa cobros (CLAUDE.md regla 7): cada línea llama, en la misma
-- transacción, a la RPC que ya existe para su origen:
-- - pedido web → fn_cobrar_pedido_web_en_caja (factura si falta, pago en la caja, venta pagada);
-- - venta POS  → fn_registrar_pago (cobro sobre la factura de la venta, origen 'pos_cxc').
-- Así la contabilidad sale de las reglas vigentes: efectivo a la caja; tarjeta/datáfono a la CxC
-- del procesador 13802001 (fn_procesador_de_pago + fn_cuenta_cobro, migración 20261121094157);
-- transferencia y QR a la cuenta que hoy les asigna fn_cuenta_cobro (banco). Ver TODO del Contador
-- en docs/logistica/FASE1-CIMIENTOS.md.
--
-- Diferencias: una línea recibida por menos de lo esperado queda 'shortage' con su motivo; al
-- cerrar, si el total no cuadra, se exigen motivo y responsable (courier | cashier | customer |
-- other) y el cuadre queda accounting_status = 'pending_accountant'. NO hay asiento automático del
-- faltante: lo decide el Contador (TODO documentado). Lo recibido sí queda cobrado en la factura;
-- el saldo que falte sigue como cartera del cliente hasta esa decisión.
--
-- Permisos: miembro activo, acceso a la sede y fn_caja_puede(org, 'pos.create') (cajeros y
-- administradores). Escritura SOLO por RPC (sin políticas de INSERT/UPDATE/DELETE); lectura para
-- miembros activos.

create table if not exists public.courier_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations (id) on delete cascade,
  branch_id integer not null references public.branches (id) on delete restrict,
  driver_id uuid not null references public.driver_credentials (id) on delete restrict,
  cash_session_id integer references public.cash_sessions (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  expected_total numeric(14, 2) not null default 0,
  received_total numeric(14, 2) not null default 0,
  difference numeric(14, 2) not null default 0,
  expected_by_method jsonb not null default '{}'::jsonb,
  received_by_method jsonb not null default '{}'::jsonb,
  difference_reason text,
  difference_responsible text check (difference_responsible is null
                                     or difference_responsible in ('courier', 'cashier', 'customer', 'other')),
  difference_responsible_detail text,
  accounting_status text not null default 'not_required'
    check (accounting_status in ('not_required', 'pending_accountant', 'resolved')),
  notes text,
  opened_by uuid,
  opened_at timestamptz not null default now(),
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_courier_settlements_org on public.courier_settlements (organization_id, status, opened_at desc);
create index if not exists idx_courier_settlements_branch on public.courier_settlements (branch_id);
create index if not exists idx_courier_settlements_driver on public.courier_settlements (driver_id);
create index if not exists idx_courier_settlements_cash on public.courier_settlements (cash_session_id);
create unique index if not exists uq_courier_settlements_abierto
  on public.courier_settlements (organization_id, driver_id) where status = 'open';

create table if not exists public.courier_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations (id) on delete cascade,
  settlement_id uuid not null references public.courier_settlements (id) on delete cascade,
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  source_type text,
  source_id uuid,
  expected_amount numeric(14, 2) not null default 0,
  reported_amount numeric(14, 2),
  reported_method text,
  received_amount numeric(14, 2),
  received_method text,
  payment_id uuid references public.payments (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'received', 'shortage', 'cancelled')),
  difference numeric(14, 2) not null default 0,
  difference_reason text,
  received_by uuid,
  received_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_courier_settlement_lines_settlement on public.courier_settlement_lines (settlement_id);
create index if not exists idx_courier_settlement_lines_shipment on public.courier_settlement_lines (shipment_id);
create index if not exists idx_courier_settlement_lines_payment on public.courier_settlement_lines (payment_id);
create index if not exists idx_courier_settlement_lines_org on public.courier_settlement_lines (organization_id);
create unique index if not exists uq_courier_settlement_lines_envio_vigente
  on public.courier_settlement_lines (shipment_id) where status <> 'cancelled';

alter table public.courier_settlements enable row level security;
alter table public.courier_settlement_lines enable row level security;

drop policy if exists courier_settlements_select on public.courier_settlements;
create policy courier_settlements_select on public.courier_settlements
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
drop policy if exists courier_settlement_lines_select on public.courier_settlement_lines;
create policy courier_settlement_lines_select on public.courier_settlement_lines
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
revoke all on public.courier_settlements from anon;
revoke all on public.courier_settlement_lines from anon;
revoke insert, update, delete, truncate on public.courier_settlements from authenticated;
revoke insert, update, delete, truncate on public.courier_settlement_lines from authenticated;

-- ── Auxiliares ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.fn_logistica_cuadre_exigir(p_org integer, p_branch integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  if auth.uid() is not null then
    if p_branch is not null and not public.app_branch_access(p_branch) then
      raise exception 'SIN_ACCESO_SEDE' using errcode = '42501';
    end if;
    if not public.fn_caja_puede(p_org, 'pos.create') then
      raise exception 'SIN_PERMISO' using errcode = '42501';
    end if;
  end if;
end;
$$;
revoke execute on function public.fn_logistica_cuadre_exigir(integer, integer) from public, anon, authenticated;

create or replace function public.fn_logistica_cuadre_recalcular(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.courier_settlements cs set
    expected_total = t.esperado,
    received_total = t.recibido,
    difference = t.diferencia,
    expected_by_method = t.esperado_metodo,
    received_by_method = t.recibido_metodo,
    updated_at = now()
  from (
    select coalesce(sum(l.expected_amount), 0) as esperado,
           coalesce(sum(l.received_amount), 0) as recibido,
           coalesce(sum(l.received_amount - l.expected_amount) filter (where l.status in ('received', 'shortage')), 0) as diferencia,
           coalesce((select jsonb_object_agg(m.metodo, m.total) from (
                       select coalesce(x.reported_method, 'sin_dato') as metodo, sum(x.expected_amount) as total
                         from public.courier_settlement_lines x
                        where x.settlement_id = p_settlement_id and x.status <> 'cancelled'
                        group by 1) m), '{}'::jsonb) as esperado_metodo,
           coalesce((select jsonb_object_agg(m.metodo, m.total) from (
                       select x.received_method as metodo, sum(x.received_amount) as total
                         from public.courier_settlement_lines x
                        where x.settlement_id = p_settlement_id and x.status in ('received', 'shortage')
                          and x.received_method is not null
                        group by 1) m), '{}'::jsonb) as recibido_metodo
      from public.courier_settlement_lines l
     where l.settlement_id = p_settlement_id and l.status <> 'cancelled'
  ) t
  where cs.id = p_settlement_id;
end;
$$;
revoke execute on function public.fn_logistica_cuadre_recalcular(uuid) from public, anon, authenticated;

create or replace function public.fn_logistica_cuadre_resumen(p_settlement_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'settlement_id', cs.id, 'status', cs.status, 'branch_id', cs.branch_id, 'driver_id', cs.driver_id,
    'cash_session_id', cs.cash_session_id, 'esperado', cs.expected_total, 'recibido', cs.received_total,
    'diferencia', cs.difference, 'esperado_por_metodo', cs.expected_by_method,
    'recibido_por_metodo', cs.received_by_method, 'accounting_status', cs.accounting_status,
    'lineas', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', l.id, 'shipment_id', l.shipment_id, 'source_type', l.source_type, 'source_id', l.source_id,
                 'esperado', l.expected_amount, 'reportado', l.reported_amount, 'metodo_reportado', l.reported_method,
                 'recibido', l.received_amount, 'metodo_recibido', l.received_method, 'payment_id', l.payment_id,
                 'status', l.status, 'diferencia', l.difference, 'motivo', l.difference_reason)
                 order by l.created_at)
                 from public.courier_settlement_lines l where l.settlement_id = cs.id), '[]'::jsonb))
    from public.courier_settlements cs
   where cs.id = p_settlement_id;
$$;
revoke execute on function public.fn_logistica_cuadre_resumen(uuid) from public, anon, authenticated;

-- ── Abrir ──────────────────────────────────────────────────────────────────────────────────────
create or replace function public.logistica_cuadre_abrir(
  p_organization_id integer,
  p_branch_id integer,
  p_driver_id uuid,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_caja integer;
begin
  perform public.fn_logistica_cuadre_exigir(p_organization_id, p_branch_id);
  if p_branch_id is null or not exists (select 1 from public.branches b
                                         where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'SEDE_INVALIDA' using errcode = '22023';
  end if;
  if not exists (select 1 from public.driver_credentials dc
                  where dc.id = p_driver_id and dc.organization_id = p_organization_id) then
    raise exception 'DOMICILIARIO_INVALIDO' using errcode = '22023';
  end if;

  select cs.id into v_id from public.courier_settlements cs
   where cs.organization_id = p_organization_id and cs.driver_id = p_driver_id and cs.status = 'open'
   for update;

  if v_id is null then
    v_caja := public.fn_caja_abierta_para(p_organization_id, p_branch_id, auth.uid());
    if v_caja is null then
      raise exception 'NO_OPEN_CASH_SESSION' using errcode = 'P0001', hint = 'Abre la caja de la sede para recibir el cuadre.';
    end if;
    insert into public.courier_settlements (organization_id, branch_id, driver_id, cash_session_id, notes, opened_by)
    values (p_organization_id, p_branch_id, p_driver_id, v_caja, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid())
    returning id into v_id;
  end if;

  -- Envíos contraentrega cobrados por el domiciliario en esta sede y aún sin cuadre vigente.
  insert into public.courier_settlement_lines (organization_id, settlement_id, shipment_id, source_type, source_id,
                                               expected_amount, reported_amount, reported_method)
  select s.organization_id, v_id, s.id, s.source_type, s.source_id, s.cod_amount, s.cod_collected_amount,
         s.cod_collected_method
    from public.shipments s
   where s.organization_id = p_organization_id
     and s.branch_id = p_branch_id
     and s.driver_id = p_driver_id
     and s.cod_status = 'collected'
     and coalesce(s.cod_amount, 0) > 0
     and not exists (select 1 from public.courier_settlement_lines l
                      where l.shipment_id = s.id and l.status <> 'cancelled');

  perform public.fn_logistica_cuadre_recalcular(v_id);
  return public.fn_logistica_cuadre_resumen(v_id);
end;
$$;
revoke execute on function public.logistica_cuadre_abrir(integer, integer, uuid, text) from public, anon;
grant execute on function public.logistica_cuadre_abrir(integer, integer, uuid, text) to authenticated, service_role;

-- ── Recibir una línea ──────────────────────────────────────────────────────────────────────────
create or replace function public.logistica_cuadre_recibir_linea(
  p_line_id uuid,
  p_metodo text,
  p_monto numeric,
  p_referencia text default null,
  p_factura jsonb default null,
  p_motivo_diferencia text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.courier_settlement_lines;
  v_cs public.courier_settlements;
  v_metodo text := lower(btrim(coalesce(p_metodo, '')));
  v_monto numeric := round(coalesce(p_monto, -1), 2);
  v_r jsonb;
  v_pago uuid;
  v_inv public.invoice_sales;
  v_moneda text;
  v_tz text;
begin
  select * into v_l from public.courier_settlement_lines where id = p_line_id for update;
  if not found then
    raise exception 'LINEA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  select * into v_cs from public.courier_settlements where id = v_l.settlement_id for update;
  perform public.fn_logistica_cuadre_exigir(v_cs.organization_id, v_cs.branch_id);
  if v_cs.status <> 'open' then
    raise exception 'CUADRE_CERRADO' using errcode = '22023';
  end if;
  if v_l.status <> 'pending' then
    raise exception 'LINEA_YA_RECIBIDA' using errcode = '22023';
  end if;
  if v_monto < 0 then
    raise exception 'MONTO_INVALIDO' using errcode = '22023';
  end if;
  if v_monto > v_l.expected_amount then
    raise exception 'MONTO_MAYOR_AL_ESPERADO' using errcode = '22023';
  end if;
  if v_monto < v_l.expected_amount and nullif(btrim(coalesce(p_motivo_diferencia, '')), '') is null then
    raise exception 'MOTIVO_REQUERIDO' using errcode = '22023', hint = 'Falta dinero en la línea: indica el motivo.';
  end if;
  if v_monto > 0 and not exists (select 1 from public.payment_methods pm
                                  where pm.code = v_metodo and coalesce(pm.is_active, true)) then
    raise exception 'METODO_INVALIDO' using errcode = '22023';
  end if;

  if v_monto > 0 then
    if v_l.source_type = 'web_order' then
      v_r := public.fn_cobrar_pedido_web_en_caja(v_l.source_id, v_metodo, p_factura, p_referencia, v_monto);
      v_pago := nullif(v_r ->> 'payment_id', '')::uuid;
    elsif v_l.source_type = 'sale' then
      select * into v_inv from public.invoice_sales i
       where i.sale_id = v_l.source_id and i.organization_id = v_cs.organization_id
         and coalesce(i.document_type, 'invoice') = 'invoice' and i.status <> 'void'
       order by i.created_at asc limit 1;
      if v_inv.id is null then
        raise exception 'FACTURA_DE_VENTA_NO_ENCONTRADA' using errcode = '22023';
      end if;
      v_moneda := coalesce(nullif(btrim(v_inv.currency), ''),
                           (select oc.currency_code from public.organization_currencies oc
                             where oc.organization_id = v_cs.organization_id
                             order by oc.is_base desc, oc.currency_code limit 1),
                           'COP');
      v_tz := public.fn_timezone_for(v_cs.organization_id, v_cs.branch_id);
      v_r := public.fn_registrar_pago(
        p_direccion => 'cobro',
        p_aplicaciones => jsonb_build_array(jsonb_build_object('documento', 'invoice_sales', 'id', v_inv.id, 'monto', v_monto)),
        p_metodo => v_metodo,
        p_moneda => v_moneda,
        p_fecha => (now() at time zone v_tz)::date,
        p_referencia => p_referencia,
        p_cuenta_bancaria => null,
        p_recibido => case when v_metodo = 'cash' then v_monto end,
        p_anticipo => 0,
        p_clave_idempotencia => 'cuadre-domiciliario:' || v_l.id::text,
        p_notas => 'Cuadre del domiciliario',
        p_origen => 'pos_cxc',
        p_organization_id => v_cs.organization_id);
      v_pago := nullif(v_r -> 'pagos' -> 0 ->> 'payment_id', '')::uuid;
    else
      raise exception 'ORIGEN_NO_SOPORTADO' using errcode = '22023', detail = coalesce(v_l.source_type, '-');
    end if;
  end if;

  update public.courier_settlement_lines set
    received_amount = v_monto,
    received_method = case when v_monto > 0 then v_metodo end,
    payment_id = v_pago,
    difference = v_monto - expected_amount,
    status = case when v_monto >= expected_amount then 'received' else 'shortage' end,
    difference_reason = nullif(btrim(coalesce(p_motivo_diferencia, '')), ''),
    received_by = auth.uid(),
    received_at = now()
   where id = v_l.id;

  update public.shipments set cod_status = 'remitted', cod_remitted_at = now(), updated_at = now()
   where id = v_l.shipment_id;

  perform public.fn_logistica_cuadre_recalcular(v_cs.id);
  return public.fn_logistica_cuadre_resumen(v_cs.id) || jsonb_build_object('cobro', v_r, 'linea_id', v_l.id);
end;
$$;
revoke execute on function public.logistica_cuadre_recibir_linea(uuid, text, numeric, text, jsonb, text) from public, anon;
grant execute on function public.logistica_cuadre_recibir_linea(uuid, text, numeric, text, jsonb, text) to authenticated, service_role;

-- ── Cerrar ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.logistica_cuadre_cerrar(
  p_settlement_id uuid,
  p_motivo text default null,
  p_responsable text default null,
  p_detalle_responsable text default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cs public.courier_settlements;
  v_pendientes integer;
begin
  select * into v_cs from public.courier_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'CUADRE_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  perform public.fn_logistica_cuadre_exigir(v_cs.organization_id, v_cs.branch_id);
  if v_cs.status <> 'open' then
    raise exception 'CUADRE_CERRADO' using errcode = '22023';
  end if;
  select count(*) into v_pendientes from public.courier_settlement_lines
   where settlement_id = v_cs.id and status = 'pending';
  if v_pendientes > 0 then
    raise exception 'LINEAS_PENDIENTES' using errcode = '22023', detail = v_pendientes::text;
  end if;

  perform public.fn_logistica_cuadre_recalcular(v_cs.id);
  select * into v_cs from public.courier_settlements where id = v_cs.id;

  if v_cs.difference <> 0 and (nullif(btrim(coalesce(p_motivo, '')), '') is null
                               or p_responsable is null
                               or p_responsable not in ('courier', 'cashier', 'customer', 'other')) then
    raise exception 'MOTIVO_Y_RESPONSABLE_REQUERIDOS' using errcode = '22023';
  end if;

  -- TODO(Contador): el faltante (difference < 0) NO genera asiento. Queda pending_accountant hasta
  -- que el Contador defina la cuenta (CxC al domiciliario, gasto o castigo) y su tercero.
  update public.courier_settlements set
    status = 'closed',
    closed_by = auth.uid(),
    closed_at = now(),
    difference_reason = case when difference <> 0 then btrim(p_motivo) end,
    difference_responsible = case when difference <> 0 then p_responsable end,
    difference_responsible_detail = case when difference <> 0 then nullif(btrim(coalesce(p_detalle_responsable, '')), '') end,
    accounting_status = case when difference < 0 then 'pending_accountant' else 'not_required' end,
    notes = coalesce(nullif(btrim(coalesce(p_notas, '')), ''), notes),
    updated_at = now()
   where id = v_cs.id;

  return public.fn_logistica_cuadre_resumen(v_cs.id);
end;
$$;
revoke execute on function public.logistica_cuadre_cerrar(uuid, text, text, text, text) from public, anon;
grant execute on function public.logistica_cuadre_cerrar(uuid, text, text, text, text) to authenticated, service_role;

-- ── Anular (solo sin dinero recibido) ──────────────────────────────────────────────────────────
create or replace function public.logistica_cuadre_anular(p_settlement_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cs public.courier_settlements;
begin
  select * into v_cs from public.courier_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'CUADRE_NO_ENCONTRADO' using errcode = 'P0002';
  end if;
  perform public.fn_logistica_cuadre_exigir(v_cs.organization_id, v_cs.branch_id);
  if v_cs.status <> 'open' then
    raise exception 'CUADRE_CERRADO' using errcode = '22023';
  end if;
  if exists (select 1 from public.courier_settlement_lines where settlement_id = v_cs.id and status <> 'pending') then
    raise exception 'CUADRE_CON_RECIBOS' using errcode = '22023', hint = 'Ya se recibió dinero: ciérralo con su diferencia.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'MOTIVO_REQUERIDO' using errcode = '22023';
  end if;
  update public.courier_settlement_lines set status = 'cancelled' where settlement_id = v_cs.id;
  update public.courier_settlements set status = 'cancelled', closed_by = auth.uid(), closed_at = now(),
         notes = concat_ws(E'\n', notes, 'Anulado: ' || btrim(p_motivo)), updated_at = now()
   where id = v_cs.id;
  return public.fn_logistica_cuadre_resumen(v_cs.id);
end;
$$;
revoke execute on function public.logistica_cuadre_anular(uuid, text) from public, anon;
grant execute on function public.logistica_cuadre_anular(uuid, text) to authenticated, service_role;

comment on table public.courier_settlements is 'Cuadre del domiciliario contra la caja de la sede (logística Fase 1). Escritura solo por RPC logistica_cuadre_*.';
comment on column public.courier_settlements.accounting_status is 'pending_accountant = faltante sin asiento; lo decide el Contador (TODO en docs/logistica/FASE1-CIMIENTOS.md).';
comment on table public.courier_settlement_lines is 'Un envío contraentrega por línea. El cobro se registra con fn_cobrar_pedido_web_en_caja (pedido web) o fn_registrar_pago (venta POS).';
