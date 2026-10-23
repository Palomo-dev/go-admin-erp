do $parche$
declare
  v_def text := pg_get_functiondef('public.pos_mesa_aplicar_promociones(uuid, jsonb)'::regprocedure);
  v_viejo text := $viejo$    continue when coalesce(v_si.discount_amount, 0) > 0 and not (v_notas ? 'descuento_promocion');$viejo$;
  v_nuevo text := $nuevo$    continue when coalesce(v_si.discount_amount, 0) > 0 and not (v_notas ? 'descuento_promocion');

    if coalesce(v_si.promo_excluded, false) then
      v_desc := 0;
      v_ids := '[]'::jsonb;
    end if;$nuevo$;
begin
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'no se encontró una sola vez el bloque de pos_mesa_aplicar_promociones';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end
$parche$;

-- El cobro de una venta nueva persiste el flag y audita. Sin permiso, rechaza.
do $parche$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_viejo text := $viejo$  -- ── 7. Líneas de venta ───────────────────────────────────────────────────
  if v_mode <> 'settle' and not exists (select 1 from public.sale_items si where si.sale_id = v_sale_id) then
    insert into public.sale_items (
      sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes, tax_included
    )
    select
      v_sale_id,
      nullif(i.value->>'product_id', '')::integer,
      (i.value->>'quantity')::numeric,
      coalesce((i.value->>'unit_price')::numeric, 0),
      coalesce((i.value->>'total')::numeric, 0),
      coalesce((i.value->>'tax_amount')::numeric, 0),
      coalesce((i.value->>'tax_rate')::numeric, 0),
      coalesce((i.value->>'discount_amount')::numeric, 0),
      case when jsonb_typeof(i.value->'notes') = 'object' then i.value->'notes' else null end,
      (i.value->>'tax_included')::boolean
    from jsonb_array_elements(v_items) with ordinality as i(value, ord)
    order by i.ord;
    if v_replayed then v_completed := array_append(v_completed, 'sale_items'); end if;
  end if;$viejo$;
  v_nuevo text := $nuevo$  -- ── 7. Líneas de venta ───────────────────────────────────────────────────
  if v_mode <> 'settle' and not exists (select 1 from public.sale_items si where si.sale_id = v_sale_id) then
    if exists (
      select 1 from jsonb_array_elements(v_items) i
       where coalesce((i->>'promo_excluded')::boolean, false)
    ) and not public.fn_pos_puede_quitar_promocion(v_org, v_actor) then
      raise exception 'sin_permiso_quitar_promocion' using errcode = '42501',
        detail = 'Se necesita el permiso pos.promotions.remove para quitar la promoción de una línea.';
    end if;
    declare
      v_linea jsonb;
      v_linea_id uuid;
      v_excluida boolean;
    begin
      for v_linea in
        select i.value
          from jsonb_array_elements(v_items) with ordinality as i(value, ord)
         order by i.ord
      loop
        v_excluida := coalesce((v_linea->>'promo_excluded')::boolean, false);
        insert into public.sale_items (
          sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes, tax_included,
          promo_excluded, promo_excluded_by, promo_excluded_at, promo_excluded_reason
        ) values (
          v_sale_id,
          nullif(v_linea->>'product_id', '')::integer,
          (v_linea->>'quantity')::numeric,
          coalesce((v_linea->>'unit_price')::numeric, 0),
          coalesce((v_linea->>'total')::numeric, 0),
          coalesce((v_linea->>'tax_amount')::numeric, 0),
          coalesce((v_linea->>'tax_rate')::numeric, 0),
          coalesce((v_linea->>'discount_amount')::numeric, 0),
          case when jsonb_typeof(v_linea->'notes') = 'object' then v_linea->'notes' else null end,
          (v_linea->>'tax_included')::boolean,
          v_excluida,
          case when v_excluida then v_actor else null end,
          case when v_excluida then now() else null end,
          case when v_excluida then nullif(left(coalesce(v_linea->>'promo_excluded_reason', ''), 240), '') else null end
        ) returning id into v_linea_id;
        if v_excluida then
          insert into public.ops_audit_log (
            organization_id, branch_id, user_id, entity_type, entity_id, action, metadata
          ) values (
            v_org, v_branch, v_actor, 'sale', v_sale_id::text, 'promo_excluded',
            jsonb_build_object(
              'sale_item_id', v_linea_id,
              'product_id', nullif(v_linea->>'product_id', ''),
              'promotion_id', case
                when jsonb_typeof(v_linea->'promo_removed') = 'array' and jsonb_array_length(v_linea->'promo_removed') > 0
                then nullif(v_linea->'promo_removed'->0->>'promotion_id', '')
                else null end,
              'promotion_name', (
                select string_agg(nullif(x->>'promotion_name', ''), ', ')
                  from jsonb_array_elements(coalesce(v_linea->'promo_removed', '[]'::jsonb)) x
              ),
              'amount', coalesce((
                select sum(coalesce((x->>'discount_amount')::numeric, 0))
                  from jsonb_array_elements(coalesce(v_linea->'promo_removed', '[]'::jsonb)) x
              ), 0),
              'reason', nullif(left(coalesce(v_linea->>'promo_excluded_reason', ''), 240), '')
            )
          );
        end if;
      end loop;
    end;
    if v_replayed then v_completed := array_append(v_completed, 'sale_items'); end if;
  end if;$nuevo$;
begin
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'no se encontró una sola vez el bloque de líneas de pos_checkout_v1';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end
$parche$;

-- La confirmación del pedido copia el flag a las líneas de la venta.
do $parche$
declare
  v_def text := pg_get_functiondef('public.fn_confirmar_pedido_web_completo(uuid, jsonb, integer, integer, boolean, uuid, uuid, boolean)'::regprocedure);
  v_viejo text := $viejo$      insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_amount,
                                     tax_rate, tax_included, discount_amount, notes)
      select v_sale,
             nullif(l.value->>'product_id', '')::integer,
             coalesce((l.value->>'quantity')::numeric, 1),
             coalesce((l.value->>'unit_price')::numeric, 0),
             coalesce((l.value->>'total')::numeric, 0),
             coalesce((l.value->>'tax_amount')::numeric, 0),
             coalesce((l.value->>'tax_rate')::numeric, 0),
             (l.value->>'tax_included')::boolean,
             coalesce((l.value->>'discount_amount')::numeric, 0),
             case when jsonb_typeof(l.value->'notes') = 'object' then l.value->'notes' else null end
        from jsonb_array_elements(p_lineas) with ordinality as l(value, ord)
       order by l.ord;$viejo$;
  v_nuevo text := $nuevo$      insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_amount,
                                     tax_rate, tax_included, discount_amount, notes,
                                     promo_excluded, promo_excluded_by, promo_excluded_at, promo_excluded_reason)
      select v_sale,
             nullif(l.value->>'product_id', '')::integer,
             coalesce((l.value->>'quantity')::numeric, 1),
             coalesce((l.value->>'unit_price')::numeric, 0),
             coalesce((l.value->>'total')::numeric, 0),
             coalesce((l.value->>'tax_amount')::numeric, 0),
             coalesce((l.value->>'tax_rate')::numeric, 0),
             (l.value->>'tax_included')::boolean,
             coalesce((l.value->>'discount_amount')::numeric, 0),
             case when jsonb_typeof(l.value->'notes') = 'object' then l.value->'notes' else null end,
             coalesce((l.value->>'promo_excluded')::boolean, false),
             case when coalesce((l.value->>'promo_excluded')::boolean, false)
                       and coalesce(l.value->>'promo_excluded_by', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (l.value->>'promo_excluded_by')::uuid else null end,
             case when coalesce((l.value->>'promo_excluded')::boolean, false)
                       and coalesce(l.value->>'promo_excluded_at', '') <> ''
                  then (l.value->>'promo_excluded_at')::timestamptz else null end,
             case when coalesce((l.value->>'promo_excluded')::boolean, false)
                  then nullif(left(coalesce(l.value->>'promo_excluded_reason', ''), 240), '') else null end
        from jsonb_array_elements(p_lineas) with ordinality as l(value, ord)
       order by l.ord;$nuevo$;
begin
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'no se encontró una sola vez el insert de fn_confirmar_pedido_web_completo';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end
$parche$;
