-- fn_auto_journal_web_order: confirmar un pedido web SIN pagar ya no falla con 23514.
-- Extraída de E2 (20261007130100_fn_confirmar_pedido_web_completo), que queda esperando el
-- despliegue del ERP: esta corrección no depende del código nuevo y arregla el ERP desplegado.
--
-- Problema (reproducido el 2026-10-06 con el flujo exacto del ERP desplegado 995026ed,
-- webOrderConfirmationService.confirmOrder sin «Marcar como pagado»): fn_confirmar_pedido_web
-- crea la venta y pone web_orders.sale_id; el paso 11 (update de web_orders a 'confirmed')
-- dispara trg_auto_journal_web_order, que inserta invoice_sales con status 'confirmed', valor que
-- invoice_sales_status_check (draft, issued, paid, partial, void) NO admite:
--   [23514] new row for relation "invoice_sales" violates check constraint
--   "invoice_sales_status_check"
-- El update entero se revierte: el pedido queda 'pending' con venta, líneas y comanda creadas.
-- Pasa también con un pedido pagado que llega a 'confirmed' sin factura (la factura del servidor
-- falló). Hay 0 facturas «WEB-%» en toda la base: esa rama nunca funcionó.
--
-- Qué hace (mismo número «WEB-<id>» y mismas columnas que antes):
--   - Pedido SIN pagar → no crea factura. La factura nace al cobrar (no al confirmar), con sus
--     líneas; el asiento lo hace trg_auto_journal_sale sobre esa factura.
--   - Pedido PAGADO sin factura (respaldo) → la crea con status 'paid' (antes 'confirmed', que
--     fallaba) y trg_auto_journal_sale la contabiliza.
--   - Con factura ya creada (el camino normal del ERP: factura antes del update) → no hace nada,
--     igual que antes.
--   - Se fija search_path (era SECURITY DEFINER sin él).
--
-- Aplicada por MCP el 2026-10-06. Ensayo (do/raise, flujo del ERP desplegado, org nueva con
-- fn_alta_organizacion): ENSAYO_OK antes: pagado sin factura FALLA [23514] | A sin pagar (cajero,
-- sesión del navegador): confirmed, 0 facturas, 0 asientos | B pagado con «Marcar como pagado»:
-- 1 factura (la del ERP, sin WEB- duplicada), 1 asiento cuadrado 20000/20000 | C pagado sin
-- factura (servidor, respaldo): WEB- paid y asiento cuadrado 15000/15000 | D entregar sin
-- pagar: sin factura.
-- Producción (2026-10-06): 0 pedidos sin pagar atascados en 'pending' en 30 días (los pedidos
-- manuales son ≈1 al mes); los 4 errores 23514 de las últimas 24 h en los logs son ensayos por
-- MCP, no clientes. El fallo es latente: salta en cuanto un restaurante confirma un pedido en
-- efectivo o transferencia sin marcarlo pagado.

create or replace function public.fn_auto_journal_web_order()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  v_existing_invoice uuid;
begin
  -- Solo cuando el pedido pasa a confirmed/completed/delivered y tiene venta.
  if (new.status = 'confirmed' or new.status = 'completed' or new.status = 'delivered')
     and (old.status is distinct from new.status)
     and new.sale_id is not null then

    select id into v_existing_invoice
      from public.invoice_sales
     where sale_id = new.sale_id
       and organization_id = new.organization_id
     limit 1;

    -- Ya hay factura (el trigger de invoice_sales ya la contabilizó).
    if v_existing_invoice is not null then
      return new;
    end if;

    -- Sin pagar: la factura la crea el cobro, con sus líneas. Antes aquí se
    -- insertaba status 'confirmed', que el CHECK de invoice_sales no admite:
    -- la confirmación entera fallaba.
    if coalesce(new.payment_status, 'pending') <> 'paid' then
      return new;
    end if;

    insert into public.invoice_sales (
      organization_id, branch_id, customer_id, sale_id,
      number, issue_date, subtotal, tax_total, total,
      status, document_type, tax_included, created_at
    ) values (
      new.organization_id, new.branch_id, null, new.sale_id,
      'WEB-' || new.id::text, coalesce(new.created_at, now()),
      new.total - coalesce(new.tax_total, 0), coalesce(new.tax_total, 0), new.total,
      'paid', 'invoice', false, now()
    );
  end if;
  return new;
end;
$f$;

revoke all on function public.fn_auto_journal_web_order() from public, anon, authenticated;
