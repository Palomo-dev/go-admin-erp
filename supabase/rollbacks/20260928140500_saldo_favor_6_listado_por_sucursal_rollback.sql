-- Rollback de 20260928140500_saldo_favor_6_listado_por_sucursal.
-- Devuelve fn_list_customer_credits(integer) a la versión anterior (sin
-- permiso, sin acceso por sucursal y con el estado tal cual). No toca datos.

drop function if exists public.fn_list_customer_credits(integer, integer);

CREATE OR REPLACE FUNCTION public.fn_list_customer_credits(p_org integer)
 RETURNS TABLE(id uuid, customer_id uuid, customer_name text, amount numeric, balance numeric, used numeric, status text, notes text, expiry_date timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT cn.id, cn.customer_id, c.full_name, cn.amount, cn.balance,
         (cn.amount - cn.balance) AS used, cn.status, cn.notes, cn.expiry_date, cn.created_at
  FROM public.credit_notes cn
  LEFT JOIN public.customers c ON c.id = cn.customer_id
  WHERE cn.organization_id = p_org
    AND (
      (select auth.uid()) IS NULL
      OR EXISTS (
        SELECT 1 FROM public.organization_members om
         WHERE om.organization_id = p_org
           AND om.user_id = (select auth.uid())
           AND om.is_active
      )
    )
  ORDER BY cn.created_at DESC;
$function$;

revoke all on function public.fn_list_customer_credits(integer) from public, anon;
grant execute on function public.fn_list_customer_credits(integer) to authenticated, service_role;
