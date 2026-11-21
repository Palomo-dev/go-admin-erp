-- Propinas como dinero de los trabajadores (decisión del Contador, 2026-11-20).
--
-- La propina no es ingreso ni gasto del negocio y no es salario (art. 131 del
-- Código Sustantivo del Trabajo, modificado por la Ley 1935 de 2018). Se lleva
-- al auxiliar 28150501 «Propinas recibidas para trabajadores» (281505).
--
-- Antes:
--   · la venta POS devengaba su total —con la propina— como ingreso (41xx);
--   · cada propina asentaba Débito 5105 / Crédito 1105, al revés de la plata
--     que entraba;
--   · la liquidación en efectivo no tenía asiento y la de transferencia pasaba
--     de caja a bancos.
--
-- Ahora:
--   1. El devengo de la venta POS toma solo la venta (total − propina). La
--      factura ya la excluía (su total es la suma de las líneas).
--   2. Al cobrar, el cobro (fn_auto_journal_payment) sigue debitando el medio
--      por el que entró la plata —caja, banco o datáfono— por el total cobrado
--      contra la cuenta del cliente (1305). El asiento de la propina pasa su
--      parte de la cuenta del cliente al pasivo: Débito 1305 / Crédito 28150501.
--      Neto del cobro: Débito medio (venta + propina) / Crédito ingresos e
--      impuestos (venta) y Crédito 28150501 (propina). Tercero: el cliente.
--      Una propina sin venta debita directamente su medio.
--   3. Liquidar en efectivo: Débito 28150501 / Crédito caja, con su movimiento
--      de caja. Por transferencia: Débito 28150501 / Crédito bancos. Un asiento
--      por trabajador; su documento es el tercero (si no lo tiene, el negocio).
--   4. Anular la liquidación reversa esos asientos con las mismas cuentas: el
--      saldo vuelve a quedar por pagar en 28150501.
--
-- No toca datos históricos: a la fecha no hay ninguna propina, ningún asiento
-- de propina ni ninguna venta con propina en la base (verificado con el MCP).

-- ── 1. Cuentas: plantilla y las 45 organizaciones ──────────────────────────
insert into public.puc_plantilla (codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento,
                                  requiere_tercero, requiere_centro_costo, centro_costo_modo, presentacion_niif)
values
  ('281505', 'Valores recibidos para terceros', 'liability', '2815', null, 'credito', false,
   true, false, 'no_aplica', 'corriente'),
  ('28150501', 'Propinas recibidas para trabajadores', 'liability', '281505',
   'Propinas cobradas a los clientes y todavía no pagadas a los trabajadores (art. 131 CST, Ley 1935 de 2018). No es ingreso, gasto ni salario.',
   'credito', true, true, false, 'no_aplica', 'corriente')
on conflict (codigo) do nothing;

-- En un plan nuevo 2815 es título: sus auxiliares reciben los asientos.
update public.puc_plantilla set es_movimiento = false where codigo = '2815' and es_movimiento;

-- Planes existentes: 2815 sigue como está (sin movimientos en ninguna
-- organización); fn_puc_asegurar_cuenta crea 281505 y 28150501 debajo.
do $$
declare
  v_orgs integer[];
  v_org integer;
  v_n integer := 0;
begin
  -- El arreglo se arma antes: fn_puc_asegurar_cuenta hace ALTER TABLE y no
  -- puede correr con un cursor abierto sobre chart_of_accounts.
  select array_agg(distinct organization_id order by organization_id) into v_orgs from public.chart_of_accounts;
  foreach v_org in array v_orgs loop
    if public.fn_puc_asegurar_cuenta(v_org, '28150501', 'Propinas recibidas para trabajadores', true) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'Cuenta 28150501 asegurada en % organizaciones', v_n;
end $$;

update public.chart_of_accounts c
   set requiere_tercero = true,
       description = coalesce(c.description,
         'Propinas cobradas a los clientes y todavía no pagadas a los trabajadores (art. 131 CST, Ley 1935 de 2018). No es ingreso, gasto ni salario.')
 where c.account_code in ('281505', '28150501') and not c.requiere_tercero;

-- ── 2. Regla de la propina: sin 5105 ───────────────────────────────────────
update public.accounting_rules
   set debit_account_code = '1305',
       credit_account_code = '28150501',
       description = 'Propina recibida para trabajadores (Ley 1935 de 2018): Débito cuenta del cliente, que salda el cobro / Crédito 28150501'
 where source_type = 'tip'
   and debit_account_code = '5105' and credit_account_code = '1105';

-- Organizaciones nuevas: la misma regla desde el principio.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_create_default_accounting_rules'::regproc);
  v_viejo text := $q$(org_id, 'Propina', 'Registro de propina', 'tip', 'created', '5105', '1105', null, false, 30, true)$q$;
  v_nuevo text := $q$(org_id, 'Propina', 'Propina recibida para trabajadores (Ley 1935 de 2018)', 'tip', 'created', '1305', '28150501', null, false, 30, true)$q$;
begin
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'fn_create_default_accounting_rules no tiene la regla vieja de propina';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

-- ── 3. Asiento de cada propina ─────────────────────────────────────────────
create or replace function public.fn_auto_journal_tip()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rule record;
  v_branch integer;
  v_debito text;
  v_credito text;
begin
  if coalesce(new.amount, 0) <= 0 then
    return new;
  end if;

  v_branch := new.branch_id;
  if v_branch is null then
    select min(id) into v_branch from public.branches where organization_id = new.organization_id;
  end if;

  select * into v_rule
    from public.accounting_rules
   where organization_id = new.organization_id
     and source_type = 'tip'
     and is_active = true
   order by priority
   limit 1;

  if v_rule is null then
    perform public.fn_log_journal_failure(new.organization_id, v_branch, coalesce(new.created_at, now()),
      'tips', new.id::text, 'tip:' || new.id::text, null, null, new.amount,
      'no_rule', 'Sin regla contable activa de propina');
    return new;
  end if;

  -- Crédito: el pasivo con los trabajadores (28150501), nunca ingreso ni gasto.
  v_credito := v_rule.credit_account_code;
  if left(coalesce(v_credito, ''), 1) in ('4', '5', '6', '7') then
    perform public.fn_log_journal_failure(new.organization_id, v_branch, coalesce(new.created_at, now()),
      'tips', new.id::text, 'tip:' || new.id::text, v_rule.debit_account_code, v_credito, new.amount,
      'no_rule', 'La regla de propina acredita ' || v_credito || '; la propina es de los trabajadores y va a 28150501');
    return new;
  end if;

  if new.sale_id is not null then
    -- El cobro de la venta debita el medio por el total cobrado (venta más
    -- propina) contra la cuenta del cliente. Aquí la parte de la propina pasa
    -- de la cuenta del cliente al pasivo: la del cliente queda en cero.
    select r.credit_account_code into v_debito
      from public.accounting_rules r
     where r.organization_id = new.organization_id
       and r.source_type = 'sale_payment'
       and r.is_active = true
     order by r.priority
     limit 1;
    v_debito := coalesce(v_debito, v_rule.debit_account_code);
  else
    -- Propina sin venta: el débito es el medio por el que entró.
    v_debito := public.fn_money_account_code_pago(new.organization_id, v_branch,
                  case when new.tip_type = 'cash' then 'cash' else 'card' end, null);
    if v_debito is null and new.tip_type = 'cash' then
      v_debito := public.fn_cuenta_caja_existente(new.organization_id, v_branch, null);
    end if;
  end if;

  if v_debito is null or v_credito is null then
    perform public.fn_log_journal_failure(new.organization_id, v_branch, coalesce(new.created_at, now()),
      'tips', new.id::text, 'tip:' || new.id::text, v_debito, v_credito, new.amount,
      'sin_cuenta', 'Propina sin cuenta de débito o sin 28150501');
    return new;
  end if;

  perform public.fn_create_journal_entry(
    p_organization_id := new.organization_id,
    p_branch_id := v_branch,
    p_entry_date := coalesce(new.created_at, now()),
    p_memo := 'Propina recibida para trabajadores'
              || case when new.sale_id is not null then ' · venta #' || right(new.sale_id::text, 8) else '' end,
    p_source := 'tips',
    p_source_id := new.id::text,
    p_debit_account := v_debito,
    p_credit_account := v_credito,
    p_amount := new.amount,
    p_fact_key := 'tip:' || new.id::text
  );

  return new;
end;
$function$;

-- ── 4. Devengo de la venta POS: sin la propina ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_journal_sale_pos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_inc numeric := 0;
    v_inc_cta text;
    v_entry_id integer;
    v_fact_key text;
    v_branch integer;
    v_debito text;
    v_credito text;
    v_fallo text;
    v_venta numeric;
BEGIN
    IF NEW.status NOT IN ('paid', 'partial', 'confirmed', 'completed') THEN
        RETURN NEW;
    END IF;

    v_fact_key := 'accrual:sale:' || NEW.id::text;

    -- Propinas (Contador, 2026-11-20): sales.total incluye la propina, que no es
    -- ingreso ni parte de la base del impuesto. Se devenga solo la venta; la
    -- propina va a 28150501 con su propio asiento (fn_auto_journal_tip).
    v_venta := coalesce(NEW.total, 0) - coalesce(NEW.tip_amount, 0);

    SELECT * INTO v_rule FROM fn_regla_devengo_venta(NEW.organization_id);

    IF v_rule.debit_account_code IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id,
            COALESCE(NEW.sale_date, NEW.created_at, now()),
            'sales', NEW.id::text, v_fact_key, NULL, NULL, v_venta,
            'no_rule', 'Sin regla contable activa de venta con cuenta de ingreso');
        RETURN NEW;
    END IF;

    -- FIX (A) 25-oct-2026: INC por LÍNEA (sale_items.tax_rate 8%). Todo INC -> cuenta INC (2495); mixto
    -- INC+IVA no cabe en un asiento de una sola cuenta de impuesto -> fallo 'impuesto_mixto_inc_iva' (revisar).
    IF v_rule.use_tax_from_document AND coalesce(NEW.tax_total, 0) <> 0 THEN
      v_inc := public.fn_impuesto_inc_parte('sales', NEW.id::text, NEW.tax_total);
      v_inc_cta := public.fn_cuenta_inc(NEW.organization_id);
      IF v_inc > 0 AND v_inc_cta IS NOT NULL THEN
        IF v_inc >= abs(NEW.tax_total) THEN
          v_rule.tax_account_code := v_inc_cta;
        ELSE
          PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id,
            COALESCE(NEW.sale_date, NEW.created_at, now()),
            'sales', NEW.id::text, v_fact_key, v_rule.debit_account_code, v_rule.credit_account_code, v_venta,
            'impuesto_mixto_inc_iva', 'La venta tiene líneas con INC y con IVA: revisar y contabilizar por líneas');
          RETURN NEW;
        END IF;
      END IF;
    END IF;

    -- configuracion_antes_de_sede: la misma sede que usará el asiento.
    v_branch := NEW.branch_id;
    IF v_branch IS NULL OR v_branch = 0 OR NOT EXISTS (
      SELECT 1 FROM branches WHERE id = v_branch AND organization_id = NEW.organization_id
    ) THEN
      SELECT id INTO v_branch FROM branches
      WHERE organization_id = NEW.organization_id AND is_main = true AND is_active = true
      LIMIT 1;
      IF v_branch IS NULL THEN
        SELECT min(id) INTO v_branch FROM branches WHERE organization_id = NEW.organization_id;
      END IF;
    END IF;

    SELECT r.cuenta, r.fallo INTO v_debito, v_fallo
    FROM public.fn_cuenta_configurada_de_sede(
      NEW.organization_id, v_branch, 'sales', 'debito', v_rule.debit_account_code
    ) r;
    IF v_fallo IS NOT NULL THEN
      PERFORM fn_log_journal_failure(
        NEW.organization_id, v_branch, COALESCE(NEW.sale_date, NEW.created_at, now()),
        'sales', NEW.id::text, v_fact_key, v_debito, v_rule.credit_account_code, v_venta,
        'cuenta_no_configurada', v_fallo);
      RETURN NEW;
    END IF;

    SELECT r.cuenta, r.fallo INTO v_credito, v_fallo
    FROM public.fn_cuenta_configurada_de_sede(
      NEW.organization_id, v_branch, 'sales', 'credito', v_rule.credit_account_code
    ) r;
    IF v_fallo IS NOT NULL THEN
      PERFORM fn_log_journal_failure(
        NEW.organization_id, v_branch, COALESCE(NEW.sale_date, NEW.created_at, now()),
        'sales', NEW.id::text, v_fact_key, v_debito, v_credito, v_venta,
        'cuenta_no_configurada', v_fallo);
      RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := COALESCE(v_branch, 0),
        p_entry_date := COALESCE(NEW.sale_date, NEW.created_at, now()),
        p_memo := 'Venta POS ' || NEW.id::text,
        p_source := 'sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,
        p_amount := v_venta,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_tax_is_credit := true,
        p_fact_key := v_fact_key
    );

    RETURN NEW;
END;
$function$;

-- ── 5. Tercero de los asientos de propina ──────────────────────────────────
-- Cobro: el cliente de la venta. Liquidación: el trabajador de cada asiento
-- (su documento en Gestión humana); sin documento, el negocio.
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
  v_fact text;
  v_nit text;
  v_nombre text;
  v_persona uuid;
  v_sale uuid;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id, e.fact_key
    into v_source, v_source_id, v_org, v_fact
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  -- sales: el devengo del POS. La factura, si llega después, reutiliza la misma clave.
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents', 'sales',
                                          'supplier_advance', 'supplier_advance_application', 'supplier_advance_refund',
                                          'tips', 'tip_settlements') then
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
  elsif v_source = 'tips' then
    select tp.sale_id into v_sale from public.tips tp
     where tp.id::text = v_source_id and tp.organization_id = v_org;
    if v_sale is not null then
      select t.nit, t.nombre into v_nit, v_nombre
        from public.fn_tercero_de_documento('venta', v_sale) t;
    end if;
  elsif v_source = 'tip_settlements' then
    -- fact_key 'tip_settlement:<liquidación>:<persona>'
    begin
      v_persona := split_part(coalesce(v_fact, ''), ':', 3)::uuid;
    exception when others then
      v_persona := null;
    end;
    if v_persona is not null then
      select nullif(btrim(i.doc_number), ''), public.fn_hr_nombre_persona(hp.id)
        into v_nit, v_nombre
        from public.hr_people hp
        left join public.hr_people_identification i on i.person_id = hp.id
       where hp.organization_id = v_org and hp.user_id = v_persona
       order by (i.doc_number is null), hp.created_at
       limit 1;
      if v_nombre is null then
        select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into v_nombre
          from public.profiles p where p.id = v_persona;
      end if;
    end if;
    if v_nit is null then
      select nullif(btrim(coalesce(o.nit, o.tax_id)), ''),
             coalesce(nullif(btrim(o.legal_name), ''), o.name)
               || case when v_nombre is not null then ' · propinas de ' || v_nombre else '' end
        into v_nit, v_nombre
        from public.organizations o where o.id = v_org;
    end if;
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

-- ── 6. Movimiento de caja de la liquidación: el asiento lo hace la liquidación ─
create or replace function public.fn_asiento_movimiento_caja(p_organization_id integer, p_tipo text, p_concept_code text)
 returns table(accion text, debito text, credito text)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text := case when p_tipo in ('in', 'deposit', 'income') then 'in' else 'out' end;
  v_clave text := coalesce(p_concept_code, '');
  v_caja text;
  v_contra text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  -- liquidacionPropinas: el egreso (y su reingreso al anular) es la salida
  -- física del dinero. El asiento lo hace fn_propinas_liquidacion_crear, uno
  -- por trabajador (Débito 28150501 / Crédito caja), con su tercero.
  if v_clave in ('cambioEfectivo', 'consignacionBanco', 'liquidacionPropinas') then
    accion := 'omitir';
    debito := null;
    credito := null;
    return next;
    return;
  end if;

  v_caja := public.fn_cuenta_caja_existente(p_organization_id, null, null);

  if v_tipo = 'out' then
    v_contra := case v_clave
      when 'pagoProveedor' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['22050501', '2205', '2105']))
      when 'prestamoEmpleado' then public.fn_primera_cuenta_detalle(p_organization_id, array['1365'])
      when 'retiroConsignacion' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
      when 'retiroEfectivo' then coalesce(
        public.fn_cuenta_por_clave(p_organization_id, null, 'bancos'),
        public.fn_primera_cuenta_detalle(p_organization_id, array['1110']))
      else public.fn_primera_cuenta_detalle(p_organization_id, array['5195', '5135', '5305', '5105'])
    end;
    if v_contra is not null and left(v_contra, 1) = '4' then
      v_contra := null;
    end if;
    if v_caja is null or v_contra is null then
      accion := 'sin_cuenta';
      debito := v_contra;
      credito := v_caja;
      return next;
      return;
    end if;
    accion := 'asiento';
    debito := v_contra;
    credito := v_caja;
    return next;
    return;
  end if;

  v_contra := case v_clave
    when 'ventaContadoEspecial' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'ventas_productos'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['4135', '414015', '4145', '4235', '4105']))
    when 'fondoAdicional' then public.fn_primera_cuenta_detalle(p_organization_id, array['3105', '3115', '3605'])
    when 'prestamoInterno' then public.fn_primera_cuenta_detalle(p_organization_id, array['2380', '2305', '2195'])
    when 'devolucionRecibida' then coalesce(
      public.fn_cuenta_por_clave(p_organization_id, null, 'proveedores'),
      public.fn_primera_cuenta_detalle(p_organization_id, array['22050501', '2205', '2105']))
    else public.fn_primera_cuenta_detalle(p_organization_id, array[public.fn_cuenta_ingresos_diversos(p_organization_id, null)])
  end;
  if v_clave is distinct from 'ventaContadoEspecial' and v_contra is not null and left(v_contra, 4) = '4105' then
    v_contra := null;
  end if;
  if v_caja is null or v_contra is null then
    accion := 'sin_cuenta';
    debito := v_caja;
    credito := v_contra;
    return next;
    return;
  end if;
  accion := 'asiento';
  debito := v_caja;
  credito := v_contra;
  return next;
end;
$function$;

-- ── 7. Liquidar: un asiento por trabajador desde 28150501 ──────────────────
create or replace function public.fn_propinas_liquidacion_crear(p_organization_id integer, p_branch_id integer, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_solicitud uuid;
  v_ids uuid[];
  v_reparto text := coalesce(p_datos->>'reparto', 'atendio');
  v_medio text := p_datos->>'medio';
  v_motivo_ajuste text := left(nullif(btrim(coalesce(p_datos->>'motivo_ajuste', '')), ''), 500);
  v_motivo text := left(nullif(btrim(coalesce(p_datos->>'motivo', '')), ''), 500);
  v_existente public.tip_settlements%rowtype;
  v_n_encontradas integer;
  v_n_validas integer;
  v_abiertas integer;
  v_total numeric(14, 2);
  v_efectivo numeric(14, 2);
  v_banco numeric(14, 2);
  v_lineas jsonb := '[]'::jsonb;
  v_linea jsonb;
  v_suma_pct numeric;
  v_suma_ajustes numeric(14, 2);
  v_suma_calc numeric(14, 2);
  v_hay_ajuste boolean;
  v_numero integer;
  v_id uuid := gen_random_uuid();
  v_codigo text;
  v_sesion integer;
  v_mov jsonb;
  v_mov_id integer;
  v_caja text;
  v_bancos text;
  v_rec record;
  v_pasivo text;
  v_contra text;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'pos.propinas.liquidar') then
    raise exception 'SIN_PERMISO: liquidar propinas requiere el permiso pos.propinas.liquidar' using errcode = '42501';
  end if;
  if p_branch_id is null or not exists (select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'SIN_SUCURSAL: la liquidación es de una sucursal' using errcode = '22023';
  end if;
  if not public.app_branch_access(p_branch_id) then
    raise exception 'SIN_PERMISO: sin acceso a la sucursal' using errcode = '42501';
  end if;

  begin
    v_solicitud := (p_datos->>'solicitud')::uuid;
  exception when others then
    v_solicitud := null;
  end;
  if v_solicitud is null then
    raise exception 'SOLICITUD_REQUERIDA' using errcode = '22023';
  end if;

  -- Reintento de la misma solicitud: devuelve la liquidación ya creada.
  select * into v_existente from public.tip_settlements
   where organization_id = p_organization_id and request_id = v_solicitud;
  if found then
    return jsonb_build_object('id', v_existente.id, 'codigo', v_existente.code, 'total', v_existente.total,
                              'ya_registrada', true);
  end if;

  select coalesce(array_agg(distinct x::uuid), array[]::uuid[]) into v_ids
    from jsonb_array_elements_text(coalesce(p_datos->'propinas', '[]'::jsonb)) x;
  if cardinality(v_ids) = 0 then
    raise exception 'SIN_PROPINAS: elija al menos una propina' using errcode = '22023';
  end if;

  if v_reparto not in ('atendio', 'porcentaje') then
    raise exception 'REPARTO_INVALIDO: reparto %', v_reparto using errcode = '22023';
  end if;
  if v_medio is null or v_medio not in ('efectivo', 'transferencia', 'sin_pago') then
    raise exception 'MEDIO_INVALIDO: medio %', coalesce(v_medio, '(vacío)') using errcode = '22023';
  end if;

  -- Bloquea las propinas (orden estable para no cruzarse con otra liquidación).
  perform 1 from public.tips t
   where t.organization_id = p_organization_id and t.id = any (v_ids)
   order by t.id
   for update;

  select count(*),
         count(*) filter (where t.branch_id = p_branch_id and t.voided_at is null and not coalesce(t.is_distributed, false)),
         count(*) filter (where s.id is not null and coalesce(s.status, '') not in ('void', 'cancelled')
                                and coalesce(nullif(s.payment_status, ''), s.status, '') <> 'paid'),
         coalesce(sum(t.amount), 0),
         coalesce(sum(t.amount) filter (where t.tip_type = 'cash'), 0),
         coalesce(sum(t.amount) filter (where t.tip_type <> 'cash'), 0)
    into v_n_encontradas, v_n_validas, v_abiertas, v_total, v_efectivo, v_banco
    from public.tips t
    left join public.sales s on s.id = t.sale_id
   where t.organization_id = p_organization_id and t.id = any (v_ids);

  if v_n_encontradas <> cardinality(v_ids) or v_n_validas <> cardinality(v_ids) then
    raise exception 'PROPINAS_NO_DISPONIBLES: % de % propinas ya no están por liquidar en esta sucursal',
      cardinality(v_ids) - v_n_validas, cardinality(v_ids) using errcode = '22023';
  end if;
  if v_abiertas > 0 then
    raise exception 'VENTA_ABIERTA: % propinas son de ventas sin cobrar', v_abiertas using errcode = '22023';
  end if;
  if v_total <= 0 then
    raise exception 'SIN_PROPINAS: el total a liquidar es cero' using errcode = '22023';
  end if;

  -- ── Reparto: calculado por persona ──
  if v_reparto = 'atendio' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'persona', q.server_id, 'base', q.base,
             'pct', round(q.base * 100 / v_total, 4), 'calculado', q.base) order by q.base desc, q.server_id), '[]'::jsonb)
      into v_lineas
      from (select t.server_id, sum(t.amount)::numeric(14, 2) as base
              from public.tips t where t.organization_id = p_organization_id and t.id = any (v_ids)
             group by t.server_id) q;
  else
    if jsonb_typeof(p_datos->'participaciones') is distinct from 'array'
       or jsonb_array_length(p_datos->'participaciones') = 0 then
      raise exception 'PORCENTAJES_INVALIDOS: faltan las participaciones' using errcode = '22023';
    end if;
    select sum((x->>'pct')::numeric) into v_suma_pct from jsonb_array_elements(p_datos->'participaciones') x;
    if v_suma_pct is null or abs(v_suma_pct - 100) > 0.01
       or exists (select 1 from jsonb_array_elements(p_datos->'participaciones') x where (x->>'pct')::numeric < 0)
       or (select count(distinct x->>'persona') from jsonb_array_elements(p_datos->'participaciones') x)
          <> jsonb_array_length(p_datos->'participaciones') then
      raise exception 'PORCENTAJES_INVALIDOS: las participaciones deben sumar 100 %%' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_datos->'participaciones') x
                where not exists (select 1 from public.organization_members om
                                   where om.organization_id = p_organization_id and om.is_active
                                     and om.user_id = (x->>'persona')::uuid)) then
      raise exception 'PERSONA_INVALIDA: una persona del reparto no es miembro activo' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'persona', (x->>'persona')::uuid,
             'base', coalesce((select sum(t.amount) from public.tips t
                                where t.organization_id = p_organization_id and t.id = any (v_ids)
                                  and t.server_id = (x->>'persona')::uuid), 0),
             'pct', round((x->>'pct')::numeric, 4),
             'calculado', round(v_total * (x->>'pct')::numeric / 100, 2))
             order by (x->>'pct')::numeric desc, x->>'persona'), '[]'::jsonb)
      into v_lineas
      from jsonb_array_elements(p_datos->'participaciones') x;
    -- El redondeo va a la primera línea (la de mayor participación).
    select coalesce(sum((l->>'calculado')::numeric), 0) into v_suma_calc from jsonb_array_elements(v_lineas) l;
    if v_suma_calc <> v_total then
      v_lineas := jsonb_set(v_lineas, '{0,calculado}',
                            to_jsonb(((v_lineas->0->>'calculado')::numeric + (v_total - v_suma_calc))::numeric(14, 2)));
    end if;
  end if;

  -- ── Ajustes: suman cero y llevan motivo ──
  if jsonb_typeof(p_datos->'ajustes') = 'array' then
    if exists (select 1 from jsonb_array_elements(p_datos->'ajustes') a
                where coalesce((a->>'monto')::numeric, 0) <> 0
                  and not exists (select 1 from jsonb_array_elements(v_lineas) l where l->>'persona' = a->>'persona')) then
      raise exception 'PERSONA_INVALIDA: un ajuste es de alguien fuera del reparto' using errcode = '22023';
    end if;
    select coalesce(sum(round((a->>'monto')::numeric, 2)), 0), bool_or(coalesce((a->>'monto')::numeric, 0) <> 0)
      into v_suma_ajustes, v_hay_ajuste
      from jsonb_array_elements(p_datos->'ajustes') a;
  else
    v_suma_ajustes := 0;
    v_hay_ajuste := false;
  end if;
  if v_suma_ajustes <> 0 then
    raise exception 'AJUSTES_NO_SUMAN_CERO: los ajustes suman %', v_suma_ajustes using errcode = '22023';
  end if;
  if coalesce(v_hay_ajuste, false) and (v_motivo_ajuste is null or length(v_motivo_ajuste) < 3) then
    raise exception 'MOTIVO_AJUSTE_REQUERIDO: un valor ajustado a mano exige motivo' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(l || jsonb_build_object(
           'ajuste', coalesce((select sum(round((a->>'monto')::numeric, 2)) from jsonb_array_elements(coalesce(p_datos->'ajustes', '[]'::jsonb)) a
                                where a->>'persona' = l->>'persona'), 0))), '[]'::jsonb)
    into v_lineas
    from jsonb_array_elements(v_lineas) l;

  if exists (select 1 from jsonb_array_elements(v_lineas) l
              where (l->>'calculado')::numeric + (l->>'ajuste')::numeric < 0) then
    raise exception 'AJUSTE_NEGATIVO: nadie puede quedar con un valor negativo' using errcode = '22023';
  end if;

  -- ── Medio de pago ──
  if v_medio = 'transferencia' then
    if exists (select 1 from jsonb_array_elements(v_lineas) l
                where (l->>'calculado')::numeric + (l->>'ajuste')::numeric > 0
                  and coalesce(btrim((select r->>'referencia' from jsonb_array_elements(coalesce(p_datos->'referencias', '[]'::jsonb)) r
                                       where r->>'persona' = l->>'persona' limit 1)), '') = '') then
      raise exception 'REFERENCIA_REQUERIDA: cada transferencia lleva su referencia' using errcode = '22023';
    end if;
  elsif v_medio = 'sin_pago' then
    if v_motivo is null or length(v_motivo) < 3 then
      raise exception 'MOTIVO_REQUERIDO: marcar liquidada sin pago exige un motivo' using errcode = '22023';
    end if;
  elsif v_medio = 'efectivo' then
    v_sesion := public.fn_caja_abierta_para(p_organization_id, p_branch_id, v_uid);
    if v_sesion is null then
      raise exception 'CAJA_CERRADA: abra la caja para pagar en efectivo' using errcode = '55000';
    end if;
  end if;

  if v_medio in ('efectivo', 'transferencia')
     and not public.fn_is_period_open(p_organization_id, public.fn_today_for(p_organization_id, p_branch_id)) then
    raise exception 'PERIODO_CERRADO: el periodo contable de hoy está cerrado' using errcode = '22023';
  end if;

  -- ── Número ──
  perform pg_advisory_xact_lock(hashtext('tip_settlements'), p_organization_id);
  select coalesce(max(number), 0) + 1 into v_numero from public.tip_settlements where organization_id = p_organization_id;
  v_codigo := 'LIQ-' || lpad(v_numero::text, 6, '0');

  insert into public.tip_settlements (
    id, organization_id, branch_id, number, period_from, period_to, distribution_method, payment_method,
    total, cash_tips, bank_tips, tips_count, tip_ids, adjustment_reason, notes, cash_session_id, request_id, created_by
  ) values (
    v_id, p_organization_id, p_branch_id, v_numero,
    nullif(p_datos->>'desde', '')::date, nullif(p_datos->>'hasta', '')::date,
    v_reparto, v_medio, v_total, v_efectivo, v_banco, cardinality(v_ids), v_ids,
    case when v_hay_ajuste then v_motivo_ajuste end, v_motivo, v_sesion, v_solicitud, v_uid
  );

  insert into public.tip_settlement_lines (settlement_id, organization_id, person_id, base, share_pct, calculated, adjustment, amount, transfer_reference)
  select v_id, p_organization_id, (l->>'persona')::uuid, (l->>'base')::numeric, (l->>'pct')::numeric,
         (l->>'calculado')::numeric, (l->>'ajuste')::numeric,
         (l->>'calculado')::numeric + (l->>'ajuste')::numeric,
         case when v_medio = 'transferencia' then
           nullif(btrim((select r->>'referencia' from jsonb_array_elements(coalesce(p_datos->'referencias', '[]'::jsonb)) r
                          where r->>'persona' = l->>'persona' limit 1)), '') end
    from jsonb_array_elements(v_lineas) l;

  perform set_config('app.propinas_rpc', 'on', true);
  update public.tips
     set is_distributed = true, distributed_at = now(), distribution_batch_id = v_id
   where organization_id = p_organization_id and id = any (v_ids);
  perform set_config('app.propinas_rpc', 'off', true);

  -- ── Pago ──
  -- Contador, 2026-11-20: la propina es de los trabajadores (art. 131 CST, Ley
  -- 1935 de 2018). Al cobrarla quedó en 28150501; al pagarla sale de ahí. Un
  -- asiento por trabajador: su documento es el tercero (fn_trg_tercero_linea_asiento
  -- lo lee de la clave 'tip_settlement:<liquidación>:<persona>').
  if v_medio = 'efectivo' then
    v_mov := public.pos_caja_registrar_movimiento(
      p_session_id := v_sesion,
      p_tipo := 'out',
      p_monto := v_total,
      p_concepto := 'Liquidación de propinas ' || v_codigo,
      p_concept_code := 'liquidacionPropinas',
      p_referencia := v_codigo,
      p_notas := null,
      p_uuid := v_solicitud);
    v_mov_id := (v_mov->>'id')::integer;
    update public.tip_settlements set cash_movement_id = v_mov_id where id = v_id;
    v_contra := coalesce(public.fn_money_account_code_pago(p_organization_id, p_branch_id, 'cash', null),
                         public.fn_cuenta_caja_existente(p_organization_id, p_branch_id, null));
  elsif v_medio = 'transferencia' then
    v_contra := coalesce(public.fn_cuenta_por_clave(p_organization_id, p_branch_id, 'bancos'),
                         public.fn_primera_cuenta_detalle(p_organization_id, array['1110']));
  end if;

  if v_medio in ('efectivo', 'transferencia') then
    v_pasivo := public.fn_primera_cuenta_detalle(p_organization_id, array['28150501']);
    if v_pasivo is null or v_contra is null then
      perform public.fn_log_journal_failure(p_organization_id, p_branch_id, now(), 'tip_settlements', v_id::text,
        'tip_settlement:' || v_id::text, v_pasivo, v_contra, v_total, 'sin_cuenta',
        'Liquidación de propinas sin la cuenta 28150501 o sin cuenta de '
          || case when v_medio = 'efectivo' then 'caja' else 'bancos' end);
    else
      for v_rec in
        select l.person_id, l.amount
          from public.tip_settlement_lines l
         where l.settlement_id = v_id and l.amount > 0
         order by l.amount desc, l.person_id
      loop
        perform public.fn_create_journal_entry(
          p_organization_id := p_organization_id,
          p_branch_id := p_branch_id,
          p_entry_date := now(),
          p_memo := 'Liquidación de propinas ' || v_codigo
                    || case when v_medio = 'efectivo' then ' en efectivo' else ' por transferencia' end,
          p_source := 'tip_settlements',
          p_source_id := v_id::text,
          p_debit_account := v_pasivo,
          p_credit_account := v_contra,
          p_amount := v_rec.amount,
          p_created_by := v_uid,
          p_fact_key := 'tip_settlement:' || v_id::text || ':' || v_rec.person_id::text);
      end loop;
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'total', v_total, 'ya_registrada', false,
                            'movimiento_caja', v_mov_id, 'sesion_caja', v_sesion);
end;
$function$;

revoke execute on function public.fn_auto_journal_tip() from public, anon;
revoke execute on function public.fn_auto_journal_sale_pos() from public, anon;
revoke execute on function public.fn_trg_tercero_linea_asiento() from public, anon;
