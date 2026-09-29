-- Rollback de 20260929060000_pos_mesa_cuenta_dividida_abono_real.sql
--
-- Orden: 1) pos_checkout_v1: se invierten los reemplazos sobre su definición VIVA (cada bloque
-- nuevo debe aparecer exactamente una vez y vuelve a su fragmento original; si otra migración
-- posterior tocó esos bloques, se aborta sin cambiar nada). 2) fn_pos_mesa_saldo vuelve al cuerpo
-- exacto de 20260924191500. 3) Se borra fn_pos_tolerancia_moneda. 4) Se borra
-- sale_items.paid_amount.
--
-- NO revierte datos: los abonos por línea (paid_amount) se pierden al borrar la columna, y las
-- líneas que este arreglo dejó con paid_at siguen con paid_at. Tras el rollback vuelve el defecto
-- E1 (una cuenta dividida puede quedar con saldo 0 sin haberse cobrado entera).

create or replace function pg_temp.cuenta_dividida_desparchar(
  p_fn regprocedure, p_marca text, p_frag text[], p_repl text[])
returns void
language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  i integer;
begin
  if position(p_marca in v_def) = 0 then
    return; -- no aplicado
  end if;
  for i in 1 .. array_length(p_repl, 1) loop
    if (length(v_def) - length(replace(v_def, p_repl[i], ''))) / length(p_repl[i]) <> 1 then
      raise exception 'rollback %: el bloque % no aparece exactamente una vez', p_fn, i;
    end if;
  end loop;
  for i in 1 .. array_length(p_repl, 1) loop
    v_def := replace(v_def, p_repl[i], p_frag[i]);
  end loop;
  execute v_def;
end;
$$;

-- ── 1. pos_checkout_v1 (mismos arreglos que la migración) ───────────────────
select pg_temp.cuenta_dividida_desparchar('public.pos_checkout_v1(jsonb)'::regprocedure, 'Cuenta dividida (20260929060000)',
  array[
    -- 1. Declaraciones
    E'  v_mesa        uuid;       -- settle de una mesa: su sesión\n',
    -- 2. «Ya pagada» con la tolerancia de la moneda
    E'    if v_sale.status = ''paid'' and coalesce(v_sale.balance, 0) <= 0 then\n',
    -- 3. Tope del cobro de mesa: el saldo pendiente
    E'  if v_mode = ''settle'' then\n    for v_pay, v_ord in select p.value, p.ord from jsonb_array_elements(v_payments) with ordinality as p(value, ord) order by p.ord loop\n',
    -- 4. Abono a las líneas (antes: la línea entera pagada)
    E'    -- Cuenta dividida por platos: las líneas de este pago quedan pagadas.\n'
    || E'    if v_mesa is not null and jsonb_typeof(p_envelope->''paid_sale_item_ids'') = ''array'' then\n'
    || E'      update public.sale_items si set\n'
    || E'        paid_at = now(), paid_by_split_id = nullif(p_envelope->>''split_id'', ''''), updated_at = now()\n'
    || E'      where si.sale_id = v_sale_id and si.paid_at is null\n'
    || E'        and si.id::text in (select jsonb_array_elements_text(p_envelope->''paid_sale_item_ids''));\n'
    || E'    end if;\n',
    -- 5. Pagada con la tolerancia; todas las líneas pagadas
    E'      status         = case when v_balance <= 0 then ''paid'' else ''pending'' end,\n'
    || E'      payment_status = case when v_balance <= 0 then ''paid'' when v_pagado > 0 then ''partial'' else ''pending'' end,\n'
    || E'      updated_at     = now()\n'
    || E'    where id = v_sale_id;\n'
  ],
  array[
    -- 1.
    E'  v_mesa        uuid;       -- settle de una mesa: su sesión\n'
    || E'  v_tol         numeric;    -- Cuenta dividida (20260929060000): tolerancia de redondeo de la moneda\n'
    || E'  v_abono       numeric;    -- lo que este cobro abona a las líneas (pagos − cambio − propina − flete)\n'
    || E'  v_porcion     numeric;\n'
    || E'  v_saldo_antes numeric;\n',
    -- 2.
    E'    -- Cuenta dividida (20260929060000): pagada = saldo dentro de la tolerancia de la moneda.\n'
    || E'    v_tol := public.fn_pos_tolerancia_moneda(v_org);\n'
    || E'    if v_sale.status = ''paid'' and coalesce(v_sale.balance, 0) <= v_tol then\n',
    -- 3.
    E'  if v_mode = ''settle'' then\n'
    || E'    -- Cuenta dividida (20260929060000): un cobro de mesa no abona más que el saldo\n'
    || E'    -- pendiente (con la tolerancia de redondeo de cada línea). Una parte cobrada dos\n'
    || E'    -- veces con intentos distintos, o un «cobrar» por el total tras un abono, no cobra\n'
    || E'    -- de más. El reintento del MISMO intento ya volvió arriba (pos_cobros).\n'
    || E'    if v_mesa is not null then\n'
    || E'      select coalesce(sum(p.amount - coalesce(p.change_amount, 0)), 0) into v_pagado\n'
    || E'      from public.payments p\n'
    || E'      where p.organization_id = v_org and p.status = ''completed''\n'
    || E'        and ((p.source = ''sale'' and p.source_id = v_sale_id::text)\n'
    || E'          or (p.source = ''invoice_sales'' and p.source_id in (\n'
    || E'                select i.id::text from public.invoice_sales i\n'
    || E'                where i.sale_id = v_sale_id and coalesce(i.document_type, ''invoice'') = ''invoice'')));\n'
    || E'      v_saldo_antes := greatest(0, round(coalesce(v_sale.total, 0) - v_tip - v_shipping - v_pagado, 2));\n'
    || E'      v_abono := greatest(0, v_pay_sum - v_change - v_tip - v_shipping);\n'
    || E'      if v_abono > v_saldo_antes + v_tol * greatest(1, (select count(*) from public.sale_items si\n'
    || E'                                                         where si.sale_id = v_sale_id and si.quantity > 0)) then\n'
    || E'        raise exception ''pago_excede_saldo'' using errcode = ''22023'',\n'
    || E'          detail = format(''El cobro abona %s y el saldo pendiente de la cuenta es %s.'', v_abono, v_saldo_antes);\n'
    || E'      end if;\n'
    || E'    end if;\n'
    || E'    for v_pay, v_ord in select p.value, p.ord from jsonb_array_elements(v_payments) with ordinality as p(value, ord) order by p.ord loop\n',
    -- 4.
    E'    -- Cuenta dividida (20260929060000): el cobro ABONA a las líneas lo que de verdad\n'
    || E'    -- entró, nunca más. Primero a las líneas de la parte, hasta la porción que la parte\n'
    || E'    -- lleva de cada una (su cantidad en el sobre / la cantidad de la línea); lo que sobre\n'
    || E'    -- (cobro por monto: partes iguales o montos) a las demás líneas pendientes, en orden.\n'
    || E'    -- La línea queda pagada (paid_at) solo cuando su abono cubre su total. Antes se\n'
    || E'    -- marcaba pagada la línea entera aunque la parte llevara 1 de 3 unidades (E1).\n'
    || E'    if v_mesa is not null then\n'
    || E'      if jsonb_typeof(p_envelope->''paid_sale_item_ids'') = ''array'' then\n'
    || E'        for v_si in\n'
    || E'          select si.id, si.total, si.quantity, si.paid_amount,\n'
    || E'                 (select sum((i.value->>''quantity'')::numeric) from jsonb_array_elements(v_items) i\n'
    || E'                   where i.value->>''sale_item_id'' = si.id::text) as cantidad_parte\n'
    || E'            from public.sale_items si\n'
    || E'           where si.sale_id = v_sale_id and si.paid_at is null and si.quantity > 0\n'
    || E'             and si.id::text in (select jsonb_array_elements_text(p_envelope->''paid_sale_item_ids''))\n'
    || E'           order by si.created_at, si.id\n'
    || E'        loop\n'
    || E'          exit when v_abono <= 0;\n'
    || E'          v_porcion := least(\n'
    || E'            greatest(0, v_si.total - v_si.paid_amount),\n'
    || E'            round(v_si.total * least(coalesce(v_si.cantidad_parte, v_si.quantity), v_si.quantity) / v_si.quantity, 2),\n'
    || E'            v_abono);\n'
    || E'          continue when v_porcion <= 0;\n'
    || E'          update public.sale_items set\n'
    || E'            paid_amount      = paid_amount + v_porcion,\n'
    || E'            paid_at          = case when paid_amount + v_porcion >= total - v_tol then now() end,\n'
    || E'            paid_by_split_id = case when paid_amount + v_porcion >= total - v_tol\n'
    || E'                                    then nullif(p_envelope->>''split_id'', '''') else paid_by_split_id end,\n'
    || E'            updated_at       = now()\n'
    || E'          where id = v_si.id;\n'
    || E'          v_abono := v_abono - v_porcion;\n'
    || E'        end loop;\n'
    || E'      end if;\n'
    || E'      for v_si in\n'
    || E'        select si.id, si.total, si.paid_amount from public.sale_items si\n'
    || E'         where si.sale_id = v_sale_id and si.paid_at is null and si.quantity > 0\n'
    || E'         order by si.created_at, si.id\n'
    || E'      loop\n'
    || E'        exit when v_abono <= 0;\n'
    || E'        v_porcion := least(greatest(0, v_si.total - v_si.paid_amount), v_abono);\n'
    || E'        continue when v_porcion <= 0;\n'
    || E'        update public.sale_items set\n'
    || E'          paid_amount      = paid_amount + v_porcion,\n'
    || E'          paid_at          = case when paid_amount + v_porcion >= total - v_tol then now() end,\n'
    || E'          paid_by_split_id = case when paid_amount + v_porcion >= total - v_tol\n'
    || E'                                  then nullif(p_envelope->>''split_id'', '''') else paid_by_split_id end,\n'
    || E'          updated_at       = now()\n'
    || E'        where id = v_si.id;\n'
    || E'        v_abono := v_abono - v_porcion;\n'
    || E'      end loop;\n'
    || E'    end if;\n',
    -- 5.
    E'      status         = case when v_balance <= v_tol then ''paid'' else ''pending'' end,\n'
    || E'      payment_status = case when v_balance <= v_tol then ''paid'' when v_pagado > 0 then ''partial'' else ''pending'' end,\n'
    || E'      updated_at     = now()\n'
    || E'    where id = v_sale_id;\n'
    || E'    -- Cuenta dividida (20260929060000): venta pagada → todas sus líneas pagadas.\n'
    || E'    if v_mesa is not null and v_balance <= v_tol then\n'
    || E'      update public.sale_items si set\n'
    || E'        paid_amount = si.total, paid_at = now(),\n'
    || E'        paid_by_split_id = coalesce(si.paid_by_split_id, nullif(p_envelope->>''split_id'', '''')), updated_at = now()\n'
    || E'      where si.sale_id = v_sale_id and si.paid_at is null and si.quantity > 0;\n'
    || E'    end if;\n'
  ]);

-- ── 2. fn_pos_mesa_saldo: cuerpo de 20260924191500 ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_pos_mesa_saldo(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sale             public.sales%rowtype;
  v_items_total      numeric;
  v_sin_pagar        numeric;
  v_division         boolean;
  v_pagado           numeric;
  v_total            numeric;
  v_saldo            numeric;
  v_facturas         integer;
  v_factura_saldo    numeric;
  v_factura_cliente  boolean;
begin
  select * into v_sale from public.sales s where s.id = p_sale_id;
  if not found then
    return null;
  end if;

  select coalesce(sum(si.total), 0),
         coalesce(sum(si.total) filter (where si.paid_at is null), 0),
         coalesce(bool_or(si.paid_by_split_id is not null), false)
    into v_items_total, v_sin_pagar, v_division
  from public.sale_items si
  where si.sale_id = p_sale_id;

  select coalesce(sum(p.amount - coalesce(p.change_amount, 0)), 0)
    into v_pagado
  from public.payments p
  where p.organization_id = v_sale.organization_id
    and p.status = 'completed'
    and (
      (p.source = 'sale' and p.source_id = p_sale_id::text)
      or (p.source = 'invoice_sales' and p.source_id in (
            select i.id::text from public.invoice_sales i
            where i.sale_id = p_sale_id and coalesce(i.document_type, 'invoice') = 'invoice'))
    );

  select count(*), coalesce(sum(i.balance), 0), coalesce(bool_and(i.customer_id is not null), false)
    into v_facturas, v_factura_saldo, v_factura_cliente
  from public.invoice_sales i
  where i.sale_id = p_sale_id
    and coalesce(i.document_type, 'invoice') = 'invoice'
    and i.status <> 'void';

  if v_sale.status = 'void' then
    v_total := coalesce(v_sale.total, 0);
    v_saldo := 0;
  elsif v_division then
    v_total := v_items_total;
    v_saldo := v_sin_pagar;
  elsif v_sale.status = 'paid' then
    v_total := coalesce(v_sale.total, v_items_total);
    v_saldo := 0;
  else
    v_total := v_items_total;
    v_saldo := greatest(0, v_items_total - v_pagado);
  end if;

  return jsonb_build_object(
    'sale_id', v_sale.id,
    'estado', v_sale.status,
    'customer_id', v_sale.customer_id,
    'branch_id', v_sale.branch_id,
    'total', round(v_total, 2),
    'pagado', round(v_pagado, 2),
    'saldo', round(v_saldo, 2),
    'division', v_division,
    'facturas', v_facturas,
    'factura_saldo', round(v_factura_saldo, 2),
    'factura_con_cliente', v_factura_cliente
  );
end;
$function$;

revoke all on function public.fn_pos_mesa_saldo(uuid) from public, anon, authenticated;
grant execute on function public.fn_pos_mesa_saldo(uuid) to service_role;

-- ── 3 y 4. Tolerancia y abono por línea ─────────────────────────────────────
drop function if exists public.fn_pos_tolerancia_moneda(integer);

-- Advertencia: borra los abonos por línea (ver encabezado).
alter table public.sale_items drop column if exists paid_amount;
