-- Rollback de 20260929001100_membresias_enganche_venta.sql
--
-- Invierte los reemplazos sobre la definición VIVA de cada función: cada bloque nuevo debe aparecer
-- exactamente una vez y vuelve a su fragmento original (mismos arreglos que la migración). Si otra
-- migración posterior tocó esos bloques, se aborta sin cambiar nada.
-- No revierte datos: las membresías creadas por ventas se quedan (las quita el rollback de M3).
-- Orden: revertir ESTE archivo antes que 20260929001000 (las funciones de venta llaman a las de M6).

create or replace function pg_temp.membresias_desparchar(
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

-- ── pos_checkout_v1 ─────────────────────────────────────────────────────────
select pg_temp.membresias_desparchar('public.pos_checkout_v1(jsonb)'::regprocedure, 'Membresías (20260929001100)',
  array[
    E'  v_mesa        uuid;       -- settle de una mesa: su sesión\n',
    E'  -- ── 13. Resultado (filas frescas: los disparadores ya recalcularon) ──────\n',
    E'    ''payment_key'', v_key\n  );'
  ],
  array[
    E'  v_mesa        uuid;       -- settle de una mesa: su sesión\n'
    || E'  v_membresias  jsonb;      -- Membresías (20260929001100): activadas o pendientes por esta venta\n',

    E'  -- ── 12b. Membresías (20260929001100): se crean o activan en esta misma transacción ──\n'
    || E'  -- Venta pagada → activas; deuda → pendientes; settle que salda → las pendientes se activan.\n'
    || E'  -- Una línea membresía sin cliente aborta el cobro (membresia_sin_cliente).\n'
    || E'  v_membresias := public.fn_membresias_activar_venta(v_sale_id, v_invoice.id, ''pos'', null);\n\n'
    || E'  -- ── 13. Resultado (filas frescas: los disparadores ya recalcularon) ──────\n',

    E'    ''payment_key'', v_key,\n    ''membresias'', coalesce(v_membresias, ''[]''::jsonb)\n  );'
  ]);

-- ── fn_factura_venta_emitir ─────────────────────────────────────────────────
select pg_temp.membresias_desparchar('public.fn_factura_venta_emitir(uuid)'::regprocedure, 'Membresías (20260929001100)',
  array[
    E'  v_avisos text[] := ''{}'';\nbegin\n',
    E'  return jsonb_build_object(''id'', v_inv.id, ''numero'', v_numero, ''status'', ''issued'',',
    E'''seriales_avisos'', to_jsonb(v_avisos));'
  ],
  array[
    E'  v_avisos text[] := ''{}'';\n  v_membresias jsonb := ''[]''::jsonb; -- Membresías (20260929001100)\nbegin\n',

    E'  -- Membresías (20260929001100): contado pagado o crédito on_credit → activas; si no, pendientes.\n'
    || E'  if v_inv.sale_id is not null then\n'
    || E'    v_membresias := public.fn_membresias_activar_venta(v_inv.sale_id, v_inv.id, ''invoice'', null);\n'
    || E'  end if;\n\n'
    || E'  return jsonb_build_object(''id'', v_inv.id, ''numero'', v_numero, ''status'', ''issued'',',

    E'''seriales_avisos'', to_jsonb(v_avisos), ''membresias'', v_membresias);'
  ]);

-- ── fn_registrar_pago ───────────────────────────────────────────────────────
select pg_temp.membresias_desparchar(
  'public.fn_registrar_pago(text, jsonb, text, text, date, text, integer, numeric, numeric, text, text, text, integer)'::regprocedure,
  'Membresías (20260929001100)',
  array[
    E'  v_pagos jsonb := ''[]''::jsonb;\nbegin\n',
    E'  return jsonb_build_object(\n    ''grupo_id'', v_grupo.id, ''recibo'', v_recibo, ''repetida'', false,',
    E'''credito_id'', v_credito, ''caja_id'', v_caja, ''pagos'', coalesce(v_pagos, ''[]''::jsonb));'
  ],
  array[
    E'  v_pagos jsonb := ''[]''::jsonb;\n'
    || E'  v_mem_inv record;                      -- Membresías (20260929001100)\n'
    || E'  v_membresias jsonb := ''[]''::jsonb;\n'
    || E'begin\n',

    E'  -- Membresías (20260929001100): una factura que quedó saldada activa sus membresías pendientes.\n'
    || E'  if p_direccion = ''cobro'' then\n'
    || E'    for v_mem_inv in\n'
    || E'      select distinct i.id, i.sale_id\n'
    || E'        from jsonb_array_elements(coalesce(v_pagos, ''[]''::jsonb)) p\n'
    || E'        join public.accounts_receivable a on a.id = (p->>''cuenta_id'')::uuid\n'
    || E'        join public.invoice_sales i on i.id = a.invoice_id\n'
    || E'       where i.sale_id is not null\n'
    || E'    loop\n'
    || E'      v_membresias := v_membresias || public.fn_membresias_activar_venta(v_mem_inv.sale_id, v_mem_inv.id, ''invoice'', null);\n'
    || E'    end loop;\n'
    || E'  end if;\n\n'
    || E'  return jsonb_build_object(\n    ''grupo_id'', v_grupo.id, ''recibo'', v_recibo, ''repetida'', false,',

    E'''credito_id'', v_credito, ''caja_id'', v_caja, ''pagos'', coalesce(v_pagos, ''[]''::jsonb),\n'
    || E'    ''membresias'', v_membresias);'
  ]);

-- ── pos_anular_venta_v1 ─────────────────────────────────────────────────────
select pg_temp.membresias_desparchar('public.pos_anular_venta_v1(uuid, text)'::regprocedure, 'Membresías (20260929001100)',
  array[
    E'  v_periodo_ok boolean;\nbegin\n',
    E'  update public.sales set\n    status         = ''void'',\n',
    E'    ''avisos'', to_jsonb(v_avisos)\n  );\nend;'
  ],
  array[
    E'  v_periodo_ok boolean;\n'
    || E'  v_mem_si     record;                   -- Membresías (20260929001100)\n'
    || E'  v_n_membresias integer := 0;\n'
    || E'begin\n',

    E'  -- Membresías (20260929001100): la anulación cancela las membresías de sus líneas.\n'
    || E'  for v_mem_si in\n'
    || E'    select si.id, si.quantity from public.sale_items si where si.sale_id = v_sale.id and si.quantity > 0\n'
    || E'  loop\n'
    || E'    if (public.fn_membresias_revertir_linea(v_mem_si.id, v_mem_si.quantity, v_motivo,\n'
    || E'          jsonb_build_object(''tipo'', ''anulacion'', ''id'', v_sale.id))->>''accion'') is not null then\n'
    || E'      v_n_membresias := v_n_membresias + 1;\n'
    || E'    end if;\n'
    || E'  end loop;\n\n'
    || E'  update public.sales set\n    status         = ''void'',\n',

    E'    ''avisos'', to_jsonb(v_avisos),\n    ''membresias_canceladas'', v_n_membresias\n  );\nend;'
  ]);

-- ── procesar_devolucion ─────────────────────────────────────────────────────
select pg_temp.membresias_desparchar(
  'public.procesar_devolucion(integer, uuid, jsonb, text, text, text, text)'::regprocedure,
  'Membresías (20260929001100)',
  array[
    E'      array(select x::integer from jsonb_array_elements_text(v_linea->''serial_ids'') x)\n    );\n'
  ],
  array[
    E'      array(select x::integer from jsonb_array_elements_text(v_linea->''serial_ids'') x)\n    );\n'
    || E'    -- Membresías (20260929001100): devolución total → cancela; parcial → recorta periodos (P6).\n'
    || E'    perform public.fn_membresias_revertir_linea((v_linea->>''sale_item_id'')::uuid,\n'
    || E'      (v_linea->>''quantity'')::numeric, btrim(p_reason),\n'
    || E'      jsonb_build_object(''tipo'', ''devolucion'', ''id'', v_return_id));\n'
  ]);

-- ── fn_nota_credito_emitir ──────────────────────────────────────────────────
select pg_temp.membresias_desparchar(
  'public.fn_nota_credito_emitir(uuid, text, jsonb, numeric, text, text, boolean, text, text, integer, text)'::regprocedure,
  'Membresías (20260929001100)',
  array[
    E'  v_track boolean;\nbegin\n',
    E'  insert into public.invoice_applied_taxes (invoice_id, tax_code, tax_rate, is_applied)\n'
  ],
  array[
    E'  v_track boolean;\n  v_mem_l record;                        -- Membresías (20260929001100)\nbegin\n',

    E'  -- Membresías (20260929001100): cada línea acreditada de un producto membresía recorta o cancela su\n'
    || E'  -- membresía. Una nota por valor (sin líneas) no la toca.\n'
    || E'  if p_modo <> ''valor'' and v_inv.sale_id is not null then\n'
    || E'    for v_mem_l in\n'
    || E'      select (l->>''product_id'')::integer as product_id, sum((l->>''q'')::numeric) as q\n'
    || E'        from jsonb_array_elements(v_lineas) l\n'
    || E'       where l->>''product_id'' is not null\n'
    || E'       group by (l->>''product_id'')::integer\n'
    || E'    loop\n'
    || E'      perform public.fn_membresias_revertir_producto(v_inv.sale_id, v_mem_l.product_id, v_mem_l.q,\n'
    || E'        btrim(p_motivo), jsonb_build_object(''tipo'', ''nota_credito'', ''id'', v_nc_id));\n'
    || E'    end loop;\n'
    || E'  end if;\n\n'
    || E'  insert into public.invoice_applied_taxes (invoice_id, tax_code, tax_rate, is_applied)\n'
  ]);
