-- Rollback de 20261007032940_promociones_limite_y_cuenta_de_mesa.sql
--
-- Orden inverso:
--   3. pos_checkout_v1: quita el bloque que suma el uso al saldar la mesa
--      (sustitución exacta inversa sobre la definición viva).
--   2. pos_mesa_aplicar_promociones: se elimina. El navegador que la llame
--      recibirá «función no existe»; PedidosService lo registra y la cuenta
--      queda sin recalcular promociones (como antes de esta migración).
--   1. increment_promotion_usage: vuelve a sumar sin mirar usage_limit
--      (cuerpo y comentario de 20260911020000).
--
-- DATOS: no se revierten. Las líneas de mesa conservan el descuento escrito
-- y sus claves `notes.descuento_promocion` / `notes.promociones`, y los
-- usage_count sumados se quedan.

-- ── 3. pos_checkout_v1 ─────────────────────────────────────────────────────
do $rollback$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_bloque text :=
       E'    -- Promociones de la mesa (promociones_limite_y_cuenta_de_mesa): el uso se suma UNA\n'
    || E'    -- vez, en el cobro que salda la cuenta, y solo de las que quedaron en sus líneas.\n'
    || E'    if v_mesa is not null and v_balance <= v_tol and cardinality(v_promos) > 0 then\n'
    || E'      begin\n'
    || E'        perform public.increment_promotion_usage(v_org, array(\n'
    || E'          select distinct x from unnest(v_promos) x\n'
    || E'           where exists (select 1 from public.sale_items si\n'
    || E'                          where si.sale_id = v_sale_id and si.quantity > 0\n'
    || E'                            and jsonb_typeof(si.notes->''promociones'') = ''array''\n'
    || E'                            and si.notes->''promociones'' ? x::text)));\n'
    || E'      exception when others then\n'
    || E'        v_warnings := array_append(v_warnings, ''promociones: '' || sqlerrm);\n'
    || E'      end;\n'
    || E'    end if;\n';
begin
  if position(v_bloque in v_def) = 0 then
    raise notice 'pos_checkout_v1 no tiene el bloque: nada que revertir';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_bloque, ''))) / length(v_bloque) <> 1 then
    raise exception 'pos_checkout_v1: el bloque aparece más de una vez';
  end if;
  execute replace(v_def, v_bloque, '');
end;
$rollback$;

-- ── 2. pos_mesa_aplicar_promociones ────────────────────────────────────────
drop function if exists public.pos_mesa_aplicar_promociones(uuid, jsonb);

-- ── 1. increment_promotion_usage (versión 20260911020000) ──────────────────
create or replace function public.increment_promotion_usage(p_organization_id integer, p_promotion_ids uuid[])
returns integer
language sql
security invoker
set search_path = public
as $$
  with actualizadas as (
    update promotions
       set usage_count = coalesce(usage_count, 0) + 1,
           updated_at = now()
     where organization_id = p_organization_id
       and id = any(p_promotion_ids)
    returning id
  )
  select count(*)::integer from actualizadas;
$$;

comment on function public.increment_promotion_usage(integer, uuid[]) is
  'Incrementa usage_count de las promociones indicadas en un solo UPDATE (sin leer-y-escribir). Solo toca filas de p_organization_id; ids de otra organización se ignoran. SECURITY INVOKER: con sesión de usuario aplica RLS de promotions.';

revoke execute on function public.increment_promotion_usage(integer, uuid[]) from public, anon;
grant execute on function public.increment_promotion_usage(integer, uuid[]) to authenticated, service_role;
