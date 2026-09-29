-- Inventario B3 · Integridad: un traslado despachado solo cambia por sus RPC.
--
-- Hallazgo de la revisión de seguridad (2026-09-29): la RLS de
-- inventory_transfers y transfer_items sigue siendo FOR ALL por pertenencia
-- (la cierra B10; assistant_create_transfer inserta como invocador y el
-- «deshacer» del GO Assistant cancela un pendiente con UPDATE). Con eso, un
-- miembro podía, desde el navegador, subir la cantidad de un renglón ya
-- despachado (o insertar uno nuevo en un traslado en tránsito) y luego
-- recibirlo: entraba al destino lo que nunca salió del origen.
--
-- Guardia (sin tocar la RLS ni los permisos): cuando quien escribe es
-- `authenticated`/`anon` directamente (no dentro de una RPC SECURITY DEFINER,
-- donde current_user es el dueño), solo se permite lo que ya hacían esos
-- caminos legítimos:
-- * inventory_transfers: insertar un traslado PENDIENTE; pasar un pendiente a
--   cancelado (y tocar su nota) sin cambiar nada más; borrar un pendiente.
-- * transfer_items: crear, cambiar o borrar renglones solo de un traslado
--   PENDIENTE y sin recibido/faltante/devuelto.
-- Todo lo demás (despachar, recibir, devolver, cambiar cantidades de algo en
-- tránsito) responde 42501 `traslado_solo_por_rpc`.

create or replace function public.fn_traslado_int_guardia()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_estado text;
  v_libres text[] := array['status', 'updated_at', 'notes', 'cancelled_at', 'cancelled_by', 'cancel_reason'];
begin
  -- Dentro de una RPC DEFINER current_user es su dueño: esas validan por sí mismas.
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'inventory_transfers' then
    if tg_op = 'INSERT' then
      if new.status is distinct from 'pending' or new.shipped_at is not null or new.received_at is not null then
        raise exception 'traslado_solo_por_rpc' using errcode = '42501';
      end if;
      return new;
    elsif tg_op = 'UPDATE' then
      if old.status = 'pending' and new.status in ('pending', 'cancelled')
         and (to_jsonb(new) - v_libres) = (to_jsonb(old) - v_libres) then
        return new;
      end if;
      raise exception 'traslado_solo_por_rpc' using errcode = '42501';
    else
      if old.status = 'pending' then
        return old;
      end if;
      raise exception 'traslado_solo_por_rpc' using errcode = '42501';
    end if;
  end if;

  -- transfer_items: solo renglones de un traslado pendiente y sin recepción.
  select t.status into v_estado from public.inventory_transfers t
   where t.id = coalesce(new.inventory_transfer_id, old.inventory_transfer_id);
  if v_estado is distinct from 'pending' then
    raise exception 'traslado_solo_por_rpc' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.inventory_transfer_id is distinct from new.inventory_transfer_id then
    raise exception 'traslado_solo_por_rpc' using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (
       coalesce(new.received_qty, 0) <> 0 or coalesce(new.missing_qty, 0) <> 0 or coalesce(new.returned_qty, 0) <> 0
       or coalesce(new.status, 'pending') <> 'pending' or new.unit_cost is not null or new.serial_ids is not null) then
    raise exception 'traslado_solo_por_rpc' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.fn_traslado_int_guardia() from public, anon, authenticated;

drop trigger if exists trg_traslado_guardia on public.inventory_transfers;
create trigger trg_traslado_guardia
  before insert or update or delete on public.inventory_transfers
  for each row execute function public.fn_traslado_int_guardia();

drop trigger if exists trg_traslado_renglon_guardia on public.transfer_items;
create trigger trg_traslado_renglon_guardia
  before insert or update or delete on public.transfer_items
  for each row execute function public.fn_traslado_int_guardia();
