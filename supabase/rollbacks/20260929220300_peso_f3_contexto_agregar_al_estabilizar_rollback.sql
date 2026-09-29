-- Reversión de 20260929220300_peso_f3_contexto_agregar_al_estabilizar.
-- Quita la clave agregar_al_estabilizar de pos_pesaje_contexto (definición
-- viva). El POS la toma como true si falta, así que revertir no cambia el
-- comportamiento de las organizaciones sin la regla; las que la tenían en
-- false pasan a agregar al estabilizar hasta que se revierta también el cliente.
-- No toca organization_settings.

do $parche$
declare
  v_def text := pg_get_functiondef('public.pos_pesaje_contexto(integer)'::regprocedure);
  v_frag text := $frag$    -- 20260929220300: con báscula, agregar solo en cuanto la lectura está estable (por defecto sí).
    'agregar_al_estabilizar', coalesce((
      select (s.settings->>'agregar_al_estabilizar') is distinct from 'false'
        from public.organization_settings s
       where s.organization_id = p_org and s.key = 'pos_pesaje'
       limit 1), true),
$frag$;
begin
  if position(v_frag in v_def) = 0 then
    return;  -- ya revertido
  end if;
  execute replace(v_def, v_frag, '');
end;
$parche$;

revoke all on function public.pos_pesaje_contexto(integer) from public, anon;
grant execute on function public.pos_pesaje_contexto(integer) to authenticated, service_role;
