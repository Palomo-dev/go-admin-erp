-- Inventario B4 · P9 (aprobado por el dueño): la garantía empieza al vender.
--
-- `serialTrackingService.createSerial` y `fn_producto_generar_seriales` fijaban
-- warranty_start/warranty_end el día de la recepción: 98 unidades que siguen en
-- bodega (93 en la org 133 y 5 en la org 143, todas `in_stock`, plazo 12
-- meses) ya consumían garantía antes de venderse (hallazgo D14 del plan).
--
-- Qué hace: a los seriales `in_stock` de esas dos organizaciones con garantía
-- corriendo les borra warranty_start y warranty_end. El plazo (warranty_months)
-- se conserva: la garantía se fijará desde la fecha de venta (disparador de
-- 20260929040200). Los vendidos no se tocan.
--
-- Rastro y reversión: por cada serial se deja un evento `warranty_reset` en
-- serial_tracking_events con las fechas anteriores en `metadata`; el rollback
-- las restaura desde ahí. Conteo antes/después con RAISE NOTICE; si después
-- queda alguna garantía corriendo en bodega en esas organizaciones, falla.
-- Idempotente: una segunda pasada no encuentra filas y no inserta nada.

do $$
declare
  v_antes integer;
  v_eventos integer;
  v_actualizados integer;
  v_despues integer;
begin
  select count(*) into v_antes
    from public.serial_numbers
   where organization_id in (133, 143)
     and status = 'in_stock'
     and (warranty_start is not null or warranty_end is not null);
  raise notice 'P9 antes: % seriales en bodega con garantía corriendo (orgs 133 y 143)', v_antes;

  insert into public.serial_tracking_events (
    serial_number_id, organization_id, event_type, from_status, to_status,
    from_branch_id, source_table, source_id, event_date, notes, metadata)
  select sn.id, sn.organization_id, 'warranty_reset', sn.status, sn.status,
         sn.current_branch_id, 'migration', '20260929040100', now(),
         'P9: la garantía empieza el día de la venta',
         jsonb_build_object('warranty_start_anterior', sn.warranty_start,
                            'warranty_end_anterior', sn.warranty_end,
                            'warranty_months', sn.warranty_months)
    from public.serial_numbers sn
   where sn.organization_id in (133, 143)
     and sn.status = 'in_stock'
     and (sn.warranty_start is not null or sn.warranty_end is not null);
  get diagnostics v_eventos = row_count;

  update public.serial_numbers
     set warranty_start = null, warranty_end = null, updated_at = now()
   where organization_id in (133, 143)
     and status = 'in_stock'
     and (warranty_start is not null or warranty_end is not null);
  get diagnostics v_actualizados = row_count;

  select count(*) into v_despues
    from public.serial_numbers
   where organization_id in (133, 143)
     and status = 'in_stock'
     and (warranty_start is not null or warranty_end is not null);

  raise notice 'P9 después: % eventos de rastro, % seriales reiniciados, % con garantía corriendo en bodega',
    v_eventos, v_actualizados, v_despues;

  if v_despues <> 0 or v_eventos <> v_actualizados then
    raise exception 'P9: conteo inesperado (eventos %, actualizados %, quedan %)', v_eventos, v_actualizados, v_despues;
  end if;
end;
$$;
