-- Precio/costo masivo en bloque (TecnoFacil, org 337: «Precios actualizados (parcial): 119 exitosos,
-- 250 fallidos», 57014 en el lote 0-250).
-- Causa (prod, 27-oct): fn_productos_precio_masivo recorría el lote FILA POR FILA; por cada producto
-- hacía ~4 consultas a product_prices + fn_producto_int_fijar_precio (2 UPDATE + 1 INSERT, cada uno con
-- los triggers por fila trg_meta_price_sync y trg_membresias_precio_legado) y un
-- `update public.products set updated_at = now() where id = v_id` que dispara audit_products_changes
-- (to_jsonb before/after, ~4,9 KB, en products_audit_log de 435 MB con 9 índices) y fn_meta_product_sync,
-- sobre una tabla con 26 índices (7 GIN trigram). El log de Postgres ubica la cancelación en
-- «line 154 at SQL statement: update public.products set updated_at = now() where id = v_id».
-- Arreglo: ids una sola vez (deduplicados), cálculo de precios vigentes/futuros con un join lateral,
-- y escrituras en bloque (un UPDATE para cerrar futuros, uno para cerrar vigentes, un INSERT, un UPDATE
-- de products). Misma regla de vigencia que fn_producto_int_fijar_precio/fijar_costo, mismos
-- motivos, mismo resumen, mismos permisos, security definer y search_path.
-- No expande variantes (el cliente ya manda el alcance expandido y lo parte sin repetir).
create or replace function public.fn_productos_precio_masivo(
  p_organization_id integer, p_product_ids integer[], p_tipo text, p_operacion text,
  p_opciones jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_modo text := p_opciones->>'modo';
  v_cantidad numeric := nullif(p_opciones->>'cantidad', '')::numeric;
  v_multiplo numeric := nullif(p_opciones->>'multiplo', '')::numeric;
  v_digitos integer := nullif(p_opciones->>'digitos', '')::integer;
  v_fijo text := p_opciones->>'valor';
  v_sobrescribir boolean := coalesce((p_opciones->>'sobrescribir')::boolean, false);
  v_ahora timestamptz := now();
  v_ids integer[];
  v_cambiados integer;
  v_sin_cambio integer;
  v_omitidos jsonb;
  v_ejemplos jsonb;
begin
  perform public.fn_productos_exigir_permiso(p_organization_id,
    array['inventory.edit', 'product_management', 'inventory_management']);
  if coalesce(cardinality(p_product_ids), 0) > 1000 then
    raise exception 'demasiados_productos' using errcode = '22023', detail = '1000';
  end if;
  if p_tipo not in ('venta', 'comparacion', 'compra') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_operacion = 'ajustar' then
    if v_modo not in ('fijo', 'valor', 'porcentaje') or v_cantidad is null then
      raise exception 'modo_invalido' using errcode = '22023';
    end if;
  elsif p_operacion = 'redondear' then
    if v_modo not in ('multiplo', 'digitos') then
      raise exception 'modo_invalido' using errcode = '22023';
    end if;
  elsif p_operacion = 'copiar_a_comparacion' then
    null;
  else
    raise exception 'operacion_invalida' using errcode = '22023';
  end if;

  -- Una sola vez: ids distintos de la selección.
  v_ids := array(select distinct x from unnest(coalesce(p_product_ids, '{}'::integer[])) x
                  where x is not null order by x);

  -- Bloqueo en orden de id: dos acciones masivas simultáneas no se cruzan.
  perform 1 from public.products
   where id = any(v_ids) and organization_id = p_organization_id
   order by id
     for update;

  drop table if exists pg_temp.tmp_precio_masivo;
  create temp table tmp_precio_masivo (
    id integer primary key,
    motivo text,
    nuevo numeric,
    comp numeric,
    supplier_id integer,
    cambio boolean not null default false
  ) on commit drop;

  if p_tipo = 'compra' then
    insert into tmp_precio_masivo (id, motivo, nuevo, supplier_id, cambio)
    select c.id, c.motivo, c.nuevo, c.supplier_id,
           c.motivo is null and (c.hay_futuros or not (c.hay_actual and c.cost = c.nuevo))
      from (
        select b.id, b.motivo, b.supplier_id, b.cost, b.hay_actual, b.hay_futuros,
               case when b.motivo is null then round(greatest(0, b.calc), 2) end as nuevo
          from (
            select s.id, a.cost, a.supplier_id, a.id is not null as hay_actual,
                   exists (select 1 from public.product_costs f
                            where f.product_id = s.id and f.effective_from > v_ahora
                              and (f.effective_to is null or f.effective_to > f.effective_from)) as hay_futuros,
                   case
                     when p_operacion = 'ajustar' then
                       case when v_modo = 'porcentaje' and coalesce(a.cost, 0) = 0 then 'sin_costo_previo' end
                     when p_operacion = 'redondear' then
                       case when coalesce(a.cost, 0) <= 0 then 'sin_costo' end
                     else 'operacion_no_aplica'
                   end as motivo,
                   case
                     when p_operacion = 'ajustar' then
                       case v_modo
                         when 'fijo' then v_cantidad
                         when 'valor' then coalesce(a.cost, 0) + v_cantidad
                         else coalesce(a.cost, 0) * (1 + v_cantidad / 100) end
                     when p_operacion = 'redondear' then
                       public.fn_productos_int_redondear(coalesce(a.cost, 0), v_modo, v_multiplo, v_digitos, v_fijo)
                   end as calc
              from public.products s
              left join lateral (
                select pc.id, pc.cost, pc.supplier_id
                  from public.product_costs pc
                 where pc.product_id = s.id and pc.effective_from <= v_ahora
                   and (pc.effective_to is null or pc.effective_to > v_ahora)
                 order by pc.effective_from desc, pc.id desc limit 1) a on true
             where s.id = any(v_ids)
               and s.organization_id = p_organization_id
               and coalesce(s.status, 'active') <> 'deleted'
          ) b
      ) c;

    update public.product_costs pc set effective_to = pc.effective_from
      from tmp_precio_masivo t
     where t.cambio and pc.product_id = t.id and pc.effective_from > v_ahora
       and (pc.effective_to is null or pc.effective_to > pc.effective_from);
    update public.product_costs pc set effective_to = v_ahora
      from tmp_precio_masivo t
     where t.cambio and pc.product_id = t.id and pc.effective_from <= v_ahora
       and (pc.effective_to is null or pc.effective_to > v_ahora);
    insert into public.product_costs (product_id, cost, effective_from, supplier_id)
    select t.id, t.nuevo, v_ahora, t.supplier_id
      from tmp_precio_masivo t where t.cambio order by t.id;
  else
    insert into tmp_precio_masivo (id, motivo, nuevo, comp, cambio)
    select c.id, c.motivo, c.nuevo, c.comp,
           c.motivo is null and (c.hay_futuros or not (c.hay_actual and c.price = c.nuevo
                                  and coalesce(c.compare_price, 0) = coalesce(c.comp, 0)))
      from (
        select b.id, b.motivo, b.price, b.compare_price, b.hay_actual, b.hay_futuros,
               case when b.motivo is null then round(greatest(0, b.calc_nuevo), 2) end as nuevo,
               case when b.motivo is null then nullif(round(greatest(0, b.calc_comp), 2), 0) end as comp
          from (
            select s.id, a.price, a.compare_price, a.id is not null as hay_actual,
                   exists (select 1 from public.product_prices f
                            where f.product_id = s.id and f.effective_from > v_ahora
                              and (f.effective_to is null or f.effective_to > f.effective_from)) as hay_futuros,
                   case
                     when p_operacion = 'copiar_a_comparacion' then
                       case when coalesce(a.price, 0) <= 0 then 'sin_precio'
                            when coalesce(a.compare_price, 0) > 0 and not v_sobrescribir then 'ya_tiene_comparacion' end
                     when p_tipo = 'venta' then
                       case when p_operacion = 'ajustar' then
                              case when a.price is null and v_modo <> 'fijo' then 'sin_precio' end
                            when coalesce(a.price, 0) <= 0 then 'sin_precio' end
                     else -- comparacion
                       case when a.price is null then 'sin_precio'
                            when p_operacion = 'ajustar' then null
                            when coalesce(a.compare_price, 0) <= 0 then 'sin_comparacion' end
                   end as motivo,
                   case
                     when p_operacion = 'copiar_a_comparacion' then coalesce(a.price, 0)
                     when p_tipo = 'venta' then
                       case when p_operacion = 'ajustar' then
                              case v_modo
                                when 'fijo' then v_cantidad
                                when 'valor' then coalesce(a.price, 0) + v_cantidad
                                else coalesce(a.price, 0) * (1 + v_cantidad / 100) end
                            else public.fn_productos_int_redondear(coalesce(a.price, 0), v_modo, v_multiplo, v_digitos, v_fijo) end
                     else coalesce(a.price, 0)
                   end as calc_nuevo,
                   case
                     when p_operacion = 'copiar_a_comparacion' then coalesce(a.price, 0)
                     when p_tipo = 'venta' then coalesce(a.compare_price, 0)
                     when p_operacion = 'ajustar' then
                       case v_modo
                         when 'fijo' then v_cantidad
                         when 'valor' then coalesce(a.compare_price, 0) + v_cantidad
                         else coalesce(a.compare_price, 0) * (1 + v_cantidad / 100) end
                     else public.fn_productos_int_redondear(coalesce(a.compare_price, 0), v_modo, v_multiplo, v_digitos, v_fijo)
                   end as calc_comp
              from public.products s
              left join lateral (
                select pp.id, pp.price, pp.compare_price
                  from public.product_prices pp
                 where pp.product_id = s.id and pp.effective_from <= v_ahora
                   and (pp.effective_to is null or pp.effective_to > v_ahora)
                 order by pp.effective_from desc, pp.id desc limit 1) a on true
             where s.id = any(v_ids)
               and s.organization_id = p_organization_id
               and coalesce(s.status, 'active') <> 'deleted'
          ) b
      ) c;

    update public.product_prices pp set effective_to = pp.effective_from
      from tmp_precio_masivo t
     where t.cambio and pp.product_id = t.id and pp.effective_from > v_ahora
       and (pp.effective_to is null or pp.effective_to > pp.effective_from);
    update public.product_prices pp set effective_to = v_ahora
      from tmp_precio_masivo t
     where t.cambio and pp.product_id = t.id and pp.effective_from <= v_ahora
       and (pp.effective_to is null or pp.effective_to > v_ahora);
    insert into public.product_prices (product_id, price, compare_price, effective_from)
    select t.id, t.nuevo, t.comp, v_ahora
      from tmp_precio_masivo t where t.cambio order by t.id;
  end if;

  -- Un solo UPDATE (en orden de id) para marcar los productos cambiados.
  update public.products p set updated_at = v_ahora
    from tmp_precio_masivo t
   where t.cambio and p.id = t.id;

  select count(*) filter (where motivo is null and cambio),
         count(*) filter (where motivo is null and not cambio)
    into v_cambiados, v_sin_cambio
    from tmp_precio_masivo;
  select coalesce(jsonb_object_agg(motivo, n), '{}'::jsonb),
         coalesce(jsonb_object_agg(motivo, ej), '{}'::jsonb)
    into v_omitidos, v_ejemplos
    from (select motivo, count(*) as n,
                 (jsonb_agg(id order by id) filter (where rn <= 20)) as ej
            from (select motivo, id, row_number() over (partition by motivo order by id) rn
                    from tmp_precio_masivo where motivo is not null) o
           group by motivo) g;

  drop table if exists pg_temp.tmp_precio_masivo;

  return jsonb_build_object(
    'cambiados', v_cambiados,
    'sin_cambio', v_sin_cambio,
    'no_encontrados', coalesce(cardinality(v_ids), 0)
                        - v_cambiados - v_sin_cambio
                        - coalesce((select sum(value::integer) from jsonb_each_text(v_omitidos)), 0),
    'omitidos', v_omitidos,
    'ejemplos', v_ejemplos);
end;
$$;

revoke all on function public.fn_productos_precio_masivo(integer, integer[], text, text, jsonb) from public, anon;
grant execute on function public.fn_productos_precio_masivo(integer, integer[], text, text, jsonb) to authenticated, service_role;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261027230000', 'productos_precio_masivo_en_bloque', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
