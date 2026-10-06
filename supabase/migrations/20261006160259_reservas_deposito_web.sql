-- Aplicada el 2026-10-06 con apply_migration (versión 20261006160259).
-- Paquete D · D7 — depósito de las reservas de mesa cobrado en el sitio web.
-- NO APLICADA. Ensayo y orden de aplicación al pie de este encabezado.
--
-- Problema: «Pedir depósito» (`restaurant_booking_settings.require_deposit`,
-- `deposit_amount`, `deposit_per_person`) existía en la configuración pero el
-- sitio no lo cobraba ni lo mostraba y ninguna RPC lo usaba. El ERP dejaba el
-- interruptor deshabilitado con «Próximamente».
--
-- Qué hace (todo aditivo: columnas NULL o con DEFAULT, funciones nuevas, un
-- CREATE OR REPLACE del aviso al equipo y un cron; sin DROP ni DELETE):
-- 1. Ajustes: `deposit_refundable` (DEFAULT true) y `deposit_refund_hours`
--    (NULL = las mismas horas de `cancellation_hours`).
-- 2. Reserva: estado del depósito (`deposit_status`), monto, moneda,
--    referencia de cobro única (`MESA-<uuid sin guiones>`), vencimiento del
--    cobro, estado al pagar (`confirmed` o `pending` según «Confirmación
--    manual», el que decidió `create_restaurant_reservation`), hasta cuándo es
--    reembolsable, pasarela, transacción, pago (`payments.id`) y reembolso.
-- 3. `fn_reserva_mesa_pasarela(org)`: la pasarela integrada activa con la que
--    el sitio puede cobrar el depósito (`organization_payment_methods` con
--    `integration_connection_id` → conexión `active`/`connected`). Hoy solo
--    `wompi_co`: es la única con el ramal de depósito en su webhook. Sin
--    pasarela no se exige depósito aunque la sede lo pida (el sitio reserva
--    como hoy).
-- 4. `fn_reserva_mesa_deposito_cotizar(org, sede, personas)`: lo que el sitio
--    muestra antes de reservar (monto, política, reembolso). El monto que se
--    cobra lo vuelve a calcular la base al crear: el navegador nunca lo fija.
-- 5. `fn_reserva_mesa_crear_web(...)`: la misma `create_restaurant_reservation`
--    de siempre y, si hay depósito, en la MISMA transacción la deja `pending`
--    con `deposit_status = 'pending'` y 30 min para pagar. Libera antes las
--    reservas vencidas de la organización (la mesa vuelve a estar libre).
-- 6. `fn_reserva_mesa_deposito_resultado(...)`: lo llama el webhook de la
--    pasarela YA verificado (firma, organización de la reserva). Idempotente
--    por transacción (`payments.idempotency_key`) y por estado (FOR UPDATE).
--    Pagado → `payments` (source `restaurant_reservation`) y la reserva pasa a
--    su estado al pagar. Rechazado → la reserva se libera. Anulado en la
--    pasarela → el pago queda `void` y el depósito `refunded`. Pago que llega
--    tarde (reserva ya liberada) → `paid_late` y aviso para reembolsar.
-- 7. `fn_reservas_mesa_liberar_depositos_vencidos(org)`: cancela las reservas
--    cuyo depósito no se pagó a tiempo. pg_cron cada 5 min y, además, al crear
--    una reserva web de la organización.
-- 8. `fn_reserva_mesa_deposito_reembolsar(reserva, motivo)`: el ERP registra
--    el reembolso en finanzas. Mismo mecanismo que `fn_anular_pago` (pago
--    `void`, `finance_audit_log`, permiso `finance.void`/`pos.void`), que por
--    diseño no anula pagos de origen propio («folios, parqueaderos,
--    membresías y web tienen su propio flujo de reverso»). Sin asiento que
--    revertir: el pago del depósito no genera asiento (`fn_auto_journal_payment`
--    solo contabiliza ventas y compras). El dinero se devuelve en la pasarela.
-- 9. Aviso al equipo (`fn_notify_restaurant_reservation_created`): mismo
--    cuerpo y, con la marca de transacción `goadmin.reserva_con_deposito`,
--    «por pagar depósito» en vez de «confirmada»; con
--    `goadmin.reserva_deposito_liberada`, «liberada: depósito sin pagar» en vez
--    de «cancelada por el cliente».
--
-- Permisos: todas SECURITY DEFINER con `revoke ... from public, anon` en esta
-- misma migración. Sitio y webhook (service role): cotizar, crear, resultado,
-- liberar. ERP (authenticated, con `fn_assert_acceso_org` y permiso de
-- finanzas): pasarela y reembolsar.
--
-- Depende de D1 (`create_restaurant_reservation` de 16 argumentos,
-- `fn_ajustes_reserva`), D2 (`manage_token`) y de `fn_timezone_for`,
-- `fn_moneda_base_organizacion`, `fn_create_org_notification`,
-- `fn_finanzas_exigir_permiso`, `app_branch_access` (verificadas por MCP el
-- 2026-10-06).
--
-- ENSAYO (2026-10-06, execute_sql: un bloque `do` con esta migración entera
-- —sin comentarios, `select cron.schedule` como `perform`— y las pruebas, que
-- se deshace con `raise exception`. Org 140, sede 115, una conexión Wompi
-- sandbox y su método de pago creados DENTRO del bloque; depósito 10.000 por
-- persona, reembolsable hasta 24 h antes):
--   ENSAYO_OK anon_cotizar=42501 anon_crear=42501 anon_resultado=42501
--   anon_liberar=42501 anon_pasarela=42501 anon_reembolsar=42501
--   cotizar=true/20000.00/COP/wompi_co
--   A_creada=pending:pending/pending/20000.00/confirmed
--   A_aviso=[Nueva reserva web · Sucursal Principal · por pagar depósito]
--   A_monto_bajo=MONTO A_otra_org=42501 A_pago=true:confirmed
--   A_repetido=false:YA_PROCESADO A_pagos=1:completed A_final=confirmed/paid/true/true
--   B_rechazo=true:cancelled/failed
--   B_aviso=[Reserva liberada: depósito sin pagar · Sucursal Principal]
--   C_liberadas=1:cancelled/expired C_tardio=PAGO_TARDIO:cancelled/paid_late
--   D_manual=pending E_sin_pasarela=pending:deposito=null
--   auth_pasarela=wompi_co auth_pasarela_ajena=42501 auth_resultado=42501
--   auth_crear=42501 auth_lee_A=paid/20000.00
--   auth_reembolso_doble=deposito_no_reembolsable A_reembolso=refunded/void/true
--   A_auditoria=1 anon_lee=0 cron=1
-- (A: reserva → pago con monto menor (se rechaza) → pago de otra organización
-- (42501) → pago bueno → el mismo evento otra vez (idempotente, un solo pago).
-- B: pago rechazado → la reserva se libera con su aviso. C: vence → el barrido
-- la libera → el pago tardío queda `paid_late`. D: «Confirmación manual» →
-- pagada queda `pending`. E: sin pasarela conectada → reserva sin depósito,
-- como hoy. authenticated = miembro administrador de la org 140: ve el
-- depósito con la RLS de siempre, no puede crear ni confirmar pagos y registra
-- el reembolso una sola vez. anon: ninguna función, ninguna fila.)
--
-- ORDEN DE APLICACIÓN: 1) esta migración por `apply_migration`; 2) desplegar el
-- ERP (la configuración habilita el interruptor solo con pasarela); 3)
-- desplegar el sitio (sin la migración el sitio sigue reservando como hoy:
-- `fn_reserva_mesa_crear_web` responde PGRST202 y cae a
-- `create_restaurant_reservation`). Cualquier orden funciona; ese es el que no
-- muestra el interruptor antes de que el sitio sepa cobrar.

-- ── 1. Ajustes de la sede ───────────────────────────────────────────────
alter table public.restaurant_booking_settings
  add column if not exists deposit_refundable boolean not null default true,
  add column if not exists deposit_refund_hours integer null
    constraint restaurant_booking_settings_deposit_refund_hours_check
    check (deposit_refund_hours is null or deposit_refund_hours between 0 and 720);

comment on column public.restaurant_booking_settings.deposit_refundable is 'El depósito de la reserva se devuelve si el cliente cancela a tiempo.';
comment on column public.restaurant_booking_settings.deposit_refund_hours is 'Horas antes de la reserva hasta las que el depósito es reembolsable. NULL = las de cancellation_hours.';

-- ── 2. Depósito de la reserva ───────────────────────────────────────────
alter table public.restaurant_reservations
  add column if not exists deposit_status text null
    constraint restaurant_reservations_deposit_status_check
    check (deposit_status is null or deposit_status in ('pending', 'paid', 'failed', 'expired', 'refunded', 'paid_late')),
  add column if not exists deposit_amount numeric(14, 2) null
    constraint restaurant_reservations_deposit_amount_check
    check (deposit_amount is null or deposit_amount > 0),
  add column if not exists deposit_currency text null,
  add column if not exists deposit_reference text null,
  add column if not exists deposit_due_at timestamptz null,
  add column if not exists deposit_status_on_paid text null
    constraint restaurant_reservations_deposit_status_on_paid_check
    check (deposit_status_on_paid is null or deposit_status_on_paid in ('confirmed', 'pending')),
  add column if not exists deposit_refundable_until timestamptz null,
  add column if not exists deposit_gateway text null,
  add column if not exists deposit_transaction_id text null,
  add column if not exists deposit_paid_at timestamptz null,
  add column if not exists deposit_payment_id uuid null
    references public.payments (id) on delete set null,
  add column if not exists deposit_refunded_at timestamptz null;

create unique index if not exists uq_restaurant_reservations_deposit_reference
  on public.restaurant_reservations (deposit_reference)
  where deposit_reference is not null;

create index if not exists idx_restaurant_reservations_deposito_vence
  on public.restaurant_reservations (deposit_due_at)
  where deposit_status = 'pending';

comment on column public.restaurant_reservations.deposit_status is 'Depósito: pending (por pagar), paid, failed (rechazado), expired (vencido), refunded, paid_late (pagado con la reserva ya liberada). NULL = sin depósito.';
comment on column public.restaurant_reservations.deposit_reference is 'Referencia del cobro en la pasarela (MESA-<uuid sin guiones>). Única.';
comment on column public.restaurant_reservations.deposit_due_at is 'Hasta cuándo se puede pagar el depósito. Después la reserva se libera.';
comment on column public.restaurant_reservations.deposit_status_on_paid is 'Estado de la reserva al confirmarse el pago: confirmed, o pending si la sede confirma a mano.';
comment on column public.restaurant_reservations.deposit_refundable_until is 'Hasta cuándo el depósito es reembolsable (NULL = no reembolsable).';
comment on column public.restaurant_reservations.deposit_payment_id is 'Pago del depósito en payments (source restaurant_reservation).';

-- ── 3. Pasarela con la que el sitio cobra el depósito ───────────────────
create or replace function public.fn_reserva_mesa_pasarela(p_organization_id integer)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_codigo text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  -- Solo pasarelas cuyo webhook sabe confirmar el depósito (hoy: Wompi).
  select c.code into v_codigo
    from public.organization_payment_methods opm
    join public.integration_connections ic on ic.id = opm.integration_connection_id
    join public.integration_connectors c on c.id = ic.connector_id
   where opm.organization_id = p_organization_id
     and coalesce(opm.is_active, true)
     and ic.organization_id = p_organization_id
     and ic.status in ('active', 'connected')
     and c.code = any (array['wompi_co'])
   order by opm.id
   limit 1;
  return v_codigo;
end;
$function$;

revoke all on function public.fn_reserva_mesa_pasarela(integer) from public, anon;
grant execute on function public.fn_reserva_mesa_pasarela(integer) to authenticated, service_role;

-- ── 4. Cálculo del depósito (interno) y cotización para el sitio ────────
create or replace function public.fn_reserva_mesa_deposito_calculo(
  p_organization_id integer,
  p_branch_id integer,
  p_party_size integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_s public.restaurant_booking_settings;
  v_pasarela text;
  v_personas integer := greatest(coalesce(p_party_size, 1), 1);
  v_monto numeric;
begin
  v_s := public.fn_ajustes_reserva(p_organization_id, p_branch_id);
  if v_s.id is null or not v_s.require_deposit or coalesce(v_s.deposit_amount, 0) <= 0 then
    return jsonb_build_object('requiere', false, 'motivo', 'SIN_DEPOSITO');
  end if;
  v_pasarela := public.fn_reserva_mesa_pasarela(p_organization_id);
  if v_pasarela is null then
    return jsonb_build_object('requiere', false, 'motivo', 'SIN_PASARELA');
  end if;
  v_monto := round(v_s.deposit_amount * case when v_s.deposit_per_person then v_personas else 1 end, 2);
  return jsonb_build_object(
    'requiere', true,
    'monto', v_monto,
    'monto_base', v_s.deposit_amount,
    'por_persona', v_s.deposit_per_person,
    'moneda', coalesce(nullif(public.fn_moneda_base_organizacion(p_organization_id), ''), 'COP'),
    'reembolsable', coalesce(v_s.deposit_refundable, true),
    'horas_reembolso', coalesce(v_s.deposit_refund_hours, v_s.cancellation_hours, 4),
    'politica', v_s.policy_text,
    'pasarela', v_pasarela,
    'minutos_para_pagar', 30
  );
end;
$function$;

revoke all on function public.fn_reserva_mesa_deposito_calculo(integer, integer, integer) from public, anon, authenticated;

create or replace function public.fn_reserva_mesa_deposito_cotizar(
  p_organization_id integer,
  p_branch_id integer,
  p_party_size integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'SEDE: La sede no pertenece a la organizacion' using errcode = '42501';
  end if;
  return public.fn_reserva_mesa_deposito_calculo(p_organization_id, p_branch_id, p_party_size);
end;
$function$;

revoke all on function public.fn_reserva_mesa_deposito_cotizar(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_reserva_mesa_deposito_cotizar(integer, integer, integer) to service_role;

-- ── 7 (antes que 5). Liberar depósitos vencidos ─────────────────────────
create or replace function public.fn_reservas_mesa_liberar_depositos_vencidos(p_organization_id integer default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n integer := 0;
begin
  if p_organization_id is not null then
    perform public.fn_assert_acceso_org(p_organization_id);
  end if;
  perform set_config('goadmin.reserva_deposito_liberada', 'on', true);
  with liberadas as (
    update public.restaurant_reservations r
       set status = 'cancelled',
           cancelled_at = now(),
           cancellation_reason = 'Depósito sin pagar a tiempo',
           deposit_status = 'expired',
           updated_at = now()
     where r.deposit_status = 'pending'
       and r.status = 'pending'
       and r.deposit_due_at < now()
       and (p_organization_id is null or r.organization_id = p_organization_id)
    returning 1
  )
  select count(*) into v_n from liberadas;
  perform set_config('goadmin.reserva_deposito_liberada', 'off', true);
  return v_n;
end;
$function$;

revoke all on function public.fn_reservas_mesa_liberar_depositos_vencidos(integer) from public, anon, authenticated;
grant execute on function public.fn_reservas_mesa_liberar_depositos_vencidos(integer) to service_role;

-- ── 5. Crear la reserva web (con depósito si corresponde) ───────────────
create or replace function public.fn_reserva_mesa_crear_web(
  p_organization_id integer,
  p_reservation_date date,
  p_reservation_time time,
  p_party_size integer,
  p_customer_name text,
  p_branch_id integer default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_zone text default null,
  p_notes text default null,
  p_validar_reglas boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_dep jsonb;
  v_res jsonb;
  v_id uuid;
  v_ref text;
  v_tz text;
  v_horas integer;
  v_hasta timestamptz;
  v_vence timestamptz;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  perform public.fn_reservas_mesa_liberar_depositos_vencidos(p_organization_id);

  v_dep := public.fn_reserva_mesa_deposito_calculo(p_organization_id, p_branch_id, p_party_size);
  if coalesce((v_dep ->> 'requiere')::boolean, false) then
    perform set_config('goadmin.reserva_con_deposito', 'on', true);
  end if;

  v_res := public.create_restaurant_reservation(
    p_organization_id, p_reservation_date, p_reservation_time, p_party_size, p_customer_name,
    null::uuid, null::uuid, null::integer, p_validar_reglas,
    p_branch_id, p_customer_phone, p_customer_email, p_zone, p_notes, null::text, 'website'
  );
  perform set_config('goadmin.reserva_con_deposito', 'off', true);

  if not coalesce((v_dep ->> 'requiere')::boolean, false) or not coalesce((v_res ->> 'success')::boolean, false) then
    return v_res || jsonb_build_object('deposito', null);
  end if;

  v_id := (v_res ->> 'reservation_id')::uuid;
  v_ref := 'MESA-' || upper(replace(v_id::text, '-', ''));
  v_vence := now() + make_interval(mins => (v_dep ->> 'minutos_para_pagar')::integer);
  if (v_dep ->> 'reembolsable')::boolean then
    v_tz := public.fn_timezone_for(p_organization_id, coalesce((v_res ->> 'branch_id')::integer, p_branch_id));
    v_horas := (v_dep ->> 'horas_reembolso')::integer;
    v_hasta := ((p_reservation_date + p_reservation_time) at time zone coalesce(v_tz, 'America/Bogota'))
               - make_interval(hours => v_horas);
  end if;

  update public.restaurant_reservations r
     set status = 'pending',
         confirmed_at = null,
         deposit_status = 'pending',
         deposit_amount = (v_dep ->> 'monto')::numeric,
         deposit_currency = v_dep ->> 'moneda',
         deposit_reference = v_ref,
         deposit_due_at = v_vence,
         deposit_status_on_paid = case when v_res ->> 'status' = 'confirmed' then 'confirmed' else 'pending' end,
         deposit_refundable_until = v_hasta,
         deposit_gateway = v_dep ->> 'pasarela',
         updated_at = now()
   where r.id = v_id
     and r.organization_id = p_organization_id;

  return v_res || jsonb_build_object(
    'status', 'pending',
    'deposito', jsonb_build_object(
      'monto', (v_dep ->> 'monto')::numeric,
      'moneda', v_dep ->> 'moneda',
      'referencia', v_ref,
      'vence', v_vence,
      'pasarela', v_dep ->> 'pasarela',
      'estado_al_pagar', case when v_res ->> 'status' = 'confirmed' then 'confirmed' else 'pending' end,
      'reembolsable', (v_dep ->> 'reembolsable')::boolean,
      'reembolsable_hasta', v_hasta,
      'politica', v_dep ->> 'politica'
    )
  );
end;
$function$;

revoke all on function public.fn_reserva_mesa_crear_web(integer, date, time, integer, text, integer, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_reserva_mesa_crear_web(integer, date, time, integer, text, integer, text, text, text, text, boolean) to service_role;

-- ── 6. Resultado del pago (webhook ya verificado) ───────────────────────
create or replace function public.fn_reserva_mesa_deposito_resultado(
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
set search_path to 'public'
as $function$
declare
  r public.restaurant_reservations%rowtype;
  v_pago uuid;
  v_metodo text;
  v_estado_nuevo text;
  v_sede text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if p_estado not in ('paid', 'failed', 'refunded', 'pending') then
    raise exception 'ESTADO: estado de pago desconocido %', p_estado using errcode = '22023';
  end if;

  select * into r
    from public.restaurant_reservations
   where deposit_reference = p_reference
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'transicion', false, 'motivo', 'NO_ENCONTRADA');
  end if;
  if r.organization_id <> p_organization_id then
    raise exception 'ORGANIZACION: la reserva no es de la organizacion' using errcode = '42501';
  end if;

  select b.name into v_sede from public.branches b where b.id = r.branch_id;

  if p_estado = 'pending' then
    return jsonb_build_object('ok', true, 'transicion', false, 'motivo', 'PENDIENTE', 'reservation_id', r.id);
  end if;

  if p_estado = 'paid' then
    if r.deposit_status in ('paid', 'paid_late', 'refunded') then
      return jsonb_build_object('ok', true, 'transicion', false, 'motivo', 'YA_PROCESADO', 'reservation_id', r.id, 'status', r.status);
    end if;
    if coalesce(p_monto, 0) < r.deposit_amount
       or upper(coalesce(p_moneda, r.deposit_currency)) <> upper(r.deposit_currency) then
      raise warning 'fn_reserva_mesa_deposito_resultado: monto o moneda distintos ref=% monto=% moneda=%', p_reference, p_monto, p_moneda;
      return jsonb_build_object('ok', false, 'transicion', false, 'motivo', 'MONTO', 'reservation_id', r.id);
    end if;

    v_metodo := case when exists (select 1 from public.payment_methods pm where pm.code = p_metodo) then p_metodo else null end;
    insert into public.payments (
      organization_id, branch_id, source, source_id, method, amount, currency,
      reference, processor_response, status, idempotency_key
    )
    values (
      r.organization_id, r.branch_id, 'restaurant_reservation', r.id::text, v_metodo, p_monto, r.deposit_currency,
      p_transaction_id, p_respuesta, 'completed', 'reserva-mesa-deposito:' || p_transaction_id
    )
    on conflict (organization_id, idempotency_key) where idempotency_key is not null do nothing
    returning id into v_pago;
    if v_pago is null then
      select p.id into v_pago from public.payments p
       where p.organization_id = r.organization_id
         and p.idempotency_key = 'reserva-mesa-deposito:' || p_transaction_id;
    end if;

    if r.deposit_status = 'pending' and r.status in ('pending', 'confirmed') then
      v_estado_nuevo := case when r.status = 'pending' then coalesce(r.deposit_status_on_paid, 'pending') else r.status end;
      update public.restaurant_reservations
         set deposit_status = 'paid',
             deposit_paid_at = now(),
             deposit_transaction_id = p_transaction_id,
             deposit_gateway = coalesce(p_pasarela, deposit_gateway),
             deposit_payment_id = v_pago,
             status = v_estado_nuevo,
             confirmed_at = case when v_estado_nuevo = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
             updated_at = now()
       where id = r.id;
      perform public.fn_create_org_notification(
        p_organization_id   => r.organization_id,
        p_recipient_user_id => null,
        p_channel           => 'app',
        p_type              => 'restaurant_reservation_deposit_paid',
        p_title             => 'Depósito pagado · ' || coalesce(v_sede, 'Sede') || ' · '
                               || case when v_estado_nuevo = 'confirmed' then 'confirmada' else 'por confirmar' end,
        p_content           => to_char(r.reservation_date, 'DD/MM/YYYY') || ' ' || to_char(r.reservation_time, 'HH24:MI')
                               || ' · ' || r.party_size || case when r.party_size = 1 then ' persona' else ' personas' end
                               || ' · ' || r.customer_name,
        p_metadata          => jsonb_build_object('reservation_id', r.id, 'branch_id', r.branch_id, 'status', v_estado_nuevo,
                                                  'href', '/app/pos/reservas-mesas?reserva=' || r.id)
      );
      return jsonb_build_object('ok', true, 'transicion', true, 'reservation_id', r.id, 'status', v_estado_nuevo,
                                'organization_id', r.organization_id, 'branch_id', r.branch_id, 'payment_id', v_pago);
    end if;

    -- La reserva ya se había liberado (vencida, rechazada o cancelada): el dinero llegó igual.
    update public.restaurant_reservations
       set deposit_status = 'paid_late',
           deposit_paid_at = now(),
           deposit_transaction_id = p_transaction_id,
           deposit_gateway = coalesce(p_pasarela, deposit_gateway),
           deposit_payment_id = v_pago,
           updated_at = now()
     where id = r.id;
    perform public.fn_create_org_notification(
      p_organization_id   => r.organization_id,
      p_recipient_user_id => null,
      p_channel           => 'app',
      p_type              => 'restaurant_reservation_deposit_late',
      p_title             => 'Depósito pagado tarde · ' || coalesce(v_sede, 'Sede') || ' · reembolsar o reactivar',
      p_content           => to_char(r.reservation_date, 'DD/MM/YYYY') || ' ' || to_char(r.reservation_time, 'HH24:MI')
                             || ' · ' || r.customer_name,
      p_metadata          => jsonb_build_object('reservation_id', r.id, 'branch_id', r.branch_id, 'status', r.status,
                                                'href', '/app/pos/reservas-mesas?reserva=' || r.id)
    );
    return jsonb_build_object('ok', true, 'transicion', false, 'motivo', 'PAGO_TARDIO', 'reservation_id', r.id, 'status', r.status);
  end if;

  if p_estado = 'failed' then
    if r.deposit_status = 'pending' and r.status = 'pending' then
      perform set_config('goadmin.reserva_deposito_liberada', 'on', true);
      update public.restaurant_reservations
         set status = 'cancelled',
             cancelled_at = now(),
             cancellation_reason = 'Pago del depósito rechazado',
             deposit_status = 'failed',
             deposit_transaction_id = p_transaction_id,
             updated_at = now()
       where id = r.id;
      perform set_config('goadmin.reserva_deposito_liberada', 'off', true);
      return jsonb_build_object('ok', true, 'transicion', true, 'reservation_id', r.id, 'status', 'cancelled',
                                'organization_id', r.organization_id, 'branch_id', r.branch_id);
    end if;
    return jsonb_build_object('ok', true, 'transicion', false, 'motivo', 'SIN_CAMBIO', 'reservation_id', r.id, 'status', r.status);
  end if;

  -- p_estado = 'refunded': anulado en la pasarela.
  if r.deposit_status in ('paid', 'paid_late') then
    update public.payments
       set status = 'void', voided_at = now(), void_reason = 'Depósito anulado en la pasarela', updated_at = now()
     where id = r.deposit_payment_id and status = 'completed';
    if r.deposit_payment_id is not null then
      insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
      values (r.organization_id, 'payments', r.deposit_payment_id::text, 'void', null,
              jsonb_build_object('amount', r.deposit_amount, 'source', 'restaurant_reservation', 'source_id', r.id),
              'Depósito anulado en la pasarela');
    end if;
    update public.restaurant_reservations
       set deposit_status = 'refunded', deposit_refunded_at = now(), updated_at = now()
     where id = r.id;
    return jsonb_build_object('ok', true, 'transicion', true, 'reservation_id', r.id, 'status', r.status, 'deposito', 'refunded');
  end if;
  return jsonb_build_object('ok', true, 'transicion', false, 'motivo', 'SIN_CAMBIO', 'reservation_id', r.id, 'status', r.status);
end;
$function$;

revoke all on function public.fn_reserva_mesa_deposito_resultado(integer, text, text, text, numeric, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_reserva_mesa_deposito_resultado(integer, text, text, text, numeric, text, text, text, jsonb) to service_role;

-- ── 8. Reembolso registrado desde el ERP ────────────────────────────────
create or replace function public.fn_reserva_mesa_deposito_reembolsar(p_reservation_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  r public.restaurant_reservations%rowtype;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;

  select * into r from public.restaurant_reservations where id = p_reservation_id for update;
  if not found then
    raise exception 'reserva_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(r.organization_id, array['finance.void', 'pos.void']);
  if not public.app_branch_access(r.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if coalesce(r.deposit_status, '') not in ('paid', 'paid_late') then
    raise exception 'deposito_no_reembolsable' using errcode = '22023';
  end if;

  update public.payments
     set status = 'void', voided_at = now(), voided_by = v_uid, void_reason = btrim(p_motivo), updated_at = now()
   where id = r.deposit_payment_id and status = 'completed';

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (r.organization_id, 'payments', coalesce(r.deposit_payment_id::text, r.id::text), 'void', v_uid,
          jsonb_build_object('amount', r.deposit_amount, 'source', 'restaurant_reservation', 'source_id', r.id),
          btrim(p_motivo));

  update public.restaurant_reservations
     set deposit_status = 'refunded', deposit_refunded_at = now(), updated_at = now()
   where id = r.id;

  return jsonb_build_object('reservation_id', r.id, 'payment_id', r.deposit_payment_id,
                            'monto', r.deposit_amount, 'moneda', r.deposit_currency);
end;
$function$;

revoke all on function public.fn_reserva_mesa_deposito_reembolsar(uuid, text) from public, anon;
grant execute on function public.fn_reserva_mesa_deposito_reembolsar(uuid, text) to authenticated, service_role;

-- ── 9. Aviso al equipo: textos del depósito ─────────────────────────────
create or replace function public.fn_notify_restaurant_reservation_created()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sede   text;
  v_titulo text;
  v_cuerpo text;
begin
  begin
    select b.name into v_sede from public.branches b where b.id = new.branch_id;

    if tg_op = 'INSERT' then
      v_titulo := 'Nueva reserva web · ' || coalesce(v_sede, 'Sede') || ' · '
                  || case
                       when coalesce(current_setting('goadmin.reserva_con_deposito', true), '') = 'on' then 'por pagar depósito'
                       when new.status = 'pending' then 'por confirmar'
                       else 'confirmada'
                     end;
      v_cuerpo := to_char(new.reservation_date, 'DD/MM/YYYY') || ' ' || to_char(new.reservation_time, 'HH24:MI')
                  || ' · ' || new.party_size || case when new.party_size = 1 then ' persona' else ' personas' end
                  || ' · ' || new.customer_name;
      perform public.fn_create_org_notification(
        p_organization_id   => new.organization_id,
        p_recipient_user_id => null,
        p_channel           => 'app',
        p_type              => 'restaurant_reservation_created',
        p_title             => v_titulo,
        p_content           => v_cuerpo,
        p_metadata          => jsonb_build_object(
          'reservation_id', new.id,
          'branch_id', new.branch_id,
          'status', new.status,
          'href', '/app/pos/reservas-mesas?reserva=' || new.id
        )
      );
    elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' and auth.uid() is null then
      v_titulo := case
                    when coalesce(current_setting('goadmin.reserva_deposito_liberada', true), '') = 'on'
                      then 'Reserva liberada: depósito sin pagar · '
                    else 'Reserva cancelada por el cliente · '
                  end || coalesce(v_sede, 'Sede');
      v_cuerpo := to_char(new.reservation_date, 'DD/MM/YYYY') || ' ' || to_char(new.reservation_time, 'HH24:MI')
                  || ' · ' || new.party_size || case when new.party_size = 1 then ' persona' else ' personas' end
                  || ' · ' || new.customer_name;
      perform public.fn_create_org_notification(
        p_organization_id   => new.organization_id,
        p_recipient_user_id => null,
        p_channel           => 'app',
        p_type              => 'restaurant_reservation_cancelled',
        p_title             => v_titulo,
        p_content           => v_cuerpo,
        p_metadata          => jsonb_build_object(
          'reservation_id', new.id,
          'branch_id', new.branch_id,
          'status', new.status,
          'href', '/app/pos/reservas-mesas?reserva=' || new.id
        )
      );
    end if;
  exception when others then
    raise warning 'fn_notify_restaurant_reservation_created: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$function$;

-- ── Cron: liberar depósitos vencidos cada 5 min ─────────────────────────
select cron.schedule('reservas-mesas-depositos-vencidos', '*/5 * * * *', $cron$select public.fn_reservas_mesa_liberar_depositos_vencidos()$cron$);
