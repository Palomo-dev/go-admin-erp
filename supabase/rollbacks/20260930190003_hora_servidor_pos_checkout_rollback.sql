-- Rollback de 20260930190003_hora_servidor_pos_checkout.sql
--
-- Deshace las sustituciones sobre pos_checkout_v1 (en orden inverso): la RPC vuelve a
-- tomar la hora del sobre como hora oficial. Debe correr ANTES del rollback de
-- 20260930190001 (esta versión usa fn_hora_oficial_resolver y las columnas nuevas).
-- DATOS: las ventas registradas mientras estuvo activa conservan su hora oficial.

do $rollback$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_pares text[][] := array[
    array[
      E'      source, source_id, created_by, created_at, payment_date\n'
      || E'    ) values (\n'
      || E'      v_org, v_branch, (v_pay->>''amount'')::numeric, v_pay->>''method'', v_currency, ''completed'',\n'
      || E'      case when v_takes_change then v_change else 0 end,\n'
      || E'      ''invoice_sales'', v_invoice.id::text, v_actor,\n'
      || E'      coalesce(v_sale.sale_date, v_created_at), coalesce(v_sale.sale_date, v_created_at)\n'
      || E'    );',
      E'      source, source_id, created_by\n'
      || E'    ) values (\n'
      || E'      v_org, v_branch, (v_pay->>''amount'')::numeric, v_pay->>''method'', v_currency, ''completed'',\n'
      || E'      case when v_takes_change then v_change else 0 end,\n'
      || E'      ''invoice_sales'', v_invoice.id::text, v_actor\n'
      || E'    );'
    ],
    array[
      E'v_org, coalesce(v_sale.branch_id, v_branch), v_customer, v_sale_id, v_number, coalesce(v_sale.sale_date, v_created_at),\n'
      || E'      case when v_mode = ''debt'' then coalesce(v_sale.sale_date, v_created_at) + make_interval(days => v_terms) else coalesce(v_sale.sale_date, v_created_at) end,',
      E'v_org, coalesce(v_sale.branch_id, v_branch), v_customer, v_sale_id, v_number, v_created_at,\n'
      || E'      case when v_mode = ''debt'' then v_created_at + make_interval(days => v_terms) else v_created_at end,'
    ],
    array[
      E'          else null end,\n'
      || E'        v_hora_equipo,\n'
      || E'        greatest(-2000000000, least(2000000000, case\n'
      || E'          when v_sin_conexion then v_desfase_ms / 1000\n'
      || E'          when v_hora_equipo is not null then round(extract(epoch from (v_hora_equipo - now())))\n'
      || E'        end))::integer,\n'
      || E'        v_revision\n'
      || E'      ) returning * into v_sale;',
      E'          else null end\n      ) returning * into v_sale;'
    ],
    array[
      E'salesperson_id, commission_rate, commission_type, delivery_fee, tip_amount, notes,\n'
      || E'        device_created_at, clock_skew_seconds, time_review_reason\n      ) values (',
      E'salesperson_id, commission_rate, commission_type, delivery_fee, tip_amount, notes\n      ) values ('
    ],
    array[
      E'perform public.fn_pos_validar_linea_venta(v_org, v_actor, v_item, v_hora_precio, p_envelope->''discount_authorization'');',
      E'perform public.fn_pos_validar_linea_venta(v_org, v_actor, v_item, v_created_at, p_envelope->''discount_authorization'');'
    ],
    array[
      E'  -- Hora oficial (20260930190003): la pone el servidor. La del sobre es la del\n'
      || E'  -- equipo: se guarda en sales.device_created_at y solo cuenta en una venta\n'
      || E'  -- sin conexión con el desfase medido ≤ 10 min (fn_hora_oficial_resolver).\n'
      || E'  v_hora_equipo  := nullif(p_envelope->>''created_at'', '''')::timestamptz;\n'
      || E'  v_sin_conexion := coalesce(nullif(p_envelope->>''offline'', '''')::boolean, false);\n'
      || E'  v_desfase_ms   := nullif(p_envelope->>''clock_offset_ms'', '''')::numeric::bigint;\n'
      || E'  select r.instante, r.motivo_revision into v_created_at, v_revision\n'
      || E'    from public.fn_hora_oficial_resolver(v_hora_equipo, v_desfase_ms, v_sin_conexion) r;\n'
      || E'  -- Precio vigente al momento real de la venta: sin conexión, la hora del equipo (nunca futura).\n'
      || E'  v_hora_precio  := case when v_sin_conexion then least(coalesce(v_hora_equipo, now()), now()) else now() end;',
      E'  v_created_at := coalesce((p_envelope->>''created_at'')::timestamptz, now());'
    ],
    array[
      E'  v_hora_equipo timestamptz;   -- Hora oficial (20260930190003): la que mandó el equipo\n'
      || E'  v_sin_conexion boolean;\n'
      || E'  v_desfase_ms  bigint;\n'
      || E'  v_revision    text;\n'
      || E'  v_hora_precio timestamptz;\n',
      ''
    ]
  ];
  v_i integer;
  v_veces integer;
begin
  if position('fn_hora_oficial_resolver' in v_def) = 0 then
    raise notice 'pos_checkout_v1 no tiene la hora oficial: nada que revertir';
    return;
  end if;
  for v_i in 1 .. array_length(v_pares, 1) loop
    v_veces := (length(v_def) - length(replace(v_def, v_pares[v_i][1], ''))) / length(v_pares[v_i][1]);
    if v_veces <> 1 then
      raise exception 'rollback pos_checkout_v1: el fragmento % aparece % veces (se esperaba 1)', v_i, v_veces;
    end if;
    v_def := replace(v_def, v_pares[v_i][1], v_pares[v_i][2]);
  end loop;
  execute v_def;
end;
$rollback$;
