-- Rollback de 20261122004635_pos_venta_reventa_de_devolucion.
--
-- Deshace el parche de pos_checkout_v1 con los reemplazos inversos (sobre la
-- definición viva; si ya no tiene el parche, no toca nada), quita
-- fn_venta_reventa_de, el índice y la columna sales.resale_of_return_id.
-- ADVERTENCIA: no revierte datos. Al borrar la columna se pierde qué venta
-- revendió qué devolución; las ventas siguen existiendo intactas.

do $deshacer$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1'::regproc);
  v_nuevo text;
begin
  if position('resale_of_return_id' in v_def) = 0 then
    return;
  end if;
  v_nuevo := replace(v_def, E'time_review_reason, resale_of_return_id\n      ) values (', E'time_review_reason\n      ) values (');
  v_nuevo := replace(v_nuevo,
    E'        v_revision,\n'
    || E'        -- Reventa de una devolución: solo si es de la organización y sigue procesada.\n'
    || E'        public.fn_venta_reventa_de(v_org, p_envelope)\n'
    || E'      ) returning * into v_sale;',
    E'        v_revision\n      ) returning * into v_sale;');
  if position('resale_of_return_id' in v_nuevo) > 0 or position('fn_venta_reventa_de' in v_nuevo) > 0 then
    raise exception 'pos_checkout_v1 cambió después del parche: revisar a mano antes de revertir';
  end if;
  execute v_nuevo;
end;
$deshacer$;

drop function if exists public.fn_venta_reventa_de(integer, jsonb);
drop index if exists public.idx_sales_resale_of_return_id;
alter table public.sales drop column if exists resale_of_return_id;
