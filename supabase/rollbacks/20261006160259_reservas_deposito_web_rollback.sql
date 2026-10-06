-- Rollback de 20261006160259_reservas_deposito_web (D7, depósito de reservas web).
--
-- Orden: primero el cron y las funciones (el sitio y el webhook caen a la vía
-- de siempre: `fn_reserva_mesa_crear_web` responde PGRST202 y el sitio llama a
-- `create_restaurant_reservation`), luego el aviso al equipo con su cuerpo
-- anterior EXACTO (leído por MCP el 2026-10-06) y al final índices y columnas.
--
-- NO revierte datos: se pierden el estado, el monto y la referencia de los
-- depósitos. Los pagos ya registrados en `payments` (source
-- `restaurant_reservation`) se conservan, y las reservas que estuvieran
-- `pending` esperando el pago quedan `pending` (el equipo las confirma o
-- cancela). Antes de revertir con depósitos vivos, consulta:
--   select id, status, deposit_status, deposit_amount from public.restaurant_reservations
--    where deposit_status is not null
-- y reembolsa o confirma a mano lo que corresponda.

select cron.unschedule(jobid) from cron.job where jobname = 'reservas-mesas-depositos-vencidos';

drop function if exists public.fn_reserva_mesa_deposito_reembolsar(uuid, text);
drop function if exists public.fn_reserva_mesa_deposito_resultado(integer, text, text, text, numeric, text, text, text, jsonb);
drop function if exists public.fn_reserva_mesa_crear_web(integer, date, time, integer, text, integer, text, text, text, text, boolean);
drop function if exists public.fn_reservas_mesa_liberar_depositos_vencidos(integer);
drop function if exists public.fn_reserva_mesa_deposito_cotizar(integer, integer, integer);
drop function if exists public.fn_reserva_mesa_deposito_calculo(integer, integer, integer);
drop function if exists public.fn_reserva_mesa_pasarela(integer);

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
                  || case when new.status = 'pending' then 'por confirmar' else 'confirmada' end;
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
      v_titulo := 'Reserva cancelada por el cliente · ' || coalesce(v_sede, 'Sede');
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

drop index if exists public.idx_restaurant_reservations_deposito_vence;
drop index if exists public.uq_restaurant_reservations_deposit_reference;

alter table public.restaurant_reservations
  drop column if exists deposit_refunded_at,
  drop column if exists deposit_payment_id,
  drop column if exists deposit_paid_at,
  drop column if exists deposit_transaction_id,
  drop column if exists deposit_gateway,
  drop column if exists deposit_refundable_until,
  drop column if exists deposit_status_on_paid,
  drop column if exists deposit_due_at,
  drop column if exists deposit_reference,
  drop column if exists deposit_currency,
  drop column if exists deposit_amount,
  drop column if exists deposit_status;

alter table public.restaurant_booking_settings
  drop column if exists deposit_refund_hours,
  drop column if exists deposit_refundable;
