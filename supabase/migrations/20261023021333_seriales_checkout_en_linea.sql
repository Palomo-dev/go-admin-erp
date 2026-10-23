-- Checkout: persistir serial_ids en la línea.

do $patch$
declare
  v_def text;
  v_nuevo text;
  v_promo text;
  v_promo_new text;
  v_previo text;
  v_previo_new text;
begin
  v_def := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  if position('serial_ids_en_linea_20261023' in v_def) > 0 then
    return;
  end if;

  v_promo := $old$        insert into public.sale_items (
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
        ) returning id into v_linea_id;$old$;
  v_promo_new := $new$        insert into public.sale_items (
          sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes, tax_included,
          promo_excluded, promo_excluded_by, promo_excluded_at, promo_excluded_reason, serial_ids
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
          case when v_excluida then nullif(left(coalesce(v_linea->>'promo_excluded_reason', ''), 240), '') else null end,
          -- serial_ids_en_linea_20261023
          coalesce((
            select array_agg(x::integer)
              from jsonb_array_elements_text(coalesce(v_linea->'serial_ids', '[]'::jsonb)) x
          ), '{}'::integer[])
        ) returning id into v_linea_id;$new$;

  v_previo := $old$    insert into public.sale_items (
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
    order by i.ord;$old$;
  v_previo_new := $new$    insert into public.sale_items (
      sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes, tax_included, serial_ids
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
      (i.value->>'tax_included')::boolean,
      -- serial_ids_en_linea_20261023
      coalesce((
        select array_agg(x::integer)
          from jsonb_array_elements_text(coalesce(i.value->'serial_ids', '[]'::jsonb)) x
      ), '{}'::integer[])
    from jsonb_array_elements(v_items) with ordinality as i(value, ord)
    order by i.ord;$new$;

  if position(v_promo in v_def) > 0 then
    v_def := replace(v_def, v_promo, v_promo_new);
  elsif position(v_previo in v_def) > 0 then
    v_def := replace(v_def, v_previo, v_previo_new);
  else
    raise exception 'pos_checkout_v1: no está el insert de sale_items (ni con promo ni el anterior)';
  end if;

  v_nuevo := replace(v_def,
    $old$            v_serial.id, v_org, 'sold', v_serial.status, 'sold', v_branch,
            'sales', v_sale_id::text, v_sale_id, v_customer, v_user_id
          );
        end loop;
      end if;$old$,
    $new$            v_serial.id, v_org, 'sold', v_serial.status, 'sold', v_branch,
            'sales', v_sale_id::text, v_sale_id, v_customer, v_user_id
          );
        end loop;
        -- serial_ids_en_linea_20261023: también en la línea ya existente (mesa).
        update public.sale_items si
           set serial_ids = (
             select coalesce(array_agg(distinct u.x order by u.x), '{}'::integer[])
               from unnest(coalesce(si.serial_ids, '{}'::integer[]) || v_serial_ids) as u(x)
           )
         where si.sale_id = v_sale_id
           and si.product_id = v_product_id
           and si.id = coalesce(
             case when coalesce(v_item->>'sale_item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (v_item->>'sale_item_id')::uuid end,
             (
               select s2.id from public.sale_items s2
                where s2.sale_id = v_sale_id and s2.product_id = v_product_id
                order by (cardinality(coalesce(s2.serial_ids, '{}')) = 0) desc, s2.created_at, s2.id
                limit 1
             )
           );
      end if;$new$);
  if v_nuevo = v_def then
    raise exception 'pos_checkout_v1: no está el cierre del ciclo de seriales';
  end if;
  execute v_nuevo;
end
$patch$;
