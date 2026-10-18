-- Rollback de pos_cocina_circulo_por_linea: devuelve pos_cocina_marcar_item a la
-- versión de 20261007173105 (un pendiente no se marca; responde comanda_sin_empezar).
-- No revierte filas que ya hayan pasado de pending a in_progress con el círculo nuevo.

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

revoke all on function public.pos_cocina_marcar_item(integer, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.pos_cocina_marcar_item(integer, uuid, integer, boolean) to service_role;
