-- Reversión de 20261108170000_anticipos_proveedores_contador.sql.
--
-- Deja las funciones de anticipos como las dejó 20261108120000_anticipos_proveedores.sql (cuerpos copiados
-- de ese archivo, byte a byte) y fn_estado_cuenta_proveedor_movs como estaba antes (leída por el MCP el
-- 2026-11-07). Borra las funciones, tablas y columnas nuevas.
--
-- ADVERTENCIA: NO restaura datos. Si ya se registraron anticipos con la versión nueva, se pierden su
-- naturaleza, sus retenciones (supplier_advance_withholdings) y sus ajustes, sus devoluciones
-- (supplier_advance_refunds), los vínculos con facturas, los pendientes contables, las calidades verificadas de
-- proveedores, las reglas de ReteICA, las equivalencias de cuenta y el detalle de cada aplicación; los asientos y pagos ya publicados quedan como están. Antes de revertir con
-- datos, exporte esas tablas y la conciliación (fn_anticipos_proveedor_conciliacion).

-- 1. Funciones y disparador nuevos (ronda 1 y ronda 2)
drop trigger if exists trg_factura_compra_retencion_anticipo on public.invoice_purchase;
drop function if exists public.fn_trg_factura_compra_retencion_anticipo();
drop function if exists public.fn_anticipos_proveedor_conciliacion(integer, integer);
drop function if exists public.fn_anticipo_proveedor_anular_por_error(uuid, text, text, date, integer);
drop function if exists public.fn_anticipo_proveedor_registrar(integer, integer, numeric, text, text, text, integer, numeric, uuid, uuid, integer, text, text, jsonb, boolean);
drop function if exists public.fn_anticipo_proveedor_evaluar_retenciones(integer, integer, text, numeric, numeric, uuid, uuid, jsonb, boolean);
drop function if exists public.fn_anticipo_proveedor_aplicar_corrigiendo(uuid, uuid, numeric, text, text, text, integer);
drop function if exists public.fn_anticipo_proveedor_aplicar_int(uuid, uuid, numeric, text, integer, jsonb);
drop function if exists public.fn_anticipo_proveedor_vincular_factura(uuid, uuid, numeric, integer);
drop function if exists public.fn_anticipo_proveedor_desvincular_factura(uuid, uuid, integer);
drop function if exists public.fn_anticipo_proveedor_devolver(uuid, numeric, text, text, text, integer, integer, text, jsonb);
drop function if exists public.fn_anticipo_pendiente_resolver(uuid, text, text, integer);
drop function if exists public.fn_anticipo_pendiente_abrir(integer, uuid, text, jsonb, uuid);
drop function if exists public.fn_proveedor_calidad_tributaria_guardar(integer, integer, text, text, text[], date, date, date, text, text, date, text);
drop function if exists public.fn_reteiva_aiu_regla_guardar(integer, text, date, date, text);
drop function if exists public.fn_anticipo_retencion_exceso_reintegrar(uuid, text, numeric, numeric, text, text, jsonb, text, boolean, text, integer, integer, text);
drop function if exists public.fn_reteica_regla_guardar(integer, uuid, text, numeric, text, date, date, numeric);
drop function if exists public.fn_anticipo_cuenta_equivalencia_aprobar(integer, text, text);
drop function if exists public.fn_anticipo_retencion_practicar(integer, text, uuid, numeric);
drop function if exists public.fn_anticipo_proveedor_asiento(integer, integer, timestamptz, text, text, text, text, jsonb, uuid);
drop function if exists public.fn_cxp_cuenta_reconocida(integer, uuid);

-- 2. Funciones reemplazadas: versión de 20261108120000 (con respaldo a 1330, como estaba).
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


drop function if exists public.fn_cuenta_anticipo_proveedor_estado(integer, integer);
drop function if exists public.fn_cuenta_anticipo_motivo_invalida(integer, text);

-- 3. Estado de cuenta del proveedor: sin anticipos (versión anterior).
create or replace function public.fn_estado_cuenta_proveedor_movs(p_org integer, p_supplier integer)
 returns table(fecha timestamp with time zone, tipo text, documento text, ref_id text, vence timestamp with time zone, cargo numeric, abono numeric)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  -- Cargos: facturas confirmadas por su neto a pagar …
  select ip.issue_date, 'factura'::text, ip.number_ext, ip.id::text, ip.due_date,
         public.fn_invoice_purchase_neto(ip.id), 0::numeric
    from public.invoice_purchase ip
   where ip.organization_id = p_org and ip.supplier_id = p_supplier
     and ip.status not in ('draft', 'void', 'voided')
     and (auth.uid() is null or public.app_branch_access(ip.branch_id))
  union all
  -- … y cuentas por pagar sin factura.
  select ap.created_at, 'cuenta'::text, null::text, ap.id::text, ap.due_date, coalesce(ap.amount, 0), 0::numeric
    from public.accounts_payable ap
   where ap.organization_id = p_org and ap.supplier_id = p_supplier and ap.invoice_id is null
     and coalesce(ap.status, '') <> 'void'
     and (auth.uid() is null or public.app_branch_access(ap.branch_id))
  union all
  -- Abonos: pagos completados de los dos orígenes.
  select p.payment_date, 'pago'::text, coalesce(nullif(p.reference, ''), p.method), p.id::text, null::timestamptz,
         0::numeric, p.amount + coalesce(p.discount_amount, 0)
    from public.payments p
   where p.organization_id = p_org and p.status = 'completed'
     and (
       (p.source = 'invoice_purchase' and p.source_id in (
          select ip.id::text from public.invoice_purchase ip
           where ip.organization_id = p_org and ip.supplier_id = p_supplier and ip.status not in ('draft', 'void', 'voided')))
       or (p.source = 'account_payable' and p.source_id in (
          select ap.id::text from public.accounts_payable ap
            left join public.invoice_purchase ip on ip.id = ap.invoice_id
           where ap.organization_id = p_org and ap.supplier_id = p_supplier
             and (ip.id is null or ip.status not in ('draft', 'void', 'voided'))))
     )
     and (auth.uid() is null or public.app_branch_access(p.branch_id));
$function$;

-- 3b. Certificado y reporte de retenciones: solo facturas de compra (versión leída por el MCP el 2026-11-07).
create or replace function public.fn_retenciones_practicadas_filas(p_organization_id integer, p_desde timestamp with time zone,
  p_hasta timestamp with time zone, p_branch_id integer, p_supplier_id integer)
 returns table(invoice_id uuid, numero text, emision timestamp with time zone, supplier_id integer, branch_id integer, concepto text, codigo text,
               clase text, cuenta text, base numeric, tarifa numeric, valor numeric)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select i.id,
         coalesce(nullif(btrim(i.number_ext), ''), i.id::text)::text,
         i.issue_date::timestamptz,
         i.supplier_id::integer,
         i.branch_id::integer,
         w.concept::text,
         w.tax_code::text,
         public.fn_clase_retencion(w.tax_code, w.concept),
         coalesce(
           (select jl.account_code
              from journal_entries e
              join journal_lines jl on jl.journal_entry_id = e.id
             where e.organization_id = i.organization_id
               and e.source = 'invoice_purchase'
               and e.source_id = i.id::text
               and e.memo like 'Compra %'
               and jl.description = w.concept || ' - ' || e.memo
               and jl.credit = w.amount
             order by jl.id
             limit 1),
           public.fn_cuenta_retencion_compra(i.organization_id, w.tax_code, w.concept)
         )::text,
         w.base::numeric,
         w.rate::numeric,
         w.amount::numeric
    from invoice_purchase_withholdings w
    join invoice_purchase i on i.id = w.invoice_id and i.organization_id = w.organization_id
   where w.organization_id = p_organization_id
     and w.amount > 0
     and i.status not in ('draft', 'void', 'cancelled')
     and i.issue_date >= p_desde
     and i.issue_date <= p_hasta
     and (p_branch_id is null or i.branch_id = p_branch_id)
     and (p_supplier_id is null or i.supplier_id = p_supplier_id);
$function$;

-- 3c. Arqueo: versión anterior (leída por el MCP el 2026-11-07), sin los renglones de anticipos.
create or replace function public.pos_caja__esperado_calculo(p_session_id integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  s public.cash_sessions%rowtype;
  v_hasta timestamptz;
  v_por_cajero boolean;
  v_ventas_ef numeric := 0;
  v_vuelto numeric := 0;
  v_abonos_ef numeric := 0;
  v_compras_ef numeric := 0;
  v_devoluciones numeric := 0;
  v_entradas numeric := 0;
  v_salidas numeric := 0;
  v_efectivo numeric := 0;
  v_por_metodo jsonb := '{}'::jsonb;
begin
  select * into s from public.cash_sessions where id = p_session_id;
  if not found then
    raise exception 'La caja no existe' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(s.organization_id);
  if auth.uid() is not null and not public.app_branch_access(s.branch_id) then
    raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
  end if;

  v_hasta := coalesce(s.closed_at, now());
  v_por_cajero := coalesce(
    (select os.settings->>'mode' from public.organization_settings os
      where os.organization_id = s.organization_id and os.key = 'pos_cash_session_mode'),
    'branch') = 'user';

  with p as (
    select coalesce(pay.method, 'other') as metodo,
           coalesce(pay.amount, 0) as monto,
           coalesce(pay.change_amount, 0) as vuelto,
           coalesce(pay.source, '') as origen
      from public.payments pay
     where pay.organization_id = s.organization_id
       and pay.status = 'completed'
       and pay.created_at >= s.opened_at
       and pay.created_at <= v_hasta
       and (s.branch_id is null or pay.branch_id = s.branch_id)
       and (not v_por_cajero or pay.created_by = s.opened_by)
  )
  select
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(vuelto) filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen = 'account_receivable'), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen in ('invoice_purchase', 'account_payable')), 0),
    coalesce(
      (select jsonb_object_agg(x.metodo, x.total)
         from (select metodo, sum(monto) as total from p
                where metodo <> 'cash' and origen not in ('invoice_purchase', 'account_payable')
                group by metodo) x),
      '{}'::jsonb)
    into v_ventas_ef, v_vuelto, v_abonos_ef, v_compras_ef, v_por_metodo
    from p;

  select coalesce(sum(r.total_refund), 0) into v_devoluciones
    from public.returns r
   where r.organization_id = s.organization_id
     and r.status = 'processed'
     and r.refund_method is null
     and r.created_at >= s.opened_at
     and r.created_at <= v_hasta
     and (s.branch_id is null or r.branch_id = s.branch_id)
     and (not v_por_cajero or r.user_id = s.opened_by);

  select coalesce(sum(m.amount) filter (where m.type = 'in'), 0),
         coalesce(sum(m.amount) filter (where m.type = 'out'), 0)
    into v_entradas, v_salidas
    from public.cash_movements m
   where m.cash_session_id = s.id;

  v_efectivo := coalesce(s.initial_amount, 0)
              + (v_ventas_ef - v_vuelto)
              + v_abonos_ef
              + v_entradas - v_salidas
              - v_compras_ef
              - v_devoluciones;

  return jsonb_build_object(
    'session_id', s.id,
    'organization_id', s.organization_id,
    'status', s.status,
    'efectivo_esperado', round(v_efectivo, 2),
    'por_metodo', v_por_metodo || jsonb_build_object('cash', round(v_efectivo, 2)),
    'detalle', jsonb_build_object(
      'inicial', coalesce(s.initial_amount, 0),
      'ventas_efectivo', v_ventas_ef - v_vuelto,
      'vuelto', v_vuelto,
      'abonos_efectivo', v_abonos_ef,
      'entradas', v_entradas,
      'salidas', v_salidas,
      'compras_efectivo', v_compras_ef,
      'devoluciones', v_devoluciones
    ),
    'por_cajero', v_por_cajero,
    'hasta', v_hasta
  );
end;
$function$;

drop function if exists public.fn_anticipo_cruces_consignacion(integer, integer);

-- 4. Clave de configuración: se borra la fila «anticipos_proveedores» (NO se restaura) y vuelve la lista de 32.
delete from public.configuracion_contable where clave = 'anticipos_proveedores';
alter table public.configuracion_contable drop constraint if exists configuracion_contable_clave_chk;
alter table public.configuracion_contable add constraint configuracion_contable_clave_chk check (clave = any (array[
  'caja', 'bancos', 'clientes', 'proveedores', 'ventas_productos', 'ventas_servicios', 'devoluciones', 'descuentos',
  'costo_ventas', 'inventario', 'iva_generado', 'iva_descontable', 'retefuente', 'reteiva', 'reteica', 'propinas',
  'comisiones', 'anticipos', 'nomina', 'nomina_por_pagar', 'nomina_aportes', 'faltante_inventario',
  'gastos_extraordinarios', 'consumo_interno', 'manifiesto_por_pagar', 'manifiesto_transporte', 'saldo_inicial',
  'impuesto_consumo', 'redondeo', 'compra_servicio', 'ingresos_diversos', 'redondeo_en_contra']::text[]));

-- 5. Tablas y columnas nuevas
drop table if exists public.anticipo_pendientes;
drop table if exists public.supplier_advance_invoice_links;
drop table if exists public.supplier_advance_withholding_ajustes;
drop table if exists public.supplier_advance_refunds;
drop table if exists public.supplier_advance_withholdings;
drop table if exists public.supplier_tax_qualities;
drop table if exists public.reteica_reglas;
drop table if exists public.reteiva_aiu_reglas;
drop table if exists public.anticipos_cuenta_equivalencias;

alter table public.supplier_advance_applications
  drop column if exists asiento_id,
  drop column if exists asiento_causacion,
  drop column if exists cuenta_por_pagar,
  drop column if exists correccion_soporte,
  drop column if exists correccion_motivo,
  drop column if exists retencion_detalle,
  drop column if exists retencion_descontada,
  drop column if exists consumo_anticipo;

alter table public.supplier_advances drop constraint if exists supplier_advances_retencion_check;
alter table public.supplier_advances drop constraint if exists supplier_advances_anulacion_tipo_check;
alter table public.supplier_advances drop constraint if exists supplier_advances_naturaleza_check;
alter table public.supplier_advances
  drop column if exists anulacion_caja_cerrada,
  drop column if exists componentes,
  drop column if exists anulacion_fecha,
  drop column if exists anulacion_soporte,
  drop column if exists anulacion_tipo,
  drop column if exists retenciones_evaluacion,
  drop column if exists retencion_pendiente,
  drop column if exists monto_girado,
  drop column if exists retencion_total,
  drop column if exists base_retencion,
  drop column if exists tarifa_iva,
  drop column if exists naturaleza;

comment on column public.supplier_advances.amount is null;
comment on column public.supplier_advance_applications.amount is null;

-- 5b. Tercero de las líneas: versión de 20261108120000 (sin reintegro de retención ni cruce con consignación).
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

-- 6. Permisos como los dejó 20261108120000.
revoke all on function public.fn_cuenta_anticipo_proveedor(integer, integer) from public, anon;
grant execute on function public.fn_cuenta_anticipo_proveedor(integer, integer) to authenticated;
revoke all on function public.fn_anticipo_proveedor_crear(integer, integer, numeric, text, text, integer, integer, text, text) from public, anon;
revoke all on function public.fn_anticipo_proveedor_aplicar(uuid, uuid, numeric, text, integer) from public, anon;
revoke all on function public.fn_anticipo_proveedor_devolver(uuid, numeric, text, text, text, integer, integer, text) from public, anon;
revoke all on function public.fn_anticipo_proveedor_anular(uuid, text, integer) from public, anon;
grant execute on function public.fn_anticipo_proveedor_crear(integer, integer, numeric, text, text, integer, integer, text, text) to authenticated;
grant execute on function public.fn_anticipo_proveedor_aplicar(uuid, uuid, numeric, text, integer) to authenticated;
grant execute on function public.fn_anticipo_proveedor_devolver(uuid, numeric, text, text, text, integer, integer, text) to authenticated;
grant execute on function public.fn_anticipo_proveedor_anular(uuid, text, integer) to authenticated;
