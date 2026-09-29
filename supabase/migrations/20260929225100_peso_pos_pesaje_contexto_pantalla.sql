-- `pos_pesaje_contexto` devuelve también la regla `peso_en_pantalla_cliente`
-- (organization_settings, clave `pos_pesaje`; activa por defecto,
-- docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6 y §2.11): la caja muestra
-- «Pesando: 0,735 kg × $ 18.900 / kg = $ 13.892» en la pantalla del cliente
-- mientras «Pesar» está abierto, salvo que la organización lo apague con
-- `"peso_en_pantalla_cliente": false`.
--
-- Parche sobre la definición VIVA (pg_get_functiondef + replace + execute,
-- como 20260925140300): conserva cualquier otro cambio que la función ya
-- tenga. Idempotente: si la clave ya está, no hace nada; si el ancla no
-- aparece, falla en vez de aplicar a ciegas.

do $migracion$
declare
  v_def   text := pg_get_functiondef('public.pos_pesaje_contexto(integer)'::regprocedure);
  v_ancla text := $a$'puede_pesar_a_mano', case when$a$;
  v_nuevo text := $n$'peso_en_pantalla_cliente', coalesce((
      select (s.settings->>'peso_en_pantalla_cliente') is distinct from 'false'
        from public.organization_settings s
       where s.organization_id = p_org and s.key = 'pos_pesaje'
       limit 1), true),
    'puede_pesar_a_mano', case when$n$;
begin
  if position('peso_en_pantalla_cliente' in v_def) > 0 then
    return;
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception 'pos_pesaje_contexto cambió: no se encontró el ancla del parche';
  end if;
  execute replace(v_def, v_ancla, v_nuevo);
end
$migracion$;

-- Los permisos no cambian con CREATE OR REPLACE; se reafirman por claridad.
revoke all on function public.pos_pesaje_contexto(integer) from public, anon;
grant execute on function public.pos_pesaje_contexto(integer) to authenticated, service_role;
