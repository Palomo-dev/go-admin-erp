-- Rollback de 20260928140100_saldo_favor_2_aplicar_validado.
-- Vuelve a la firma fn_apply_customer_credit(uuid, uuid, numeric, uuid) en su
-- versión puente de 20260928140000 (sin escribir el saldo de la factura).
-- Orden: revertir antes 20260928140500 (6/6) y 20260928140400 (5/6), que usan
-- fn_saldo_favor_vencido.
-- ADVERTENCIA: quita credit_note_applications.idempotency_key; las claves
-- guardadas se pierden (las aplicaciones no se tocan).

drop function if exists public.fn_apply_customer_credit(uuid, uuid, numeric, text, integer);
drop function if exists public.fn_saldo_favor_vencido(integer, integer, timestamptz);
drop index if exists public.uq_credit_note_applications_org_idem;
alter table public.credit_note_applications drop column if exists idempotency_key;

create or replace function public.fn_apply_customer_credit(p_credit_id uuid, p_invoice_id uuid, p_amount numeric, p_created_by uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_credit public.credit_notes%rowtype;
  v_inv public.invoice_sales%rowtype;
  v_app_id uuid;
  v_entry integer;
  v_actor uuid;
begin
  select * into v_credit from public.credit_notes where id = p_credit_id for update;
  if not found then raise exception 'Saldo a favor no encontrado'; end if;
  if v_credit.status <> 'active' or v_credit.balance <= 0 then
    raise exception 'El saldo a favor no está disponible';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  if p_amount > v_credit.balance then raise exception 'El monto excede el saldo disponible'; end if;

  v_actor := auth.uid();
  if v_actor is null and auth.role() = 'service_role' then
    v_actor := p_created_by;
  end if;
  if v_actor is null or not exists (
    select 1 from public.organization_members om
    where om.user_id = v_actor
      and om.organization_id = v_credit.organization_id
      and om.is_active
  ) then
    raise exception 'No perteneces a esta organización' using errcode = '42501';
  end if;

  select * into v_inv from public.invoice_sales where id = p_invoice_id for update;
  if not found then raise exception 'Factura no encontrada'; end if;
  if v_inv.organization_id <> v_credit.organization_id then
    raise exception 'La factura pertenece a otra organización';
  end if;
  if p_amount > v_inv.balance then raise exception 'El monto excede el saldo de la factura'; end if;

  insert into public.credit_note_applications(organization_id, credit_note_id, invoice_id, amount, created_by)
  values (v_credit.organization_id, p_credit_id, p_invoice_id, p_amount, v_actor)
  returning id into v_app_id;

  update public.credit_notes
  set balance = balance - p_amount,
      status = case when balance - p_amount <= 0 then 'used' else 'active' end,
      updated_at = now()
  where id = p_credit_id;

  v_entry := fn_create_journal_entry(
    p_organization_id := v_credit.organization_id,
    p_branch_id := v_inv.branch_id,
    p_entry_date := now(),
    p_memo := 'Aplicación saldo a favor a ' || coalesce(v_inv.number, v_inv.id::text),
    p_source := 'customer_credit',
    p_source_id := v_app_id::text,
    p_debit_account := '2805',
    p_credit_account := '1305',
    p_amount := p_amount,
    p_tax_account := null,
    p_tax_amount := 0
  );

  return v_app_id;
end;
$function$;

revoke all on function public.fn_apply_customer_credit(uuid, uuid, numeric, uuid) from public, anon;
grant execute on function public.fn_apply_customer_credit(uuid, uuid, numeric, uuid) to authenticated, service_role;
