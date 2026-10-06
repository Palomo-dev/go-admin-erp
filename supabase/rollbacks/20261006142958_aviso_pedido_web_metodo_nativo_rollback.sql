-- Reversión de 20261006142958_aviso_pedido_web_metodo_nativo.sql
-- Restaura el aviso solo para cash/transfer, el WHEN del disparador y el plazo
-- de expiración anterior. No toca datos: los avisos ya creados se quedan.
set lock_timeout = '5s';

create or replace function public.fn_notify_web_order_created()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
$function$;

create or replace trigger trg_notify_web_order_created_ins
  after insert on public.web_orders
  for each row
  when (new.payment_method = any (array['cash'::text, 'transfer'::text]))
  execute function public.fn_notify_web_order_created();

create or replace function public.expire_pending_web_orders(p_expiration_minutes integer default 30)
returns jsonb
language plpgsql
security definer
as $function$
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
      w.payment_method
    FROM web_orders w
    LEFT JOIN LATERAL (
      SELECT settings
      FROM organization_settings
      WHERE organization_id = w.organization_id
        AND key = 'web_commerce'
      LIMIT 1
    ) os ON true
    WHERE w.status = 'pending'
      AND w.payment_status = 'pending'
      AND w.stock_released_at IS NULL
      AND w.created_at < now() - (
        COALESCE(
          NULLIF(
            (os.settings->>'order_expiration_minutes')::integer,
            0
          ),
          CASE
            WHEN w.payment_method IN ('transfer','cash','bancolombia_transfer','bancolombia_collect','pse')
              THEN 1440
            ELSE p_expiration_minutes
          END
        ) || ' minutes'
      )::interval
    ORDER BY w.created_at ASC
    FOR UPDATE OF w SKIP LOCKED
  LOOP
    PERFORM release_stock_for_order(v_order.id);

    UPDATE web_orders
       SET status = 'expired',
           payment_status = 'failed',
           cancelled_at = now(),
           cancellation_reason = 'Expirado por falta de pago'
     WHERE id = v_order.id;

    v_expired := v_expired + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'expired_count', v_expired);
END;
$function$;

drop function if exists public.fn_web_order_metodo_nativo(integer, text);
