-- Saldos a favor (1/6) — la regla única del saldo de la factura cuenta las
-- aplicaciones de saldo a favor.
--
-- Antes: fn_apply_customer_credit escribía invoice_sales.balance/status a mano,
-- pero la regla única (fn_factura_venta_recalcular_saldo: saldo = total −
-- pagado − acreditado) no contaba credit_note_applications. El siguiente pago,
-- nota crédito o cambio de línea recalculaba y DEVOLVÍA el saldo ya cubierto
-- con el saldo a favor.
--
-- Ahora:
-- 1. fn_invoice_sales_paid suma, una sola vez, las aplicaciones de saldo a
--    favor de la factura: aplicar saldo a favor es cobrar con dinero que el
--    cliente ya entregó. Por eso vale como "pagado" y no como "acreditado".
--    Con ello, sin tocarlos:
--    · fn_factura_venta_recalcular_saldo y sus disparadores lo cuentan;
--    · fn_excedente_nota_credito trata como pagada la factura cubierta con
--      saldo a favor (una nota sobre ella devuelve el dinero como excedente);
--    · v_cartera_vs_documentos deja de listarla como "pagada sin pago".
-- 2. Un disparador sobre credit_note_applications recalcula la factura con la
--    regla única en cada INSERT/UPDATE/DELETE: ningún escritor pone el saldo.
-- 3. fn_apply_customer_credit deja de escribir el saldo de la factura (la
--    versión completa con validaciones llega en la migración 2/6).
--
-- Daño medido el 2026-09-28: 0 aplicaciones en la base, 0 facturas con saldo
-- distinto de la regla por este motivo. No hace falta recálculo de datos.

create or replace function public.fn_invoice_sales_paid(p_invoice_id uuid)
 returns numeric
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select public.fn_assert_acceso_org((select i.organization_id from public.invoice_sales i where i.id = p_invoice_id));
  select coalesce((
    select sum(p.amount + case when p.source = 'account_receivable' then coalesce(p.discount_amount, 0) else 0 end)
      from public.payments p, public.invoice_sales i
     where i.id = p_invoice_id
       and p.status = 'completed'
       and (
         (p.source = 'invoice_sales' and p.source_id = i.id::text)
         or (p.source = 'sale' and i.sale_id is not null and p.source_id = i.sale_id::text)
         or (p.source = 'account_receivable' and p.source_id in (
             select ar.id::text from public.accounts_receivable ar where ar.invoice_id = i.id
           ))
       )
  ), 0)
  -- Saldo a favor aplicado a la factura: dinero ya recibido del cliente.
  + coalesce((
    select sum(a.amount) from public.credit_note_applications a where a.invoice_id = p_invoice_id
  ), 0);
$function$;

create or replace function public.fn_trg_aplicacion_saldo_favor_recalcula_factura()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op <> 'INSERT' and (tg_op = 'DELETE' or old.invoice_id is distinct from new.invoice_id) then
    perform public.fn_factura_venta_recalcular_saldo(old.invoice_id);
  end if;
  if tg_op <> 'DELETE' then
    perform public.fn_factura_venta_recalcular_saldo(new.invoice_id);
  end if;
  return null;
end;
$function$;

revoke all on function public.fn_trg_aplicacion_saldo_favor_recalcula_factura() from public, anon, authenticated;

drop trigger if exists trg_aplicacion_saldo_favor_recalcula_factura on public.credit_note_applications;
create trigger trg_aplicacion_saldo_favor_recalcula_factura
  after insert or update or delete on public.credit_note_applications
  for each row execute function public.fn_trg_aplicacion_saldo_favor_recalcula_factura();

-- Versión puente: igual que la vigente (20260922140000) pero sin escribir el
-- saldo ni el estado de la factura; los pone el disparador de arriba.
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

  -- El disparador trg_aplicacion_saldo_favor_recalcula_factura recalcula la
  -- factura (y ella su cartera) con la regla única.
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
