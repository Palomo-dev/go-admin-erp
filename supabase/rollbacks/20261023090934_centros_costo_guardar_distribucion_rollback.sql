-- Revierte 20261023090934_centros_costo_guardar_distribucion.
-- Quita fn_distribucion_guardar y le devuelve a pos_caja_registrar_movimiento
-- la firma de 18 argumentos, sin p_distribucion_id.
-- No borra movimientos de caja. La fila de prueba prueba-guardar-reparto
-- se eliminó dentro de la migración; aquí no hay datos que restaurar.
-- Ejecutar primero, antes de revertir 20261023085438_centros_costo_reportes.

do $rb$
declare
  v_nueva text := 'public.pos_caja_registrar_movimiento(integer,text,numeric,text,text,text,text,uuid,timestamptz,bigint,text,uuid,text,text,text,text,text,text,uuid)';
  v_vieja text := 'public.pos_caja_registrar_movimiento(integer,text,numeric,text,text,text,text,uuid,timestamptz,bigint,text,uuid,text,text,text,text,text,text)';
  v_def text;
  v_firma text := 'p_tercero_dv text DEFAULT NULL::text, p_distribucion_id uuid DEFAULT NULL::uuid)';
  v_firma_vieja text := 'p_tercero_dv text DEFAULT NULL::text)';
  v_cols text := 'tercero_tipo, tercero_id, tercero_dv, distribucion_id';
  v_cols_viejas text := 'tercero_tipo, tercero_id, tercero_dv';
  v_val text := 'nullif(btrim(p_tercero_dv), ''''), p_distribucion_id';
  v_val_viejo text := 'nullif(btrim(p_tercero_dv), '''')';
begin
  if to_regprocedure(v_nueva) is null then
    return;
  end if;
  v_def := pg_get_functiondef(v_nueva::regprocedure);
  if (length(v_def) - length(replace(v_def, v_firma, ''))) / length(v_firma) <> 1
     or (length(v_def) - length(replace(v_def, v_cols, ''))) / length(v_cols) <> 1
     or (length(v_def) - length(replace(v_def, v_val, ''))) / length(v_val) <> 1 then
    raise exception 'el movimiento de caja no tiene un único punto para quitar la distribución';
  end if;
  v_def := replace(v_def, v_firma, v_firma_vieja);
  v_def := replace(v_def, v_cols, v_cols_viejas);
  v_def := replace(v_def, v_val, v_val_viejo);
  execute v_def;
  if to_regprocedure(v_vieja) is null
     or position('p_distribucion_id' in pg_get_functiondef(v_vieja::regprocedure)) > 0 then
    raise exception 'la caja no recuperó la firma anterior';
  end if;
  execute format('revoke all on function %s from public, anon', v_vieja::regprocedure);
  execute format('grant execute on function %s to authenticated, service_role', v_vieja::regprocedure);
  execute format('grant execute on function %s to %I, postgres', v_vieja::regprocedure, current_user);
  execute format('drop function %s', v_nueva::regprocedure);
end
$rb$;

drop function if exists public.fn_distribucion_guardar(integer, text, jsonb, uuid);
