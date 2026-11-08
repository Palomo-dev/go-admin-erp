-- Reversión de 20261108120000_anticipos_proveedores.sql (anticipos a proveedores).
-- Migración aplicada por el MCP el 2026-11-07 con orden del dueño.
--
-- Deja las tres funciones reemplazadas exactamente como estaban el 2026-11-07 (definición leída por MCP)
-- y borra lo nuevo. ADVERTENCIA: si ya hay anticipos o aplicaciones, borrar las tablas pierde esos datos y
-- las cuentas por pagar con aplicaciones volverían a mostrar el saldo sin ellas (los asientos y los pagos
-- quedan). Respaldar supplier_advances y supplier_advance_applications antes, o no revertir con datos.

drop trigger if exists trg_aplicacion_anticipo_proveedor_recalcula on public.supplier_advance_applications;

drop function if exists public.fn_anticipo_proveedor_crear(integer, integer, numeric, text, text, integer, integer, text, text);
drop function if exists public.fn_anticipo_proveedor_aplicar(uuid, uuid, numeric, text, integer);
drop function if exists public.fn_anticipo_proveedor_devolver(uuid, numeric, text, text, text, integer, integer, text);
drop function if exists public.fn_anticipo_proveedor_anular(uuid, text, integer);
drop function if exists public.fn_cuenta_anticipo_proveedor(integer, integer);

-- Antes de borrar las tablas: las tres funciones de siempre (ya no leen supplier_advance_applications).
create or replace function public.fn_invoice_purchase_paid(p_invoice_id uuid)
 returns numeric
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(p.amount + coalesce(p.discount_amount, 0)), 0)
    from public.payments p
   where p.status = 'completed'
     and (
       (p.source = 'invoice_purchase' and p.source_id = p_invoice_id::text)
       or (p.source = 'account_payable' and p.source_id in (
             select ap.id::text from public.accounts_payable ap where ap.invoice_id = p_invoice_id))
     );
$function$;

create or replace function public.fn_cxp_recalcular(p_ap_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ap public.accounts_payable%rowtype;
  v_pagado numeric;
  v_saldo numeric;
  v_estado text;
begin
  select * into v_ap from public.accounts_payable where id = p_ap_id;
  if not found then
    return;
  end if;

  if v_ap.status = 'void' then
    update public.accounts_payable
       set balance = 0, updated_at = now()
     where id = p_ap_id and balance is distinct from 0;
    return;
  end if;

  if v_ap.invoice_id is not null then
    v_pagado := public.fn_invoice_purchase_paid(v_ap.invoice_id);
  else
    select coalesce(sum(p.amount + coalesce(p.discount_amount, 0)), 0) into v_pagado
      from public.payments p
     where p.status = 'completed' and p.source = 'account_payable' and p.source_id = v_ap.id::text;
  end if;

  v_saldo := greatest(coalesce(v_ap.amount, 0) - v_pagado, 0);

  v_estado := case
    when v_pagado > 0 and v_saldo <= 0 then 'paid'
    when v_pagado > 0 then 'partial'
    when coalesce(v_ap.status, 'pending') in ('partial', 'paid') then 'pending'
    else coalesce(v_ap.status, 'pending')
  end;

  update public.accounts_payable
     set balance = v_saldo,
         status = v_estado,
         updated_at = now()
   where id = p_ap_id
     and (balance is distinct from v_saldo or status is distinct from v_estado);
end;
$function$;

create or replace function public.fn_trg_tercero_linea_asiento()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_source text;
  v_source_id text;
  v_org integer;
  v_nit text;
  v_nombre text;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id
    into v_source, v_source_id, v_org
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  -- sales: el devengo del POS. La factura, si llega después, reutiliza la misma clave.
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents', 'sales') then
    return new;
  end if;

  if v_source = 'cash_movements' then
    select nullif(btrim(cm.tercero_nit), ''), nullif(btrim(cm.tercero_nombre), '')
      into v_nit, v_nombre
      from public.cash_movements cm
     where cm.id::text = v_source_id and cm.organization_id = v_org;
  elsif v_source = 'invoice_purchase' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('compra', v_source_id::uuid) t;
  elsif v_source = 'support_documents' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('documento_soporte', v_source_id::uuid) t;
  else
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('venta', v_source_id::uuid) t;
  end if;

  if v_nit is not null then
    new.tercero_nit := v_nit;
    new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
  end if;
  return new;
exception when others then
  return new;
end;
$function$;

drop function if exists public.fn_trg_aplicacion_anticipo_proveedor_recalcula();
drop function if exists public.fn_tercero_anticipo_proveedor(text, text);

drop table if exists public.supplier_advance_applications;
drop table if exists public.supplier_advances;
