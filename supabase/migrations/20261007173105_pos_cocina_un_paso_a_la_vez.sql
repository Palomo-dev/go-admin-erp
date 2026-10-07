-- Comandas: un paso a la vez (Nuevas → En preparación → Listas para servir → Entregadas).
--
-- Causa del salto reportado (org 140, comanda de la Carta QR): la tarjeta en
-- «Nuevas» dejaba tocar el círculo del ítem, que llama pos_cocina_marcar_item
-- con hecho = true. Un ítem `pending` pasaba directo a `ready` y, en una
-- comanda de una sola línea, fn_pos_cocina_estado_derivado la dejaba `ready`
-- sin pasar por `preparing` (y el trigger fn_comanda_web_avanza_pedido llevaba
-- el pedido web de `confirmed` a `ready`). La pantalla ya no lo ofrece; esta
-- migración hace que la base tampoco lo acepte, venga de donde venga:
--
-- 1. pos_cocina_marcar_item: un ítem `pending` no se marca hecho
--    (`comanda_sin_empezar`). Deshacer un hecho (`ready` → `in_progress`) sigue igual.
-- 2. pos_cocina_cambiar_estado: «Marcar lista» exige que la estación (o la
--    comanda, sin estación) haya empezado: si todos sus ítems vivos siguen
--    `pending`, `comanda_sin_empezar`.
--
-- Solo cambia el cuerpo de dos funciones (CREATE OR REPLACE): sin cambios de
-- esquema ni de datos. Permisos: solo service_role, como antes.

create or replace function public.pos_cocina_marcar_item(p_organization_id integer, p_actor uuid, p_item_id integer, p_hecho boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_it public.kitchen_ticket_items%rowtype;
  v_kt public.kitchen_tickets%rowtype;
begin
  if not public.fn_pos_cocina_puede(p_organization_id, p_actor, 'operar') then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  select i.* into v_it from public.kitchen_ticket_items i
   where i.id = p_item_id and i.organization_id = p_organization_id;
  if not found then
    raise exception 'linea_no_encontrada' using errcode = 'P0002';
  end if;
  select * into v_kt from public.kitchen_tickets where id = v_it.kitchen_ticket_id for update;
  if v_kt.status = 'cancelled' or v_it.status in ('cancelled', 'delivered') then
    raise exception 'comanda_cancelada' using errcode = 'P0001';
  end if;
  if v_kt.has_allergy and v_kt.allergy_ack_at is null then
    raise exception 'alergia_sin_confirmar' using errcode = 'P0001';
  end if;
  -- Un paso a la vez: lo que la estación no ha empezado no se marca hecho.
  if coalesce(p_hecho, true) and v_it.status = 'pending' then
    raise exception 'comanda_sin_empezar' using errcode = 'P0001';
  end if;

  if coalesce(p_hecho, true) then
    if v_it.status <> 'ready' then
      update public.kitchen_ticket_items
         set status = 'ready', started_at = coalesce(started_at, now()), ready_at = now(), updated_at = now()
       where id = v_it.id;
      insert into public.kitchen_ticket_events (organization_id, kitchen_ticket_id, kitchen_ticket_item_id, station, event, actor_id)
      values (p_organization_id, v_kt.id, v_it.id, v_it.station, 'item_hecho', p_actor);
    end if;
  else
    if v_it.status = 'ready' then
      update public.kitchen_ticket_items
         set status = 'in_progress', ready_at = null, updated_at = now()
       where id = v_it.id;
      insert into public.kitchen_ticket_events (organization_id, kitchen_ticket_id, kitchen_ticket_item_id, station, event, actor_id)
      values (p_organization_id, v_kt.id, v_it.id, v_it.station, 'item_deshecho', p_actor);
    end if;
  end if;

  v_kt := public.fn_pos_cocina_aplicar_derivado(v_kt.id);
  return jsonb_build_object('ticket_id', v_kt.id, 'status', v_kt.status, 'ready_at', v_kt.ready_at,
                            'item_id', v_it.id, 'hecho', coalesce(p_hecho, true));
end;
$function$;

create or replace function public.pos_cocina_cambiar_estado(p_organization_id integer, p_actor uuid, p_ticket_id integer, p_station text, p_estado text, p_motivo text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_kt public.kitchen_tickets%rowtype;
  v_n integer := 0;
  v_ready_antes timestamptz;
  v_evento text;
begin
  if p_estado not in ('new', 'preparing', 'ready', 'delivered') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if not public.fn_pos_cocina_puede(p_organization_id, p_actor, case when p_estado = 'new' then 'gestionar' else 'operar' end) then
    raise exception 'sin_membresia' using errcode = '42501';
  end if;
  select * into v_kt from public.kitchen_tickets
   where id = p_ticket_id and organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'comanda_no_encontrada' using errcode = 'P0002';
  end if;
  if v_kt.status = 'cancelled' then
    raise exception 'comanda_cancelada' using errcode = 'P0001';
  end if;
  if p_estado in ('preparing', 'ready') and v_kt.has_allergy and v_kt.allergy_ack_at is null then
    raise exception 'alergia_sin_confirmar' using errcode = 'P0001';
  end if;
  -- Un paso a la vez: «Marcar lista» solo sobre lo que ya se empezó.
  if p_estado = 'ready'
     and exists (select 1 from public.kitchen_ticket_items
                  where kitchen_ticket_id = v_kt.id and status = 'pending'
                    and (p_station is null or coalesce(station, '') = p_station))
     and not exists (select 1 from public.kitchen_ticket_items
                      where kitchen_ticket_id = v_kt.id and status in ('in_progress', 'ready', 'delivered')
                        and (p_station is null or coalesce(station, '') = p_station)) then
    raise exception 'comanda_sin_empezar' using errcode = 'P0001';
  end if;
  v_ready_antes := v_kt.ready_at;

  if p_estado = 'preparing' then
    update public.kitchen_ticket_items
       set status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now()
     where kitchen_ticket_id = v_kt.id and status = 'pending'
       and (p_station is null or coalesce(station, '') = p_station);
    get diagnostics v_n = row_count;
    v_evento := 'empezada';
  elsif p_estado = 'ready' then
    update public.kitchen_ticket_items
       set status = 'ready', started_at = coalesce(started_at, now()), ready_at = coalesce(ready_at, now()), updated_at = now()
     where kitchen_ticket_id = v_kt.id and status in ('pending', 'in_progress')
       and (p_station is null or coalesce(station, '') = p_station);
    get diagnostics v_n = row_count;
    v_evento := 'lista';
  elsif p_estado = 'delivered' then
    update public.kitchen_ticket_items
       set status = 'delivered', updated_at = now()
     where kitchen_ticket_id = v_kt.id and status not in ('cancelled', 'delivered');
    get diagnostics v_n = row_count;
    update public.kitchen_tickets
       set status = 'delivered', ready_at = coalesce(ready_at, now()), updated_at = now()
     where id = v_kt.id and status <> 'delivered';
    v_evento := 'entregada';
  else
    update public.kitchen_ticket_items
       set status = 'pending', ready_at = null, updated_at = now()
     where kitchen_ticket_id = v_kt.id and status in ('in_progress', 'ready', 'delivered')
       and (p_station is null or coalesce(station, '') = p_station);
    get diagnostics v_n = row_count;
    v_evento := 'devuelta';
  end if;

  if p_estado <> 'delivered' then
    v_kt := public.fn_pos_cocina_aplicar_derivado(v_kt.id);
  else
    select * into v_kt from public.kitchen_tickets where id = p_ticket_id;
  end if;

  if v_n > 0 then
    insert into public.kitchen_ticket_events (organization_id, kitchen_ticket_id, station, event, actor_id, detail)
    values (p_organization_id, v_kt.id, p_station, v_evento, p_actor,
            jsonb_build_object('items', v_n, 'motivo', nullif(btrim(coalesce(p_motivo, '')), ''),
                               'ready_at_anterior', case when v_evento = 'devuelta' then v_ready_antes end));
  end if;

  return jsonb_build_object('ticket_id', v_kt.id, 'status', v_kt.status, 'started_at', v_kt.started_at,
                            'ready_at', v_kt.ready_at, 'items_cambiados', v_n);
end;
$function$;

revoke all on function public.pos_cocina_marcar_item(integer, uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.pos_cocina_cambiar_estado(integer, uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.pos_cocina_marcar_item(integer, uuid, integer, boolean) to service_role;
grant execute on function public.pos_cocina_cambiar_estado(integer, uuid, integer, text, text, text) to service_role;
