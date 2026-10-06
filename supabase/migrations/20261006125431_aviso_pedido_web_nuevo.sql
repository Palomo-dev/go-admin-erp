-- ⚠️ SIN APLICAR (2026-10-07). Paquete E · E6 — el equipo se entera de un pedido web nuevo aunque
-- no tenga abierta la pantalla Pedidos online. Requiere E1 (columna
-- restaurant_table_id, para el texto «Comer aquí · Mesa N»).
--
-- ENSAYO (2026-10-07, bloque `do` que aplica E1 (CHECK y columna) y esta
-- migración, inserta pedidos como `service_role` (lo que hace el sitio) en la
-- org 140 y se deshace con `raise exception`; los `drop trigger if exists` se
-- omitieron porque no existen y el MCP se cuelga con ellos):
--   ENSAYO_OK efectivo=1 [Nuevo pedido web WO-ENSAYO-E6A · Recoger] |
--   pasarela_pendiente=0 | pasarela_pagada=1 | repagado_no_duplica=1 |
--   comer_aqui=1 [Nuevo pedido web WO-ENSAYO-E6C · Comer aquí · Mesa 4]
--   href_ok=t
--   Segundo ensayo, con `body` para el push:
--   ENSAYO_OK_PUSH efectivo=1 [Nuevo pedido web WO-ENSAYO-E6A · Recoger]
--   body_ok=t | pasarela_pendiente=0 | pasarela_pagada=1
--
--   Tercer ensayo (2026-10-06, tras la revisión: total sin «$» fijo ni
--   decimales, moneda de la organización y datos para que la campana arme su
--   texto traducido; E1 (columna) y esta función, deshecho con `raise exception`):
--   ENSAYO_OK notificaciones=1 title=[Nuevo pedido web ENS-E6-A · Recoger]
--   content=[Total COP 30,000 · <sede>] body=[igual] currency=COP total=30000.00
--   branch_name_ok=t table_name=null
--   (antes: «Total $30000.00», con signo de peso fijo para cualquier moneda).
--   La campana (useNotificacionesHeader) muestra «Nuevo pedido web W-… ·
--   Recoger» y el total con la moneda y el formato del idioma, desde
--   `total`, `currency`, `branch_name` y `table_name`; el texto de la base
--   queda para el push.
--
-- Problema: el único aviso de un pedido web era la suscripción realtime de la
-- pantalla POS › Pedidos online. Con la pantalla cerrada, nadie se enteraba
-- (salvo la notificación genérica «Pago registrado» de los pagados en línea).
--
-- Qué hace: `fn_notify_web_order_created()` crea UNA notificación de la
-- organización (recipient NULL, como fn_notify_payment_registered y el aviso
-- de reservas D3) en la campana, canal 'app' (el CHECK de notifications no
-- admite 'in_app'), tipo `web_order_created`, título «Nuevo pedido web <n> ·
-- Recoger|Domicilio|Comer aquí · Mesa N», contenido con total y sede, y en el
-- payload order_id, order_number, branch_id, delivery_type, total y href a
-- /app/pos/pedidos-online/<id>. Dos disparos, para no avisar de pedidos que
-- nunca se pagan (≈5.250 pedidos de pasarela expiraron sin pagar):
--   1. AFTER INSERT con método manual (cash, transfer): se paga en el local.
--   2. AFTER UPDATE OF payment_status cuando un pago de pasarela pasa a 'paid'.
-- Idempotente: NOT EXISTS sobre notifications (organización + tipo +
-- order_id), así un pedido no avisa dos veces. Un fallo del aviso NUNCA tumba
-- el pedido (bloque exception): el sitio inserta con service role y el pedido
-- es dinero.
--
-- Volumen medido por MCP (2026-10-07, últimos 30 días, todas las
-- organizaciones): 12,17 pedidos/día pagados por pasarela + 0,03/día manuales
-- ≈ 12 notificaciones/día en total; la organización con más pedidos, ≈4,6/día.
-- No hay backfill: solo avisa de pedidos nuevos desde que se aplique.

create or replace function public.fn_notify_web_order_created()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  v_tipo text;
  v_sede text;
  v_mesa text;
  v_moneda text;
  v_total text;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.payment_method, '') not in ('cash', 'transfer') then
      return new;
    end if;
  elsif not (new.payment_status = 'paid' and old.payment_status is distinct from 'paid'
             and coalesce(new.payment_method, '') not in ('cash', 'transfer')) then
    return new;
  end if;
  if new.status in ('cancelled', 'rejected', 'expired', 'refunded') then
    return new;
  end if;

  begin
    if exists (
      select 1 from public.notifications n
       where n.organization_id = new.organization_id
         and n.payload->>'type' = 'web_order_created'
         and n.payload->>'order_id' = new.id::text
    ) then
      return new;
    end if;

    select b.name into v_sede from public.branches b where b.id = new.branch_id;
    if new.restaurant_table_id is not null then
      select rt.name into v_mesa from public.restaurant_tables rt where rt.id = new.restaurant_table_id;
    end if;
    -- Moneda base de la organización (la misma cadena que resolveOrgCurrency:
    -- organization_currencies is_base) y total sin decimales para el push. La
    -- campana arma su propio texto con `total` y `currency` del payload.
    select oc.currency_code into v_moneda
      from public.organization_currencies oc
     where oc.organization_id = new.organization_id
     order by oc.is_base desc, oc.currency_code
     limit 1;
    v_total := coalesce(v_moneda || ' ', '') || to_char(round(coalesce(new.total, 0))::bigint, 'FM999,999,999,990');
    v_tipo := case new.delivery_type
                when 'pickup' then 'Recoger'
                when 'delivery_own' then 'Domicilio'
                when 'delivery_third_party' then 'Domicilio'
                when 'dine_in' then 'Comer aquí' || coalesce(' · ' || v_mesa, '')
                else coalesce(new.delivery_type, '')
              end;

    insert into public.notifications (organization_id, recipient_user_id, channel, status, payload)
    values (new.organization_id, null, 'app', 'pending',
            jsonb_build_object(
              'type', 'web_order_created',
              'title', 'Nuevo pedido web ' || new.order_number || ' · ' || v_tipo,
              'content', 'Total ' || v_total || coalesce(' · ' || v_sede, ''),
              -- La Edge Function push lee `body` (supabase/functions/push/index.ts).
              'body', 'Total ' || v_total || coalesce(' · ' || v_sede, ''),
              'currency', v_moneda,
              'branch_name', v_sede,
              'table_name', v_mesa,
              'order_id', new.id::text,
              'order_number', new.order_number,
              'branch_id', new.branch_id,
              'delivery_type', new.delivery_type,
              'total', coalesce(new.total, 0),
              'href', '/app/pos/pedidos-online/' || new.id::text));
  exception when others then
    raise warning 'fn_notify_web_order_created: %', sqlerrm;
  end;
  return new;
end;
$f$;

revoke all on function public.fn_notify_web_order_created() from public, anon, authenticated;

drop trigger if exists trg_notify_web_order_created_ins on public.web_orders;
create trigger trg_notify_web_order_created_ins
  after insert on public.web_orders
  for each row
  when (new.payment_method in ('cash', 'transfer'))
  execute function public.fn_notify_web_order_created();

drop trigger if exists trg_notify_web_order_created_pago on public.web_orders;
create trigger trg_notify_web_order_created_pago
  after update of payment_status on public.web_orders
  for each row
  when (new.payment_status = 'paid' and old.payment_status is distinct from 'paid')
  execute function public.fn_notify_web_order_created();
