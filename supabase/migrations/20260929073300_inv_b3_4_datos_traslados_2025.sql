-- Inventario B3 · Datos: los 3 traslados abiertos de julio de 2025 (org 2) se
-- cancelan con motivo, SIN mover stock (decisión P7 del dueño, 2026-09-28).
--
-- Antes (2026-09-29): org 2 tiene 5 traslados, todos de julio de 2025:
--   TR-0001 (id 1) pending · TR-0002 (id 2) pending · TR-0004 (id 4) in_transit
--   TR-0003 (id 3) y TR-0005 (id 5) received (con received_qty = 0; se dejan).
-- Los tres abiertos se crearon con el código anterior, que escribía salidas
-- `transfer` sin mover el saldo de forma coherente; no se reversan ni se crean
-- movimientos nuevos: solo se cierran para que dejen de figurar como abiertos.
-- Conteo esperado: abiertos 3 → 0; cancelados 0 → 3. Solo filas con id en
-- (1, 2, 4), organization_id = 2 y el estado de antes (idempotente).

do $datos$
declare
  v_antes integer;
  v_despues integer;
  v_n integer;
begin
  select count(*) into v_antes from public.inventory_transfers
   where organization_id = 2 and status in ('pending', 'in_transit') and created_at < timestamptz '2025-08-01';

  with cerrados as (
    update public.inventory_transfers t
       set status = 'cancelled',
           cancelled_at = now(),
           cancel_reason = 'Traslado de prueba abierto desde julio de 2025: se cancela sin mover existencias (decisión P7, 2026-09-28).',
           updated_at = now()
     where t.organization_id = 2
       and ((t.id in (1, 2) and t.status = 'pending') or (t.id = 4 and t.status = 'in_transit'))
       and t.created_at < timestamptz '2025-08-01'
    returning t.id, t.organization_id
  )
  insert into public.inventory_transfer_events (organization_id, transfer_id, tipo, detalle, created_by)
  select c.organization_id, c.id, 'cancelado',
         jsonb_build_object('limpieza', 'b3_2025', 'sin_mover_stock', true,
                            'motivo', 'Traslado de prueba abierto desde julio de 2025'), null
    from cerrados c;
  get diagnostics v_n = row_count;

  select count(*) into v_despues from public.inventory_transfers
   where organization_id = 2 and status in ('pending', 'in_transit') and created_at < timestamptz '2025-08-01';
  raise notice 'B3 datos 2025: abiertos antes %, cancelados ahora %, abiertos después %', v_antes, v_n, v_despues;
end;
$datos$;
