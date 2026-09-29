-- Reversión de 20260929040100_inv_b4_garantias_reinicio_en_bodega.sql.
--
-- Restaura warranty_start/warranty_end desde el evento `warranty_reset` que
-- dejó la migración (metadata con las fechas anteriores) y borra esos eventos.
-- Solo toca seriales que sigan sin garantía (si ya se vendieron y la garantía
-- se fijó desde la venta, se respeta la de la venta).
--
-- Orden: revertir antes 20260929040200 (disparador «garantía desde la venta»);
-- si el disparador sigue activo, se desactiva durante la restauración porque
-- borraría de nuevo la garantía de un serial en bodega.

do $$
declare
  v_restaurados integer;
  v_con_disparador boolean := exists (
    select 1 from pg_trigger
     where tgrelid = 'public.serial_numbers'::regclass
       and tgname = 'trg_serial_garantia_desde_venta');
begin
  if v_con_disparador then
    execute 'alter table public.serial_numbers disable trigger trg_serial_garantia_desde_venta';
  end if;

  update public.serial_numbers sn
     set warranty_start = (e.metadata->>'warranty_start_anterior')::date,
         warranty_end   = (e.metadata->>'warranty_end_anterior')::date,
         updated_at     = now()
    from public.serial_tracking_events e
   where e.serial_number_id = sn.id
     and e.event_type = 'warranty_reset'
     and e.source_table = 'migration'
     and e.source_id = '20260929040100'
     and sn.warranty_start is null
     and sn.warranty_end is null;
  get diagnostics v_restaurados = row_count;

  delete from public.serial_tracking_events
   where event_type = 'warranty_reset'
     and source_table = 'migration'
     and source_id = '20260929040100';

  if v_con_disparador then
    execute 'alter table public.serial_numbers enable trigger trg_serial_garantia_desde_venta';
  end if;

  raise notice 'P9 revertido: % seriales con la garantía anterior', v_restaurados;
end;
$$;
