-- Estación de cocina heredada (decisión del dueño, 2026-09-24).
--
-- Regla: el producto usa la estación de su CATEGORÍA salvo que tenga una
-- estación PROPIA; si no tiene propia y la de la categoría cambia, la del
-- producto cambia con ella.
--
-- Diseño (sin columnas nuevas): products.station pasa a ser «estación propia»;
-- NULL = hereda. La estación efectiva es
--   propia del producto → propia del padre (variantes) → la de la categoría
--   (la del producto o, si no tiene, la del padre)
-- y la resuelven fn_estacion_efectiva (una) y fn_estaciones_efectivas (lote,
-- para POS/cocina/impresión). El formulario ya trataba NULL como «heredar»;
-- el problema era que al elegir categoría copiaba su estación como valor fijo.
--
-- Datos (verificado por MCP el 2026-09-24): 286 productos con estación;
-- 198 iguales a la de su categoría, 1 distinta, 87 con categoría sin estación
-- (o sin categoría), 39 variantes con estación. Se pasa a «hereda» SOLO lo que
-- da la misma estación efectiva antes y después; lo demás queda como propio.
-- Prueba en transacción deshecha: 205 pasan a «hereda» (166 sin padre + 39
-- variantes, 4 organizaciones), 81 quedan con estación propia; 0 productos con
-- estación cambian de estación efectiva.
-- Los valores originales quedan en private.respaldo_estacion_productos_20260924
-- para el rollback.

-- ── 1. Respaldo (fuera de la API: esquema private, sin permisos) ────────────
create table if not exists private.respaldo_estacion_productos_20260924 (
  product_id integer primary key,
  organization_id integer not null,
  station text not null,
  respaldado_at timestamptz not null default now()
);
alter table private.respaldo_estacion_productos_20260924 enable row level security;
revoke all on table private.respaldo_estacion_productos_20260924 from public, anon, authenticated;

-- ── 2. Estación efectiva ────────────────────────────────────────────────────
create or replace function public.fn_estacion_efectiva(p_product_id integer)
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(p.station, pp.station, c.station)
    from public.products p
    left join public.products pp on pp.id = p.parent_product_id
    left join public.categories c on c.id = coalesce(p.category_id, pp.category_id)
   where p.id = p_product_id;
$$;

comment on function public.fn_estacion_efectiva(integer) is
  'Estación de cocina/bar efectiva: propia del producto, si no la propia del padre (variantes), si no la de la categoría. products.station NULL = hereda.';

-- Lote para POS, comandas e impresión por estación. `heredada` = el producto
-- no tiene estación propia; `requires_preparation` sale de la misma categoría.
create or replace function public.fn_estaciones_efectivas(p_organization_id integer, p_product_ids integer[])
returns table (product_id integer, station text, heredada boolean, requires_preparation boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  return query
  select p.id,
         public.fn_estacion_efectiva(p.id),
         p.station is null,
         coalesce(c.requires_preparation, false)
    from public.products p
    left join public.products pp on pp.id = p.parent_product_id
    left join public.categories c on c.id = coalesce(p.category_id, pp.category_id)
   where p.id = any(coalesce(p_product_ids, '{}'::integer[]))
     and p.organization_id = p_organization_id;
end;
$$;

revoke all on function public.fn_estacion_efectiva(integer) from public, anon;
revoke all on function public.fn_estaciones_efectivas(integer, integer[]) from public, anon;
grant execute on function public.fn_estacion_efectiva(integer) to authenticated, service_role;
grant execute on function public.fn_estaciones_efectivas(integer, integer[]) to authenticated, service_role;

-- ── 3. Variantes nuevas: heredan (antes copiaban la estación del padre) ─────
-- Cambio quirúrgico sobre la definición viva (otra sesión puede haberla
-- tocado): solo el valor de `station` en el INSERT de la variante.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_producto_int_variante_guardar(integer, integer, jsonb, boolean)'::regprocedure);
  v_antes constant text := 'v_parent.unit_code, v_parent.product_type, v_parent.station, v_parent.brand';
  v_despues constant text := 'v_parent.unit_code, v_parent.product_type, null, v_parent.brand';
begin
  if position(v_antes in v_def) > 0 then
    execute replace(v_def, v_antes, v_despues);
  elsif position(v_despues in v_def) = 0 then
    raise exception 'fn_producto_int_variante_guardar cambió: revisar el INSERT de la variante a mano';
  end if;
end;
$$;

-- ── 4. Datos: pasar a «hereda» lo que no cambia de estación efectiva ────────
-- 4a. Productos sin padre cuya estación es la de su categoría.
insert into private.respaldo_estacion_productos_20260924 (product_id, organization_id, station)
select p.id, p.organization_id, p.station
  from public.products p
  join public.categories c on c.id = p.category_id
 where p.parent_product_id is null
   and p.station is not null
   and p.station = c.station
on conflict (product_id) do nothing;

update public.products p
   set station = null
 where p.id in (select r.product_id from private.respaldo_estacion_productos_20260924 r
                 where r.respaldado_at = now())
   and p.parent_product_id is null;

-- 4b. Variantes cuya estación es la que heredarían (del padre ya migrado o de
-- la categoría).
insert into private.respaldo_estacion_productos_20260924 (product_id, organization_id, station)
select v.id, v.organization_id, v.station
  from public.products v
  join public.products pp on pp.id = v.parent_product_id
  left join public.categories c on c.id = coalesce(v.category_id, pp.category_id)
 where v.station is not null
   and v.station = coalesce(pp.station, c.station)
on conflict (product_id) do nothing;

update public.products v
   set station = null
 where v.id in (select r.product_id from private.respaldo_estacion_productos_20260924 r
                 where r.respaldado_at = now())
   and v.parent_product_id is not null;

-- ── 5. Esquema documentado ──────────────────────────────────────────────────
comment on column public.products.station is
  'Estación propia (hot_kitchen, cold_kitchen, bar, cashier, all). NULL = hereda: del padre si es variante y si no de la categoría. Leer con fn_estacion_efectiva / fn_estaciones_efectivas.';
