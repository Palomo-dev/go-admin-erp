create or replace function public.fn_avisos_miembro_stock_cero()
returns table (
  organization_id integer,
  branch_id integer,
  branch_name text,
  product_id integer,
  product_name text,
  qty numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id,
         sl.branch_id,
         b.name::text,
         p.id,
         p.name,
         sum(coalesce(sl.qty_on_hand, 0))
  from public.stock_levels sl
  join public.products p on p.id = sl.product_id
  join public.branches b on b.id = sl.branch_id and b.organization_id = p.organization_id
  where coalesce(p.status, 'active') <> 'deleted'
    and coalesce(p.track_stock, false)
    and not (
      coalesce(p.is_parent, false)
      and exists (
        select 1 from public.products h
        where h.parent_product_id = p.id
          and coalesce(h.status, 'active') <> 'deleted'
      )
    )
    and (
      p.parent_product_id is null
      or exists (
        select 1 from public.products padre
        where padre.id = p.parent_product_id
          and coalesce(padre.status, 'active') <> 'deleted'
      )
    )
  group by p.organization_id, sl.branch_id, b.name, p.id, p.name
  having sum(coalesce(sl.qty_on_hand, 0)) <= 0;
$$;

comment on function public.fn_avisos_miembro_stock_cero() is
  'Productos en cero por sucursal. La variante avisa por su existencia; el padre con hijas vivas no. Sin fila de stock no entra.';

create or replace function public.fn_avisos_miembro_cartera()
returns table (
  organization_id integer,
  por_cobrar integer,
  saldo_cobrar numeric,
  por_pagar integer,
  saldo_pagar numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with orgs as (
    select o.id, coalesce(nullif(btrim(o.timezone), ''), 'America/Bogota') as tz
    from public.organizations o
  ),
  cxc as (
    select ar.organization_id,
           count(*)::integer as n,
           coalesce(sum(ar.balance), 0) as saldo
    from public.accounts_receivable ar
    join orgs o on o.id = ar.organization_id
    where ar.status not in ('paid', 'cancelled', 'written_off')
      and ar.balance > 0
      and ar.due_date is not null
      and (ar.due_date at time zone o.tz)::date < (now() at time zone o.tz)::date
    group by ar.organization_id
  ),
  cxp as (
    select ap.organization_id,
           count(*)::integer as n,
           coalesce(sum(ap.balance), 0) as saldo
    from public.accounts_payable ap
    join orgs o on o.id = ap.organization_id
    where ap.status not in ('paid', 'cancelled')
      and ap.balance > 0
      and ap.due_date is not null
      and (ap.due_date at time zone o.tz)::date < (now() at time zone o.tz)::date
    group by ap.organization_id
  )
  select coalesce(cxc.organization_id, cxp.organization_id),
         coalesce(cxc.n, 0),
         coalesce(cxc.saldo, 0),
         coalesce(cxp.n, 0),
         coalesce(cxp.saldo, 0)
  from cxc
  full join cxp on cxp.organization_id = cxc.organization_id
  where coalesce(cxc.n, 0) + coalesce(cxp.n, 0) > 0;
$$;

create or replace function public.fn_avisos_miembro_proteger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user = 'service_role' then
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.recipient_user_id is distinct from old.recipient_user_id
     or new.event is distinct from old.event
     or new.entity_type is distinct from old.entity_type
     or new.entity_id is distinct from old.entity_id
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.href is distinct from old.href
     or new.idempotency_key is distinct from old.idempotency_key
     or new.email_status is distinct from old.email_status
     or new.created_at is distinct from old.created_at
     or new.subject_key is distinct from old.subject_key
  then
    raise exception 'member_notices: solo se pueden marcar como leido o descartado';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_avisos_miembro_uuid(text) from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_puede(integer, uuid, text) from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_destinatarios(integer, text) from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_poner(integer, uuid, uuid, text, text, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_caja() from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_stock() from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_stock_cero() from public, anon, authenticated;
revoke all on function public.fn_avisos_miembro_cartera() from public, anon, authenticated;
grant execute on function public.fn_avisos_miembro_destinatarios(integer, text) to service_role;
grant execute on function public.fn_avisos_miembro_stock_cero() to service_role;
grant execute on function public.fn_avisos_miembro_cartera() to service_role;

drop trigger if exists trg_avisos_miembro_oportunidad on public.opportunities;
create trigger trg_avisos_miembro_oportunidad
  after insert or update of salesperson_id, stage_id, status on public.opportunities
  for each row execute function public.fn_avisos_miembro_oportunidad();
