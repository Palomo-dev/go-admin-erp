-- Finanzas › Impuestos (Figma 1012:86383): cuántos productos usa cada impuesto
-- y la cobertura de la tarifa por defecto («N de M productos tienen impuesto
-- asignado; los otros se venden con esta tarifa»).
--
-- Solo lectura. SECURITY DEFINER para contar en una sola pasada sin la política
-- RLS de product_tax_relations (EXISTS por fila sobre products: con decenas de
-- miles de productos es lento). La pertenencia la exige fn_assert_acceso_org,
-- la misma guarda de list_organization_taxes.
--
-- Devuelve:
--   total          productos de la organización que no están borrados
--   con_impuesto   productos con al menos un impuesto de venta (kind = 'tax')
--                  activo de tarifa > 0
--   exentos        productos cuyos impuestos de venta activos son todos de
--                  tarifa 0 (excluido o exento configurado a propósito)
--   por_impuesto   { "<uuid del impuesto>": productos que lo usan } para todos
--                  los impuestos y retenciones de la organización

create or replace function public.fn_impuestos_uso_productos(p_organization_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_total integer;
  v_con integer;
  v_exentos integer;
  v_por jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select count(*) into v_total
    from public.products p
   where p.organization_id = p_organization_id
     and coalesce(p.status, 'active') <> 'deleted';

  with rel as (
    select r.product_id, t.rate
      from public.product_tax_relations r
      join public.organization_taxes t on t.id = r.tax_id
      join public.products p on p.id = r.product_id
     where t.organization_id = p_organization_id
       and p.organization_id = p_organization_id
       and coalesce(p.status, 'active') <> 'deleted'
       and coalesce(t.is_active, true)
       and t.kind = 'tax'
  ), por_producto as (
    select product_id, max(rate) as tarifa_max from rel group by product_id
  )
  select count(*) filter (where tarifa_max > 0),
         count(*) filter (where tarifa_max <= 0)
    into v_con, v_exentos
    from por_producto;

  select coalesce(jsonb_object_agg(x.tax_id::text, x.n), '{}'::jsonb) into v_por
    from (
      select r.tax_id, count(*)::integer as n
        from public.product_tax_relations r
        join public.organization_taxes t on t.id = r.tax_id
        join public.products p on p.id = r.product_id
       where t.organization_id = p_organization_id
         and p.organization_id = p_organization_id
         and coalesce(p.status, 'active') <> 'deleted'
       group by r.tax_id
    ) x;

  return jsonb_build_object(
    'total', coalesce(v_total, 0),
    'con_impuesto', coalesce(v_con, 0),
    'exentos', coalesce(v_exentos, 0),
    'por_impuesto', v_por
  );
end;
$function$;

revoke all on function public.fn_impuestos_uso_productos(integer) from public, anon;
grant execute on function public.fn_impuestos_uso_productos(integer) to authenticated, service_role;

comment on function public.fn_impuestos_uso_productos(integer) is
  'Finanzas › Impuestos: productos por impuesto y cobertura de la tarifa por defecto. Solo lectura; exige pertenencia a la organización.';
