-- Comisión de oportunidad · una sola fuente, sin impuestos y con su método (2026-09-28).
--
-- Hallazgo (docs/hallazgos/comisiones-e-impuestos-2026-09-28.md, «vistos al
-- pasar»): crm/paymentService.ts, al quedar pagada una factura ligada a una
-- oportunidad, insertaba desde Node una comisión 'opportunity':
--   - sobre invoice_sales.total (CON impuestos), no sobre el subtotal;
--   - siempre por porcentaje (un monto fijo de 5.000 se habría devengado como
--     5.000 %);
--   - con commission_type = 'none' si la factura lo traía ('none' || 'salesperson');
--   - sin mirar la comisión de la propia factura: fn_factura_venta_guardar la
--     devenga al emitir ('invoice_sale') y fn_create_commission_on_invoice_sale
--     al cobrarse; con vendedor en la factura eran dos comisiones por la misma
--     venta.
-- commissionService.accrueCommission (cierre «ganada» del CRM) hacía lo mismo
-- desde el navegador (y con lectura + inserción sin bloqueo: dos clics podían
-- colarse).
--
-- Medido hoy: 0 comisiones 'opportunity' en toda la base y 0 con
-- metadata.auto_generated (las de paymentService): 0 duplicados. 2 facturas
-- ligadas a oportunidad, ninguna pagada. Nada que corregir hacia atrás.
--
-- Qué hace: fn_comision_oportunidad_devengar, la ÚNICA escritura de la comisión
-- de oportunidad fuera de los disparadores (la usan paymentService y el cierre
-- «ganada»). SECURITY DEFINER; fn_assert_acceso_org (miembro o service role;
-- anon fuera). Bloquea la oportunidad (FOR UPDATE): sin carreras.
--   - Si la oportunidad ya tiene comisión (en cualquier estado) → la devuelve
--     (already_accrued), como el disparador de «ganada».
--   - Una sola fuente: si una factura de la oportunidad (o su venta) ya tiene
--     comisión 'invoice_sale' / 'sale' en cualquier estado → no devenga
--     (reason 'factura_ya_devengo').
--   - Con p_invoice_id (pago de factura): la factura debe ser de la
--     organización y de la oportunidad y estar 'paid'; vendedor, tasa, método
--     y moneda de la factura; base = subtotal (sin impuestos); monto fijo =
--     commission_amount (o la tasa, como el disparador de la factura);
--     commission_type 'none' → no devenga.
--   - Sin p_invoice_id (cierre «ganada»): la oportunidad debe estar 'won';
--     base = amount; tasa = la de la oportunidad o fn_tasa_comision_vigente
--     (vendedor, luego general; día de la organización). Porcentaje.
--   - Importe <= 0 → no devenga (reason 'sin_tasa').

create or replace function public.fn_comision_oportunidad_devengar(
  p_org integer,
  p_opportunity_id uuid,
  p_invoice_id uuid default null,
  p_payment_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_opp public.opportunities%rowtype;
  v_inv public.invoice_sales%rowtype;
  v_c public.commissions%rowtype;
  v_vendedor uuid;
  v_tipo text;
  v_metodo text;
  v_tasa numeric;
  v_base numeric;
  v_monto numeric;
  v_moneda text;
  v_sucursal integer;
  v_nombre text;
begin
  perform public.fn_assert_acceso_org(p_org);

  select * into v_opp from public.opportunities
   where id = p_opportunity_id and organization_id = p_org
   for update;
  if not found then
    raise exception 'oportunidad_no_encontrada' using errcode = 'P0002';
  end if;

  -- Ya devengada para la oportunidad (cualquier estado: una cancelada es un
  -- rechazo o clawback de un gestor y no se vuelve a devengar sola).
  select * into v_c from public.commissions
   where organization_id = p_org and source_type = 'opportunity' and source_id = p_opportunity_id::text
   order by created_at limit 1;
  if found then
    return jsonb_build_object('created', false, 'already_accrued', true, 'reason', 'ya_devengada',
      'commission', jsonb_build_object('id', v_c.id, 'base_amount', v_c.base_amount, 'commission_rate', v_c.commission_rate,
                                       'commission_amount', v_c.commission_amount, 'status', v_c.status, 'source_type', v_c.source_type));
  end if;

  -- Una sola fuente: la comisión de la factura (o de su venta) es la de la venta.
  select c.* into v_c from public.commissions c
   where c.organization_id = p_org
     and exists (select 1 from public.invoice_sales i
                  where i.organization_id = p_org
                    and (i.opportunity_id = p_opportunity_id or i.id = p_invoice_id)
                    and ((c.source_type = 'invoice_sale' and c.source_id = i.id::text)
                      or (i.sale_id is not null and c.source_type = 'sale' and c.source_id = i.sale_id::text)))
   order by c.created_at limit 1;
  if found then
    return jsonb_build_object('created', false, 'already_accrued', true, 'reason', 'factura_ya_devengo',
      'commission', jsonb_build_object('id', v_c.id, 'base_amount', v_c.base_amount, 'commission_rate', v_c.commission_rate,
                                       'commission_amount', v_c.commission_amount, 'status', v_c.status, 'source_type', v_c.source_type));
  end if;

  if p_invoice_id is not null then
    select * into v_inv from public.invoice_sales
     where id = p_invoice_id and organization_id = p_org;
    if not found or v_inv.opportunity_id is distinct from p_opportunity_id then
      raise exception 'factura_no_encontrada' using errcode = 'P0002';
    end if;
    if v_inv.status is distinct from 'paid' then
      return jsonb_build_object('created', false, 'already_accrued', false, 'reason', 'factura_no_pagada');
    end if;
    v_tipo := coalesce(nullif(btrim(v_inv.commission_type), ''), 'salesperson');
    if v_tipo = 'none' or v_inv.salesperson_id is null then
      return jsonb_build_object('created', false, 'already_accrued', false, 'reason', 'sin_comision');
    end if;
    v_vendedor := v_inv.salesperson_id;
    v_metodo := coalesce(nullif(v_inv.commission_method, ''), 'percentage');
    v_tasa := coalesce(v_inv.commission_rate, 0);
    v_base := coalesce(v_inv.subtotal, v_inv.total, 0);
    v_monto := case
      when v_metodo = 'fixed_amount' then coalesce(nullif(v_inv.commission_amount, 0), v_tasa)
      else round(v_base * v_tasa / 100.0, 2)
    end;
    v_moneda := v_inv.currency;
    v_sucursal := v_inv.branch_id;
  else
    if v_opp.status is distinct from 'won' then
      raise exception 'oportunidad_no_ganada' using errcode = '22023';
    end if;
    if v_opp.salesperson_id is null then
      return jsonb_build_object('created', false, 'already_accrued', false, 'reason', 'sin_vendedor');
    end if;
    v_vendedor := v_opp.salesperson_id;
    v_tipo := 'salesperson';
    v_metodo := 'percentage';
    v_tasa := case when coalesce(v_opp.commission_rate, 0) > 0 then v_opp.commission_rate
                   else public.fn_tasa_comision_vigente(p_org, v_vendedor, true) end;
    v_base := coalesce(v_opp.amount, 0);
    v_monto := round(v_base * coalesce(v_tasa, 0) / 100.0, 2);
    v_moneda := v_opp.currency;
    select b.id into v_sucursal from public.branches b
     where b.id::bigint = v_opp.branch_id and b.organization_id = p_org;
  end if;

  if coalesce(v_monto, 0) <= 0 then
    return jsonb_build_object('created', false, 'already_accrued', false, 'reason', 'sin_tasa');
  end if;

  select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email)
    into v_nombre from public.profiles p where p.id = v_vendedor;

  insert into public.commissions (
    organization_id, branch_id, commission_type, source_type, source_id,
    payee_type, payee_id, payee_name, base_amount, commission_rate, commission_amount,
    currency, status, accrued_at, created_by, notes, metadata
  ) values (
    p_org, v_sucursal, v_tipo, 'opportunity', p_opportunity_id::text,
    'employee', v_vendedor, coalesce(v_nombre, 'N/A'), v_base, coalesce(v_tasa, 0), v_monto,
    nullif(btrim(v_moneda), ''), 'accrued', now(), auth.uid(),
    'Comisión por oportunidad - ' || coalesce(v_opp.name, p_opportunity_id::text),
    jsonb_strip_nulls(jsonb_build_object(
      'opportunity_id', p_opportunity_id, 'invoice_id', p_invoice_id, 'payment_id', p_payment_id,
      'commission_method', v_metodo, 'origen', 'fn_comision_oportunidad_devengar'))
  ) returning * into v_c;

  return jsonb_build_object('created', true, 'already_accrued', false, 'reason', null,
    'commission', jsonb_build_object('id', v_c.id, 'base_amount', v_c.base_amount, 'commission_rate', v_c.commission_rate,
                                     'commission_amount', v_c.commission_amount, 'status', v_c.status, 'source_type', v_c.source_type));
end;
$function$;

revoke all on function public.fn_comision_oportunidad_devengar(integer, uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_comision_oportunidad_devengar(integer, uuid, uuid, uuid) to authenticated, service_role;

comment on function public.fn_comision_oportunidad_devengar(integer, uuid, uuid, uuid) is
  'Única escritura de la comisión de oportunidad fuera de los disparadores: cierre «ganada» (tasa de la oportunidad o vigente) o pago de su factura (subtotal sin impuestos, método de la factura). No duplica la comisión de la factura ni de su venta.';

-- ── Disparador de «ganada»: tampoco duplica la comisión de la factura ───────
-- Medido hoy: 1 oportunidad abierta (organización 125) con tasa 25 % tiene una
-- factura con comisión 'invoice_sale' de 400.000; al ganarse, el disparador
-- habría devengado otros 400.000 por la misma venta. Mismo criterio que
-- f0c92b14 con la venta: si la factura (o su venta) ya devengó, no se devenga
-- otra. El resto del cuerpo es el vigente (pg_get_functiondef, 2026-09-28).
create or replace function public.fn_create_commission_on_opportunity_won()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
    v_commission_amount numeric;
    v_payee_name text;
    v_existing_commission_count integer;
    v_branch_id integer;
BEGIN
    IF NEW.status <> 'won' THEN
        RETURN NEW;
    END IF;

    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    IF NEW.commission_type = 'none' OR NEW.commission_rate IS NULL OR NEW.commission_rate <= 0 THEN
        RETURN NEW;
    END IF;

    IF NEW.salesperson_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*) INTO v_existing_commission_count
    FROM commissions
    WHERE source_type = 'opportunity' AND source_id = NEW.id::text;

    IF v_existing_commission_count > 0 THEN
        RETURN NEW;
    END IF;

    -- Una sola fuente: si una factura de la oportunidad (o su venta) ya devengó
    -- comisión, esa es la de la venta.
    IF EXISTS (
        SELECT 1
          FROM commissions c
          JOIN invoice_sales i ON i.organization_id = c.organization_id
         WHERE c.organization_id = NEW.organization_id
           AND i.opportunity_id = NEW.id
           AND ((c.source_type = 'invoice_sale' AND c.source_id = i.id::text)
             OR (i.sale_id IS NOT NULL AND c.source_type = 'sale' AND c.source_id = i.sale_id::text))
    ) THEN
        RETURN NEW;
    END IF;

    v_commission_amount := ROUND(COALESCE(NEW.amount, 0) * NEW.commission_rate / 100.0, 2);

    IF v_commission_amount <= 0 THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email, 'Vendedor')
    INTO v_payee_name
    FROM auth.users
    WHERE id = NEW.salesperson_id;

    v_payee_name := COALESCE(v_payee_name, 'Vendedor');

    -- Sucursal: la de la oportunidad si es de este inquilino.
    v_branch_id := NULL;

    IF NEW.branch_id IS NOT NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.id::bigint = NEW.branch_id
           AND b.organization_id = NEW.organization_id;

        IF v_branch_id IS NULL THEN
            RAISE WARNING 'fn_create_commission_on_opportunity_won: la oportunidad % declara la sucursal %, que no pertenece a la organizacion %; se descarta',
                  NEW.id, NEW.branch_id, NEW.organization_id;
        END IF;
    END IF;

    -- Respaldo: la principal de ESTA organizacion, con orden reproducible.
    IF v_branch_id IS NULL THEN
        SELECT b.id INTO v_branch_id
          FROM branches b
         WHERE b.organization_id = NEW.organization_id
         ORDER BY (b.is_main IS TRUE) DESC, (b.is_active IS TRUE) DESC, b.id ASC
         LIMIT 1;
    END IF;

    -- Sin sucursales no se inventa ninguna: NULL y constancia en el log.
    IF v_branch_id IS NULL THEN
        RAISE WARNING 'fn_create_commission_on_opportunity_won: la organizacion % no tiene ninguna sucursal; la comision de la oportunidad % queda sin sucursal',
              NEW.organization_id, NEW.id;
    END IF;

    INSERT INTO commissions (
        organization_id, branch_id,
        commission_type, source_type, source_id,
        payee_type, payee_id, payee_name,
        base_amount, commission_rate, commission_amount,
        currency, status, notes
    ) VALUES (
        NEW.organization_id, v_branch_id,
        NEW.commission_type, 'opportunity', NEW.id::text,
        'employee', NEW.salesperson_id, v_payee_name,   -- uuid, sin ::text (era el bug)
        COALESCE(NEW.amount, 0), NEW.commission_rate, v_commission_amount,
        COALESCE(NEW.currency, 'USD'), 'accrued',
        'Comisión por oportunidad ganada - ' || NEW.name
    );

    RETURN NEW;
END;
$function$;

revoke all on function public.fn_create_commission_on_opportunity_won() from public, anon, authenticated;
