-- Fase 3 de productos por peso: la regla pos_pesaje.agregar_al_estabilizar en
-- pos_pesaje_contexto (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6 punto 5,
-- §2.11 y §11). Pedido del dueño (2026-09-29): con báscula, escanear o tocar
-- un producto por peso lo agrega de una al carrito en cuanto la lectura está
-- estable, sin Enter.
--
-- Decisión: activa por defecto (solo un `false` explícito en
-- organization_settings key 'pos_pesaje' la apaga). La §7 pregunta 7
-- recomendaba «no» antes de este pedido; con la báscula del equipo la
-- lectura estable ya es la confirmación, y sin báscula la regla no aplica
-- (el peso a mano siempre pide Enter).
--
-- Parche sobre la definición VIVA (20260929225100 le agregó
-- peso_en_pantalla_cliente): se inserta una clave después de 'manual', con un
-- fragmento que debe aparecer una sola vez. Sin DDL de tablas.

do $parche$
declare
  v_def text := pg_get_functiondef('public.pos_pesaje_contexto(integer)'::regprocedure);
  v_old text := $frag$    'manual', coalesce(v_regla, 'permiso'),
$frag$;
  v_new text := $frag$    'manual', coalesce(v_regla, 'permiso'),
    -- 20260929220300: con báscula, agregar solo en cuanto la lectura está estable (por defecto sí).
    'agregar_al_estabilizar', coalesce((
      select (s.settings->>'agregar_al_estabilizar') is distinct from 'false'
        from public.organization_settings s
       where s.organization_id = p_org and s.key = 'pos_pesaje'
       limit 1), true),
$frag$;
begin
  if position('agregar_al_estabilizar' in v_def) > 0 then
    return;  -- ya aplicado
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'pos_pesaje_contexto cambió: el fragmento del parche no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$parche$;

revoke all on function public.pos_pesaje_contexto(integer) from public, anon;
grant execute on function public.pos_pesaje_contexto(integer) to authenticated, service_role;
