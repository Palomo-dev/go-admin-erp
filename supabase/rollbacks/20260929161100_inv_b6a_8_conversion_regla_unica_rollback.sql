-- Reversión de 20260929161100_inv_b6a_8_conversion_regla_unica.sql
-- Restaura exactas `fn_receta_int_calcular` y `fn_producto_produccion_resumen`
-- desde private.respaldo_funciones (si alguien las cambió después, se pierde
-- ese cambio: revisar antes) y la `fn_receta_int_factor` de 3 argumentos.

set local lock_timeout = '5s';

do $$
declare
  r record;
begin
  for r in select definicion from private.respaldo_funciones
            where migracion = 'inv_b6a_8_conversion_regla_unica' order by guardado_en loop
    execute r.definicion;
  end loop;
end;
$$;

create or replace function public.fn_receta_int_factor(p_org integer, p_de text, p_a text)
returns numeric
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when upper(btrim(coalesce(p_de, ''))) = upper(btrim(coalesce(p_a, ''))) then 1::numeric
    else coalesce(
      (select uc.factor from public.unit_conversions uc
        where upper(btrim(uc.from_unit_code)) = upper(btrim(p_de))
          and upper(btrim(uc.to_unit_code)) = upper(btrim(p_a))
          and uc.factor > 0
          and (uc.organization_id = p_org or uc.organization_id is null)
        order by uc.organization_id nulls last, uc.id
        limit 1),
      (select 1 / uc.factor from public.unit_conversions uc
        where upper(btrim(uc.from_unit_code)) = upper(btrim(p_a))
          and upper(btrim(uc.to_unit_code)) = upper(btrim(p_de))
          and uc.factor > 0
          and (uc.organization_id = p_org or uc.organization_id is null)
        order by uc.organization_id nulls last, uc.id
        limit 1))
  end;
$function$;

drop function if exists public.fn_receta_int_factor(integer, text, text, integer);
drop function if exists public.fn_unidad_factor(integer, text, text, integer);

delete from private.respaldo_funciones where migracion = 'inv_b6a_8_conversion_regla_unica';
