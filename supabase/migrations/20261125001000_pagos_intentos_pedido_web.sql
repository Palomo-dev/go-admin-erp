-- Pagos del pedido web: método elegido e intentos (diseño aprobado 2026-11-24, Figma
-- EAvjINVRnlzFM70GVoWXgl › «05 POS y ventas» › 3087:201491).
--
-- 1. `web_order_payment_attempts`: un renglón por intento de pago de un pedido web (o de su
--    anticipo de contraentrega). Solo lo que la tarjeta «Pagos» muestra —pasarela, evento, motivo
--    corto, medio, marca y últimos 4, banco, referencia, monto—; NUNCA la respuesta completa de la
--    pasarela (trae nombre, documento, correo y teléfono del pagador).
--    Lectura: miembros activos de la organización. Escritura: solo service_role, por
--    `fn_web_order_intento_registrar` (tienda: checkout/init y webhooks) y por
--    `expire_pending_web_orders` (vencimiento).
-- 2. `fn_web_order_vence_pago`: la hora en que vence un pedido sin pagar, con la MISMA regla del
--    vencimiento (anticipo pendiente → advance_due_at; si no, created_at + fn_web_order_plazo_minutos).
-- 3. Decisión del dueño (2026-11-24): un rechazo de la pasarela ya NO cancela el pedido; queda
--    «Pendiente» con `payment_status = 'failed'` y su reserva de stock hasta que venza. Por eso
--    `expire_pending_web_orders` ahora vence también los pendientes con pago rechazado, y deja el
--    intento «Venció sin pagar».
-- 4. `fn_web_orders_resumen_pago(uuid[])`: vencimiento e intentos de una página del listado en
--    una sola llamada (miembros de la organización).
-- 5. Backfill de los avisos ya guardados en `integration_events` de Bold (firmados: solo se guardan
--    tras verificar la firma) y de Wompi (veredicto de firma «match», o procesados desde que la
--    firma es obligatoria), con la referencia del pedido y la organización del aviso. Mercado Pago
--    no se rellena: su aviso guardado no trae la referencia del pedido.

-- ── 1. Tabla ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.web_order_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  web_order_id uuid not null references public.web_orders(id) on delete cascade,
  concept text not null default 'order',
  gateway text null,
  event text not null,
  reason text null,
  reason_code text null,
  method text null,
  card_brand text null,
  card_last4 text null,
  bank text null,
  reference text null,
  amount numeric(14, 2) null,
  currency text null,
  created_at timestamptz not null default now(),
  constraint web_order_payment_attempts_concept_check check (concept in ('order', 'advance')),
  constraint web_order_payment_attempts_event_check
    check (event in ('link_created', 'pending', 'approved', 'declined', 'error', 'voided', 'expired')),
  constraint web_order_payment_attempts_reason_len check (reason is null or char_length(reason) <= 200),
  constraint web_order_payment_attempts_reason_code_len check (reason_code is null or char_length(reason_code) <= 80),
  constraint web_order_payment_attempts_method_len check (method is null or char_length(method) <= 40),
  constraint web_order_payment_attempts_brand_len check (card_brand is null or char_length(card_brand) <= 30),
  constraint web_order_payment_attempts_last4_check check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  constraint web_order_payment_attempts_bank_len check (bank is null or char_length(bank) <= 80),
  constraint web_order_payment_attempts_reference_len check (reference is null or char_length(reference) <= 120),
  constraint web_order_payment_attempts_gateway_len check (gateway is null or char_length(gateway) <= 40)
);

comment on table public.web_order_payment_attempts is
  'Intentos de pago de un pedido web (o de su anticipo): enlace creado, pendiente, aprobado, rechazado, error, anulado o vencido. Sin la respuesta completa de la pasarela. Escribe solo service_role.';

create index if not exists idx_web_order_payment_attempts_pedido
  on public.web_order_payment_attempts (web_order_id, created_at);
create index if not exists idx_web_order_payment_attempts_org
  on public.web_order_payment_attempts (organization_id, created_at desc);
-- Un aviso repetido (la pasarela reintenta, o webhook y /checkout/resultado ven la misma
-- transacción) no duplica el intento.
create unique index if not exists uq_web_order_payment_attempts_aviso
  on public.web_order_payment_attempts (web_order_id, concept, coalesce(gateway, ''), event, reference)
  where reference is not null and event not in ('link_created', 'expired');
-- Un pedido vence una sola vez (por concepto).
create unique index if not exists uq_web_order_payment_attempts_vencido
  on public.web_order_payment_attempts (web_order_id, concept)
  where event = 'expired';

alter table public.web_order_payment_attempts enable row level security;

drop policy if exists web_order_payment_attempts_select_org on public.web_order_payment_attempts;
create policy web_order_payment_attempts_select_org
  on public.web_order_payment_attempts
  for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active = true
    )
  );

revoke all on table public.web_order_payment_attempts from public, anon, authenticated;
grant select on table public.web_order_payment_attempts to authenticated;
grant all on table public.web_order_payment_attempts to service_role;

-- ── 2. Vencimiento: una sola regla ────────────────────────────────────────────────────────────
create or replace function public.fn_web_order_vence_pago_en(p_order public.web_orders, p_por_defecto integer)
returns timestamptz
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case
           -- Contraentrega con anticipo pendiente: vence a la hora límite del anticipo.
           when p_order.advance_status = 'pending' and p_order.advance_due_at is not null
             then p_order.advance_due_at
           else p_order.created_at + make_interval(
                  mins => public.fn_web_order_plazo_minutos(p_order.organization_id, p_order.payment_method, p_por_defecto)
                )
         end;
$function$;

revoke execute on function public.fn_web_order_vence_pago_en(public.web_orders, integer) from public, anon, authenticated;
grant execute on function public.fn_web_order_vence_pago_en(public.web_orders, integer) to service_role;

comment on function public.fn_web_order_vence_pago_en(public.web_orders, integer) is
  'Hora en que vence un pedido web sin pagar: advance_due_at con anticipo pendiente; si no, created_at + fn_web_order_plazo_minutos. La usa expire_pending_web_orders.';

create or replace function public.fn_web_order_vence_pago(p_order public.web_orders)
returns timestamptz
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.fn_web_order_vence_pago_en(p_order, 30);
$function$;

revoke execute on function public.fn_web_order_vence_pago(public.web_orders) from public, anon, authenticated;
grant execute on function public.fn_web_order_vence_pago(public.web_orders) to service_role;

comment on function public.fn_web_order_vence_pago(public.web_orders) is
  'fn_web_order_vence_pago_en con el plazo por defecto del cron (30 min).';

-- Código de pasarela normalizado ('bold', 'mercadopago', 'wompi'…) desde un código de método o de
-- conector. Sin pasarela conocida: el código tal cual (en minúsculas) o null.
create or replace function public.fn_web_order_pasarela_de_metodo(p_metodo text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case
           when nullif(btrim(coalesce(p_metodo, '')), '') is null then null
           when lower(btrim(p_metodo)) in ('mp', 'mercadopago', 'mercado_pago', 'mp_checkout') then 'mercadopago'
           when lower(btrim(p_metodo)) like 'bold%' then 'bold'
           when lower(btrim(p_metodo)) in ('wompi', 'wompi_co') then 'wompi'
           when lower(btrim(p_metodo)) in ('payu', 'payu_co') then 'payu'
           when lower(btrim(p_metodo)) in ('stripe', 'stripe_payments') then 'stripe'
           when lower(btrim(p_metodo)) in ('paypal', 'paypal_checkout') then 'paypal'
           else left(lower(btrim(p_metodo)), 40)
         end;
$function$;

revoke execute on function public.fn_web_order_pasarela_de_metodo(text) from public, anon;
grant execute on function public.fn_web_order_pasarela_de_metodo(text) to authenticated, service_role;

-- ── 3. Registrar un intento (tienda) ──────────────────────────────────────────────────────────
create or replace function public.fn_web_order_intento_registrar(
  p_organization_id integer,
  p_web_order_id uuid,
  p_concepto text,
  p_pasarela text,
  p_evento text,
  p_motivo text default null,
  p_codigo_motivo text default null,
  p_medio text default null,
  p_marca text default null,
  p_ultimos4 text default null,
  p_banco text default null,
  p_referencia text default null,
  p_monto numeric default null,
  p_moneda text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_concepto text := coalesce(nullif(btrim(coalesce(p_concepto, '')), ''), 'order');
  v_pasarela text := public.fn_web_order_pasarela_de_metodo(p_pasarela);
  v_evento text := lower(btrim(coalesce(p_evento, '')));
  v_ref text := left(nullif(btrim(coalesce(p_referencia, '')), ''), 120);
  v_ultimos4 text := nullif(btrim(coalesce(p_ultimos4, '')), '');
  v_id uuid;
begin
  if v_concepto not in ('order', 'advance') then
    return jsonb_build_object('ok', false, 'motivo', 'concepto_invalido');
  end if;
  if v_evento not in ('link_created', 'pending', 'approved', 'declined', 'error', 'voided', 'expired') then
    return jsonb_build_object('ok', false, 'motivo', 'evento_invalido');
  end if;
  -- El pedido tiene que ser de la organización que ya verificó la tienda (firma o host).
  if not exists (
    select 1 from public.web_orders w where w.id = p_web_order_id and w.organization_id = p_organization_id
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'pedido_no_encontrado');
  end if;
  if v_ultimos4 is not null and v_ultimos4 !~ '^[0-9]{4}$' then
    v_ultimos4 := null;
  end if;
  -- «Enlace de pago creado»: dos clics seguidos en «Pagar» no son dos intentos.
  if v_evento = 'link_created' and exists (
    select 1 from public.web_order_payment_attempts a
     where a.web_order_id = p_web_order_id and a.concept = v_concepto
       and a.event = 'link_created' and a.gateway is not distinct from v_pasarela
       and a.created_at > now() - interval '2 minutes'
  ) then
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;

  insert into public.web_order_payment_attempts (
    organization_id, web_order_id, concept, gateway, event, reason, reason_code, method,
    card_brand, card_last4, bank, reference, amount, currency
  ) values (
    p_organization_id, p_web_order_id, v_concepto, v_pasarela, v_evento,
    left(nullif(btrim(coalesce(p_motivo, '')), ''), 200),
    left(nullif(btrim(coalesce(p_codigo_motivo, '')), ''), 80),
    left(nullif(lower(btrim(coalesce(p_medio, ''))), ''), 40),
    left(nullif(lower(btrim(coalesce(p_marca, ''))), ''), 30),
    v_ultimos4,
    left(nullif(btrim(coalesce(p_banco, '')), ''), 80),
    v_ref,
    case when p_monto is null or p_monto < 0 then null else round(p_monto, 2) end,
    left(nullif(upper(btrim(coalesce(p_moneda, ''))), ''), 3)
  )
  on conflict do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'duplicado', v_id is null, 'id', v_id);
end;
$function$;

revoke execute on function public.fn_web_order_intento_registrar(integer, uuid, text, text, text, text, text, text, text, text, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.fn_web_order_intento_registrar(integer, uuid, text, text, text, text, text, text, text, text, text, text, numeric, text)
  to service_role;

comment on function public.fn_web_order_intento_registrar(integer, uuid, text, text, text, text, text, text, text, text, text, text, numeric, text) is
  'Registra un intento de pago de un pedido web (solo service_role: la tienda tras verificar firma u host). Idempotente por pedido, concepto, pasarela, evento y referencia.';

-- ── 4. Vencimiento: también los pendientes con pago rechazado; deja «Venció sin pagar» ──────────
CREATE OR REPLACE FUNCTION public.expire_pending_web_orders(p_expiration_minutes integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order record;
  v_expired integer := 0;
BEGIN
  FOR v_order IN
    SELECT
      w.id,
      w.organization_id,
      w.branch_id,
      w.order_number,
      w.payment_method,
      w.advance_gateway,
      w.total,
      w.advance_amount,
      (w.advance_status = 'pending' AND w.advance_due_at IS NOT NULL) AS por_anticipo
    FROM web_orders w
    WHERE w.status = 'pending'
      -- Un rechazo de la pasarela ya no cancela (2026-11-24): el pedido sigue «Pendiente» con
      -- payment_status 'failed' hasta que venza aquí.
      AND w.payment_status IN ('pending', 'failed')
      AND w.stock_released_at IS NULL
      -- Plazo único (fn_web_order_vence_pago_en): advance_due_at con anticipo pendiente; si no,
      -- configuración de la organización, 24 h para métodos sin pasarela, o el plazo del cron.
      AND public.fn_web_order_vence_pago_en(w, p_expiration_minutes) < now()
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    PERFORM release_stock_for_order(v_order.id);

    UPDATE web_orders
       SET status = 'expired',
           payment_status = 'failed',
           advance_status = CASE WHEN v_order.por_anticipo THEN 'expired' ELSE advance_status END,
           cancelled_at = now(),
           cancellation_reason = CASE WHEN v_order.por_anticipo THEN 'Anticipo sin pagar'
                                      ELSE 'Expirado por falta de pago' END
     WHERE id = v_order.id;

    -- Intento «Venció sin pagar» (ninguna pasarela avisa el vencimiento). Sin pasarela
    -- (transferencia, efectivo, método propio) no hay historial de intentos.
    IF v_order.por_anticipo
       OR NOT public.fn_web_order_metodo_nativo(v_order.organization_id, v_order.payment_method) THEN
      INSERT INTO public.web_order_payment_attempts (
        organization_id, web_order_id, concept, gateway, event, amount
      ) VALUES (
        v_order.organization_id, v_order.id,
        CASE WHEN v_order.por_anticipo THEN 'advance' ELSE 'order' END,
        -- La pasarela del último intento (el enlace que se creó); si no hubo, la del método.
        coalesce(
          (SELECT a.gateway FROM public.web_order_payment_attempts a
            WHERE a.web_order_id = v_order.id
              AND a.concept = CASE WHEN v_order.por_anticipo THEN 'advance' ELSE 'order' END
              AND a.gateway IS NOT NULL
            ORDER BY a.created_at DESC LIMIT 1),
          public.fn_web_order_pasarela_de_metodo(
            CASE WHEN v_order.por_anticipo THEN v_order.advance_gateway ELSE v_order.payment_method END)
        ),
        'expired',
        CASE WHEN v_order.por_anticipo THEN v_order.advance_amount ELSE v_order.total END
      )
      ON CONFLICT DO NOTHING;
    END IF;

    v_expired := v_expired + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'expired_count', v_expired);
END;
$function$;

-- ── 5. Listado: vencimiento e intentos de una página en una llamada ───────────────────────────
create or replace function public.fn_web_orders_resumen_pago(p_ids uuid[])
returns table (
  web_order_id uuid,
  vence_at timestamptz,
  plazo_minutos integer,
  intentos integer,
  ultimo_evento text,
  ultima_pasarela text,
  ultimo_motivo text,
  ultimo_codigo_motivo text,
  ultimo_medio text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select w.id,
         public.fn_web_order_vence_pago_en(w, 30),
         public.fn_web_order_plazo_minutos(w.organization_id, w.payment_method, 30),
         coalesce(c.intentos, 0),
         u.event, u.gateway, u.reason, u.reason_code, u.method
    from public.web_orders w
    left join lateral (
      select count(*)::integer as intentos
        from public.web_order_payment_attempts a
       where a.web_order_id = w.id and a.concept = 'order'
         and a.event in ('pending', 'approved', 'declined', 'error', 'voided')
    ) c on true
    left join lateral (
      select a.event, a.gateway, a.reason, a.reason_code, a.method
        from public.web_order_payment_attempts a
       where a.web_order_id = w.id and a.concept = 'order'
       order by a.created_at desc
       limit 1
    ) u on true
   where w.id = any((coalesce(p_ids, '{}'::uuid[]))[1:200])
     and w.organization_id in (
       select om.organization_id
         from public.organization_members om
        where om.user_id = (select auth.uid())
          and om.is_active = true
     );
$function$;

revoke execute on function public.fn_web_orders_resumen_pago(uuid[]) from public, anon;
grant execute on function public.fn_web_orders_resumen_pago(uuid[]) to authenticated, service_role;

comment on function public.fn_web_orders_resumen_pago(uuid[]) is
  'Vencimiento (misma regla de expire_pending_web_orders) e intentos de hasta 200 pedidos web de las organizaciones del usuario. Para la columna Pago y la tarjeta Pagos.';

-- ── 6. Backfill de avisos ya guardados (Bold y Wompi) ─────────────────────────────────────────
-- Bold: integration_events solo guarda avisos con firma verificada (la conexión que firmó).
insert into public.web_order_payment_attempts (
  organization_id, web_order_id, concept, gateway, event, method, card_brand, card_last4,
  reference, amount, currency, created_at
)
select w.organization_id, w.id, 'order', 'bold',
       case e.payload->>'type' when 'SALE_APPROVED' then 'approved' when 'SALE_REJECTED' then 'declined' else 'voided' end,
       case upper(coalesce(e.payload->'data'->>'payment_method', ''))
         when 'CARD_WEB' then 'card' when 'CARD' then 'card' when 'NEQUI' then 'nequi'
         when 'PSE' then 'pse' when 'QR' then 'qr' when 'DAVIPLATA' then 'daviplata'
         else nullif(left(lower(e.payload->'data'->>'payment_method'), 40), '') end,
       nullif(left(lower(e.payload->'data'->'card'->>'brand'), 30), ''),
       case when right(coalesce(e.payload->'data'->'card'->>'masked_pan', ''), 4) ~ '^[0-9]{4}$'
            then right(e.payload->'data'->'card'->>'masked_pan', 4) end,
       nullif(left(e.payload->'data'->>'payment_id', 120), ''),
       case when (e.payload->'data'->'amount'->>'total') ~ '^[0-9]+(\.[0-9]+)?$'
            then (e.payload->'data'->'amount'->>'total')::numeric end,
       left(coalesce(nullif(e.payload->'data'->'amount'->>'currency', ''), 'COP'), 3),
       e.created_at
  from public.integration_events e
  join public.web_orders w
    on w.organization_id = e.organization_id
   and w.order_number = e.payload->'data'->'metadata'->>'reference'
 where e.payload->>'provider' = 'bold'
   and e.payload->>'type' in ('SALE_APPROVED', 'SALE_REJECTED', 'VOID_APPROVED')
   and coalesce(e.payload->'data'->>'payment_id', '') <> ''
on conflict do nothing;

-- Wompi: solo avisos verificados (veredicto «match» registrado para esa transacción) o
-- procesados desde que la firma es obligatoria (último registro en observación: 2026-11-18).
with verificadas as (
  select distinct e.payload->>'transaction_id' as tx
    from public.integration_events e
   where e.payload->>'provider' = 'wompi' and e.payload->>'signature_verdict' = 'match'
),
avisos as (
  select distinct on (e.payload->'data'->'transaction'->>'id', e.payload->'data'->'transaction'->>'status')
         e.organization_id, e.created_at, e.payload->'data'->'transaction' as tx
    from public.integration_events e
   where e.payload->>'provider' = 'wompi'
     and jsonb_typeof(e.payload->'data'->'transaction') = 'object'
     and e.payload->'data'->'transaction'->>'status' in ('APPROVED', 'DECLINED', 'ERROR', 'VOIDED', 'PENDING')
     and (
       (e.payload->'data'->'transaction'->>'id') in (select tx from verificadas)
       or (e.status = 'processed' and e.created_at > timestamptz '2026-11-18 15:48:35+00')
     )
   order by e.payload->'data'->'transaction'->>'id', e.payload->'data'->'transaction'->>'status', e.created_at
)
insert into public.web_order_payment_attempts (
  organization_id, web_order_id, concept, gateway, event, reason, method, card_brand, card_last4,
  bank, reference, amount, currency, created_at
)
select w.organization_id, w.id, 'order', 'wompi',
       case a.tx->>'status' when 'APPROVED' then 'approved' when 'DECLINED' then 'declined'
                            when 'ERROR' then 'error' when 'VOIDED' then 'voided' else 'pending' end,
       case when a.tx->>'status' in ('DECLINED', 'ERROR') then nullif(left(btrim(a.tx->>'status_message'), 200), '') end,
       nullif(left(lower(a.tx->>'payment_method_type'), 40), ''),
       nullif(left(lower(a.tx->'payment_method'->'extra'->>'brand'), 30), ''),
       case when coalesce(a.tx->'payment_method'->'extra'->>'last_four', '') ~ '^[0-9]{4}$'
            then a.tx->'payment_method'->'extra'->>'last_four' end,
       nullif(left(btrim(a.tx->'payment_method'->'extra'->>'financial_institution_name'), 80), ''),
       nullif(left(a.tx->>'id', 120), ''),
       case when (a.tx->>'amount_in_cents') ~ '^[0-9]+$' then (a.tx->>'amount_in_cents')::numeric / 100 end,
       left(coalesce(nullif(a.tx->>'currency', ''), 'COP'), 3),
       a.created_at
  from avisos a
  join public.web_orders w
    on w.organization_id = a.organization_id
   and w.order_number = a.tx->>'reference'
on conflict do nothing;
