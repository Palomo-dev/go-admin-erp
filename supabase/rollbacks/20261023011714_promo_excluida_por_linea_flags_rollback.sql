-- Revierte 20261023011714_promo_excluida_por_linea_flags.
--
-- Borra las columnas, el permiso pos.promotions.remove y las dos funciones
-- nuevas. Las filas que ya tenían promo_excluded pierden ese dato: no se
-- puede reconstruir.
--
-- Orden: primero el rollback de 20261023011739. Si pos_checkout_v1 todavía
-- llama a fn_pos_puede_quitar_promocion, este script se detiene.

do $$
begin
  if position('fn_pos_puede_quitar_promocion' in pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure)) > 0 then
    raise exception 'Revierte primero 20261023011739_promo_excluida_por_linea_funciones';
  end if;
end
$$;

drop function if exists public.pos_linea_excluir_promocion(uuid, boolean, text);
drop function if exists public.fn_pos_puede_quitar_promocion(integer, uuid);

alter table public.sale_items
  drop column if exists promo_excluded,
  drop column if exists promo_excluded_by,
  drop column if exists promo_excluded_at,
  drop column if exists promo_excluded_reason;

alter table public.web_order_items
  drop column if exists promo_excluded,
  drop column if exists promo_excluded_by,
  drop column if exists promo_excluded_at,
  drop column if exists promo_excluded_reason;

delete from public.role_permissions rp
 using public.permissions p
 where rp.permission_id = p.id
   and p.code = 'pos.promotions.remove';

delete from public.permissions where code = 'pos.promotions.remove';
