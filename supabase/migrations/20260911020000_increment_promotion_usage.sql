-- ============================================================
-- Promociones: contador de usos atómico (increment_promotion_usage)
-- ============================================================
-- Hasta hoy ninguna promoción registraba su uso: ni el POS ni el sitio web
-- tocaban `promotions.usage_count`, así que la pantalla de promociones
-- mostraba "Usos: 0" aunque el descuento saliera en cada pedido web (caso
-- org 135, 2026-09-10: 16.000 y 66.400 de promoción en dos pedidos y ningún
-- rastro de qué promoción los generó).
--
-- El sitio web (repositorio goadmin-websites, `app/api/orders/route.ts`)
-- ahora llama a esta RPC con los ids que devolvió `/api/promotions/check`.
-- Es un único UPDATE con `usage_count + 1`: sin leer-y-escribir, dos pedidos
-- simultáneos con la misma promoción cuentan 2, no 1.
--
-- Seguridad: SECURITY INVOKER (sin elevación). Solo actualiza filas de
-- `p_organization_id`; un id de otra organización no cuenta. Con sesión de
-- usuario aplica la RLS de `promotions`; el sitio web la llama con
-- service_role. Sin EXECUTE para anon.
--
-- Verificado el 2026-09-10 en begin/rollback: id propio + id inexistente → 1;
-- mismo id con otra organización → 0.
-- ============================================================

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
