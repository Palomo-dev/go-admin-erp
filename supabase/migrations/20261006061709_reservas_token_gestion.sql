-- Aplicada por MCP el 2026-10-06 (reensayo con el sitio en producción be7e3a5 y el ERP 995026ed: ENSAYO_OK). Paquete D · D2 — enlace seguro para gestionar la reserva de mesa.
--
-- ENSAYO (2026-10-07, bloque `do` que aplica esta migración, prueba y se
-- deshace con `raise exception`, vía execute_sql, org 140 sede 115):
--   ENSAYO_OK filas_antes=0 token_no_nulo=t org_ajena=[P0002 Reserva no encontrada]
--   token_falso=[P0002 Reserva no encontrada] anon=[42501 permission denied for
--   function cancel_restaurant_reservation_by_token] authenticated=[42501 permission
--   denied ...] propia=cancelled estado=cancelled
--
-- Problema: el cliente no tenía cómo consultar ni cancelar su reserva. El sitio
-- solo conocía el id (o sus 8 primeros caracteres, adivinables) y la RPC
-- `cancel_restaurant_reservation` no comprueba la organización.
--
-- Qué hace:
-- 1. `restaurant_reservations.manage_token uuid NOT NULL DEFAULT gen_random_uuid()`
--    con índice único. El default es volátil: Postgres reescribe la tabla al
--    añadir la columna. Medido antes de escribir esto: la tabla tiene 0 filas
--    (2026-10-07), así que la reescritura es inmediata.
-- 2. `cancel_restaurant_reservation_by_token(p_token, p_organization_id, p_reason)`:
--    busca la reserva por token Y organización (la del host del sitio) y delega
--    en `cancel_restaurant_reservation`, la única que sabe las reglas de plazo.
--    Solo `service_role` (el sitio la llama con el cliente admin).
--
-- Es aditiva. El sitio lee la reserva por token con service role filtrando
-- `organization_id` (la del host): no hace falta otra RPC de lectura.
-- Va ANTES de D1 (20261007100100): `create_restaurant_reservation` de D1
-- devuelve `manage_token`.

alter table public.restaurant_reservations
  add column if not exists manage_token uuid not null default gen_random_uuid();

create unique index if not exists idx_restaurant_reservations_manage_token
  on public.restaurant_reservations (manage_token);

comment on column public.restaurant_reservations.manage_token is
  'Token opaco del enlace «Consultar o cancelar» que recibe el cliente. Nunca se muestra en el ERP.';

create or replace function public.cancel_restaurant_reservation_by_token(
  p_token uuid,
  p_organization_id integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  if p_token is null or p_organization_id is null then
    raise exception 'Reserva no encontrada' using errcode = 'P0002';
  end if;

  select r.id into v_id
    from public.restaurant_reservations r
   where r.manage_token = p_token
     and r.organization_id = p_organization_id;

  if v_id is null then
    raise exception 'Reserva no encontrada' using errcode = 'P0002';
  end if;

  -- Una sola implementación de las reglas de cancelación.
  return public.cancel_restaurant_reservation(p_reservation_id => v_id, p_reason => left(p_reason, 500));
end;
$function$;

comment on function public.cancel_restaurant_reservation_by_token(uuid, integer, text) is
  'Cancela una reserva de mesa desde el enlace del cliente: token + organización del host. Delega en cancel_restaurant_reservation.';

revoke all on function public.cancel_restaurant_reservation_by_token(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.cancel_restaurant_reservation_by_token(uuid, integer, text) to service_role;
