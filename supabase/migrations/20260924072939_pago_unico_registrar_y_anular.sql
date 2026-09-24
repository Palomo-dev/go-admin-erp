-- Versión: 20260924072939, la que quedó registrada en supabase_migrations al aplicarla por MCP.
-- Antes se llamaba 20260926110000_pago_unico_registrar_y_anular.sql; se renombró el 2026-09-24 porque ese prefijo
-- lo usaban también migraciones de otras sesiones (chocaba con `supabase db push`).
--
-- Pago único: registrar y anular (P1.2 y P1.3 del plan de facturas de venta y CxC)
--
-- Una sola RPC para cobrar (cliente → nosotros) y pagar (nosotros → proveedor)
-- a una o varias facturas o cuentas, con cuota opcional, efectivo con caja y
-- sobrante a saldo a favor. La consumen: factura de venta, CxC (Finanzas y POS),
-- ficha del cliente, factura de compra y CxP, y «Registrar cobro» de ventas.
-- Contrato completo en docs/implementacion/FACTURAS-VENTA-CXC-PLAN.md §6.
--
-- Reglas:
--   * Organización y autor salen de la sesión (auth.uid()), nunca de un parámetro.
--   * Permiso en la base: cobro → finance.create o pos.create; pago → finance.create;
--     anular → finance.void o pos.void. Admin (super admin, rol 1/2) pasa, igual
--     que hasOrgAdminOrPermission en el servidor.
--   * D2: todo pago posterior va con source='account_receivable' (cobro) o
--     'account_payable' (pago) sobre la cuenta del documento. La caja ya lo cuenta
--     como «abono» (pos_caja_esperado) y fn_invoice_sales_paid lo suma.
--   * Nunca escribe saldos de factura ni de cartera: los recalculan los disparadores
--     (P1.1). Relee y devuelve los saldos finales.
--   * Efectivo sin caja abierta → error 'sin_caja_abierta' (decisión del dueño,
--     mismo criterio de caja que procesar_devolucion y pos_caja_esperado).
--   * Sobrante → saldo a favor (fn_create_customer_credit) solo si el usuario lo
--     pide (p_anticipo > 0); se registra además como pago source='customer_credit'
--     para que la caja cuente el efectivo recibido (fn_auto_journal_payment no
--     asienta esa fuente: el asiento lo hace fn_create_customer_credit).
--   * Idempotente por clave (p_clave_idempotencia), con candado por organización.
--   * Recibo: consecutivo RC-000001 por organización en payment_groups (D5 ajustada:
--     invoice_sequences es de resoluciones DIAN con rango y CHECK de tipo).
--
-- Anular (fn_anular_pago): status 'void' (los disparadores devuelven el saldo),
-- contra-asiento del asiento del pago con fn_revertir_asiento_en_fecha, cuota de
-- vuelta, motivo obligatorio. Un pago en efectivo de una caja ya cerrada no se
-- anula ('pago_en_caja_cerrada'): el arqueo ya se cerró con él.
--
-- Aditiva: tabla nueva payment_groups, columnas NULL en payments.

-- ── 1. Tabla del recibo (grupo de pagos) ─────────────────────────────────────
create table if not exists public.payment_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer references public.branches(id),
  direction text not null check (direction in ('cobro', 'pago')),
  receipt_number text not null,
  customer_id uuid references public.customers(id),
  supplier_id integer references public.suppliers(id),
  method text not null references public.payment_methods(code),
  currency character(3) not null references public.currencies(code),
  total_applied numeric(18,2) not null default 0,
  advance_amount numeric(18,2) not null default 0,
  received_amount numeric(18,2),
  change_amount numeric(18,2) not null default 0,
  payment_date timestamptz not null,
  reference text,
  bank_account_id integer references public.bank_accounts(id),
  notes text,
  customer_credit_id uuid references public.credit_notes(id),
  cash_session_id integer references public.cash_sessions(id),
  origin text,
  idempotency_key text not null,
  status text not null default 'completed' check (status in ('completed', 'partially_void', 'void')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.payment_groups is
  'Recibo de un pago único (fn_registrar_pago): agrupa las filas de payments de un mismo cobro o pago. Solo lo escriben fn_registrar_pago y fn_anular_pago.';

create unique index if not exists uq_payment_groups_org_idem on public.payment_groups (organization_id, idempotency_key);
create unique index if not exists uq_payment_groups_org_recibo on public.payment_groups (organization_id, receipt_number);
create index if not exists idx_payment_groups_org_customer on public.payment_groups (organization_id, customer_id) where customer_id is not null;
create index if not exists idx_payment_groups_org_supplier on public.payment_groups (organization_id, supplier_id) where supplier_id is not null;

alter table public.payment_groups enable row level security;

drop policy if exists payment_groups_select on public.payment_groups;
create policy payment_groups_select on public.payment_groups
  for select to authenticated
  using (
    organization_id in (select om.organization_id from public.organization_members om
                         where om.user_id = (select auth.uid()) and om.is_active)
    and (branch_id is null or public.app_branch_access(branch_id))
  );
-- Sin políticas de escritura: solo las funciones SECURITY DEFINER escriben.

-- ── 2. Columnas de payments ──────────────────────────────────────────────────
alter table public.payments add column if not exists payment_group_id uuid references public.payment_groups(id);
alter table public.payments add column if not exists installment_id uuid;
alter table public.payments add column if not exists voided_at timestamptz;
alter table public.payments add column if not exists voided_by uuid references auth.users(id);
alter table public.payments add column if not exists void_reason text;

comment on column public.payments.payment_group_id is 'Recibo (payment_groups) al que pertenece la fila; NULL en pagos anteriores al pago único.';
comment on column public.payments.installment_id is 'Cuota pagada: ar_installments.id si source=account_receivable, ap_installments.id si source=account_payable.';
comment on column public.payments.voided_at is 'Anulación por fn_anular_pago: status pasa a void y el asiento del pago se revierte con contra-asiento.';

create index if not exists idx_payments_group on public.payments (payment_group_id) where payment_group_id is not null;
create index if not exists idx_payments_source on public.payments (source, source_id);

-- ── 3. Permiso en la base, mismo criterio que el servidor ─────────────────────
create or replace function public.fn_finanzas_exigir_permiso(p_org integer, p_codigos text[])
 returns void
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_codigo text;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return;  -- solo el service role llega aquí (fn_assert_acceso_org rechaza anon)
  end if;
  if exists (select 1 from public.organization_members om
              where om.user_id = v_uid and om.organization_id = p_org and om.is_active
                and (coalesce(om.is_super_admin, false) or om.role_id in (1, 2))) then
    return;
  end if;
  foreach v_codigo in array coalesce(p_codigos, array[]::text[]) loop
    if public.check_user_permission(v_uid, p_org, v_codigo) then
      return;
    end if;
  end loop;
  raise exception 'sin_permiso' using errcode = '42501',
    detail = jsonb_build_object('permisos', p_codigos)::text;
end;
$function$;

revoke all on function public.fn_finanzas_exigir_permiso(integer, text[]) from public, anon;
grant execute on function public.fn_finanzas_exigir_permiso(integer, text[]) to authenticated, service_role;

-- ── 4. Caja abierta que corresponde (modo de la organización) ────────────────
create or replace function public.fn_caja_abierta_para(p_org integer, p_branch integer, p_user uuid)
 returns integer
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select cs.id
    from public.cash_sessions cs
   where cs.organization_id = p_org
     and cs.status = 'open'
     and case when coalesce((select os.settings->>'mode' from public.organization_settings os
                              where os.organization_id = p_org and os.key = 'pos_cash_session_mode'), 'branch') = 'user'
              then cs.branch_id is not distinct from p_branch and cs.opened_by = p_user
              else (cs.branch_id is not distinct from p_branch or cs.branch_id is null) end
   order by (cs.branch_id is null), cs.opened_at desc
   limit 1;
$function$;

revoke all on function public.fn_caja_abierta_para(integer, integer, uuid) from public, anon;
grant execute on function public.fn_caja_abierta_para(integer, integer, uuid) to authenticated, service_role;

-- ── 5. Registrar ─────────────────────────────────────────────────────────────
create or replace function public.fn_registrar_pago(
  p_direccion text,
  p_aplicaciones jsonb,
  p_metodo text,
  p_moneda text,
  p_fecha date,
  p_referencia text default null,
  p_cuenta_bancaria integer default null,
  p_recibido numeric default null,
  p_anticipo numeric default 0,
  p_clave_idempotencia text default null,
  p_notas text default null,
  p_origen text default null,
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
  v_grupo public.payment_groups%rowtype;
  v_app jsonb;
  v_apps jsonb := '[]'::jsonb;
  v_doc text;
  v_doc_id uuid;
  v_cuenta_id uuid;
  v_cuota_id uuid;
  v_monto numeric;
  v_saldo numeric;
  v_moneda text;
  v_tercero text;
  v_tercero_prev text;
  v_branch integer;
  v_branch_grupo integer;
  v_customer uuid;
  v_supplier integer;
  v_estado text;
  v_ar public.accounts_receivable%rowtype;
  v_ap public.accounts_payable%rowtype;
  v_inv public.invoice_sales%rowtype;
  v_ip public.invoice_purchase%rowtype;
  v_cuota record;
  v_total numeric := 0;
  v_anticipo numeric := round(coalesce(p_anticipo, 0), 2);
  v_cambio numeric := 0;
  v_caja integer;
  v_fecha timestamptz;
  v_tz text;
  v_recibo text;
  v_pago_id uuid;
  v_primero boolean := true;
  v_credito uuid;
  v_cuenta_dinero text;
  v_requiere_ref boolean;
  v_pagos jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_direccion not in ('cobro', 'pago') then
    raise exception 'direccion_invalida' using errcode = '22023';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if p_aplicaciones is null or jsonb_typeof(p_aplicaciones) <> 'array' or jsonb_array_length(p_aplicaciones) = 0 then
    raise exception 'sin_aplicaciones' using errcode = '22023';
  end if;
  if jsonb_array_length(p_aplicaciones) > 200 then
    raise exception 'demasiadas_aplicaciones' using errcode = '22023';
  end if;
  if v_anticipo < 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  if v_anticipo > 0 and p_direccion <> 'cobro' then
    raise exception 'anticipo_solo_cobro' using errcode = '22023';
  end if;
  if p_moneda is null or p_moneda !~ '^[A-Z]{3}$' then
    raise exception 'moneda_invalida' using errcode = '22023';
  end if;
  if p_fecha is null then
    raise exception 'fecha_invalida' using errcode = '22023';
  end if;

  select pm.requires_reference into v_requiere_ref from public.payment_methods pm
   where pm.code = p_metodo and coalesce(pm.is_active, true);
  if not found then
    raise exception 'metodo_invalido' using errcode = '22023';
  end if;
  if coalesce(v_requiere_ref, false) and nullif(btrim(coalesce(p_referencia, '')), '') is null then
    raise exception 'referencia_obligatoria' using errcode = '22023';
  end if;

  -- ── Organización: la del primer documento; todas deben coincidir (se filtra por
  --    ella al bloquear cada una) y el usuario pertenecer. p_organization_id es la
  --    de la sesión que manda el servidor: solo sirve de guarda adicional.
  v_app := p_aplicaciones->0;
  v_doc := v_app->>'documento';
  begin
    v_doc_id := (v_app->>'id')::uuid;
  exception when others then
    raise exception 'documento_invalido' using errcode = '22023';
  end;
  v_org := case v_doc
    when 'invoice_sales' then (select organization_id from public.invoice_sales where id = v_doc_id)
    when 'account_receivable' then (select organization_id from public.accounts_receivable where id = v_doc_id)
    when 'invoice_purchase' then (select organization_id from public.invoice_purchase where id = v_doc_id)
    when 'account_payable' then (select organization_id from public.accounts_payable where id = v_doc_id)
    else null end;
  if v_org is null then
    raise exception 'documento_no_encontrado' using errcode = 'P0002';
  end if;
  if p_organization_id is not null and p_organization_id <> v_org then
    raise exception 'documento_no_encontrado' using errcode = 'P0002';
  end if;

  perform public.fn_finanzas_exigir_permiso(v_org,
    case when p_direccion = 'cobro' then array['finance.create', 'pos.create'] else array['finance.create'] end);

  -- ── Idempotencia ──
  perform pg_advisory_xact_lock(hashtextextended('fn_registrar_pago:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_grupo from public.payment_groups
   where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    return jsonb_build_object(
      'grupo_id', v_grupo.id, 'recibo', v_grupo.receipt_number, 'repetida', true,
      'total_aplicado', v_grupo.total_applied, 'anticipo', v_grupo.advance_amount,
      'cambio', v_grupo.change_amount, 'credito_id', v_grupo.customer_credit_id,
      'caja_id', v_grupo.cash_session_id,
      'pagos', coalesce((select jsonb_agg(jsonb_build_object('payment_id', p.id, 'source', p.source,
                          'source_id', p.source_id, 'monto', p.amount) order by p.created_at, p.id)
                         from public.payments p where p.payment_group_id = v_grupo.id), '[]'::jsonb));
  end if;

  -- ── Validar y bloquear cada aplicación, en orden de id (sin interbloqueos) ──
  for v_app in
    select e from jsonb_array_elements(p_aplicaciones) e order by e->>'documento', e->>'id'
  loop
    v_doc := v_app->>'documento';
    begin
      v_doc_id := (v_app->>'id')::uuid;
      v_cuota_id := nullif(v_app->>'cuota_id', '')::uuid;
      v_monto := round((v_app->>'monto')::numeric, 2);
    exception when others then
      raise exception 'aplicacion_invalida' using errcode = '22023';
    end;
    if v_monto is null or v_monto <= 0 then
      raise exception 'monto_invalido' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_apps) x where (x->>'doc_id')::uuid = v_doc_id) then
      raise exception 'aplicacion_repetida' using errcode = '22023';
    end if;

    if p_direccion = 'cobro' then
      if v_doc not in ('invoice_sales', 'account_receivable') then
        raise exception 'documento_invalido' using errcode = '22023';
      end if;
      if v_doc = 'invoice_sales' then
        select * into v_inv from public.invoice_sales where id = v_doc_id and organization_id = v_org for update;
        if not found then raise exception 'documento_no_encontrado' using errcode = 'P0002'; end if;
        select * into v_ar from public.accounts_receivable where invoice_id = v_inv.id order by created_at limit 1 for update;
        if not found then
          if v_inv.status = 'draft' then raise exception 'documento_borrador' using errcode = '22023'; end if;
          perform public.create_account_receivable(v_inv.id::text);
          select * into v_ar from public.accounts_receivable where invoice_id = v_inv.id order by created_at limit 1 for update;
        end if;
      else
        select * into v_ar from public.accounts_receivable where id = v_doc_id and organization_id = v_org for update;
        if not found then raise exception 'documento_no_encontrado' using errcode = 'P0002'; end if;
        v_inv := null;
        if v_ar.invoice_id is not null then
          select * into v_inv from public.invoice_sales where id = v_ar.invoice_id for update;
        end if;
      end if;

      if v_inv.id is not null then
        if v_inv.status = 'draft' then raise exception 'documento_borrador' using errcode = '22023'; end if;
        if v_inv.status in ('void', 'voided', 'cancelled') then raise exception 'documento_anulado' using errcode = '22023'; end if;
        if coalesce(v_inv.document_type, 'invoice') <> 'invoice' then raise exception 'documento_invalido' using errcode = '22023'; end if;
        v_saldo := coalesce(v_inv.balance, 0);
        v_moneda := upper(coalesce(v_inv.currency, public.fn_moneda_base_organizacion(v_org)));
        v_branch := coalesce(v_inv.branch_id, v_ar.branch_id);
      else
        v_saldo := coalesce(v_ar.balance, 0);
        v_moneda := upper(public.fn_moneda_base_organizacion(v_org));
        v_branch := v_ar.branch_id;
      end if;
      if v_ar.status = 'cancelled' then raise exception 'documento_anulado' using errcode = '22023'; end if;
      v_cuenta_id := v_ar.id;
      v_customer := coalesce(v_ar.customer_id, v_inv.customer_id);
      v_tercero := coalesce(v_customer::text, '');
      v_estado := coalesce(v_inv.status, v_ar.status);

      if v_cuota_id is not null then
        select * into v_cuota from public.ar_installments
         where id = v_cuota_id and account_receivable_id = v_ar.id for update;
        if not found then raise exception 'cuota_no_encontrada' using errcode = 'P0002'; end if;
        if v_cuota.status in ('paid', 'written_off') then raise exception 'cuota_pagada' using errcode = '22023'; end if;
        if v_monto > coalesce(v_cuota.balance, v_cuota.amount - v_cuota.paid_amount) then
          raise exception 'monto_excede_cuota' using errcode = '22023',
            detail = jsonb_build_object('cuota_id', v_cuota_id, 'saldo', v_cuota.balance)::text;
        end if;
      end if;
    else
      if v_doc not in ('invoice_purchase', 'account_payable') then
        raise exception 'documento_invalido' using errcode = '22023';
      end if;
      v_ip := null;
      if v_doc = 'invoice_purchase' then
        select * into v_ip from public.invoice_purchase where id = v_doc_id and organization_id = v_org for update;
        if not found then raise exception 'documento_no_encontrado' using errcode = 'P0002'; end if;
        select * into v_ap from public.accounts_payable where invoice_id = v_ip.id order by created_at limit 1 for update;
        if not found then raise exception 'cuenta_no_encontrada' using errcode = 'P0002'; end if;
      else
        select * into v_ap from public.accounts_payable where id = v_doc_id and organization_id = v_org for update;
        if not found then raise exception 'documento_no_encontrado' using errcode = 'P0002'; end if;
        if v_ap.invoice_id is not null then
          select * into v_ip from public.invoice_purchase where id = v_ap.invoice_id for update;
        end if;
      end if;
      if v_ip.id is not null and v_ip.status in ('draft', 'void', 'voided', 'cancelled') then
        raise exception 'documento_anulado' using errcode = '22023';
      end if;
      if v_ap.status = 'cancelled' then raise exception 'documento_anulado' using errcode = '22023'; end if;
      v_saldo := coalesce(v_ap.balance, 0);
      v_moneda := upper(coalesce(v_ip.currency, public.fn_moneda_base_organizacion(v_org)));
      v_branch := coalesce(v_ip.branch_id, v_ap.branch_id);
      v_cuenta_id := v_ap.id;
      v_supplier := v_ap.supplier_id;
      v_tercero := v_supplier::text;
      v_estado := v_ap.status;

      if v_cuota_id is not null then
        select * into v_cuota from public.ap_installments
         where id = v_cuota_id and account_payable_id = v_ap.id for update;
        if not found then raise exception 'cuota_no_encontrada' using errcode = 'P0002'; end if;
        if v_cuota.status in ('paid', 'written_off') then raise exception 'cuota_pagada' using errcode = '22023'; end if;
        if v_monto > coalesce(v_cuota.balance, v_cuota.amount - v_cuota.paid_amount) then
          raise exception 'monto_excede_cuota' using errcode = '22023',
            detail = jsonb_build_object('cuota_id', v_cuota_id, 'saldo', v_cuota.balance)::text;
        end if;
      end if;
    end if;

    if v_branch is not null and not public.app_branch_access(v_branch) then
      raise exception 'sin_acceso_sucursal' using errcode = '42501';
    end if;
    if v_moneda <> upper(p_moneda) then
      raise exception 'moneda_distinta' using errcode = '22023',
        detail = jsonb_build_object('documento', v_doc_id, 'moneda', v_moneda)::text;
    end if;
    if v_monto > v_saldo then
      raise exception 'monto_excede_saldo' using errcode = '22023',
        detail = jsonb_build_object('documento', v_doc_id, 'saldo', v_saldo, 'monto', v_monto)::text;
    end if;
    if v_tercero_prev is not null and v_tercero_prev <> v_tercero then
      raise exception 'terceros_distintos' using errcode = '22023';
    end if;
    v_tercero_prev := v_tercero;
    v_branch_grupo := coalesce(v_branch_grupo, v_branch);
    v_total := v_total + v_monto;

    -- El pago no puede ser anterior al día de emisión (en la zona de la sucursal).
    if coalesce(v_inv.issue_date, v_ip.issue_date) is not null
       and p_fecha < (coalesce(v_inv.issue_date, v_ip.issue_date) at time zone public.fn_timezone_for(v_org, v_branch))::date then
      raise exception 'fecha_anterior_emision' using errcode = '22023';
    end if;

    v_apps := v_apps || jsonb_build_object(
      'documento', v_doc, 'doc_id', v_doc_id, 'cuenta_id', v_cuenta_id, 'cuota_id', v_cuota_id,
      'monto', v_monto, 'branch_id', v_branch);
  end loop;

  if v_anticipo > 0 and v_customer is null then
    raise exception 'saldo_a_favor_sin_cliente' using errcode = '22023';
  end if;

  -- ── Efectivo: recibido, cambio y caja abierta ──
  if p_metodo = 'cash' then
    if p_recibido is not null then
      if round(p_recibido, 2) < v_total + v_anticipo then
        raise exception 'recibido_insuficiente' using errcode = '22023';
      end if;
      v_cambio := round(p_recibido, 2) - (v_total + v_anticipo);
    end if;
    v_caja := public.fn_caja_abierta_para(v_org, v_branch_grupo, v_uid);
    if v_caja is null then
      raise exception 'sin_caja_abierta' using errcode = '22023',
        hint = 'Abra la caja de la sucursal o registre el pago con otro método.';
    end if;
  elsif p_cuenta_bancaria is not null then
    if not exists (select 1 from public.bank_accounts b where b.id = p_cuenta_bancaria and b.organization_id = v_org and coalesce(b.is_active, true)) then
      raise exception 'cuenta_bancaria_invalida' using errcode = '22023';
    end if;
  end if;

  -- ── Fecha: el día elegido con la hora de pared de la sucursal ──
  v_tz := public.fn_timezone_for(v_org, v_branch_grupo);
  if p_fecha > public.fn_today_for(v_org, v_branch_grupo) then
    raise exception 'fecha_futura' using errcode = '22023';
  end if;
  v_fecha := ((p_fecha + (now() at time zone v_tz)::time) at time zone v_tz);

  -- ── Recibo ──
  perform pg_advisory_xact_lock(hashtextextended('recibo_pago:' || v_org, 0));
  select 'RC-' || lpad((coalesce(max(nullif(regexp_replace(g.receipt_number, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 6, '0')
    into v_recibo
    from public.payment_groups g where g.organization_id = v_org;

  insert into public.payment_groups (
    organization_id, branch_id, direction, receipt_number, customer_id, supplier_id, method, currency,
    total_applied, advance_amount, received_amount, change_amount, payment_date, reference,
    bank_account_id, notes, cash_session_id, origin, idempotency_key, created_by
  ) values (
    v_org, v_branch_grupo, p_direccion, v_recibo, v_customer, v_supplier, p_metodo, upper(p_moneda),
    v_total, v_anticipo, case when p_metodo = 'cash' then round(p_recibido, 2) end, v_cambio, v_fecha,
    nullif(btrim(coalesce(p_referencia, '')), ''), case when p_metodo = 'cash' then null else p_cuenta_bancaria end,
    nullif(btrim(coalesce(p_notas, '')), ''), v_caja, nullif(btrim(coalesce(p_origen, '')), ''), p_clave_idempotencia, v_uid
  ) returning * into v_grupo;

  -- ── Un payments por aplicación (el cambio solo en la primera fila) ──
  for v_app in select e from jsonb_array_elements(v_apps) e loop
    insert into public.payments (
      organization_id, branch_id, source, source_id, method, amount, currency, reference, status,
      created_by, payment_date, change_amount, bank_account_id, payment_group_id, installment_id
    ) values (
      v_org, coalesce((v_app->>'branch_id')::integer, v_branch_grupo),
      case when p_direccion = 'cobro' then 'account_receivable' else 'account_payable' end,
      v_app->>'cuenta_id', p_metodo, (v_app->>'monto')::numeric, upper(p_moneda),
      coalesce(nullif(btrim(coalesce(p_referencia, '')), ''), v_recibo), 'completed',
      v_uid, v_fecha, case when v_primero then v_cambio else 0 end,
      case when p_metodo = 'cash' then null else p_cuenta_bancaria end,
      v_grupo.id, nullif(v_app->>'cuota_id', '')::uuid
    ) returning id into v_pago_id;
    v_primero := false;

    -- Cuota en la misma transacción (el BEFORE de la cuota recalcula estado y saldo).
    if nullif(v_app->>'cuota_id', '') is not null then
      if p_direccion = 'cobro' then
        update public.ar_installments
           set paid_amount = paid_amount + (v_app->>'monto')::numeric,
               balance = greatest(amount - (paid_amount + (v_app->>'monto')::numeric), 0)
         where id = (v_app->>'cuota_id')::uuid;
      else
        update public.ap_installments
           set paid_amount = paid_amount + (v_app->>'monto')::numeric,
               balance = greatest(amount - (paid_amount + (v_app->>'monto')::numeric), 0)
         where id = (v_app->>'cuota_id')::uuid;
      end if;
    end if;

    v_pagos := v_pagos || jsonb_build_object(
      'payment_id', v_pago_id, 'documento', v_app->>'documento', 'id', v_app->>'doc_id',
      'cuenta_id', v_app->>'cuenta_id', 'cuota_id', v_app->>'cuota_id', 'monto', (v_app->>'monto')::numeric);
  end loop;

  -- ── Sobrante a saldo a favor ──
  if v_anticipo > 0 then
    v_cuenta_dinero := coalesce(public.fn_money_account_code_pago(v_org, v_branch_grupo, p_metodo, p_cuenta_bancaria), '1105');
    v_credito := public.fn_create_customer_credit(
      v_org, v_customer, v_anticipo, v_cuenta_dinero, v_branch_grupo,
      'Saldo a favor por el recibo ' || v_recibo, null, v_uid);
    insert into public.payments (
      organization_id, branch_id, source, source_id, method, amount, currency, reference, status,
      created_by, payment_date, bank_account_id, payment_group_id
    ) values (
      v_org, v_branch_grupo, 'customer_credit', v_credito::text, p_metodo, v_anticipo, upper(p_moneda),
      coalesce(nullif(btrim(coalesce(p_referencia, '')), ''), v_recibo), 'completed',
      v_uid, v_fecha, case when p_metodo = 'cash' then null else p_cuenta_bancaria end, v_grupo.id
    );
    update public.payment_groups set customer_credit_id = v_credito where id = v_grupo.id;
  end if;

  -- ── Saldos finales, releídos después de los disparadores ──
  v_pagos := (
    select jsonb_agg(p || jsonb_build_object(
      'saldo_nuevo', case
        when p->>'documento' in ('invoice_sales', 'account_receivable') then coalesce(
          (select i.balance from public.accounts_receivable a join public.invoice_sales i on i.id = a.invoice_id where a.id = (p->>'cuenta_id')::uuid),
          (select a.balance from public.accounts_receivable a where a.id = (p->>'cuenta_id')::uuid))
        else (select a.balance from public.accounts_payable a where a.id = (p->>'cuenta_id')::uuid) end))
    from jsonb_array_elements(v_pagos) p);

  return jsonb_build_object(
    'grupo_id', v_grupo.id, 'recibo', v_recibo, 'repetida', false,
    'total_aplicado', v_total, 'anticipo', v_anticipo, 'cambio', v_cambio,
    'credito_id', v_credito, 'caja_id', v_caja, 'pagos', coalesce(v_pagos, '[]'::jsonb));
end;
$function$;

revoke all on function public.fn_registrar_pago(text, jsonb, text, text, date, text, integer, numeric, numeric, text, text, text, integer) from public, anon;
grant execute on function public.fn_registrar_pago(text, jsonb, text, text, date, text, integer, numeric, numeric, text, text, text, integer) to authenticated, service_role;

-- ── 6. Anular ────────────────────────────────────────────────────────────────
create or replace function public.fn_anular_pago(p_payment_id uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_p public.payments%rowtype;
  v_caja record;
  v_asiento integer;
  v_reverso integer;
  v_vivos integer;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;

  select * into v_p from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'pago_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_p.organization_id, array['finance.void', 'pos.void']);
  if v_p.branch_id is not null and not public.app_branch_access(v_p.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_p.status is distinct from 'completed' then
    raise exception 'pago_no_anulable' using errcode = '22023';
  end if;
  if coalesce(v_p.source, '') not in ('invoice_sales', 'account_receivable', 'sale', 'invoice_purchase', 'account_payable') then
    -- Folios, parqueaderos, membresías y web tienen su propio flujo de reverso.
    raise exception 'pago_no_anulable' using errcode = '22023';
  end if;

  -- Efectivo de una caja ya cerrada: el arqueo se cerró con él.
  if v_p.method = 'cash' then
    select cs.id, cs.status into v_caja from public.cash_sessions cs
     where cs.id = (select g.cash_session_id from public.payment_groups g where g.id = v_p.payment_group_id);
    if not found then
      select cs.id, cs.status into v_caja from public.cash_sessions cs
       where cs.organization_id = v_p.organization_id
         and (cs.branch_id is null or cs.branch_id is not distinct from v_p.branch_id)
         and v_p.created_at >= cs.opened_at and v_p.created_at <= coalesce(cs.closed_at, 'infinity'::timestamptz)
       order by (cs.status = 'open'), cs.opened_at desc
       limit 1;
    end if;
    if found and v_caja.status <> 'open' then
      raise exception 'pago_en_caja_cerrada' using errcode = '22023',
        hint = 'El pago está en una caja ya cerrada: registre una nota crédito o una salida de caja.';
    end if;
  end if;

  update public.payments
     set status = 'void', voided_at = now(), voided_by = v_uid,
         void_reason = btrim(p_motivo), updated_at = now()
   where id = v_p.id;

  -- Cuota de vuelta.
  if v_p.installment_id is not null then
    if v_p.source = 'account_receivable' then
      update public.ar_installments
         set paid_amount = greatest(paid_amount - v_p.amount, 0),
             balance = least(amount, balance + v_p.amount),
             status = case when greatest(paid_amount - v_p.amount, 0) > 0 then 'partial' else 'pending' end,
             paid_at = null
       where id = v_p.installment_id;
    elsif v_p.source = 'account_payable' then
      update public.ap_installments
         set paid_amount = greatest(paid_amount - v_p.amount, 0),
             balance = least(amount, balance + v_p.amount),
             status = case when greatest(paid_amount - v_p.amount, 0) > 0 then 'partial' else 'pending' end,
             paid_at = null
       where id = v_p.installment_id;
    end if;
  end if;

  -- Contra-asiento del asiento del pago (nunca se edita ni se borra).
  select je.id into v_asiento from public.journal_entries je
   where je.organization_id = v_p.organization_id
     and je.fact_key = 'settlement:payment:' || v_p.id::text
     and coalesce(je.posted, false)
     and not exists (select 1 from public.journal_entries r
                      where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
   limit 1;
  if v_asiento is not null then
    v_reverso := public.fn_revertir_asiento_en_fecha(v_asiento, 'anulacion_pago', 'pago:' || v_p.id::text, now(), v_uid);
  end if;

  -- Estado del recibo.
  if v_p.payment_group_id is not null then
    select count(*) into v_vivos from public.payments
     where payment_group_id = v_p.payment_group_id and status = 'completed' and source <> 'customer_credit';
    update public.payment_groups
       set status = case when v_vivos = 0 then 'void' else 'partially_void' end
     where id = v_p.payment_group_id;
  end if;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_p.organization_id, 'payments', v_p.id::text, 'void', v_uid,
          jsonb_build_object('amount', v_p.amount, 'source', v_p.source, 'source_id', v_p.source_id,
                             'asiento', v_asiento, 'contra_asiento', v_reverso),
          btrim(p_motivo));

  return jsonb_build_object(
    'payment_id', v_p.id, 'source', v_p.source, 'source_id', v_p.source_id,
    'asiento_revertido', v_asiento, 'contra_asiento', v_reverso,
    'saldo_nuevo', case
      when v_p.source = 'account_receivable' then coalesce(
        (select i.balance from public.accounts_receivable a join public.invoice_sales i on i.id = a.invoice_id where a.id::text = v_p.source_id),
        (select a.balance from public.accounts_receivable a where a.id::text = v_p.source_id))
      when v_p.source = 'invoice_sales' then (select i.balance from public.invoice_sales i where i.id::text = v_p.source_id)
      when v_p.source = 'account_payable' then (select a.balance from public.accounts_payable a where a.id::text = v_p.source_id)
      when v_p.source = 'invoice_purchase' then (select i.balance from public.invoice_purchase i where i.id::text = v_p.source_id)
      else null end);
end;
$function$;

revoke all on function public.fn_anular_pago(uuid, text) from public, anon;
grant execute on function public.fn_anular_pago(uuid, text) to authenticated, service_role;
