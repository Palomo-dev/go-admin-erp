-- Inventario B7 · 4 — track_lots también al crear y duplicar
-- Complemento de 20260929160200_inv_b7_3_lotes_desde_el_producto: esa línea
-- vive en el UPDATE de «editar»; crear y duplicar hacen un INSERT aparte (medido
-- en la base con una transacción deshecha: el producto nacía sin lotes). Aquí se
-- fija justo después del INSERT/UPDATE y antes del stock inicial, que es el que
-- necesita saber si el producto maneja lotes. Parche sobre la definición viva
-- con ancla única y marcador, como inv_b7_3.

do $$
declare
  v_def text;
  v_ancla text := E'    returning id, uuid into v_id, v_uuid;\n  end if;\n';
  v_bloque text := E'\n  -- inv_b7_4 track_lots al crear: sin control de existencias no hay lotes.\n'
    || E'  if v_modo <> ''editar'' then\n'
    || E'    update public.products\n'
    || E'       set track_lots = v_track and coalesce((v_pr->>''track_lots'')::boolean, false)\n'
    || E'     where id = v_id\n'
    || E'       and track_lots is distinct from (v_track and coalesce((v_pr->>''track_lots'')::boolean, false));\n'
    || E'  end if;\n';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_producto_guardar';
  if v_def is null then
    raise exception 'inv_b7_4: fn_producto_guardar no existe';
  end if;
  if position('inv_b7_4 track_lots' in v_def) > 0 then
    return; -- ya aplicado
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'inv_b7_4: el ancla del INSERT no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_ancla, v_ancla || v_bloque);
end;
$$;
