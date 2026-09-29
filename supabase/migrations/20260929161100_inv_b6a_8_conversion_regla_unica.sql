-- Inventario B6a · Conversiones: la regla única de conversión y la conversión
-- por producto en las recetas.
--
-- 1. `fn_unidad_factor(org, de, a, producto)`: la ÚNICA regla de conversión.
--    Gana la más específica: la del producto, luego la de la organización,
--    luego la del sistema; dentro de cada nivel, la directa antes que la
--    inversa (1 / factor). Antes (`fn_receta_int_factor`) una directa del
--    sistema ganaba a una inversa de la organización: con 1 PAQ = 6 UN propia y
--    el UN→PAQ = 0,1 del sistema, UN→PAQ salía 0,1 en vez de 1/6. Hoy hay 0
--    conversiones de organización, así que ningún resultado actual cambia.
-- 2. `fn_receta_int_factor(org, de, a)` conserva firma y contrato y delega en
--    la regla única (sin conversiones de producto, que no le corresponden). Nueva
--    sobrecarga con el producto; `fn_receta_int_calcular` (resolutor de B5) le
--    pasa el ingrediente: la conversión «solo este producto» vale para ese
--    ingrediente y no para otros. Parche sobre la definición viva por
--    marcador, con respaldo en `private.respaldo_funciones`.
-- 3. `fn_producto_produccion_resumen` (pestaña Producción › Unidades, B5):
--    lista solo las conversiones del sistema, de la organización y las del
--    propio producto (no las de otros productos), con alcance 'producto'.
--
-- Las RPC de la pantalla están en 20260929161200_inv_b6a_9_unidades_rpc.sql.

set local lock_timeout = '5s';

-- 1. Regla única ---------------------------------------------------------------
create or replace function public.fn_unidad_factor(p_org integer, p_de text, p_a text, p_producto integer default null)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when upper(btrim(coalesce(p_de, ''))) = upper(btrim(coalesce(p_a, ''))) then 1::numeric
    else (
      select x.f from (
        select uc.factor as f,
               case when uc.product_id is not null then 0 when uc.organization_id is not null then 1 else 2 end as nivel,
               0 as dir, uc.id
          from public.unit_conversions uc
         where upper(btrim(uc.from_unit_code)) = upper(btrim(p_de))
           and upper(btrim(uc.to_unit_code)) = upper(btrim(p_a))
           and uc.factor > 0
           and (uc.organization_id = p_org or uc.organization_id is null)
           and (uc.product_id is null or uc.product_id = p_producto)
        union all
        select 1 / uc.factor,
               case when uc.product_id is not null then 0 when uc.organization_id is not null then 1 else 2 end,
               1, uc.id
          from public.unit_conversions uc
         where upper(btrim(uc.from_unit_code)) = upper(btrim(p_a))
           and upper(btrim(uc.to_unit_code)) = upper(btrim(p_de))
           and uc.factor > 0
           and (uc.organization_id = p_org or uc.organization_id is null)
           and (uc.product_id is null or uc.product_id = p_producto)
      ) x
      order by x.nivel, x.dir, x.id
      limit 1)
  end;
$$;
comment on function public.fn_unidad_factor(integer, text, text, integer) is
  'Regla única de conversión de unidades: producto > organización > sistema; directa antes que inversa. NULL si no hay conversión.';
revoke all on function public.fn_unidad_factor(integer, text, text, integer) from public, anon;
grant execute on function public.fn_unidad_factor(integer, text, text, integer) to authenticated, service_role;

-- 2. Recetas -------------------------------------------------------------------
create or replace function public.fn_receta_int_factor(p_org integer, p_de text, p_a text)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select public.fn_unidad_factor(p_org, p_de, p_a, null);
$$;

create or replace function public.fn_receta_int_factor(p_org integer, p_de text, p_a text, p_producto integer)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select public.fn_unidad_factor(p_org, p_de, p_a, p_producto);
$$;
revoke all on function public.fn_receta_int_factor(integer, text, text, integer) from public, anon;
grant execute on function public.fn_receta_int_factor(integer, text, text, integer) to authenticated, service_role;

do $$
declare
  v_def text := pg_get_functiondef('public.fn_receta_int_calcular(integer,jsonb,numeric)'::regprocedure);
  v_viejo constant text := 'public.fn_receta_int_factor(p_org, unidad_receta, unidad_ingrediente)';
  v_nuevo constant text := 'public.fn_receta_int_factor(p_org, unidad_receta, unidad_ingrediente, ingredient_product_id)';
begin
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'fn_receta_int_calcular cambió: no está el marcador de la conversión';
  end if;
  insert into private.respaldo_funciones (migracion, firma, definicion, md5, guardado_en)
  values ('inv_b6a_8_conversion_regla_unica', 'fn_receta_int_calcular(integer,jsonb,numeric)', v_def, md5(v_def), now());
  execute replace(v_def, v_viejo, v_nuevo);
end;
$$;

-- 3. Pestaña Producción › Unidades del producto (B5) -----------------------------
do $$
declare
  v_def text;
  v_nuevo text;
  v_firma regprocedure;
begin
  select p.oid::regprocedure into v_firma from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'fn_producto_produccion_resumen' limit 1;
  if v_firma is null then
    return;
  end if;
  v_def := pg_get_functiondef(v_firma);
  if position('uc.product_id is null or uc.product_id = p_product' in v_def) > 0 then
    return;
  end if;
  v_nuevo := regexp_replace(v_def,
    '(where \(uc\.organization_id = p_org or uc\.organization_id is null\))(\s+)(and \(upper\(btrim\(uc\.from_unit_code\)\) = v_p\.unidad)',
    '\1\2and (uc.product_id is null or uc.product_id = p_product)\2\3');
  v_nuevo := replace(v_nuevo,
    '''alcance'', case when uc.organization_id is null then ''global'' else ''organizacion'' end',
    '''alcance'', case when uc.product_id is not null then ''producto'' when uc.organization_id is null then ''global'' else ''organizacion'' end');
  if v_nuevo = v_def or position('uc.product_id is null or uc.product_id = p_product' in v_nuevo) = 0
     or position('''producto''' in v_nuevo) = 0 then
    raise exception 'fn_producto_produccion_resumen cambió: no están los marcadores de conversiones';
  end if;
  insert into private.respaldo_funciones (migracion, firma, definicion, md5, guardado_en)
  values ('inv_b6a_8_conversion_regla_unica', v_firma::text, v_def, md5(v_def), now());
  execute v_nuevo;
end;
$$;

