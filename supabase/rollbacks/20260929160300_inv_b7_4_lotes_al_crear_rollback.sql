-- Rollback de 20260929160300_inv_b7_4_lotes_al_crear.sql
-- Quita de fn_producto_guardar el bloque marcado «inv_b7_4 track_lots». No
-- cambia `products.track_lots` de los productos que ya lo tienen.

do $$
declare
  v_def text;
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
  if v_def is not null and position(v_bloque in v_def) > 0 then
    execute replace(v_def, v_bloque, '');
  end if;
end;
$$;
