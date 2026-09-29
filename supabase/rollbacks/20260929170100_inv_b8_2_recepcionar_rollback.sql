-- Reversión de 20260929170100_inv_b8_2_recepcionar.sql.
-- Revertir antes que 20260929170000_inv_b8_1_recepciones_esquema.
-- Deja la recepción de OC sin RPC (la pantalla fallaría: volver también el código
-- de src/ al commit anterior a B8). Las recepciones ya hechas, su kardex, lotes,
-- seriales y facturas no se tocan.

-- 1. fn_kardex_entrada_compra_int y fn_factura_compra_desde_oc: definición exacta
--    anterior, guardada al aplicar la migración.
do $$
declare
  v_fila record;
begin
  for v_fila in
    select firma, definicion from private.respaldo_funciones
     where migracion = '20260929170100_inv_b8_2'
  loop
    execute v_fila.definicion;
  end loop;
end $$;

revoke all on function public.fn_kardex_entrada_compra_int(integer, integer, text, text, jsonb, uuid, integer, boolean)
  from public, anon, authenticated;

-- 2. Funciones nuevas.
drop function if exists public.fn_oc_recepcionar(integer, uuid, jsonb, text, text);
drop function if exists public.fn_fc_int_desde_oc(uuid);

delete from private.respaldo_funciones where migracion = '20260929170100_inv_b8_2';
