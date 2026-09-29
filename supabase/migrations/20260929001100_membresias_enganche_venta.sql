-- Membresías — fase 2: enganche en las funciones de venta, pago y reversos
-- (docs/design/MEMBRESIAS-FASE-1-2.md §1.6 y §4).
--
-- Patrón: se parte de la definición VIVA de cada función (pg_get_functiondef) y se reemplazan
-- fragmentos que deben aparecer EXACTAMENTE una vez; si alguno no, se aborta sin tocar nada. Así se
-- conserva todo lo que otras sesiones hayan cambiado en esas funciones (pos_checkout_v1 vive en
-- cuatro migraciones; fn_factura_venta_emitir y fn_registrar_pago cambiaron esta semana).
--
--   pos_checkout_v1         antes de «13. Resultado»: activa (o deja pendientes) las membresías de la
--                           venta; el resultado lleva «membresias». Sin cliente → membresia_sin_cliente
--                           y se revierte el cobro entero (P1).
--   fn_factura_venta_emitir tras emitir: contado pagado → activa; crédito on_credit → activa;
--                           crédito prepaid → pendiente.
--   fn_registrar_pago       al final: cada factura cobrada activa sus pendientes si quedó en 0.
--   pos_anular_venta_v1     antes de anular la venta: cancela las membresías de sus líneas.
--   procesar_devolucion     por línea devuelta: total → cancela; parcial → recorta periodos.
--   fn_nota_credito_emitir  por línea acreditada (modo total o líneas): igual que la devolución.
--                           La nota por VALOR (sin líneas) no toca membresías.

create or replace function pg_temp.membresias_parchar(
  p_fn regprocedure, p_marca text, p_frag text[], p_repl text[])
returns void
language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  i integer;
begin
  if position(p_marca in v_def) > 0 then
    return; -- ya aplicado
  end if;
  for i in 1 .. array_length(p_frag, 1) loop
    if (length(v_def) - length(replace(v_def, p_frag[i], ''))) / length(p_frag[i]) <> 1 then
      raise exception '%: el fragmento % no aparece exactamente una vez', p_fn, i;
    end if;
  end loop;
  for i in 1 .. array_length(p_frag, 1) loop
    v_def := replace(v_def, p_frag[i], p_repl[i]);
  end loop;
  execute v_def;
end;
$$;

-- ── pos_checkout_v1 ─────────────────────────────────────────────────────────
select pg_temp.membresias_parchar('public.pos_checkout_v1(jsonb)'::regprocedure, 'Membresías (20260929001100)',
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
select pg_temp.membresias_parchar('public.fn_factura_venta_emitir(uuid)'::regprocedure, 'Membresías (20260929001100)',
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
select pg_temp.membresias_parchar(
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
select pg_temp.membresias_parchar('public.pos_anular_venta_v1(uuid, text)'::regprocedure, 'Membresías (20260929001100)',
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
select pg_temp.membresias_parchar(
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
select pg_temp.membresias_parchar(
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
