-- Reversión de 20261104022200_respaldos_publicos_con_rls: devuelve las tablas al estado anterior (sin RLS y con todos los permisos
-- para anon/authenticated). OJO: ese estado deja las tablas legibles y vaciables con la clave anon.
do $$
declare t text;
begin
  foreach t in array array[
    '_bk_20261027242000_cobros_pasarela', 'bak_cintura_338_20261103_product_costs', 'bak_cintura_338_20261103_product_prices',
    'bak_cintura_338_20261103_product_variant_relations', 'bak_cintura_338_20261103_products', 'bak_cintura_338_20261103_stock_levels',
    'bak_completar_348_20261103_products', 'bak_placeholder_338_20261103', 'bak_variant_values_orden_20261103',
    'bak_variantes_333_20261103', 'bak_variantes_338_20261103', 'bak_variantes_340_20261103', 'bak_variantes_341_20261103',
    'bak_variantes_342_20261103', 'bak_variantes_345_20261103', 'bak_variantes_346_20261103', 'bak_variantes_347_20261103',
    'bak_variantes_348_20261103', 'bak_variantes_349_20261103', 'bk_20261027246000_reservas_cancelados',
    'centro_costo_modo_respaldo', 'correccion_flujo_config_respaldo', 'correccion_flujo_cuenta_respaldo',
    'correccion_flujo_funcion_respaldo', 'correccion_flujo_nombre_respaldo', 'correccion_flujo_regla_respaldo',
    'puc_centro_costo_respaldo', 'regla_contable_respaldo', 'sobrante_funcion_respaldo', 'sobrante_linea_respaldo'
  ] loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('grant all on public.%I to anon, authenticated', t);
      execute format('alter table public.%I disable row level security', t);
    end if;
  end loop;
end $$;
