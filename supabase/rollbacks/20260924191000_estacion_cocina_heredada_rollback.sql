-- Rollback de 20260924191000_estacion_cocina_heredada.sql
--
-- Restaura products.station desde el respaldo SOLO donde sigue en NULL (si
-- alguien eligió después una estación propia, se respeta), vuelve a copiar la
-- estación del padre al crear variantes y quita las funciones de estación
-- efectiva. El frontend que las llama (printJobsService, webOrderConfirmation)
-- debe revertirse en el mismo paso. El respaldo se conserva: bórralo a mano
-- cuando ya no haga falta (drop table private.respaldo_estacion_productos_20260924).

update public.products p
   set station = r.station
  from private.respaldo_estacion_productos_20260924 r
 where r.product_id = p.id
   and p.station is null;

do $$
declare
  v_def text := pg_get_functiondef('public.fn_producto_int_variante_guardar(integer, integer, jsonb, boolean)'::regprocedure);
  v_actual constant text := 'v_parent.unit_code, v_parent.product_type, null, v_parent.brand';
  v_original constant text := 'v_parent.unit_code, v_parent.product_type, v_parent.station, v_parent.brand';
begin
  if position(v_actual in v_def) > 0 then
    execute replace(v_def, v_actual, v_original);
  end if;
end;
$$;

comment on column public.products.station is null;
drop function if exists public.fn_estaciones_efectivas(integer, integer[]);
drop function if exists public.fn_estacion_efectiva(integer);
