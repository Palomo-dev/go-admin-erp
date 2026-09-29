-- Reversión de 20260929225100_peso_pos_pesaje_contexto_pantalla.
-- Quita la clave `peso_en_pantalla_cliente` de la respuesta de
-- `pos_pesaje_contexto` sobre la definición viva (conserva otros cambios).
-- No toca datos: la regla sigue guardada en organization_settings.

do $reversion$
declare
  v_def   text := pg_get_functiondef('public.pos_pesaje_contexto(integer)'::regprocedure);
  v_nuevo text := $n$'peso_en_pantalla_cliente', coalesce((
      select (s.settings->>'peso_en_pantalla_cliente') is distinct from 'false'
        from public.organization_settings s
       where s.organization_id = p_org and s.key = 'pos_pesaje'
       limit 1), true),
    'puede_pesar_a_mano', case when$n$;
  v_ancla text := $a$'puede_pesar_a_mano', case when$a$;
begin
  if position(v_nuevo in v_def) = 0 then
    return;
  end if;
  execute replace(v_def, v_nuevo, v_ancla);
end
$reversion$;

revoke all on function public.pos_pesaje_contexto(integer) from public, anon;
grant execute on function public.pos_pesaje_contexto(integer) to authenticated, service_role;
