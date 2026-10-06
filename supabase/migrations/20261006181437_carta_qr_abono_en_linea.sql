-- Aplicada el 2026-10-06 18:14:37 UTC con apply_migration (versión 20261006181437).
-- Carta QR en la mesa · 3/4 — la cuenta de la mesa y el abono en línea.
-- Figma «16 Sitio web» 2032:75742, láminas 08, 09, 17 y 20 «Conectado».
--
-- Problema: la cuenta dividida existía solo desde la caja. El comensal no podía ver la cuenta
-- de su mesa ni pagar su parte en línea; y `pos_mesa_agregar_pedido_web` rechaza lo pagado en
-- línea (PEDIDO_PAGADO_EN_LINEA) para no cobrar dos veces, así que un pedido web pagado no sirve
-- como abono a la mesa.
--
-- Qué hace (aditivo: una tabla nueva y funciones nuevas):
-- 1. `table_online_payments`: un intento de abono en línea a la venta de la mesa (referencia
--    `CQR-<32 hex>` única, monto, propina, moneda, pasarela, forma de dividir, comensal, líneas
--    de «lo que pidió cada uno», estado pending → paid | failed | paid_unapplied | refunded).
--    RLS de lectura para miembros con acceso a la sede. Escritura solo por las RPC.
-- 2. `fn_mesa_cuenta_publica(org, mesa)` (service role): la cuenta de la sesión ACTIVA de ESA
--    mesa: el pedido por rondas (fn_mesa_pedido_publico), total, pagado y saldo
--    (fn_pos_mesa_saldo, la misma regla de la caja), lo pendiente por comensal, los abonos en
--    línea y la pasarela con la que se puede pagar (fn_reserva_mesa_pasarela: hoy Wompi; sin
--    pasarela, el sitio solo ofrece «pagar en la mesa»).
-- 3. `fn_mesa_abono_iniciar(...)` (service role): el monto lo calcula la BASE, nunca el
--    navegador: todo junto = saldo; partes iguales = total / partes (tope: saldo); lo que pidió
--    cada uno = lo pendiente de sus líneas (tope: saldo). Si el navegador vio otro monto,
--    MONTO_CAMBIO con el nuevo. Propina entre 0 y el monto. Un abono en curso de la misma sesión
--    que, sumado, pase del saldo → PAGO_EN_CURSO. Sin pasarela → SIN_PASARELA.
-- 4. `fn_mesa_abono_resultado(...)`: lo llama el webhook de la pasarela YA verificado (firma y
--    organización de la referencia), con el patrón del depósito de reservas
--    (fn_reserva_mesa_deposito_resultado): FOR UPDATE, idempotente por estado y por
--    transacción. Pagado → el abono entra a la venta de la mesa con `pos_checkout_v1` modo
--    'settle' (el MISMO cobro de la caja: reparto paid_amount/paid_at/paid_by_split_id por línea,
--    tope pago_excede_saldo, propina a sales.tip_amount y tips, factura reutilizada),
--    payment_key = uuid derivado de la referencia (reintento = mismo cobro) y actor = mesero de
--    la sesión. Después marca sus pagos: reference = transacción, idempotency_key
--    'carta-qr-abono:<tx>', processor_response con origen 'carta_qr'. Si el settle falla (saldo
--    menor, sesión cerrada, línea inválida) el abono queda 'paid_unapplied': el dinero entró
--    pero no se aplicó, y la campana avisa para aplicarlo a mano o reembolsar.
--
-- Por qué pos_checkout_v1 y no un insert en payments: POS › Mesas calcula «Abonado» con
-- sale_items.paid_amount y el cobro de la caja con payments. Un pago que no reparte líneas
-- descuadra la cuenta y choca con pago_excede_saldo al cerrar la mesa.
--
-- Verificado por MCP (2026-10-06): pos_checkout_v1(jsonb) (settle exige payment_key, actor
-- miembro activo —con service role, el user_id del sobre—, table_session_id de la venta en
-- active|bill_requested; inserta payments source 'invoice_sales' y pos_cobros(id = payment_key,
-- payment_ids)), fn_pos_mesa_saldo(sale) jsonb {total, pagado, saldo, tolerancia},
-- fn_pos_tolerancia_moneda, fn_moneda_base_organizacion, fn_reserva_mesa_pasarela(org),
-- payments (reference, processor_response, idempotency_key + uq_payments_org_idempotency_key),
-- payment_methods.code (wompi, card, pse, nequi…), sale_items.paid_amount/paid_at.
-- Depende de 20261006180921 (fn_mesa_qr_sesion, fn_mesa_qr_avisar, fn_mesa_qr_texto) y
-- 20261006181211 (fn_mesa_pedido_publico).
--
-- ENSAYO (2026-10-06, execute_sql: UN bloque `do` con las 4 migraciones 20261006180921…181513
-- enteras —sin comentarios— y las pruebas, que se deshace con `raise exception`. Org 140, sede
-- 115, Mesa 1 con sesión activa (venta de 83.000, 3 líneas) y Mesa 2 libre; una conexión Wompi
-- sandbox y su método de pago creados DENTRO del bloque). Resultado tal cual:
--   ENSAYO_OK anon_pedido=42501 anon_solicitar=42501 anon_cuenta=42501 anon_resultado=42501
--   anon_valorar=42501 anon_atender=42501 anon_lee_solicitudes=42501 anon_lee_abonos=42501
--   anon_lee_valoraciones=42501 | auth_pedido=42501 auth_solicitar=42501 auth_abono=42501
--   auth_resultado=42501 auth_valorar=42501 auth_insert=42501 | sin_sesion=SIN_SESION
--   pedido_sin_sesion=null/0 otra_org=P0002 MESA_INVALIDA solicitar=true:open:mesero=<nombre>
--   repetido=true:true cancelar=true cuenta=true:bill_requested:bill_requested
--   cuenta_repetida=true avisos=2 aviso_cuenta=[Mesa 1 pide la cuenta | /app/pos/mesas/<mesa>]
--   | pedido: sesion=bill_requested rondas=3 total=83000.00 items_r1=1 estado_r1=servida
--   solicitudes=1 | cuenta: total=83000.00 saldo=83000.00 pasarela=null comensales=2
--   abono_sin_pasarela=SIN_PASARELA | iguales_visto_mal=MONTO_CAMBIO:41500.00
--   iguales=true:41500.00+4150.00:wompi_co:ref_ok=true en_curso=PAGO_EN_CURSO monto_bajo=MONTO
--   otra_org=42501 pago=paid:saldo=41500.00 repetido=YA_PROCESADO
--   pagos=1:invoice_sales/wompi/45650.00/carta_qr/tx-ensayo-1 abonado_lineas=41500.00
--   tip=4150.00 venta=pending/partial/41500.00 tips=1 | cuenta2: pagado=45650.00 saldo=41500.00
--   abonos=1 pend_comensal0=14500.00 resto=41500.00 pago2=paid:saldo=0.00
--   pago_que_excede=paid_unapplied:NO_APLICADO:venta_ya_pagada tras_pagar=CUENTA_PAGADA
--   venta_final=paid/paid/0.00 lineas_sin_pagar=0 avisos_pago=3 valorar_activa=true |
--   cerrada_pedido=null cerrada_solicitar=SIN_SESION valorar=true:El servicio+La comida:4
--   valorar_6=22023 valorar_sin_sesion=SIN_SESION | auth_lee_solicitudes=2 auth_lee_abonos=3
--   auth_lee_valoraciones=2 atender_ack=ack ack_otra_vez=false done=done actor_ajeno=42501
--   otra_org=42501
-- Lectura: anon y authenticated no ejecutan ninguna RPC pública ni leen/escriben las tablas
-- nuevas (authenticated miembro sí lee por RLS y atiende con la RPC de staff). Sin sesión
-- activa todo responde SIN_SESION. Otra organización: MESA_INVALIDA / 42501. El abono reparte
-- con pos_checkout_v1 (paid_amount 41.500 en líneas, propina 4.150 en sales.tip_amount y tips,
-- pago invoice_sales/wompi con origen carta_qr y la transacción); el mismo evento dos veces =
-- YA_PROCESADO; un segundo abono que llega con la cuenta ya pagada queda paid_unapplied con
-- aviso (venta_ya_pagada). Archivo del ensayo: no se versiona (scratchpad).

set lock_timeout = '10s';

-- ── 1. Tabla ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.table_online_payments (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      integer not null references public.organizations(id) on delete cascade,
  branch_id            integer not null references public.branches(id) on delete cascade,
  restaurant_table_id  uuid not null references public.restaurant_tables(id) on delete cascade,
  table_session_id     uuid not null references public.table_sessions(id) on delete cascade,
  sale_id              uuid not null references public.sales(id) on delete cascade,
  reference            text not null unique check (reference ~ '^CQR-[0-9A-F]{32}$'),
  amount               numeric(14, 2) not null check (amount > 0),
  tip_amount           numeric(14, 2) not null default 0 check (tip_amount >= 0),
  currency             text not null,
  gateway              text not null,
  split_mode           text not null check (split_mode in ('todo', 'iguales', 'comensal')),
  parts                integer null check (parts is null or parts between 2 and 30),
  diner_label          text null check (diner_label is null or char_length(diner_label) <= 40),
  sale_item_ids        uuid[] null,
  customer_email       text null check (customer_email is null or char_length(customer_email) <= 200),
  customer_name        text null check (customer_name is null or char_length(customer_name) <= 120),
  status               text not null default 'pending'
                         check (status in ('pending', 'paid', 'failed', 'paid_unapplied', 'refunded')),
  transaction_id       text null,
  payment_method       text null,
  payment_ids          uuid[] null,
  error_detail         text null,
  expires_at           timestamptz not null default now() + interval '30 minutes',
  paid_at              timestamptz null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.table_online_payments is
  'Carta QR: abonos en línea a la venta de la mesa. Se crean con fn_mesa_abono_iniciar y los cierra fn_mesa_abono_resultado (webhook firmado), que aplica el pago con pos_checkout_v1 settle.';
comment on column public.table_online_payments.reference is 'Referencia del cobro en la pasarela: CQR-<uuid en hexadecimal sin guiones>.';
comment on column public.table_online_payments.status is 'pending · paid (aplicado a la cuenta) · failed (rechazado) · paid_unapplied (cobrado pero no aplicado: revisar) · refunded (anulado en la pasarela).';
comment on column public.table_online_payments.payment_ids is 'Pagos (payments) que creó el cobro de la caja al aplicarlo.';

create index if not exists idx_table_online_payments_sesion on public.table_online_payments (table_session_id, created_at desc);
create index if not exists idx_table_online_payments_org on public.table_online_payments (organization_id, created_at desc);

alter table public.table_online_payments enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'table_online_payments'
                   and policyname = 'table_online_payments_select_miembros') then
    create policy table_online_payments_select_miembros on public.table_online_payments
      for select to authenticated
      using (
        organization_id in (
          select om.organization_id from public.organization_members om
           where om.user_id = (select auth.uid()) and om.is_active = true)
        and public.app_branch_access(branch_id)
      );
  end if;
end $$;

revoke all on public.table_online_payments from anon, public;
revoke insert, update, delete, truncate on public.table_online_payments from authenticated;
grant select on public.table_online_payments to authenticated;
grant all on public.table_online_payments to service_role;

-- Comensal de cada línea de la cuenta (interna): el de la ronda web o «Comensal N» del POS.
create or replace function public.fn_mesa_comensal_linea(p_organization_id integer, p_si public.sale_items)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
  select coalesce(
    (select wo.diner_label from public.web_orders wo
      where wo.organization_id = p_organization_id
        and wo.order_number = p_si.notes->>'from_web_order'
        and coalesce(p_si.notes->>'from_web_order', '') <> ''
      limit 1),
    case when p_si.notes ? 'guest_number' then 'Comensal ' || (p_si.notes->>'guest_number') end);
$f$;

revoke all on function public.fn_mesa_comensal_linea(integer, public.sale_items) from public, anon, authenticated;
grant execute on function public.fn_mesa_comensal_linea(integer, public.sale_items) to service_role;

-- ── 2. Cuenta de la mesa ────────────────────────────────────────────────────────────────────
create or replace function public.fn_mesa_cuenta_publica(p_organization_id integer, p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  c record;
  v_pedido jsonb;
  v_saldo jsonb;
  v_sale public.sales%rowtype;
  v_comensales jsonb;
  v_abonos jsonb;
  v_pasarela text;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Acceso denegado a la organización' using errcode = '42501';
  end if;
  select * into c from public.fn_mesa_qr_sesion(p_organization_id, p_table_id);
  v_pedido := public.fn_mesa_pedido_publico(p_organization_id, p_table_id);
  if c.session_id is null or c.sale_id is null then
    return v_pedido || jsonb_build_object('cuenta', null);
  end if;
  select * into v_sale from public.sales s where s.id = c.sale_id and s.organization_id = p_organization_id;
  v_saldo := public.fn_pos_mesa_saldo(c.sale_id);

  select coalesce(jsonb_agg(jsonb_build_object('comensal', x.comensal, 'total', round(x.total, 2),
                                               'pendiente', round(x.pendiente, 2), 'lineas', x.lineas)
                            order by x.primera), '[]'::jsonb)
    into v_comensales
    from (
      select l.comensal, sum(l.total) as total, sum(l.pendiente) as pendiente, min(l.creada) as primera,
             count(*) as lineas
        from (
          select public.fn_mesa_comensal_linea(p_organization_id, si) as comensal,
                 si.total, si.created_at as creada,
                 case when si.paid_at is not null then 0
                      else greatest(0, si.total - coalesce(si.paid_amount, 0)) end as pendiente
            from public.sale_items si
           where si.sale_id = c.sale_id and si.quantity > 0
        ) l
       group by l.comensal
    ) x;

  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'comensal', a.diner_label, 'modo', a.split_mode,
                                               'monto', a.amount, 'propina', a.tip_amount, 'estado',
                                               case when a.status = 'pending' and a.expires_at <= now() then 'vencido'
                                                    else a.status end,
                                               'creado', a.created_at, 'pagado', a.paid_at)
                            order by a.created_at), '[]'::jsonb)
    into v_abonos
    from public.table_online_payments a
   where a.table_session_id = c.session_id and a.status in ('pending', 'paid', 'paid_unapplied');

  v_pasarela := public.fn_reserva_mesa_pasarela(p_organization_id);

  return v_pedido || jsonb_build_object('cuenta', jsonb_build_object(
    'moneda', public.fn_moneda_base_organizacion(p_organization_id),
    'total', v_saldo->'total',
    'pagado', v_saldo->'pagado',
    'saldo', v_saldo->'saldo',
    'tolerancia', v_saldo->'tolerancia',
    'propina', round(coalesce(v_sale.tip_amount, 0), 2),
    'impuesto', round(coalesce(v_sale.tax_total, 0), 2),
    'impuesto_incluido', coalesce(v_sale.tax_included, false),
    'por_comensal', v_comensales,
    'abonos', v_abonos,
    'pasarela', v_pasarela));
end;
$f$;

comment on function public.fn_mesa_cuenta_publica(integer, uuid) is
  'Carta QR: la cuenta de la sesión ACTIVA de la mesa (pedido por rondas, total, pagado y saldo de fn_pos_mesa_saldo, pendiente por comensal, abonos en línea y pasarela). Service role.';

revoke all on function public.fn_mesa_cuenta_publica(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_mesa_cuenta_publica(integer, uuid) to service_role;

-- ── 3. Iniciar un abono en línea ────────────────────────────────────────────────────────────
create or replace function public.fn_mesa_abono_iniciar(
  p_organization_id integer,
  p_table_id uuid,
  p_modo text,
  p_partes integer default null,
  p_comensal text default null,
  p_propina numeric default 0,
  p_monto_visto numeric default null,
  p_email text default null,
  p_nombre text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  c record;
  v_saldo jsonb;
  v_pendiente numeric;
  v_total numeric;
  v_tol numeric;
  v_monto numeric;
  v_propina numeric := round(coalesce(p_propina, 0), 2);
  v_pasarela text;
  v_ids uuid[];
  v_en_curso numeric;
  v_ref text;
  v_id uuid;
  v_moneda text;
  v_comensal text := public.fn_mesa_qr_texto(p_comensal, 40);
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Acceso denegado a la organización' using errcode = '42501';
  end if;
  if p_modo is null or p_modo not in ('todo', 'iguales', 'comensal') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select * into c from public.fn_mesa_qr_sesion(p_organization_id, p_table_id);
  if c.session_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'SIN_SESION');
  end if;
  if c.sale_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'CUENTA_VACIA');
  end if;
  v_pasarela := public.fn_reserva_mesa_pasarela(p_organization_id);
  if v_pasarela is null then
    return jsonb_build_object('ok', false, 'motivo', 'SIN_PASARELA');
  end if;

  -- Serializa los abonos de la misma venta (dos comensales pagando a la vez).
  perform pg_advisory_xact_lock(hashtext('carta_qr_abono:' || c.sale_id::text));

  v_saldo := public.fn_pos_mesa_saldo(c.sale_id);
  v_pendiente := coalesce((v_saldo->>'saldo')::numeric, 0);
  v_total := coalesce((v_saldo->>'total')::numeric, 0);
  v_tol := coalesce((v_saldo->>'tolerancia')::numeric, 0.01);
  if v_pendiente <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'CUENTA_PAGADA');
  end if;

  if p_modo = 'todo' then
    v_monto := v_pendiente;
  elsif p_modo = 'iguales' then
    if p_partes is null or p_partes < 2 or p_partes > 30 then
      raise exception 'datos_invalidos' using errcode = '22023';
    end if;
    -- Redondeo a la unidad de la moneda (COP: pesos enteros) hacia arriba: la última parte no queda corta.
    v_monto := least(v_pendiente, ceil(v_total / p_partes / v_tol) * v_tol);
  else
    if v_comensal is null then
      raise exception 'datos_invalidos' using errcode = '22023';
    end if;
    select array_agg(si.id order by si.created_at, si.id),
           coalesce(sum(case when si.paid_at is not null then 0
                             else greatest(0, si.total - coalesce(si.paid_amount, 0)) end), 0)
      into v_ids, v_monto
      from public.sale_items si
     where si.sale_id = c.sale_id and si.quantity > 0
       and public.fn_mesa_comensal_linea(p_organization_id, si) = v_comensal;
    v_monto := least(v_pendiente, coalesce(v_monto, 0));
  end if;
  v_monto := round(v_monto, 2);
  if v_monto <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'NADA_QUE_PAGAR');
  end if;

  if p_monto_visto is not null and abs(p_monto_visto - v_monto) > v_tol then
    return jsonb_build_object('ok', false, 'motivo', 'MONTO_CAMBIO', 'monto', v_monto, 'saldo', v_pendiente);
  end if;
  if v_propina < 0 or v_propina > v_monto then
    return jsonb_build_object('ok', false, 'motivo', 'PROPINA_INVALIDA');
  end if;

  select coalesce(sum(a.amount), 0) into v_en_curso
    from public.table_online_payments a
   where a.sale_id = c.sale_id and a.status = 'pending' and a.expires_at > now();
  if v_en_curso + v_monto > v_pendiente + v_tol then
    return jsonb_build_object('ok', false, 'motivo', 'PAGO_EN_CURSO', 'saldo', v_pendiente, 'en_curso', v_en_curso);
  end if;

  v_ref := 'CQR-' || upper(replace(gen_random_uuid()::text, '-', ''));
  v_moneda := upper(coalesce(public.fn_moneda_base_organizacion(p_organization_id)::text, 'COP'));
  insert into public.table_online_payments (organization_id, branch_id, restaurant_table_id, table_session_id, sale_id,
                                            reference, amount, tip_amount, currency, gateway, split_mode, parts,
                                            diner_label, sale_item_ids, customer_email, customer_name)
  values (p_organization_id, c.branch_id, c.mesa_id, c.session_id, c.sale_id,
          v_ref, v_monto, v_propina, v_moneda, v_pasarela, p_modo,
          case when p_modo = 'iguales' then p_partes end,
          v_comensal, v_ids,
          public.fn_mesa_qr_texto(lower(p_email), 200), public.fn_mesa_qr_texto(p_nombre, 120))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'reference', v_ref, 'monto', v_monto, 'propina', v_propina,
                            'total', v_monto + v_propina, 'moneda', v_moneda, 'pasarela', v_pasarela,
                            'saldo', v_pendiente);
end;
$f$;

comment on function public.fn_mesa_abono_iniciar(integer, uuid, text, integer, text, numeric, numeric, text, text) is
  'Carta QR: crea un abono en línea (referencia CQR-…) con el monto calculado en la base (todo, partes iguales o lo de un comensal), con tope en el saldo. Service role.';

revoke all on function public.fn_mesa_abono_iniciar(integer, uuid, text, integer, text, numeric, numeric, text, text) from public, anon, authenticated;
grant execute on function public.fn_mesa_abono_iniciar(integer, uuid, text, integer, text, numeric, numeric, text, text) to service_role;

-- ── 4. Resultado del pago (webhook ya verificado) ───────────────────────────────────────────
create or replace function public.fn_mesa_abono_resultado(
  p_organization_id integer,
  p_reference text,
  p_estado text,
  p_transaction_id text,
  p_monto numeric,
  p_moneda text,
  p_pasarela text,
  p_metodo text default null,
  p_respuesta jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  a public.table_online_payments%rowtype;
  v_ses public.table_sessions%rowtype;
  v_mesa text;
  v_metodo text;
  v_key uuid;
  v_items jsonb := '[]'::jsonb;
  v_env jsonb;
  v_res jsonb;
  v_err text;
  v_pagos uuid[];
  v_total_venta numeric;
begin
  if auth.uid() is not null or coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'Acceso denegado a la organización' using errcode = '42501';
  end if;
  if p_estado not in ('paid', 'failed', 'refunded', 'pending') then
    raise exception 'ESTADO: estado de pago desconocido %', p_estado using errcode = '22023';
  end if;

  select * into a from public.table_online_payments where reference = p_reference for update;
  if not found then
    return jsonb_build_object('ok', false, 'transicion', false, 'motivo', 'NO_ENCONTRADO');
  end if;
  if a.organization_id <> p_organization_id then
    raise exception 'ORGANIZACION: el abono no es de la organizacion' using errcode = '42501';
  end if;
  select rt.name into v_mesa from public.restaurant_tables rt where rt.id = a.restaurant_table_id;

  if p_estado = 'pending' then
    return jsonb_build_object('ok', true, 'transicion', false, 'motivo', 'PENDIENTE', 'id', a.id);
  end if;

  if p_estado = 'failed' then
    if a.status = 'pending' then
      update public.table_online_payments
         set status = 'failed', transaction_id = coalesce(p_transaction_id, transaction_id), updated_at = now()
       where id = a.id;
      return jsonb_build_object('ok', true, 'transicion', true, 'id', a.id, 'status', 'failed');
    end if;
    return jsonb_build_object('ok', true, 'transicion', false, 'motivo', 'SIN_CAMBIO', 'id', a.id, 'status', a.status);
  end if;

  if p_estado = 'refunded' then
    if a.status in ('paid', 'paid_unapplied') then
      update public.table_online_payments set status = 'refunded', updated_at = now() where id = a.id;
      select * into v_ses from public.table_sessions where id = a.table_session_id;
      perform public.fn_mesa_qr_avisar(a.organization_id, v_ses.server_id, jsonb_build_object(
        'type', 'table_online_payment', 'kind', 'refunded',
        'title', 'Pago en línea anulado · ' || coalesce(v_mesa, 'Mesa'),
        'content', 'La pasarela anuló un abono de ' || to_char(a.amount + a.tip_amount, 'FM999G999G999D00') || '. Revisa la cuenta.',
        'href', '/app/pos/mesas/' || a.restaurant_table_id,
        'online_payment_id', a.id, 'table_session_id', a.table_session_id,
        'restaurant_table_id', a.restaurant_table_id, 'table_name', v_mesa));
      return jsonb_build_object('ok', true, 'transicion', true, 'id', a.id, 'status', 'refunded');
    end if;
    return jsonb_build_object('ok', true, 'transicion', false, 'motivo', 'SIN_CAMBIO', 'id', a.id, 'status', a.status);
  end if;

  -- p_estado = 'paid'
  if a.status in ('paid', 'paid_unapplied', 'refunded') then
    return jsonb_build_object('ok', true, 'transicion', false, 'motivo', 'YA_PROCESADO', 'id', a.id, 'status', a.status);
  end if;
  if coalesce(p_monto, 0) < a.amount + a.tip_amount
     or upper(coalesce(p_moneda, a.currency)) <> upper(a.currency) then
    raise warning 'fn_mesa_abono_resultado: monto o moneda distintos ref=% monto=% moneda=%', p_reference, p_monto, p_moneda;
    return jsonb_build_object('ok', false, 'transicion', false, 'motivo', 'MONTO', 'id', a.id);
  end if;

  select * into v_ses from public.table_sessions where id = a.table_session_id;
  v_metodo := case when exists (select 1 from public.payment_methods pm where pm.code = p_metodo) then p_metodo
                   when exists (select 1 from public.payment_methods pm where pm.code = 'wompi') then 'wompi'
                   else 'card' end;
  -- Mismo intento de cobro siempre: un reintento de pos_checkout_v1 devuelve lo que ya quedó.
  v_key := md5('carta-qr:' || a.reference)::uuid;
  select coalesce(s.total, 0) into v_total_venta from public.sales s where s.id = a.sale_id;

  if a.split_mode = 'comensal' and a.sale_item_ids is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'sale_item_id', si.id, 'product_id', si.product_id, 'quantity', si.quantity,
             'unit_price', si.unit_price, 'total', si.total, 'tax_rate', coalesce(si.tax_rate, 0),
             'tax_included', coalesce(si.tax_included, false))), '[]'::jsonb)
      into v_items
      from public.sale_items si
     where si.sale_id = a.sale_id and si.id = any(a.sale_item_ids) and si.quantity > 0 and si.paid_at is null;
  end if;

  v_env := jsonb_build_object(
    'organization_id', a.organization_id,
    'branch_id', a.branch_id,
    'sale_id', a.sale_id,
    'mode', 'settle',
    'payment_key', v_key,
    'user_id', v_ses.server_id,
    'table_session_id', a.table_session_id,
    'currency', a.currency,
    'totals', jsonb_build_object('total', v_total_venta, 'total_paid', a.amount + a.tip_amount,
                                 'tip_amount', a.tip_amount, 'change', 0, 'shipping_fee', 0),
    'items', v_items,
    'payments', jsonb_build_array(jsonb_build_object('method', v_metodo, 'amount', a.amount + a.tip_amount)),
    'tip', jsonb_build_object('server_id', v_ses.server_id),
    'split_id', 'carta_qr:' || a.reference,
    'paid_sale_item_ids', case when a.split_mode = 'comensal' then to_jsonb(coalesce(a.sale_item_ids, '{}'::uuid[])) end);

  begin
    if v_ses.id is null or v_ses.status not in ('active', 'bill_requested') then
      raise exception 'sesion_mesa_cerrada';
    end if;
    v_res := public.pos_checkout_v1(v_env);
  exception when others then
    v_err := sqlerrm;
  end;

  if v_err is not null then
    update public.table_online_payments
       set status = 'paid_unapplied', paid_at = now(), transaction_id = p_transaction_id,
           payment_method = v_metodo, error_detail = left(v_err, 500), updated_at = now()
     where id = a.id;
    perform public.fn_mesa_qr_avisar(a.organization_id, v_ses.server_id, jsonb_build_object(
      'type', 'table_online_payment', 'kind', 'paid_unapplied',
      'title', 'Pago en línea sin aplicar · ' || coalesce(v_mesa, 'Mesa'),
      'content', 'Entró ' || to_char(a.amount + a.tip_amount, 'FM999G999G999D00')
                 || coalesce(' de ' || a.diner_label, '') || ' pero no se pudo abonar a la cuenta. Aplícalo a mano o reembolsa.',
      'href', '/app/pos/mesas/' || a.restaurant_table_id,
      'online_payment_id', a.id, 'table_session_id', a.table_session_id,
      'restaurant_table_id', a.restaurant_table_id, 'table_name', v_mesa));
    return jsonb_build_object('ok', true, 'transicion', true, 'id', a.id, 'status', 'paid_unapplied', 'motivo', 'NO_APLICADO');
  end if;

  select pc.payment_ids into v_pagos from public.pos_cobros pc where pc.id = v_key;
  update public.payments p
     set reference = coalesce(p_transaction_id, p.reference),
         idempotency_key = coalesce(p.idempotency_key, 'carta-qr-abono:' || coalesce(p_transaction_id, a.reference)),
         processor_response = coalesce(p_respuesta, '{}'::jsonb) || jsonb_build_object(
           'origen', 'carta_qr', 'reference', a.reference, 'sale_id', a.sale_id,
           'table_session_id', a.table_session_id, 'diner_label', a.diner_label,
           'tip_amount', a.tip_amount, 'split_mode', a.split_mode, 'gateway', coalesce(p_pasarela, a.gateway)),
         updated_at = now()
   where p.id = any(coalesce(v_pagos, '{}'::uuid[])) and p.organization_id = a.organization_id;

  update public.table_online_payments
     set status = 'paid', paid_at = now(), transaction_id = p_transaction_id, payment_method = v_metodo,
         payment_ids = v_pagos, updated_at = now()
   where id = a.id;

  perform public.fn_mesa_qr_avisar(a.organization_id, v_ses.server_id, jsonb_build_object(
    'type', 'table_online_payment', 'kind', 'paid',
    'title', coalesce(v_mesa, 'Mesa') || ' pagó en línea',
    'content', to_char(a.amount + a.tip_amount, 'FM999G999G999D00') || coalesce(' · ' || a.diner_label, '')
               || case when a.tip_amount > 0 then ' (propina ' || to_char(a.tip_amount, 'FM999G999G999D00') || ')' else '' end,
    'href', '/app/pos/mesas/' || a.restaurant_table_id,
    'online_payment_id', a.id, 'table_session_id', a.table_session_id,
    'restaurant_table_id', a.restaurant_table_id, 'table_name', v_mesa));

  return jsonb_build_object('ok', true, 'transicion', true, 'id', a.id, 'status', 'paid',
                            'organization_id', a.organization_id, 'sale_id', a.sale_id,
                            'payment_ids', to_jsonb(v_pagos),
                            'saldo', (public.fn_pos_mesa_saldo(a.sale_id))->'saldo');
end;
$f$;

comment on function public.fn_mesa_abono_resultado(integer, text, text, text, numeric, text, text, text, jsonb) is
  'Carta QR: resultado del abono en línea (webhook verificado). Pagado → pos_checkout_v1 settle sobre la venta de la mesa; si no se puede aplicar, paid_unapplied con aviso. Idempotente. Service role.';

revoke all on function public.fn_mesa_abono_resultado(integer, text, text, text, numeric, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_mesa_abono_resultado(integer, text, text, text, numeric, text, text, text, jsonb) to service_role;
