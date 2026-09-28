-- Comisiones · una sola fuente de verdad para devengar la comisión de una venta (2026-09-28).
--
-- Hallazgos verificados por MCP antes de esta migración:
--
--   1. `fn_create_commission_on_sale` (trg_create_commission_on_sale, AFTER INSERT
--      OR UPDATE OF status ON sales) insertaba `payee_id = NEW.salesperson_id::text`
--      en una columna uuid: ERROR 42804. Reproducido llamando a pos_checkout_v1 con
--      un vendedor dentro de una transacción que se deshace: el cobro COMPLETO
--      fallaba («column payee_id is of type uuid but expression is of type text»).
--      Hoy ningún cobro del POS con vendedor puede terminar.
--   2. Aunque el tipo estuviera bien, calculaba siempre `subtotal × tasa / 100`:
--      una comisión por monto fijo (`commission_method = 'fixed_amount'`, la tasa
--      guarda el monto) se devengaba como porcentaje (5.000 → 5.000 %). Y como
--      dispara al insertar la venta, ANTES del paso 6 de pos_checkout_v1, la RPC
--      veía que ya existía y omitía la suya, que sí conoce el método.
--   3. `fn_create_commission_on_invoice_sale` (al pasar la factura a 'paid') tenía
--      el mismo cast roto, el mismo cálculo por porcentaje, moneda 'USD' por
--      defecto, y solo buscaba duplicados de tipo 'invoice_sale': una venta del
--      POS con deuda (comisión 'sale' de la RPC) se habría devengado dos veces al
--      cobrarse la factura.
--
-- Qué hace:
--   - La venta: la fuente de verdad es quien conoce el método (pos_checkout_v1 y
--     fn_factura_venta_guardar). El disparador pasa a ser un CONSTRAINT TRIGGER
--     DEFERRABLE INITIALLY DEFERRED: corre al final de la transacción, cuando la
--     RPC ya insertó la suya, y solo actúa si NADIE devengó la comisión de esa
--     venta (ni como 'sale' ni como 'invoice_sale' de su factura). Relee la fila
--     de la venta (el NEW diferido puede estar viejo), toma el método y el monto
--     de su factura (la RPC los escribe en invoice_sales) y, sin factura,
--     porcentaje. Un fallo se registra como WARNING y no tumba la venta.
--   - La factura: mismo criterio (método de la factura, duplicados contra la
--     venta ligada), payee_id uuid, moneda de la factura.
--
-- Daño medido (2026-09-28): 232 comisiones; 0 mal calculadas por estos
-- disparadores. Las 228 'invoice_sale' las escribió el cliente/la RPC con el
-- método correcto (71 de monto fijo, monto = tasa); la única 'sale' es de
-- porcentaje y cuadra. El fallo real era el 1: ninguna venta pudo devengar.
-- Una factura emitida con vendedor y sin comisión habría fallado al cobrarse.

-- ── 1. Comisión de la venta ─────────────────────────────────────────────────
create or replace function public.fn_create_commission_on_sale()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sale    public.sales%rowtype;
  v_method  text;
  v_inv_amt numeric;
  v_amount  numeric;
  v_base    numeric;
  v_name    text;
begin
  -- Diferido: la fila pudo cambiar después del evento. Se decide con la actual.
  select * into v_sale from public.sales where id = NEW.id;
  if not found or v_sale.status is distinct from 'paid' then
    return null;
  end if;
  if coalesce(v_sale.commission_type, 'none') = 'none'
     or coalesce(v_sale.commission_rate, 0) <= 0
     or v_sale.salesperson_id is null then
    return null;
  end if;

  -- Una sola comisión por venta: la de la RPC ('sale') o la de su factura ('invoice_sale').
  if exists (select 1 from public.commissions c
              where c.organization_id = v_sale.organization_id
                and ((c.source_type = 'sale' and c.source_id = v_sale.id::text)
                  or (c.source_type = 'invoice_sale' and c.source_id in (
                        select i.id::text from public.invoice_sales i
                         where i.sale_id = v_sale.id and i.organization_id = v_sale.organization_id)))) then
    return null;
  end if;

  select i.commission_method, i.commission_amount into v_method, v_inv_amt
    from public.invoice_sales i
   where i.sale_id = v_sale.id and i.organization_id = v_sale.organization_id
   order by i.created_at desc
   limit 1;
  v_method := coalesce(nullif(v_method, ''), 'percentage');
  v_base := coalesce(v_sale.subtotal, v_sale.total, 0);
  v_amount := case
    when v_method = 'fixed_amount' then coalesce(nullif(v_inv_amt, 0), v_sale.commission_rate)
    else round(v_base * v_sale.commission_rate / 100.0, 2)
  end;
  if coalesce(v_amount, 0) <= 0 then
    return null;
  end if;

  select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email)
    into v_name from public.profiles p where p.id = v_sale.salesperson_id;

  begin
    insert into public.commissions (
      organization_id, branch_id, commission_type, source_type, source_id,
      payee_type, payee_id, payee_name, base_amount, commission_rate, commission_amount,
      currency, status, accrued_at, notes, metadata
    ) values (
      v_sale.organization_id, v_sale.branch_id, v_sale.commission_type, 'sale', v_sale.id::text,
      'employee', v_sale.salesperson_id, coalesce(v_name, 'N/A'), v_base, v_sale.commission_rate, v_amount,
      public.fn_moneda_base_organizacion(v_sale.organization_id), 'accrued', now(),
      'Comisión automática por venta - ' || v_sale.id::text,
      jsonb_build_object('sale_id', v_sale.id, 'commission_method', v_method, 'origen', 'disparador_venta')
    );
  exception when others then
    raise warning 'fn_create_commission_on_sale: la venta % no devengó comisión: %', v_sale.id, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function public.fn_create_commission_on_sale() from public, anon, authenticated;

drop trigger if exists trg_create_commission_on_sale on public.sales;
create constraint trigger trg_create_commission_on_sale
  after insert or update of status on public.sales
  deferrable initially deferred
  for each row execute function public.fn_create_commission_on_sale();

-- ── 2. Comisión de la factura al pasar a pagada ─────────────────────────────
create or replace function public.fn_create_commission_on_invoice_sale()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_method text;
  v_amount numeric;
  v_base   numeric;
  v_name   text;
begin
  if NEW.status is distinct from 'paid' or OLD.status is not distinct from NEW.status then
    return NEW;
  end if;
  if coalesce(NEW.commission_type, 'none') = 'none'
     or coalesce(NEW.commission_rate, 0) <= 0
     or NEW.salesperson_id is null then
    return NEW;
  end if;

  -- Ni la de la factura ni la de su venta (pos_checkout_v1 la devenga como 'sale').
  if exists (select 1 from public.commissions c
              where c.organization_id = NEW.organization_id
                and ((c.source_type = 'invoice_sale' and c.source_id = NEW.id::text)
                  or (NEW.sale_id is not null and c.source_type = 'sale' and c.source_id = NEW.sale_id::text))) then
    return NEW;
  end if;

  v_method := coalesce(nullif(NEW.commission_method, ''), 'percentage');
  v_base := coalesce(NEW.subtotal, NEW.total, 0);
  v_amount := case
    when v_method = 'fixed_amount' then coalesce(nullif(NEW.commission_amount, 0), NEW.commission_rate)
    else round(v_base * NEW.commission_rate / 100.0, 2)
  end;
  if coalesce(v_amount, 0) <= 0 then
    return NEW;
  end if;

  select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email)
    into v_name from public.profiles p where p.id = NEW.salesperson_id;

  begin
    insert into public.commissions (
      organization_id, branch_id, commission_type, source_type, source_id,
      payee_type, payee_id, payee_name, base_amount, commission_rate, commission_amount,
      currency, status, accrued_at, notes, metadata
    ) values (
      NEW.organization_id, NEW.branch_id, NEW.commission_type, 'invoice_sale', NEW.id::text,
      'employee', NEW.salesperson_id, coalesce(v_name, 'N/A'), v_base, NEW.commission_rate, v_amount,
      NEW.currency, 'accrued', now(),
      'Comisión por factura de venta - ' || coalesce(NEW.number, NEW.id::text),
      jsonb_build_object('invoice_number', NEW.number, 'commission_method', v_method, 'origen', 'disparador_factura')
    );
  exception when others then
    -- Devengar la comisión no puede tumbar el cobro de la factura.
    raise warning 'fn_create_commission_on_invoice_sale: la factura % no devengó comisión: %', NEW.id, sqlerrm;
  end;
  return NEW;
end;
$function$;

revoke all on function public.fn_create_commission_on_invoice_sale() from public, anon, authenticated;

comment on function public.fn_create_commission_on_sale() is
  'Respaldo diferido: devenga la comisión de una venta pagada solo si ni pos_checkout_v1 ni la factura la devengaron. Método y monto de la factura ligada.';
comment on function public.fn_create_commission_on_invoice_sale() is
  'Devenga la comisión de una factura al pasar a pagada si no existe la de la factura ni la de su venta. Respeta commission_method.';
