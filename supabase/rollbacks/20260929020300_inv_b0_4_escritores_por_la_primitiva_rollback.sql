-- Reversión de 20260929020300_inv_b0_4_escritores_por_la_primitiva.sql
--
-- Restaura, byte a byte, la definición que cada una de las 7 funciones tenía
-- justo antes de la migración. La migración la guardó en
-- private.respaldo_funciones (migracion = '20260929020300_inv_b0_4') junto con su
-- md5; aquí se comprueba el md5 y se ejecuta.
--
--   decrement_stock_on_sale, fn_stock_entrada, fn_stock_entrada_devolucion,
--   fn_register_stock_entry, fn_producto_int_ajustar_stock,
--   fn_kardex_entrada_compra_int, fn_void_purchase_invoice
--
-- Advertencia: si después de B0 otra sesión parchea alguna de estas funciones,
-- revertir aquí pisa su cambio; compararlo antes con pg_get_functiondef.
-- Los movimientos de kardex escritos mientras estuvo activa no se tocan.

do $$
declare
  r record;
begin
  if not exists (select 1 from private.respaldo_funciones where migracion = '20260929020300_inv_b0_4') then
    raise exception 'No hay respaldo de 20260929020300_inv_b0_4 en private.respaldo_funciones';
  end if;
  for r in select firma, definicion, md5 from private.respaldo_funciones where migracion = '20260929020300_inv_b0_4' loop
    if md5(r.definicion) <> r.md5 then
      raise exception 'El respaldo de % no coincide con su md5', r.firma;
    end if;
    execute r.definicion;
  end loop;
end $$;

revoke all on function public.decrement_stock_on_sale(integer, integer, integer, numeric, text, text, numeric, text, uuid) from anon, public;
revoke all on function public.fn_register_stock_entry(jsonb, text) from anon, public;
revoke all on function public.fn_void_purchase_invoice(uuid, text, uuid) from anon, public;
