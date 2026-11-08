-- Finanzas ronda 4 · Frente R4-B · Anticipos a proveedores (Figma «07 Finanzas» 2335:140495).
--
-- Aplicada por el MCP el 2026-11-07 con orden del dueño (docs/implementacion/FINANZAS-R4-E-INTEGRACIONES-PLAN.md).
-- Mientras no exista, la pantalla «Anticipos a proveedores»
-- dice «pendiente de activar»; nunca muestra cero.
--
-- Por qué no basta con «habilitar la dirección proveedor» del saldo a favor de clientes (verificado por
-- MCP el 2026-11-07):
--   - el saldo a favor de clientes vive en credit_notes, con customer_id NOT NULL y FK a customers;
--   - fn_registrar_pago rechaza el sobrante en dirección «pago» (raise 'anticipo_solo_cobro');
--   - la cartera de proveedores (fn_cxp_recalcular / fn_invoice_purchase_paid) solo suma payments.
-- Así que el espejo es una tabla propia con el MISMO contrato que credit_notes (monto, saldo, estado) y las
-- mismas cuatro operaciones que fn_saldo_favor_* (crear · aplicar · devolver · anular). La pantalla y los
-- diálogos son los del saldo a favor de clientes, con el tercero como variante.
--
-- Asientos (fn_create_journal_entry, la misma vía de fn_create_customer_credit, fn_apply_customer_credit y
-- fn_saldo_favor_devolver; idempotentes por fact_key; si no se crea el asiento, la operación falla):
--   crear     D anticipo a proveedores (clave 'anticipos_proveedores'; respaldo 1330)  C caja o banco
--   aplicar   D cuenta por pagar (regla purchase_payment, la de fn_auto_journal_payment) C anticipo
--   devolver  D caja o banco                                                          C anticipo
--   anular    contra-asiento del de crear (fn_revertir_asiento_en_fecha)
-- El tercero de las líneas (1330 y 22xx lo exigen: fn_cuenta_exige_tercero) lo pone el disparador
-- fn_trg_tercero_linea_asiento, ampliado aquí con los tres orígenes nuevos.
--
-- Dinero: payments con source 'supplier_advance' (importe NEGATIVO: sale dinero, el arqueo lo resta igual
-- que customer_credit_refund) y 'supplier_advance_refund' (positivo: entra). Recibo CE del mismo
-- consecutivo de fn_registrar_pago y la misma clave de idempotencia en payment_groups.
--
-- Cartera: aplicar NO crea un pago. Inserta en supplier_advance_applications y la regla única de saldo de
-- compras (fn_invoice_purchase_paid y fn_cxp_recalcular) pasa a sumar también lo aplicado de anticipos.
-- Hoy hay 0 aplicaciones: el cambio no mueve ningún saldo existente.
--
-- Aditiva: dos tablas nuevas, un disparador nuevo y seis funciones nuevas; tres funciones existentes se
-- reemplazan con su mismo contrato (la reversión las deja como estaban). Sin columnas nuevas en tablas con
-- datos. Escritura SOLO por las RPC (SECURITY DEFINER, guarda de organización, sucursal y permiso);
-- lectura por RLS de pertenencia; nada para anon.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.supplier_advances (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer references public.branches(id),
  supplier_id integer not null references public.suppliers(id),
  amount numeric(16,2) not null check (amount > 0),
  balance numeric(16,2) not null check (balance >= 0),
  status text not null default 'active' check (status in ('active', 'used', 'cancelled')),
  currency character(3) not null,
  -- Cuenta del anticipo con la que nació: aplicar, devolver y anular usan la misma.
  account_code text not null,
  payment_group_id uuid references public.payment_groups(id),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  constraint supplier_advances_balance_le_amount check (balance <= amount)
);

comment on table public.supplier_advances is
  'Anticipos a proveedores: dinero que salió antes de la factura y queda a favor de la organización. Espejo de credit_notes (saldo a favor de clientes). Escritura solo por fn_anticipo_proveedor_*.';

create index if not exists idx_supplier_advances_org_supplier on public.supplier_advances (organization_id, supplier_id);
create index if not exists idx_supplier_advances_org_status on public.supplier_advances (organization_id, status);

create table if not exists public.supplier_advance_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  advance_id uuid not null references public.supplier_advances(id),
  account_payable_id uuid not null references public.accounts_payable(id),
  invoice_id uuid references public.invoice_purchase(id),
  amount numeric(16,2) not null check (amount > 0),
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint supplier_advance_applications_clave unique (organization_id, idempotency_key)
);

comment on table public.supplier_advance_applications is
  'Aplicación de un anticipo a proveedor a una cuenta por pagar. La cuenta y la factura bajan por la regla única (fn_invoice_purchase_paid, fn_cxp_recalcular).';

create index if not exists idx_supplier_advance_applications_ap on public.supplier_advance_applications (account_payable_id);
create index if not exists idx_supplier_advance_applications_invoice on public.supplier_advance_applications (invoice_id);
create index if not exists idx_supplier_advance_applications_advance on public.supplier_advance_applications (advance_id);

alter table public.supplier_advances enable row level security;
alter table public.supplier_advance_applications enable row level security;

drop policy if exists supplier_advances_select_miembros on public.supplier_advances;
create policy supplier_advances_select_miembros
  on public.supplier_advances
  for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
    )
  );

drop policy if exists supplier_advance_applications_select_miembros on public.supplier_advance_applications;
create policy supplier_advance_applications_select_miembros
  on public.supplier_advance_applications
  for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
    )
  );

revoke all on public.supplier_advances from anon;
revoke all on public.supplier_advance_applications from anon;
revoke insert, update, delete, truncate, references, trigger on public.supplier_advances from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.supplier_advance_applications from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cartera de compras: lo aplicado de anticipos cuenta como pagado
-- ─────────────────────────────────────────────────────────────────────────────

-- Igual que antes (pagos completados de la factura o de su cuenta) + aplicaciones de anticipos.
create or replace function public.fn_invoice_purchase_paid(p_invoice_id uuid)
 returns numeric
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((
    select sum(p.amount + coalesce(p.discount_amount, 0))
      from public.payments p
     where p.status = 'completed'
       and (
         (p.source = 'invoice_purchase' and p.source_id = p_invoice_id::text)
         or (p.source = 'account_payable' and p.source_id in (
               select ap.id::text from public.accounts_payable ap where ap.invoice_id = p_invoice_id))
       )), 0)
  + coalesce((
    select sum(a.amount)
      from public.supplier_advance_applications a
     where a.invoice_id = p_invoice_id
        or a.account_payable_id in (select ap.id from public.accounts_payable ap where ap.invoice_id = p_invoice_id)
    ), 0);
$function$;

-- Igual que antes; la cuenta sin factura suma también lo aplicado de anticipos.
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
    v_pagado := v_pagado + coalesce((
      select sum(a.amount) from public.supplier_advance_applications a where a.account_payable_id = v_ap.id), 0);
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

-- Una aplicación recalcula su cuenta y su factura con la misma regla que el disparador de pagos
-- (fn_recalc_invoice_balance_from_payments: neto a pagar − pagado, sin tocar borradores ni anuladas).
create or replace function public.fn_trg_aplicacion_anticipo_proveedor_recalcula()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ap uuid := case when tg_op = 'DELETE' then old.account_payable_id else new.account_payable_id end;
  v_inv uuid;
  v_status text;
  v_balance numeric;
begin
  perform public.fn_cxp_recalcular(v_ap);
  select ap.invoice_id into v_inv from public.accounts_payable ap where ap.id = v_ap;
  if v_inv is not null then
    select status into v_status from public.invoice_purchase where id = v_inv;
    if v_status is not null and v_status not in ('draft', 'void', 'voided') then
      v_balance := greatest(public.fn_invoice_purchase_neto(v_inv) - public.fn_invoice_purchase_paid(v_inv), 0);
      update public.invoice_purchase
         set balance = v_balance, updated_at = now()
       where id = v_inv and balance is distinct from v_balance;
    end if;
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_aplicacion_anticipo_proveedor_recalcula on public.supplier_advance_applications;
create trigger trg_aplicacion_anticipo_proveedor_recalcula
  after insert or delete on public.supplier_advance_applications
  for each row execute function public.fn_trg_aplicacion_anticipo_proveedor_recalcula();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tercero de las líneas: los tres orígenes nuevos toman el proveedor del anticipo
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_tercero_anticipo_proveedor(p_source text, p_source_id text, out nit text, out nombre text)
 returns record
 language plpgsql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_anticipo uuid;
begin
  nit := null;
  nombre := null;
  if p_source_id is null or p_source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  if p_source = 'supplier_advance' then
    v_anticipo := p_source_id::uuid;
  elsif p_source = 'supplier_advance_application' then
    select a.advance_id into v_anticipo from public.supplier_advance_applications a where a.id = p_source_id::uuid;
  elsif p_source = 'supplier_advance_refund' then
    select nullif(p.source_id, '')::uuid into v_anticipo from public.payments p
     where p.id = p_source_id::uuid and p.source = 'supplier_advance_refund';
  end if;
  if v_anticipo is null then
    return;
  end if;
  select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')), nullif(btrim(s.name), '')
    into nit, nombre
    from public.supplier_advances a
    join public.suppliers s on s.id = a.supplier_id
   where a.id = v_anticipo;
end;
$function$;

revoke all on function public.fn_tercero_anticipo_proveedor(text, text) from public, anon;

-- Igual que antes + la rama de anticipos a proveedores.
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
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents', 'sales',
                                          'supplier_advance', 'supplier_advance_application', 'supplier_advance_refund') then
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
  elsif v_source in ('supplier_advance', 'supplier_advance_application', 'supplier_advance_refund') then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_anticipo_proveedor(v_source, v_source_id) t;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Cuenta del anticipo
-- ─────────────────────────────────────────────────────────────────────────────

-- La configuración contable manda (clave 'anticipos_proveedores', por sede o empresa); si no hay, el primer
-- auxiliar imputable de 1330 (en las 35 organizaciones 1330 existe y no tiene hijos).
create or replace function public.fn_cuenta_anticipo_proveedor(p_org integer, p_branch integer)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    public.fn_cuenta_por_clave(p_org, p_branch, 'anticipos_proveedores'),
    public.fn_primera_cuenta_detalle(p_org, array['13300501', '133005', '1330'])
  );
$function$;

revoke all on function public.fn_cuenta_anticipo_proveedor(integer, integer) from public, anon;
grant execute on function public.fn_cuenta_anticipo_proveedor(integer, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Crear: sale el dinero (recibo CE + payments + caja) y queda el saldo con su asiento
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_anticipo_proveedor_crear(
  p_supplier integer,
  p_branch integer,
  p_monto numeric,
  p_metodo text,
  p_clave_idempotencia text,
  p_organization_id integer,
  p_cuenta_bancaria integer default null,
  p_referencia text default null,
  p_notas text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_grupo public.payment_groups%rowtype;
  v_requiere_ref boolean;
  v_caja integer;
  v_cuenta_dinero text;
  v_cuenta_anticipo text;
  v_moneda text;
  v_recibo text;
  v_anticipo uuid;
  v_pago uuid;
  v_entry integer;
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_notas text := nullif(btrim(coalesce(p_notas, '')), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if v_org is null then
    raise exception 'organizacion_no_permitida' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_monto <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);

  -- Idempotencia: mismo espacio de claves y candado que fn_registrar_pago.
  perform pg_advisory_xact_lock(hashtextextended('fn_registrar_pago:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_grupo from public.payment_groups
   where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if coalesce(v_grupo.origin, '') <> 'anticipo_proveedor' or v_grupo.advance_amount <> v_monto
       or v_grupo.supplier_id is distinct from p_supplier then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'anticipo_id', (select a.id from public.supplier_advances a where a.payment_group_id = v_grupo.id limit 1),
      'grupo_id', v_grupo.id, 'recibo', v_grupo.receipt_number, 'repetida', true,
      'caja_id', v_grupo.cash_session_id, 'monto', v_grupo.advance_amount);
  end if;

  if not exists (select 1 from public.suppliers s where s.id = p_supplier and s.organization_id = v_org) then
    raise exception 'proveedor_no_encontrado' using errcode = 'P0002';
  end if;
  if p_branch is null or not exists (
    select 1 from public.branches b where b.id = p_branch and b.organization_id = v_org and coalesce(b.is_active, true)
  ) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  if not public.app_branch_access(p_branch) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- Método de la organización (nunca «crédito»: no mueve dinero).
  select pm.requires_reference into v_requiere_ref
    from public.payment_methods pm
    join public.organization_payment_methods opm
      on opm.payment_method_code = pm.code and opm.organization_id = v_org and coalesce(opm.is_active, true)
   where pm.code = p_metodo and coalesce(pm.is_active, true) and pm.code <> 'credit';
  if not found then
    raise exception 'metodo_invalido' using errcode = '22023';
  end if;
  if coalesce(v_requiere_ref, false) and v_ref is null then
    raise exception 'referencia_obligatoria' using errcode = '22023';
  end if;

  if p_metodo = 'cash' then
    v_caja := public.fn_caja_abierta_para(v_org, p_branch, v_uid);
    if v_caja is null then
      raise exception 'sin_caja_abierta' using errcode = '22023',
        hint = 'Abra la caja de la sucursal o registre el anticipo con otro método.';
    end if;
  elsif p_cuenta_bancaria is not null then
    if not exists (select 1 from public.bank_accounts b
                    where b.id = p_cuenta_bancaria and b.organization_id = v_org and coalesce(b.is_active, true)) then
      raise exception 'cuenta_bancaria_invalida' using errcode = '22023';
    end if;
  end if;

  v_cuenta_dinero := public.fn_money_account_code_pago(v_org, p_branch, p_metodo,
                       case when p_metodo = 'cash' then null else p_cuenta_bancaria end);
  if v_cuenta_dinero is null then
    raise exception 'sin_cuenta_de_dinero' using errcode = 'P0002';
  end if;
  v_cuenta_anticipo := public.fn_cuenta_anticipo_proveedor(v_org, p_branch);
  if v_cuenta_anticipo is null then
    raise exception 'sin_cuenta_anticipos' using errcode = 'P0002',
      hint = 'Configure la cuenta de anticipos a proveedores (1330) en Configuración contable.';
  end if;
  v_moneda := upper(public.fn_moneda_base_organizacion(v_org));

  v_recibo := public.fn_recibo_siguiente_numero(v_org, 'CE');

  insert into public.payment_groups (
    organization_id, branch_id, direction, receipt_number, supplier_id, method, currency,
    total_applied, advance_amount, received_amount, change_amount, payment_date, reference,
    bank_account_id, notes, cash_session_id, origin, idempotency_key, created_by
  ) values (
    v_org, p_branch, 'pago', v_recibo, p_supplier, p_metodo, v_moneda,
    0, v_monto, null, 0, now(), v_ref,
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end,
    v_notas, v_caja, 'anticipo_proveedor', p_clave_idempotencia, v_uid
  ) returning * into v_grupo;

  insert into public.supplier_advances (
    organization_id, branch_id, supplier_id, amount, balance, status, currency, account_code,
    payment_group_id, notes, created_by
  ) values (
    v_org, p_branch, p_supplier, v_monto, v_monto, 'active', v_moneda, v_cuenta_anticipo,
    v_grupo.id, coalesce(v_notas, 'Anticipo del comprobante ' || v_recibo), v_uid
  ) returning id into v_anticipo;

  v_entry := public.fn_create_journal_entry(
    p_organization_id := v_org,
    p_branch_id := p_branch,
    p_entry_date := now(),
    p_memo := 'Anticipo a proveedor - ' || v_recibo,
    p_source := 'supplier_advance',
    p_source_id := v_anticipo::text,
    p_debit_account := v_cuenta_anticipo,
    p_credit_account := v_cuenta_dinero,
    p_amount := v_monto,
    p_created_by := v_uid,
    p_fact_key := 'supplier_advance:' || v_anticipo::text);
  if v_entry is null then
    raise exception 'asiento_no_creado' using errcode = 'P0001',
      hint = 'No se pudo contabilizar el anticipo: revise el plan de cuentas (anticipos y la cuenta de dinero) y el periodo contable.';
  end if;

  -- El dinero sale: importe negativo (lo resta el arqueo, como customer_credit_refund).
  insert into public.payments (
    organization_id, branch_id, source, source_id, method, amount, currency, reference, status,
    created_by, payment_date, bank_account_id, payment_group_id
  ) values (
    v_org, p_branch, 'supplier_advance', v_anticipo::text, p_metodo, -v_monto, v_moneda,
    coalesce(v_ref, v_recibo), 'completed', v_uid, now(),
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end, v_grupo.id
  ) returning id into v_pago;

  return jsonb_build_object(
    'anticipo_id', v_anticipo, 'grupo_id', v_grupo.id, 'recibo', v_recibo, 'repetida', false,
    'caja_id', v_caja, 'payment_id', v_pago, 'monto', v_monto, 'asiento_id', v_entry);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Aplicar a una cuenta por pagar (o a su factura de compra)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_anticipo_proveedor_aplicar(
  p_anticipo uuid,
  p_cuenta_por_pagar uuid,
  p_monto numeric,
  p_clave_idempotencia text,
  p_organization_id integer default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_ant public.supplier_advances%rowtype;
  v_ap public.accounts_payable%rowtype;
  v_ip public.invoice_purchase%rowtype;
  v_app public.supplier_advance_applications%rowtype;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_cxp text;
  v_entry integer;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_monto <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  select organization_id into v_org from public.supplier_advances where id = p_anticipo;
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);

  perform pg_advisory_xact_lock(hashtextextended('anticipo_proveedor_aplicar:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_app from public.supplier_advance_applications
   where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_app.advance_id <> p_anticipo or v_app.account_payable_id <> p_cuenta_por_pagar or v_app.amount <> v_monto then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'aplicacion_id', v_app.id, 'repetida', true, 'monto', v_app.amount,
      'saldo_disponible', (select balance from public.supplier_advances where id = v_app.advance_id),
      'saldo_cuenta', (select balance from public.accounts_payable where id = v_app.account_payable_id));
  end if;

  -- Primero el anticipo, luego la cuenta (mismo orden en todas las rutas: sin interbloqueos).
  select * into v_ant from public.supplier_advances where id = p_anticipo and organization_id = v_org for update;
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_ant.status <> 'active' or v_ant.balance <= 0 then
    raise exception 'anticipo_no_disponible' using errcode = '22023';
  end if;
  if v_monto > v_ant.balance then
    raise exception 'monto_excede_anticipo' using errcode = '22023',
      detail = jsonb_build_object('saldo', v_ant.balance)::text;
  end if;

  select * into v_ap from public.accounts_payable where id = p_cuenta_por_pagar and organization_id = v_org for update;
  if not found then
    raise exception 'cuenta_no_encontrada' using errcode = 'P0002';
  end if;
  if v_ap.status in ('cancelled', 'void') then
    raise exception 'documento_anulado' using errcode = '22023';
  end if;
  if v_ap.invoice_id is not null then
    select * into v_ip from public.invoice_purchase where id = v_ap.invoice_id for update;
    if v_ip.status = 'draft' then
      raise exception 'documento_borrador' using errcode = '22023';
    end if;
    if v_ip.status in ('void', 'voided', 'cancelled') then
      raise exception 'documento_anulado' using errcode = '22023';
    end if;
    if upper(coalesce(v_ip.currency, v_ant.currency)) <> upper(v_ant.currency) then
      raise exception 'moneda_distinta' using errcode = '22023';
    end if;
  end if;
  if v_ap.supplier_id is distinct from v_ant.supplier_id then
    raise exception 'proveedor_distinto' using errcode = '22023';
  end if;
  if coalesce(v_ap.branch_id, v_ip.branch_id) is not null and not public.app_branch_access(coalesce(v_ap.branch_id, v_ip.branch_id)) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_monto > coalesce(v_ap.balance, 0) then
    raise exception 'monto_excede_saldo' using errcode = '22023',
      detail = jsonb_build_object('saldo', v_ap.balance)::text;
  end if;

  -- La cuenta por pagar es la misma con la que se paga a un proveedor (fn_auto_journal_payment).
  select ar.debit_account_code into v_cxp
    from public.accounting_rules ar
   where ar.organization_id = v_org and ar.source_type = 'purchase_payment' and ar.is_active
   order by ar.priority
   limit 1;
  if v_cxp is null then
    raise exception 'sin_cuenta_por_pagar' using errcode = 'P0002';
  end if;

  -- El disparador recalcula la cuenta y la factura con la regla única.
  insert into public.supplier_advance_applications (
    organization_id, advance_id, account_payable_id, invoice_id, amount, idempotency_key, created_by
  ) values (
    v_org, p_anticipo, v_ap.id, v_ap.invoice_id, v_monto, p_clave_idempotencia, v_uid
  ) returning * into v_app;

  update public.supplier_advances
     set balance = balance - v_monto,
         status = case when balance - v_monto <= 0 then 'used' else 'active' end,
         updated_at = now()
   where id = p_anticipo;

  v_entry := public.fn_create_journal_entry(
    p_organization_id := v_org,
    p_branch_id := coalesce(v_ap.branch_id, v_ip.branch_id, v_ant.branch_id),
    p_entry_date := now(),
    p_memo := 'Aplicación de anticipo a proveedor' || coalesce(' - factura ' || nullif(v_ip.number_ext, ''), ''),
    p_source := 'supplier_advance_application',
    p_source_id := v_app.id::text,
    p_debit_account := v_cxp,
    p_credit_account := v_ant.account_code,
    p_amount := v_monto,
    p_created_by := v_uid,
    p_fact_key := 'supplier_advance_application:' || v_app.id::text);
  if v_entry is null then
    raise exception 'asiento_no_creado' using errcode = 'P0001',
      hint = 'Revise el plan de cuentas (anticipos y la cuenta por pagar) y el periodo contable.';
  end if;

  return jsonb_build_object(
    'aplicacion_id', v_app.id, 'repetida', false, 'monto', v_monto, 'asiento_id', v_entry,
    'saldo_disponible', (select balance from public.supplier_advances where id = p_anticipo),
    'saldo_cuenta', (select balance from public.accounts_payable where id = v_ap.id),
    'estado_cuenta', (select status from public.accounts_payable where id = v_ap.id));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Devolver: el proveedor regresa el dinero (entra a caja o banco)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_anticipo_proveedor_devolver(
  p_anticipo uuid,
  p_monto numeric,
  p_metodo text,
  p_motivo text,
  p_clave_idempotencia text,
  p_organization_id integer default null,
  p_cuenta_bancaria integer default null,
  p_referencia text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_ant public.supplier_advances%rowtype;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_pago public.payments%rowtype;
  v_requiere_ref boolean;
  v_caja integer;
  v_cuenta_dinero text;
  v_entry integer;
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_monto <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;

  select organization_id into v_org from public.supplier_advances where id = p_anticipo;
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.void']);

  perform pg_advisory_xact_lock(hashtextextended('anticipo_proveedor_devolver:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_pago from public.payments where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_pago.source <> 'supplier_advance_refund' or v_pago.source_id <> p_anticipo::text or v_pago.amount <> v_monto then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('payment_id', v_pago.id, 'repetida', true, 'monto', v_monto,
      'saldo_disponible', (select balance from public.supplier_advances where id = p_anticipo));
  end if;

  select * into v_ant from public.supplier_advances where id = p_anticipo and organization_id = v_org for update;
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_ant.status <> 'active' or v_ant.balance <= 0 then
    raise exception 'anticipo_no_disponible' using errcode = '22023';
  end if;
  if v_monto > v_ant.balance then
    raise exception 'monto_excede_anticipo' using errcode = '22023',
      detail = jsonb_build_object('saldo', v_ant.balance)::text;
  end if;

  select pm.requires_reference into v_requiere_ref
    from public.payment_methods pm
    join public.organization_payment_methods opm
      on opm.payment_method_code = pm.code and opm.organization_id = v_org and coalesce(opm.is_active, true)
   where pm.code = p_metodo and coalesce(pm.is_active, true) and pm.code <> 'credit';
  if not found then
    raise exception 'metodo_invalido' using errcode = '22023';
  end if;
  if coalesce(v_requiere_ref, false) and v_ref is null then
    raise exception 'referencia_obligatoria' using errcode = '22023';
  end if;

  if p_metodo = 'cash' then
    v_caja := public.fn_caja_abierta_para(v_org, v_ant.branch_id, v_uid);
    if v_caja is null then
      raise exception 'sin_caja_abierta' using errcode = '22023',
        hint = 'Abra la caja de la sucursal o reciba el dinero por otro método.';
    end if;
  elsif p_cuenta_bancaria is not null then
    if not exists (select 1 from public.bank_accounts b
                    where b.id = p_cuenta_bancaria and b.organization_id = v_org and coalesce(b.is_active, true)) then
      raise exception 'cuenta_bancaria_invalida' using errcode = '22023';
    end if;
  end if;
  v_cuenta_dinero := public.fn_money_account_code_pago(v_org, v_ant.branch_id, p_metodo,
                       case when p_metodo = 'cash' then null else p_cuenta_bancaria end);
  if v_cuenta_dinero is null then
    raise exception 'sin_cuenta_de_dinero' using errcode = 'P0002';
  end if;

  -- El dinero entra: importe positivo (suma al arqueo si es efectivo).
  insert into public.payments (
    organization_id, branch_id, source, source_id, method, amount, currency, reference, status,
    created_by, payment_date, bank_account_id, idempotency_key
  ) values (
    v_org, v_ant.branch_id, 'supplier_advance_refund', v_ant.id::text, p_metodo, v_monto, v_ant.currency,
    coalesce(v_ref, 'Devolución de anticipo a proveedor'), 'completed', v_uid, now(),
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end, p_clave_idempotencia
  ) returning * into v_pago;

  v_entry := public.fn_create_journal_entry(
    p_organization_id := v_org,
    p_branch_id := v_ant.branch_id,
    p_entry_date := now(),
    p_memo := 'Devolución de anticipo a proveedor',
    p_source := 'supplier_advance_refund',
    p_source_id := v_pago.id::text,
    p_debit_account := v_cuenta_dinero,
    p_credit_account := v_ant.account_code,
    p_amount := v_monto,
    p_created_by := v_uid,
    p_fact_key := 'supplier_advance_refund:' || v_pago.id::text);
  if v_entry is null then
    raise exception 'asiento_no_creado' using errcode = 'P0001',
      hint = 'Revise el plan de cuentas (anticipos y la cuenta de dinero) y el periodo contable.';
  end if;

  update public.supplier_advances
     set balance = balance - v_monto,
         status = case when balance - v_monto <= 0 then 'used' else 'active' end,
         updated_at = now()
   where id = v_ant.id;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_org, 'supplier_advances', v_ant.id::text, 'update', v_uid,
          jsonb_build_object('accion', 'devolucion_en_dinero', 'monto', v_monto, 'metodo', p_metodo, 'payment_id', v_pago.id, 'asiento', v_entry),
          btrim(p_motivo));

  return jsonb_build_object(
    'payment_id', v_pago.id, 'repetida', false, 'monto', v_monto, 'asiento_id', v_entry, 'caja_id', v_caja,
    'saldo_disponible', (select balance from public.supplier_advances where id = v_ant.id));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Anular un anticipo sin usar: pago void, contra-asiento y saldo cancelado
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_anticipo_proveedor_anular(
  p_anticipo uuid,
  p_motivo text,
  p_organization_id integer default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ant public.supplier_advances%rowtype;
  v_pago public.payments%rowtype;
  v_caja record;
  v_asiento integer;
  v_reverso integer;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  select * into v_ant from public.supplier_advances where id = p_anticipo for update;
  if not found or (p_organization_id is not null and p_organization_id <> v_ant.organization_id) then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_ant.organization_id, array['finance.void']);
  if v_ant.branch_id is not null and not public.app_branch_access(v_ant.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_ant.status = 'cancelled' then
    raise exception 'anticipo_no_disponible' using errcode = '22023';
  end if;
  -- Solo sin usar: con aplicaciones o devoluciones se devuelve el saldo, no se anula.
  if v_ant.balance <> v_ant.amount
     or exists (select 1 from public.supplier_advance_applications a where a.advance_id = v_ant.id) then
    raise exception 'anticipo_usado' using errcode = '22023';
  end if;

  select * into v_pago from public.payments p
   where p.organization_id = v_ant.organization_id and p.source = 'supplier_advance'
     and p.source_id = v_ant.id::text and p.status = 'completed'
   order by p.created_at limit 1
   for update;

  if v_pago.id is not null and v_pago.method = 'cash' then
    select cs.id, cs.status into v_caja from public.cash_sessions cs
     where cs.id = (select g.cash_session_id from public.payment_groups g where g.id = v_pago.payment_group_id);
    if found then
      if v_caja.status <> 'open' then
        raise exception 'pago_en_caja_cerrada' using errcode = '22023',
          hint = 'El anticipo salió de una caja ya cerrada: registre la devolución del proveedor como entrada.';
      end if;
    end if;
  end if;

  if v_pago.id is not null then
    update public.payments
       set status = 'void', voided_at = now(), voided_by = v_uid,
           void_reason = btrim(p_motivo), updated_at = now()
     where id = v_pago.id;
  end if;
  if v_ant.payment_group_id is not null then
    update public.payment_groups set status = 'void' where id = v_ant.payment_group_id;
  end if;

  select je.id into v_asiento from public.journal_entries je
   where je.organization_id = v_ant.organization_id
     and je.fact_key = 'supplier_advance:' || v_ant.id::text
     and coalesce(je.posted, false)
     and not exists (select 1 from public.journal_entries r
                      where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
   limit 1;
  if v_asiento is not null then
    v_reverso := public.fn_revertir_asiento_en_fecha(v_asiento, 'anulacion_pago', 'anticipo-proveedor:' || v_ant.id::text, now(), v_uid);
  end if;

  update public.supplier_advances
     set status = 'cancelled', balance = 0, cancelled_at = now(), cancelled_by = v_uid,
         cancel_reason = btrim(p_motivo), updated_at = now()
   where id = v_ant.id;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_ant.organization_id, 'supplier_advances', v_ant.id::text, 'void', v_uid,
          jsonb_build_object('monto', v_ant.amount, 'payment_id', v_pago.id, 'asiento', v_asiento, 'contra_asiento', v_reverso),
          btrim(p_motivo));

  return jsonb_build_object('anticipo_id', v_ant.id, 'payment_id', v_pago.id,
                            'asiento_revertido', v_asiento, 'contra_asiento', v_reverso);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Permisos de ejecución: solo usuarios con sesión
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.fn_anticipo_proveedor_crear(integer, integer, numeric, text, text, integer, integer, text, text) from public, anon;
revoke all on function public.fn_anticipo_proveedor_aplicar(uuid, uuid, numeric, text, integer) from public, anon;
revoke all on function public.fn_anticipo_proveedor_devolver(uuid, numeric, text, text, text, integer, integer, text) from public, anon;
revoke all on function public.fn_anticipo_proveedor_anular(uuid, text, integer) from public, anon;
revoke all on function public.fn_trg_aplicacion_anticipo_proveedor_recalcula() from public, anon, authenticated;

grant execute on function public.fn_anticipo_proveedor_crear(integer, integer, numeric, text, text, integer, integer, text, text) to authenticated;
grant execute on function public.fn_anticipo_proveedor_aplicar(uuid, uuid, numeric, text, integer) to authenticated;
grant execute on function public.fn_anticipo_proveedor_devolver(uuid, numeric, text, text, text, integer, integer, text) to authenticated;
grant execute on function public.fn_anticipo_proveedor_anular(uuid, text, integer) to authenticated;
