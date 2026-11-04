-- buscar_productos (lo usa el chat de atención para las tarjetas de producto) tomaba la
-- primera foto aunque su archivo ya no existiera en Storage (~62 mil tras la restauración
-- del 2026-11-03): la tarjeta salía rota. Se limita a fotos con archivo_disponible
-- (20261104003053). Se edita la definición viva para no reescribir a mano la función.
-- Ensayo (ENSAYO_OK): org 137 sin foto (antes rota); orgs 358 y 338 conservan las suyas.
-- Rollback: supabase/rollbacks/20261104004934_buscar_productos_solo_fotos_con_archivo_rollback.sql
do $e$
declare
  v_def text;
  v_ancla text := 'join public.product_images pi on pi.product_id = p2.id';
begin
  v_def := pg_get_functiondef('public.buscar_productos(integer,text[],integer,real)'::regprocedure);
  if position(v_ancla || ' and pi.archivo_disponible' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'buscar_productos: el ancla no aparece exactamente una vez; revisar a mano';
  end if;
  execute replace(v_def, v_ancla, v_ancla || ' and pi.archivo_disponible');
end $e$;
