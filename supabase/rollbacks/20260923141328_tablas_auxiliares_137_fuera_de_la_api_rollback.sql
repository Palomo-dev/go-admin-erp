-- Rollback de tablas_auxiliares_137_fuera_de_la_api: devuelve los GRANT
-- (ALL para anon y authenticated, como estaban) y desactiva la RLS. Reabre el
-- agujero: anon vuelve a leer y borrar estas tablas por PostgREST. No toca datos.

set local lock_timeout = '3s';

do $$
declare
  t text;
begin
  foreach t in array array[
    '_afectados_sufijos_137',
    '_bkp_sueltos_nike_137',
    '_bkp_tallas_co_137',
    '_bkp_tallas_co_137_padres',
    '_bkp_tallas_co_137_stock',
    '_bkp_variant_values_137',
    '_map_sufijos_137',
    '_map_tallas_co_137',
    '_nuevas_tallas_137',
    '_plan_ropa_137',
    '_plan_sueltos_137'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('grant all on public.%I to anon, authenticated', t);
      execute format('alter table public.%I disable row level security', t);
    end if;
  end loop;
end $$;
