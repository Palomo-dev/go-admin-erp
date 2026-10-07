-- Promociones: límite de usos atómico y promociones sobre la cuenta completa de la mesa.
--
-- 1. increment_promotion_usage respeta usage_limit. Antes sumaba siempre: dos
--    cobros simultáneos sobre una promoción con 1 uso restante la dejaban en
--    usage_count > usage_limit. Ahora el UPDATE solo toca filas con
--    `usage_limit is null or usage_count < usage_limit`; en READ COMMITTED,
--    el segundo UPDATE que espera el bloqueo de la fila vuelve a evaluar el
--    WHERE sobre la versión nueva y no suma. Devuelve cuántas sumó: un
--    llamador puede comparar con cuántas pidió. NO aborta la venta: la venta
--    ya se cobró con el descuento y el contador es lo que se protege.
--    `usage_limit` nulo sigue siendo «sin límite».
--
-- 2. pos_mesa_aplicar_promociones(p_sale_id, p_lineas): escribe en una sola
--    transacción el descuento de promoción de las líneas de la cuenta de una
--    mesa y recalcula la cabecera (fn_pos_recalcular_venta). El navegador
--    evalúa la cuenta COMPLETA con el motor único (`motorPromociones.ts`) y
--    manda el resultado; antes se evaluaba plato por plato al agregarlo y el
--    descuento no se recalculaba nunca. Solo toca líneas que gestiona el motor:
--    sin pagar, sin abono y sin un descuento ajeno (uno que no lleve
--    `notes.descuento_promocion`, p. ej. el de un pedido web). Marca la línea
--    con `notes.descuento_promocion` y `notes.promociones` (ids aplicados).
--
-- 3. pos_checkout_v1 (settle de mesa) suma el uso de las promociones UNA vez,
--    en el cobro que salda la cuenta, y solo de las que aparecen en
--    `notes.promociones` de sus líneas (el sobre no basta para sumar).
--    Parche por sustitución exacta sobre la definición viva, como
--    20260930190003: el fragmento debe aparecer una vez o la migración aborta.
--
-- Verificado el 2026-10-07 en una transacción revertida: promoción con
-- usage_limit 1 → la primera llamada suma 1 y la segunda 0; aplicar 2.300 a
-- una línea de 23.000 de una mesa abierta deja la línea en 20.700 con su
-- marca y la cabecera recalculada; el parche de pos_checkout_v1 compila.
--
-- Rollback: supabase/rollbacks/<misma versión>_promociones_limite_y_cuenta_de_mesa_rollback.sql

-- ── 1. increment_promotion_usage ───────────────────────────────────────────
create or replace function public.increment_promotion_usage(p_organization_id integer, p_promotion_ids uuid[])
 returns integer
 language sql
 set search_path to 'public'
as $function$
  with actualizadas as (
    update promotions
       set usage_count = coalesce(usage_count, 0) + 1,
           updated_at = now()
     where organization_id = p_organization_id
       and id = any(p_promotion_ids)
       and (usage_limit is null or coalesce(usage_count, 0) < usage_limit)
    returning id
  )
  select count(*)::integer from actualizadas;
$function$;

comment on function public.increment_promotion_usage(integer, uuid[]) is
  'Suma 1 a usage_count de las promociones de la organización, sin pasar de usage_limit (nulo = sin límite). Devuelve cuántas sumó. Atómico por fila.';

revoke execute on function public.increment_promotion_usage(integer, uuid[]) from public, anon;
grant execute on function public.increment_promotion_usage(integer, uuid[]) to authenticated, service_role;

-- ── 2. pos_mesa_aplicar_promociones ────────────────────────────────────────
create or replace function public.pos_mesa_aplicar_promociones(p_sale_id uuid, p_lineas jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sale     public.sales%rowtype;
  v_si       public.sale_items%rowtype;
  v_l        jsonb;
  v_id       uuid;
  v_desc     numeric;
  v_ids      jsonb;
  v_notas    jsonb;
  v_cambios  integer := 0;
begin
  if auth.uid() is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_sale from public.sales s where s.id = p_sale_id for update;
  if not found then
    raise exception 'venta_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_sale.organization_id);
  if not public.app_branch_access(v_sale.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.table_sessions ts
     where ts.sale_id = p_sale_id and ts.organization_id = v_sale.organization_id
  ) then
    raise exception 'no_es_venta_de_mesa' using errcode = '22023';
  end if;
  if v_sale.status not in ('pending', 'draft', 'partial') then
    raise exception 'venta_cerrada' using errcode = '22023';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) > 500 then
    raise exception 'lineas_invalidas' using errcode = '22023';
  end if;

  for v_l in select value from jsonb_array_elements(p_lineas) loop
    if jsonb_typeof(v_l) <> 'object'
       or coalesce(v_l->>'sale_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(jsonb_typeof(v_l->'discount_amount'), '') <> 'number' then
      raise exception 'lineas_invalidas' using errcode = '22023';
    end if;
    v_id   := (v_l->>'sale_item_id')::uuid;
    v_desc := round((v_l->>'discount_amount')::numeric, 2);
    v_ids  := case when jsonb_typeof(v_l->'promotion_ids') = 'array' then v_l->'promotion_ids' else '[]'::jsonb end;

    select * into v_si from public.sale_items si where si.id = v_id and si.sale_id = p_sale_id for update;
    if not found then
      raise exception 'linea_no_encontrada' using errcode = 'P0002';
    end if;
    v_notas := case when jsonb_typeof(v_si.notes) = 'object' then v_si.notes else '{}'::jsonb end;

    -- Solo las líneas que gestiona el motor (misma regla que lineaMesaGestionada).
    continue when v_si.paid_at is not null or coalesce(v_si.paid_amount, 0) > 0 or v_si.quantity <= 0;
    continue when coalesce(v_si.discount_amount, 0) > 0 and not (v_notas ? 'descuento_promocion');

    if v_desc < 0 or v_desc > round(v_si.quantity * v_si.unit_price, 2) then
      raise exception 'descuento_excede_linea' using errcode = '22023',
        detail = format('Línea %s: descuento %s, línea %s.', v_id, v_desc, round(v_si.quantity * v_si.unit_price, 2));
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_ids) x
       where jsonb_typeof(x) <> 'string'
          or not exists (select 1 from public.promotions p
                          where p.id::text = lower(x #>> '{}') and p.organization_id = v_sale.organization_id)
    ) then
      raise exception 'promocion_invalida' using errcode = '22023';
    end if;
    -- Ids en minúsculas y sin repetir: pos_checkout_v1 los busca con `?`.
    select coalesce(jsonb_agg(distinct lower(x #>> '{}')), '[]'::jsonb) into v_ids from jsonb_array_elements(v_ids) x;

    update public.sale_items set
      discount_amount = v_desc,
      notes = case when v_desc > 0
                   then v_notas || jsonb_build_object('descuento_promocion', v_desc, 'promociones', v_ids)
                   else v_notas - 'descuento_promocion' - 'promociones' end,
      updated_at = now()
    where id = v_id;
    v_cambios := v_cambios + 1;
  end loop;

  v_sale := public.fn_pos_recalcular_venta(p_sale_id);
  return jsonb_build_object(
    'sale_id', v_sale.id, 'lineas', v_cambios,
    'subtotal', v_sale.subtotal, 'tax_total', v_sale.tax_total, 'discount_total', v_sale.discount_total,
    'total', v_sale.total, 'balance', v_sale.balance);
end;
$function$;

comment on function public.pos_mesa_aplicar_promociones(uuid, jsonb) is
  'Escribe el descuento de promoción de las líneas de la cuenta de una mesa (evaluada completa por motorPromociones.ts) y recalcula la venta. Solo toca líneas sin pagar y sin descuento ajeno.';

revoke all on function public.pos_mesa_aplicar_promociones(uuid, jsonb) from public, anon;
grant execute on function public.pos_mesa_aplicar_promociones(uuid, jsonb) to authenticated, service_role;

-- ── 3. pos_checkout_v1: uso de las promociones al saldar la mesa ────────────
do $parche$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_old text := E'    insert into public.pos_cobros (id, organization_id, sale_id, created_by, amount, tip_amount, shipping_fee, payment_ids)\n';
  v_new text :=
       E'    -- Promociones de la mesa (promociones_limite_y_cuenta_de_mesa): el uso se suma UNA\n'
    || E'    -- vez, en el cobro que salda la cuenta, y solo de las que quedaron en sus líneas.\n'
    || E'    if v_mesa is not null and v_balance <= v_tol and cardinality(v_promos) > 0 then\n'
    || E'      begin\n'
    || E'        perform public.increment_promotion_usage(v_org, array(\n'
    || E'          select distinct x from unnest(v_promos) x\n'
    || E'           where exists (select 1 from public.sale_items si\n'
    || E'                          where si.sale_id = v_sale_id and si.quantity > 0\n'
    || E'                            and jsonb_typeof(si.notes->''promociones'') = ''array''\n'
    || E'                            and si.notes->''promociones'' ? x::text)));\n'
    || E'      exception when others then\n'
    || E'        v_warnings := array_append(v_warnings, ''promociones: '' || sqlerrm);\n'
    || E'      end;\n'
    || E'    end if;\n'
    || E'    insert into public.pos_cobros (id, organization_id, sale_id, created_by, amount, tip_amount, shipping_fee, payment_ids)\n';
begin
  if position('promociones_limite_y_cuenta_de_mesa' in v_def) > 0 then
    raise notice 'pos_checkout_v1 ya suma el uso al saldar la mesa: nada que hacer';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'pos_checkout_v1: el fragmento de pos_cobros no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$parche$;
