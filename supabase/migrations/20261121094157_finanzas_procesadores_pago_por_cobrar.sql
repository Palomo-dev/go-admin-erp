-- Datáfono y pasarelas: cuenta por cobrar a cada procesador (Contador, 2026-11-21).
--
-- La plata de un cobro con tarjeta o por pasarela no entra al banco el día del
-- cobro: el procesador la abona días después y neta de comisión y retenciones.
-- Debitar el banco al cobrar descuadra la conciliación bancaria. Por eso:
--
--   Cobro:  D 138020xx (procesador) por el total, venta más propina.
--           C la venta/cartera, los impuestos y la 28150501 por la propina (sin cambios).
--   Abono:  D banco por el neto, D 53051501 por la comisión,
--           D 13551501 / 13551701 / 13551801 por las retenciones del extracto,
--           C 138020xx por el bruto.
--
-- Un auxiliar por procesador, con el procesador como tercero, para conciliar cada
-- uno contra su propio extracto:
--   13802001 Datáfono (adquirente) · 13802002 Wompi · 13802003 Bold · 13802004 Mercado Pago.
-- Si el saldo de un procesador sube sin abonos, es una alerta (fn_procesadores_pago_saldos).
--
-- Solo cambia lo que viene: los cobros ya contabilizados no se reclasifican.
-- PayU, Stripe y PayPal siguen yendo al banco hasta que el Contador los incluya.

-- ── 1. Cuentas ──────────────────────────────────────────────────────────────
-- 1380 pasa a título: no tiene movimientos en ninguna organización.
do $$
begin
  if exists (select 1 from public.journal_lines l where l.account_code = '1380') then
    raise exception '1380 tiene movimientos: revisar antes de volverla título';
  end if;
end $$;

update public.puc_plantilla set es_movimiento = false where codigo = '1380';

insert into public.puc_plantilla (codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento,
                                  requiere_tercero, requiere_centro_costo, centro_costo_modo, presentacion_niif)
values
  ('138020', 'Cuentas por cobrar de terceros', 'asset', '1380',
   'Lo que procesadores de pago y otros terceros deben abonar.', 'debito', false, true, false, 'no_aplica', 'corriente'),
  ('13802001', 'Datáfono por cobrar (adquirente)', 'asset', '138020',
   'Cobros con tarjeta en datáfono pendientes de abono. Tercero: el adquirente.', 'debito', true, true, false, 'no_aplica', 'corriente'),
  ('13802002', 'Wompi por cobrar', 'asset', '138020',
   'Cobros por Wompi pendientes de abono. Tercero: Wompi.', 'debito', true, true, false, 'no_aplica', 'corriente'),
  ('13802003', 'Bold por cobrar', 'asset', '138020',
   'Cobros por Bold (datáfono, link o QR) pendientes de abono. Tercero: Bold.', 'debito', true, true, false, 'no_aplica', 'corriente'),
  ('13802004', 'Mercado Pago por cobrar', 'asset', '138020',
   'Cobros por Mercado Pago pendientes de abono. Tercero: Mercado Pago.', 'debito', true, true, false, 'no_aplica', 'corriente')
on conflict (codigo) do nothing;

update public.chart_of_accounts c
   set es_movimiento = false
 where c.account_code = '1380' and c.es_movimiento is distinct from false
   and not exists (select 1 from public.journal_lines l
                    join public.journal_entries e on e.id = l.journal_entry_id
                   where e.organization_id = c.organization_id and l.account_code = '1380');

do $$
declare
  v_orgs integer[];
  v_org integer;
  v_c record;
begin
  -- El arreglo se arma antes: fn_puc_asegurar_cuenta hace ALTER TABLE.
  select array_agg(distinct organization_id order by organization_id) into v_orgs from public.chart_of_accounts;
  foreach v_org in array v_orgs loop
    for v_c in select * from (values
      ('13802001', 'Datáfono por cobrar (adquirente)'), ('13802002', 'Wompi por cobrar'),
      ('13802003', 'Bold por cobrar'), ('13802004', 'Mercado Pago por cobrar')) as x(codigo, nombre)
    loop
      perform public.fn_puc_asegurar_cuenta(v_org, v_c.codigo, v_c.nombre, true);
    end loop;
  end loop;
end $$;

update public.chart_of_accounts c
   set requiere_tercero = true,
       description = coalesce(c.description, p.descripcion)
  from public.puc_plantilla p
 where p.codigo = c.account_code and c.account_code like '138020%';

-- ── 2. Catálogo de procesadores y su tercero por organización ─────────────────
create or replace function public.fn_procesadores_pago_catalogo()
 returns table(codigo text, nombre text, cuenta text)
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select * from (values
    ('datafono', 'Datáfono (adquirente)', '13802001'),
    ('wompi', 'Wompi', '13802002'),
    ('bold', 'Bold', '13802003'),
    ('mercadopago', 'Mercado Pago', '13802004')) as v(codigo, nombre, cuenta);
$function$;

create table if not exists public.payment_processor_settings (
  organization_id integer not null references public.organizations(id) on delete cascade,
  processor text not null check (processor in ('datafono', 'wompi', 'bold', 'mercadopago')),
  tercero_nit text,
  tercero_nombre text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (organization_id, processor)
);
comment on table public.payment_processor_settings is
  'Tercero (NIT y nombre) de cada procesador de pago de la organización: va en las líneas de su cuenta 138020xx.';

alter table public.payment_processor_settings enable row level security;
drop policy if exists payment_processor_settings_lectura on public.payment_processor_settings;
create policy payment_processor_settings_lectura on public.payment_processor_settings
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
revoke all on public.payment_processor_settings from anon;
revoke insert, update, delete on public.payment_processor_settings from authenticated;

-- Procesador (y su tercero) dueño de una cuenta 138020xx, también de un auxiliar de sede.
create or replace function public.fn_procesador_pago_por_cuenta(p_organization_id integer, p_cuenta text)
 returns table(codigo text, nombre text, nit text, cuenta text)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select k.codigo,
         coalesce(nullif(btrim(s.tercero_nombre), ''), k.nombre),
         nullif(btrim(s.tercero_nit), ''),
         k.cuenta
    from public.fn_procesadores_pago_catalogo() k
    left join public.payment_processor_settings s
      on s.organization_id = p_organization_id and s.processor = k.codigo
   where left(coalesce(p_cuenta, ''), 8) = k.cuenta;
$function$;
revoke all on function public.fn_procesador_pago_por_cuenta(integer, text) from public, anon, authenticated;

-- ── 3. Qué procesador cobró cada pago ─────────────────────────────────────────
alter table public.payments add column if not exists processor text;
comment on column public.payments.processor is
  'Procesador que cobró (datafono, wompi, bold, mercadopago, payu, stripe, paypal). Si viene vacío se deduce del método y de la respuesta de la pasarela. Decide la cuenta por cobrar 138020xx del cobro.';

create or replace function public.fn_procesador_de_pago(p_method text, p_source text, p_resp jsonb)
 returns text
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  with g as (select lower(coalesce(p_resp->>'gateway', p_resp->>'pasarela', '')) as gw)
  select case
    when g.gw in ('wompi', 'wompi_co') then 'wompi'
    when g.gw like 'bold%' then 'bold'
    when g.gw in ('mercadopago', 'mercado_pago', 'mp', 'mp_checkout') then 'mercadopago'
    when g.gw in ('payu', 'payu_co') then 'payu'
    when g.gw = 'stripe' then 'stripe'
    when g.gw = 'paypal' then 'paypal'
    when p_method = 'wompi' then 'wompi'
    when p_method in ('bold_card', 'bold_link', 'bold_qr') then 'bold'
    when p_method = 'mp' then 'mercadopago'
    when p_method in ('payu', 'stripe', 'paypal') then p_method
    -- Forma de la respuesta de cada pasarela (la tienda guarda la transacción tal cual).
    when p_resp ? 'payment_link_id' and p_resp ? 'payment_method_type' then 'wompi'
    when p_resp ? 'collector_id' or (p_resp ? 'payment_type_id' and p_resp ? 'payment_method_id') then 'mercadopago'
    when p_resp ? 'link_id' or (p_resp ? 'subject' and coalesce(p_resp->'data', '{}'::jsonb) ? 'payment_id') then 'bold'
    -- Tarjeta en el punto de venta sin pasarela: el datáfono.
    when p_method = 'card' and coalesce(p_source, '') <> 'web_order' and p_resp is null then 'datafono'
    else null
  end
  from g;
$function$;

create or replace function public.fn_trg_payments_procesador()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.processor is null then
    new.processor := public.fn_procesador_de_pago(new.method, new.source, new.processor_response);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_01_payments_procesador on public.payments;
create trigger trg_01_payments_procesador
  before insert or update of method, processor_response, processor on public.payments
  for each row execute function public.fn_trg_payments_procesador();

-- ── 4. Cuenta del cobro: la del procesador, si no la caja o el banco ─────────
create or replace function public.fn_cuenta_cobro(p_organization_id integer, p_branch_id integer, p_method text,
                                                  p_bank_account_id integer, p_procesador text default null)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_proc text := coalesce(p_procesador, public.fn_procesador_de_pago(p_method, null, null));
  v_cuenta text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select k.cuenta into v_cuenta from public.fn_procesadores_pago_catalogo() k where k.codigo = v_proc;
  if v_cuenta is not null and exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = p_organization_id and c.account_code = v_cuenta
       and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
  ) then
    return v_cuenta;
  end if;
  return public.fn_money_account_code_pago(p_organization_id, p_branch_id, p_method, p_bank_account_id);
end;
$function$;
revoke all on function public.fn_cuenta_cobro(integer, integer, text, integer, text) from public, anon;

-- Cobros: el pago de una venta, factura, cartera o pedido web.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_payment'::regproc);
  v_viejo text := E'    v_money_account := fn_money_account_code_pago(\n        NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id);';
begin
  if position('fn_cuenta_cobro' in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'fn_auto_journal_payment cambió';
  end if;
  execute replace(v_def, v_viejo, E'    -- Cobro con tarjeta o pasarela: a la cuenta por cobrar del procesador (138020xx),\n    -- que se salda con el abono. Contador 2026-11-21.\n    v_money_account := CASE WHEN v_es_cobro\n        THEN fn_cuenta_cobro(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id, NEW.processor)\n        ELSE fn_money_account_code_pago(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id)\n    END;');
end $$;

-- Otros cobros que eligen la cuenta del medio: propina sin venta, pagos de
-- reservas, saldo a favor y el sobrante de un recibo.
do $$
declare
  v_f text;
  v_def text;
begin
  foreach v_f in array array['fn_auto_journal_tip', 'fn_reserva_cuenta_pago', 'fn_saldo_favor_crear', 'fn_registrar_pago'] loop
    v_def := pg_get_functiondef(('public.' || v_f)::regproc);
    if position('fn_cuenta_cobro(' in v_def) > 0 then
      continue;
    end if;
    if (length(v_def) - length(replace(v_def, 'public.fn_money_account_code_pago(', ''))) / length('public.fn_money_account_code_pago(') <> 1 then
      raise exception '% cambió', v_f;
    end if;
    execute replace(v_def, 'public.fn_money_account_code_pago(', 'public.fn_cuenta_cobro(');
  end loop;
end $$;

-- ── 5. Tercero de las líneas 138020xx: el procesador ─────────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.fn_trg_tercero_linea_asiento'::regproc);
  v_ancla text := E'   where e.id = new.journal_entry_id;\n';
begin
  if position('138020' in v_def) > 0 then
    return;
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception 'fn_trg_tercero_linea_asiento cambió';
  end if;
  execute replace(v_def, v_ancla, v_ancla || $p$  -- Cuenta por cobrar a un procesador de pago (138020xx): el tercero es el
  -- procesador, en cualquier asiento (cobro, abono, anulación). Contador 2026-11-21.
  if new.account_code like '138020%' and new.tercero_nombre is null then
    select p.nit, p.nombre into v_nit, v_nombre
      from public.fn_procesador_pago_por_cuenta(v_org, new.account_code) p;
    if v_nombre is not null then
      new.tercero_nit := v_nit;
      new.tercero_nombre := v_nombre;
      return new;
    end if;
  end if;
$p$);
end $$;

-- ── 6. Abonos de los procesadores ─────────────────────────────────────────────
create table if not exists public.payment_processor_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id),
  branch_id integer references public.branches(id),
  processor text not null check (processor in ('datafono', 'wompi', 'bold', 'mercadopago')),
  payout_date date not null,
  gross_amount numeric(14, 2) not null check (gross_amount > 0),
  commission numeric(14, 2) not null default 0 check (commission >= 0),
  withholding_income numeric(14, 2) not null default 0 check (withholding_income >= 0),
  withholding_vat numeric(14, 2) not null default 0 check (withholding_vat >= 0),
  withholding_ica numeric(14, 2) not null default 0 check (withholding_ica >= 0),
  net_amount numeric(14, 2) not null check (net_amount > 0),
  bank_account_id integer references public.bank_accounts(id),
  bank_account_code text not null,
  reference text,
  notes text,
  request_id uuid not null,
  journal_entry_id integer,
  reversal_entry_id integer,
  status text not null default 'registrado' check (status in ('registrado', 'anulado')),
  created_by uuid,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text,
  unique (organization_id, request_id),
  check (gross_amount = net_amount + commission + withholding_income + withholding_vat + withholding_ica)
);
comment on table public.payment_processor_payouts is
  'Abonos de datáfono y pasarelas: D banco (neto) + D 53051501 (comisión) + D 1355 (retenciones) / C 138020xx (bruto). Contador 2026-11-21.';
create index if not exists payment_processor_payouts_org_idx
  on public.payment_processor_payouts (organization_id, processor, payout_date desc);

alter table public.payment_processor_payouts enable row level security;
drop policy if exists payment_processor_payouts_lectura on public.payment_processor_payouts;
create policy payment_processor_payouts_lectura on public.payment_processor_payouts
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
revoke all on public.payment_processor_payouts from anon;
revoke insert, update, delete on public.payment_processor_payouts from authenticated;

-- Saldo de la cuenta de un procesador (con sus auxiliares de sede) hasta una fecha.
create or replace function public.fn_procesador_pago_saldo(p_organization_id integer, p_cuenta text, p_hasta date default null)
 returns numeric
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(coalesce(l.debit, 0) - coalesce(l.credit, 0)), 0)::numeric
    from public.journal_lines l
    join public.journal_entries e on e.id = l.journal_entry_id
   where e.organization_id = p_organization_id and e.posted
     and l.account_code like p_cuenta || '%'
     and (p_hasta is null
          or (e.entry_date at time zone (select public.fn_timezone_for(p_organization_id, null)))::date <= p_hasta);
$function$;
revoke all on function public.fn_procesador_pago_saldo(integer, text, date) from public, anon, authenticated;

create or replace function public.fn_procesador_abono_registrar(p_organization_id integer, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_solicitud uuid;
  v_prev public.payment_processor_payouts%rowtype;
  v_proc text := p_datos->>'procesador';
  v_cat record;
  v_ter record;
  v_fecha date;
  v_branch integer;
  v_bruto numeric;
  v_comision numeric;
  v_rf numeric;
  v_riva numeric;
  v_rica numeric;
  v_neto numeric;
  v_banco_id integer;
  v_banco text;
  v_saldo numeric;
  v_ref text := left(nullif(btrim(coalesce(p_datos->>'referencia', '')), ''), 120);
  v_notas text := left(nullif(btrim(coalesce(p_datos->>'notas', '')), ''), 500);
  v_memo text;
  v_id uuid := gen_random_uuid();
  v_je integer;
  v_lin record;
  v_falta text;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO: registrar un abono requiere el permiso finance.create' using errcode = '42501';
  end if;
  begin
    v_solicitud := (p_datos->>'solicitud')::uuid;
  exception when others then
    v_solicitud := null;
  end;
  if v_solicitud is null then
    raise exception 'SOLICITUD_REQUERIDA' using errcode = '22023';
  end if;
  select * into v_prev from public.payment_processor_payouts
   where organization_id = p_organization_id and request_id = v_solicitud;
  if found then
    return jsonb_build_object('id', v_prev.id, 'asiento', v_prev.journal_entry_id, 'repetida', true);
  end if;

  select * into v_cat from public.fn_procesadores_pago_catalogo() k where k.codigo = v_proc;
  if not found then
    raise exception 'PROCESADOR_INVALIDO: %', coalesce(v_proc, '(vacío)') using errcode = '22023';
  end if;
  begin
    v_fecha := (p_datos->>'fecha')::date;
  exception when others then
    v_fecha := null;
  end;
  if v_fecha is null then
    raise exception 'FECHA_REQUERIDA: la fecha del abono según el extracto' using errcode = '22023';
  end if;
  if v_fecha > public.fn_today_for(p_organization_id, null) then
    raise exception 'FECHA_FUTURA: el abono no puede ser de una fecha futura' using errcode = '22023';
  end if;
  if not public.fn_is_period_open(p_organization_id, v_fecha) then
    raise exception 'PERIODO_CERRADO: el periodo contable de % está cerrado', v_fecha using errcode = '22023';
  end if;

  -- Importes del extracto, en pesos. El neto es lo que llegó al banco.
  begin
    v_bruto := round(coalesce(nullif(p_datos->>'bruto', '')::numeric, 0), 0);
    v_comision := round(coalesce(nullif(p_datos->>'comision', '')::numeric, 0), 0);
    v_rf := round(coalesce(nullif(p_datos->>'retencion_fuente', '')::numeric, 0), 0);
    v_riva := round(coalesce(nullif(p_datos->>'retencion_iva', '')::numeric, 0), 0);
    v_rica := round(coalesce(nullif(p_datos->>'retencion_ica', '')::numeric, 0), 0);
  exception when others then
    raise exception 'IMPORTE_INVALIDO: revise los valores del abono' using errcode = '22023';
  end;
  if v_bruto <= 0 or least(v_comision, v_rf, v_riva, v_rica) < 0 then
    raise exception 'IMPORTE_INVALIDO: el bruto debe ser mayor que cero y los descuentos no pueden ser negativos' using errcode = '22023';
  end if;
  v_neto := v_bruto - v_comision - v_rf - v_riva - v_rica;
  if v_neto <= 0 then
    raise exception 'NETO_INVALIDO: comisión y retenciones suman % y el bruto es %', v_bruto - v_neto, v_bruto using errcode = '22023';
  end if;
  if nullif(p_datos->>'neto', '') is not null and abs(round((p_datos->>'neto')::numeric, 0) - v_neto) > 0 then
    raise exception 'NETO_DESCUADRADO: bruto % menos descuentos da %, y el neto recibido es %',
      v_bruto, v_neto, round((p_datos->>'neto')::numeric, 0) using errcode = '22023';
  end if;

  -- Sede: la indicada si es de la organización; si no, la principal.
  v_branch := nullif(p_datos->>'sucursal', '')::integer;
  if v_branch is not null and not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_organization_id) then
    raise exception 'SUCURSAL_INVALIDA' using errcode = '22023';
  end if;
  if v_branch is null then
    select b.id into v_branch from public.branches b
     where b.organization_id = p_organization_id and b.is_main and b.is_active limit 1;
    if v_branch is null then
      select min(b.id) into v_branch from public.branches b where b.organization_id = p_organization_id;
    end if;
  end if;

  -- Banco donde llegó el neto.
  v_banco_id := nullif(p_datos->>'cuenta_bancaria', '')::integer;
  if v_banco_id is not null then
    select ba.account_code into v_banco from public.bank_accounts ba
     where ba.id = v_banco_id and ba.organization_id = p_organization_id;
    if v_banco is null then
      raise exception 'CUENTA_BANCARIA_INVALIDA: la cuenta bancaria no es de la organización o no tiene cuenta contable' using errcode = '22023';
    end if;
  else
    v_banco := coalesce(public.fn_cuenta_por_clave(p_organization_id, v_branch, 'bancos'), '1110');
  end if;

  -- No se abona más de lo que el procesador debe a esa fecha.
  v_saldo := public.fn_procesador_pago_saldo(p_organization_id, v_cat.cuenta, v_fecha);
  if v_bruto > v_saldo then
    raise exception 'ABONO_MAYOR_QUE_SALDO: % debía % a %, y el abono es por %',
      v_cat.nombre, v_saldo, v_fecha, v_bruto using errcode = '22023';
  end if;

  select * into v_ter from public.fn_procesador_pago_por_cuenta(p_organization_id, v_cat.cuenta);
  v_memo := 'Abono ' || v_ter.nombre || coalesce(' · ' || v_ref, '');

  -- Las cuentas tienen que existir y recibir movimientos (con su auxiliar de sede).
  for v_lin in
    select * from (values
      (v_banco, v_neto), ('53051501', v_comision), ('13551501', v_rf), ('13551701', v_riva),
      ('13551801', v_rica), (v_cat.cuenta, v_bruto)) as x(cuenta, monto)
    where x.monto > 0
  loop
    if not exists (select 1 from public.chart_of_accounts c
                    where c.organization_id = p_organization_id
                      and c.account_code = public.fn_puc_cuenta_de_sede(p_organization_id, v_branch, v_lin.cuenta)
                      and c.es_movimiento is distinct from false) then
      v_falta := coalesce(v_falta || ', ', '') || v_lin.cuenta;
    end if;
  end loop;
  if v_falta is not null then
    raise exception 'SIN_CUENTA: falta en el plan contable (o es de título): %', v_falta using errcode = '22023';
  end if;

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key)
  values (p_organization_id, v_branch, (v_fecha::timestamp + interval '12 hours') at time zone public.fn_timezone_for(p_organization_id, v_branch), v_memo,
          'payment_processor_payouts', v_id::text, true, v_uid, 'processor_payout:' || v_id)
  returning id into v_je;

  for v_lin in
    select * from (values
      (1, v_banco, v_neto, 0::numeric, 'Abono neto · ' || v_ter.nombre, false),
      (2, '53051501', v_comision, 0::numeric, 'Comisión · ' || v_ter.nombre, true),
      (3, '13551501', v_rf, 0::numeric, 'Retención en la fuente que practicó ' || v_ter.nombre, true),
      (4, '13551701', v_riva, 0::numeric, 'ReteIVA que practicó ' || v_ter.nombre, true),
      (5, '13551801', v_rica, 0::numeric, 'ReteICA que practicó ' || v_ter.nombre, true),
      (6, v_cat.cuenta, 0::numeric, v_bruto, 'Abono bruto · ' || v_ter.nombre, true)) as x(orden, cuenta, debito, credito, descripcion, con_tercero)
    where x.debito > 0 or x.credito > 0
    order by x.orden
  loop
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id,
                                      tercero_nit, tercero_nombre)
    values (v_je, public.fn_puc_cuenta_de_sede(p_organization_id, v_branch, v_lin.cuenta), v_lin.descripcion,
            v_lin.debito, v_lin.credito,
            public.fn_centro_para_cuenta(p_organization_id, v_branch,
              public.fn_puc_cuenta_de_sede(p_organization_id, v_branch, v_lin.cuenta), null,
              public.fn_puc_cuenta_de_sede(p_organization_id, v_branch, v_banco)),
            case when v_lin.con_tercero then v_ter.nit end,
            case when v_lin.con_tercero then v_ter.nombre end);
  end loop;

  insert into public.payment_processor_payouts (
    id, organization_id, branch_id, processor, payout_date, gross_amount, commission,
    withholding_income, withholding_vat, withholding_ica, net_amount, bank_account_id, bank_account_code,
    reference, notes, request_id, journal_entry_id, created_by)
  values (v_id, p_organization_id, v_branch, v_proc, v_fecha, v_bruto, v_comision,
          v_rf, v_riva, v_rica, v_neto, v_banco_id, v_banco,
          v_ref, v_notas, v_solicitud, v_je, v_uid);

  return jsonb_build_object('id', v_id, 'asiento', v_je, 'repetida', false, 'procesador', v_proc,
    'bruto', v_bruto, 'comision', v_comision, 'retenciones', v_rf + v_riva + v_rica, 'neto', v_neto,
    'saldo_restante', v_saldo - v_bruto);
end;
$function$;
revoke all on function public.fn_procesador_abono_registrar(integer, jsonb) from public, anon;
grant execute on function public.fn_procesador_abono_registrar(integer, jsonb) to authenticated;

create or replace function public.fn_procesador_abono_anular(p_abono_id uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_a public.payment_processor_payouts%rowtype;
  v_motivo text := left(nullif(btrim(coalesce(p_motivo, '')), ''), 500);
  v_hoy date;
  v_memo text;
  v_je integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_a from public.payment_processor_payouts where id = p_abono_id for update;
  if not found then
    raise exception 'ABONO_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_a.organization_id);
  if not public.fn_tiene_permiso(v_a.organization_id, 'finance.void') then
    raise exception 'SIN_PERMISO: anular un abono requiere el permiso finance.void' using errcode = '42501';
  end if;
  if v_a.status = 'anulado' then
    return jsonb_build_object('id', v_a.id, 'ya_anulado', true);
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'MOTIVO_REQUERIDO: anular un abono exige un motivo' using errcode = '22023';
  end if;
  -- La reversa va en la fecha del abono si su periodo sigue abierto; si no, hoy.
  v_hoy := case when public.fn_is_period_open(v_a.organization_id, v_a.payout_date) then v_a.payout_date
                else public.fn_today_for(v_a.organization_id, v_a.branch_id) end;
  if not public.fn_is_period_open(v_a.organization_id, v_hoy) then
    raise exception 'PERIODO_CERRADO: el periodo contable de % está cerrado', v_hoy using errcode = '22023';
  end if;

  select 'Anulación · ' || e.memo into v_memo from public.journal_entries e where e.id = v_a.journal_entry_id;
  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key)
  values (v_a.organization_id, v_a.branch_id, (v_hoy::timestamp + interval '12 hours') at time zone public.fn_timezone_for(v_a.organization_id, v_a.branch_id),
          coalesce(v_memo, 'Anulación de abono') || ' · ' || v_motivo,
          'payment_processor_payouts', v_a.id::text, true, v_uid, 'processor_payout_reversal:' || v_a.id)
  returning id into v_je;

  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id, tercero_nit, tercero_nombre)
  select v_je, l.account_code, 'Anulación · ' || coalesce(l.description, ''), l.credit, l.debit, l.cost_center_id,
         l.tercero_nit, l.tercero_nombre
    from public.journal_lines l
   where l.journal_entry_id = v_a.journal_entry_id
   order by l.id;

  update public.payment_processor_payouts
     set status = 'anulado', reversal_entry_id = v_je, voided_at = now(), voided_by = v_uid, void_reason = v_motivo
   where id = v_a.id;

  return jsonb_build_object('id', v_a.id, 'ya_anulado', false, 'asiento_reversa', v_je);
end;
$function$;
revoke all on function public.fn_procesador_abono_anular(uuid, text) from public, anon;
grant execute on function public.fn_procesador_abono_anular(uuid, text) to authenticated;

-- Tercero (NIT y nombre) de un procesador en la organización.
create or replace function public.fn_procesador_pago_configurar(p_organization_id integer, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_proc text := p_datos->>'procesador';
  v_nit text := left(nullif(regexp_replace(coalesce(p_datos->>'nit', ''), '[^0-9-]', '', 'g'), ''), 20);
  v_nombre text := left(nullif(btrim(coalesce(p_datos->>'nombre', '')), ''), 120);
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO: requiere el permiso finance.create' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fn_procesadores_pago_catalogo() k where k.codigo = v_proc) then
    raise exception 'PROCESADOR_INVALIDO: %', coalesce(v_proc, '(vacío)') using errcode = '22023';
  end if;
  insert into public.payment_processor_settings (organization_id, processor, tercero_nit, tercero_nombre, updated_by, updated_at)
  values (p_organization_id, v_proc, v_nit, v_nombre, v_uid, now())
  on conflict (organization_id, processor) do update
    set tercero_nit = excluded.tercero_nit, tercero_nombre = excluded.tercero_nombre,
        updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('procesador', v_proc, 'nit', v_nit, 'nombre', v_nombre);
end;
$function$;
revoke all on function public.fn_procesador_pago_configurar(integer, jsonb) from public, anon;
grant execute on function public.fn_procesador_pago_configurar(integer, jsonb) to authenticated;

-- Saldo por procesador y alerta: el saldo sube sin abonos.
create or replace function public.fn_procesadores_pago_saldos(p_organization_id integer, p_dias integer default 5)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hoy date;
  v_tz text;
  v_res jsonb := '[]'::jsonb;
  v_k record;
  v_t record;
  v_saldo numeric;
  v_ult_cobro date;
  v_ult_abono date;
  v_pend_desde date;
  v_dias integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.view') then
    raise exception 'SIN_PERMISO: requiere el permiso finance.view' using errcode = '42501';
  end if;
  v_hoy := public.fn_today_for(p_organization_id, null);
  v_tz := public.fn_timezone_for(p_organization_id, null);
  for v_k in select * from public.fn_procesadores_pago_catalogo() loop
    select * into v_t from public.fn_procesador_pago_por_cuenta(p_organization_id, v_k.cuenta);
    v_saldo := public.fn_procesador_pago_saldo(p_organization_id, v_k.cuenta, null);
    select max((e.entry_date at time zone v_tz)::date) into v_ult_cobro
      from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
     where e.organization_id = p_organization_id and e.posted and l.account_code like v_k.cuenta || '%' and l.debit > 0
       and e.source <> 'payment_processor_payouts';
    select max(a.payout_date) into v_ult_abono
      from public.payment_processor_payouts a
     where a.organization_id = p_organization_id and a.processor = v_k.codigo and a.status = 'registrado';
    -- Primer cobro que quedó después del último abono.
    select min((e.entry_date at time zone v_tz)::date) into v_pend_desde
      from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
     where e.organization_id = p_organization_id and e.posted and l.account_code like v_k.cuenta || '%' and l.debit > 0
       and e.source <> 'payment_processor_payouts'
       and (v_ult_abono is null or (e.entry_date at time zone v_tz)::date > v_ult_abono);
    v_dias := case when v_saldo > 0 and v_pend_desde is not null then v_hoy - v_pend_desde end;
    if v_saldo <> 0 or v_ult_cobro is not null or v_ult_abono is not null then
      v_res := v_res || jsonb_build_object(
        'procesador', v_k.codigo, 'nombre', v_t.nombre, 'nit', v_t.nit, 'cuenta', v_k.cuenta,
        'saldo', v_saldo, 'ultimo_cobro', v_ult_cobro, 'ultimo_abono', v_ult_abono,
        'dias_sin_abono', v_dias,
        'alerta', coalesce(v_saldo < 0 or (v_dias is not null and v_dias > greatest(coalesce(p_dias, 5), 1)), false),
        'motivo_alerta', case
          when v_saldo < 0 then 'saldo_negativo'
          when v_dias is not null and v_dias > greatest(coalesce(p_dias, 5), 1) then 'sin_abono'
        end);
    end if;
  end loop;
  return v_res;
end;
$function$;
revoke all on function public.fn_procesadores_pago_saldos(integer, integer) from public, anon;
grant execute on function public.fn_procesadores_pago_saldos(integer, integer) to authenticated;
