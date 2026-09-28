-- Saldos a favor (6/6) — el listado respeta el acceso por sucursal y el estado vivo.
--
-- Antes: fn_list_customer_credits (SECURITY DEFINER, se salta la RLS) devolvía
-- todos los saldos de la organización a cualquier miembro, sin mirar a qué
-- sucursales tiene acceso ni permiso; el navegador, para filtrar por sucursal,
-- leía credit_notes directo. El estado venía tal cual ('active' aunque hubiera
-- vencido).
--
-- Ahora (firma nueva, p_branch opcional):
--   · sesión + finance.view (fn_finanzas_exigir_permiso) en la organización;
--   · solo filas con acceso a su sucursal (app_branch_access), y p_branch filtra;
--   · status vivo con fn_saldo_favor_estado ('expired' si venció y queda saldo);
--   · sucursal, origen del saldo (pago / nota_credito / devolucion / otro) y si
--     se puede anular (anticipo pagado y sin usar), para que la pantalla no
--     tenga que adivinarlo.

drop function if exists public.fn_list_customer_credits(integer);

create or replace function public.fn_list_customer_credits(p_org integer, p_branch integer default null)
 returns table(
   id uuid, customer_id uuid, customer_name text, amount numeric, balance numeric, used numeric,
   status text, notes text, expiry_date timestamptz, created_at timestamptz,
   branch_id integer, origen text, anulable boolean
 )
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.view']);

  return query
  select cn.id, cn.customer_id, c.full_name, cn.amount, cn.balance, (cn.amount - cn.balance) as used,
         public.fn_saldo_favor_estado(cn.status, cn.balance, cn.organization_id, cn.branch_id, cn.expiry_date),
         cn.notes, cn.expiry_date, cn.created_at, cn.branch_id,
         case
           when pg.id is not null then 'pago'
           when cn.source_credit_note_id is not null then 'nota_credito'
           when exists (select 1 from public.returns r where r.customer_credit_id = cn.id) then 'devolucion'
           else 'otro'
         end,
         (pg.id is not null and cn.status = 'active' and cn.balance = cn.amount
          and not exists (select 1 from public.credit_note_applications a where a.credit_note_id = cn.id))
    from public.credit_notes cn
    left join public.customers c on c.id = cn.customer_id
    left join lateral (
      select p.id from public.payments p
       where p.organization_id = cn.organization_id and p.source = 'customer_credit'
         and p.source_id = cn.id::text and p.status = 'completed' and p.amount > 0
       limit 1
    ) pg on true
   where cn.organization_id = p_org
     and (p_branch is null or cn.branch_id = p_branch)
     and (cn.branch_id is null or auth.uid() is null or public.app_branch_access(cn.branch_id))
   order by cn.created_at desc;
end;
$function$;

revoke all on function public.fn_list_customer_credits(integer, integer) from public, anon;
grant execute on function public.fn_list_customer_credits(integer, integer) to authenticated, service_role;
