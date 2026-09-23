-- Un solo asiento por hecho de compra (ADR-CC-009).
--
-- Decisión del dueño (2026-09-23): la compra se contabiliza SOLO con la
-- factura del proveedor (fn_auto_journal_purchase, devengo de ADR-CC-006:
-- inventario + IVA contra la cuenta que salda el pago, clave
-- accrual:purchase:{id}). La recepción mueve el kardex, no el libro.
--
-- Antes, una recepción completa de orden de compra podía generar hasta cuatro
-- asientos del mismo hecho:
--   1. fn_auto_journal_stock_movement: trataba las entradas por compra como
--      ajuste (6105/1405 por renglón) porque no excluía los orígenes nuevos.
--   2. fn_auto_journal_purchase_order: 1405/2105 por el total al pasar la
--      orden a «received».
--   3. fn_auto_journal_purchase: el devengo de la factura (este es el bueno).
--   4. fn_auto_journal_ap: 1405/2105 otra vez al insertar la cuenta por pagar.
-- Hoy hay 0 recepciones, pero (4) ya duplicó 52 asientos históricos.
--
-- Espejo de ventas: allí trg_auto_journal_ar ya está deshabilitado y el
-- devengo vive solo en la factura (ADR-CC-001).

-- 1. La cuenta por pagar no contabiliza: su hecho es la factura.
alter table public.accounts_payable disable trigger trg_auto_journal_ap;
comment on function public.fn_auto_journal_ap() is
  'Deshabilitado el 2026-09-23 (ADR-CC-009): duplicaba el devengo de la factura de compra. Se conserva la función para la reversión.';

-- 2. La recepción de la orden de compra no contabiliza (decisión: solo factura).
alter table public.purchase_orders disable trigger trg_auto_journal_purchase_order;
comment on function public.fn_auto_journal_purchase_order() is
  'Deshabilitado el 2026-09-23 (ADR-CC-009): la compra se contabiliza solo con la factura del proveedor.';

-- 3. Los ajustes de inventario no cubren compras ni traslados. Mismo cuerpo que
--    antes; solo se amplía la lista de orígenes excluidos y se fija search_path.
create or replace function public.fn_auto_journal_stock_movement()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_amount numeric;
    v_unit_cost numeric;
    v_description text;
    v_product_name text;
    v_existing_entry integer;
    v_debit_account text;
    v_credit_account text;
BEGIN
    -- Excluir setup inicial, compras (las contabiliza la factura, ADR-CC-009)
    -- y traslados entre sucursales (no son ajustes).
    IF NEW.source IN ('initial', 'purchase', 'purchase_order', 'purchase_invoice',
                      'transfer', 'transfer_out', 'transfer_in') THEN
        RETURN NEW;
    END IF;

    IF NEW.direction NOT IN ('out', 'in') THEN
        RETURN NEW;
    END IF;

    -- Obtener costo unitario
    v_unit_cost := COALESCE(NEW.unit_cost, 0);
    IF v_unit_cost = 0 THEN
        SELECT sl.avg_cost INTO v_unit_cost
        FROM stock_levels sl
        WHERE sl.product_id = NEW.product_id
          AND sl.branch_id = NEW.branch_id
        LIMIT 1;
    END IF;

    v_amount := ABS(NEW.qty) * COALESCE(v_unit_cost, 0);
    IF v_amount <= 0 THEN
        RETURN NEW;
    END IF;

    -- Verificar asiento existente
    SELECT je.id INTO v_existing_entry
    FROM journal_entries je
    WHERE je.source = 'stock_movements'
      AND je.source_id = NEW.id::text
      AND je.organization_id = NEW.organization_id
    LIMIT 1;

    IF v_existing_entry IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Buscar regla contable
    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = 'inventory'
      AND event_type = 'adjusted'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        RETURN NEW;
    END IF;

    -- Resolver sub-cuentas por sucursal (1405 → 1405-0X, 6105 → 6105-0X)
    SELECT sub_account_code INTO v_debit_account
    FROM branch_account_mappings
    WHERE organization_id = NEW.organization_id
      AND branch_id = NEW.branch_id
      AND base_account_code = v_rule.debit_account_code
    LIMIT 1;

    SELECT sub_account_code INTO v_credit_account
    FROM branch_account_mappings
    WHERE organization_id = NEW.organization_id
      AND branch_id = NEW.branch_id
      AND base_account_code = v_rule.credit_account_code
    LIMIT 1;

    -- Fallback a cuenta base si no hay sub-cuenta
    v_debit_account := COALESCE(v_debit_account, v_rule.debit_account_code);
    v_credit_account := COALESCE(v_credit_account, v_rule.credit_account_code);

    SELECT name INTO v_product_name FROM products WHERE id = NEW.product_id LIMIT 1;

    IF NEW.direction = 'out' THEN
        v_description := 'Salida Inventario - ' || COALESCE(v_product_name, 'Prod:' || NEW.product_id) || ' - ' || COALESCE(NEW.source, '');
        PERFORM fn_create_journal_entry(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.created_at, now()),
            v_description, 'stock_movements', NEW.id::text,
            v_debit_account, v_credit_account, v_amount
        );
    ELSE
        v_description := 'Entrada Ajuste - ' || COALESCE(v_product_name, 'Prod:' || NEW.product_id);
        PERFORM fn_create_journal_entry(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.created_at, now()),
            v_description, 'stock_movements', NEW.id::text,
            v_credit_account, v_debit_account, v_amount
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- 4. Neutralizar los asientos históricos de fn_auto_journal_ap con
--    contra-asientos exactos (mismo mecanismo que ADR-CC-007: fn_revertir_asiento,
--    journal_reversals y un journal_reversal_runs por organización). No se borra
--    nada. En journal_reversals la categoría es «CC-009»; el detalle va en el
--    memo del contra-asiento y en los conteos del run:
--      CC-009-duplicado : la factura ya tiene su devengo (recibida o con pago parcial).
--      CC-009-borrador  : la factura sigue en borrador; un borrador no se contabiliza (F-49).
--      CC-009-cxp-borrada: la cuenta por pagar ya no existe.
--    Todos son 1405 D / 2105 C; ninguno es el único registro de una compra
--    recibida (verificado antes de aplicar). Idempotente: salta los ya revertidos.
alter table public.journal_reversals drop constraint if exists journal_reversals_categoria_check;
alter table public.journal_reversals add constraint journal_reversals_categoria_check
  check (categoria = any (array['F-48', 'F-45', 'F-49', 'CC-001', 'F-01', 'CC-009']));

do $$
declare
  v_lote constant text := 'compras-un-hecho-2026-09-23';
  v_org integer;
  v_asiento record;
  v_rev integer;
  v_antes jsonb;
  v_conteos jsonb;
  v_cuentas text[];
begin
  for v_org in
    select distinct je.organization_id
    from journal_entries je
    where je.source = 'accounts_payable' and je.posted
      and not exists (select 1 from journal_entries r
                      where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
    order by 1
  loop
    select array_agg(distinct jl.account_code) into v_cuentas
    from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id
    where je.organization_id = v_org and je.source = 'accounts_payable';

    select jsonb_build_object(
             'debitos', coalesce(sum(jl.debit), 0), 'creditos', coalesce(sum(jl.credit), 0),
             'saldos', (select coalesce(jsonb_object_agg(c, s), '{}'::jsonb) from (
                          select jl2.account_code c, sum(jl2.debit - jl2.credit) s
                          from journal_lines jl2 join journal_entries je2 on je2.id = jl2.journal_entry_id
                          where je2.organization_id = v_org and jl2.account_code = any(v_cuentas)
                          group by 1) x))
      into v_antes
    from journal_lines jl join journal_entries je on je.id = jl.journal_entry_id
    where je.organization_id = v_org;

    v_conteos := '{}'::jsonb;

    for v_asiento in
      select je.id,
             case
               when a.id is null then 'CC-009-cxp-borrada'
               when ip.status = 'draft' then 'CC-009-borrador'
               else 'CC-009-duplicado'
             end as categoria
      from journal_entries je
      left join accounts_payable a on a.id::text = je.source_id and a.organization_id = je.organization_id
      left join invoice_purchase ip on ip.id = a.invoice_id
      where je.organization_id = v_org and je.source = 'accounts_payable' and je.posted
        and not exists (select 1 from journal_entries r
                        where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
      order by je.id
    loop
      v_rev := fn_revertir_asiento(v_asiento.id, v_asiento.categoria, v_lote);
      insert into journal_reversals (organization_id, lote, categoria, original_entry_id, reversal_entry_id)
      values (v_org, v_lote, 'CC-009', v_asiento.id, v_rev);
      v_conteos := jsonb_set(v_conteos, array[v_asiento.categoria],
                             to_jsonb(coalesce((v_conteos ->> v_asiento.categoria)::int, 0) + 1));
    end loop;

    insert into journal_reversal_runs (organization_id, lote, ejecutado, resultado)
    select v_org, v_lote, true, jsonb_build_object(
             'antes', v_antes,
             'conteos', v_conteos,
             'despues', jsonb_build_object(
               'debitos', coalesce(sum(jl.debit), 0), 'creditos', coalesce(sum(jl.credit), 0),
               'saldos', (select coalesce(jsonb_object_agg(c, s), '{}'::jsonb) from (
                            select jl2.account_code c, sum(jl2.debit - jl2.credit) s
                            from journal_lines jl2 join journal_entries je2 on je2.id = jl2.journal_entry_id
                            where je2.organization_id = v_org and jl2.account_code = any(v_cuentas)
                            group by 1) x)))
    from journal_lines jl join journal_entries je on je.id = jl.journal_entry_id
    where je.organization_id = v_org;
  end loop;
end $$;
