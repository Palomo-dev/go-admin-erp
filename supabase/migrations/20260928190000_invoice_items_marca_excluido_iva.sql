-- Factura electrónica · la marca de excluido/exento viaja del impuesto del producto a invoice_items (2026-09-28).
--
-- Hallazgos verificados por MCP:
--   - Ningún camino de venta escribe invoice_items.is_excluded ni el tax_code de
--     una línea al 0 %: pos_checkout_v1 no inserta tax_code, y ni el POS ni
--     fn_factura_venta_guardar tocan is_excluded. De 6.754 líneas de venta,
--     6.176 están al 0 % con tax_code NULL y ninguna con is_excluded = 1: un 0 %
--     sale siempre como «IVA 0 %» en el payload de Factus.
--   - El catálogo tax_templates solo tiene IVA_0 «Exento de IVA» para Colombia:
--     no había forma de configurar un producto EXCLUIDO (no causa IVA), que la
--     DIAN distingue del exento (IVA a tarifa 0).
--
-- Qué hace (sin tocar los controles de impuesto del carrito ni las RPC de venta):
--   1. Plantilla COL «IVA_EXCLUIDO» (tarifa 0). Una organización la agrega en
--      Finanzas › Impuestos y la relaciona con sus productos excluidos.
--   2. BEFORE INSERT en invoice_items (solo invoice_type = 'sale', línea al 0 %,
--      con producto): si el producto está relacionado con impuestos ACTIVOS de la
--      organización que suman 0, la línea hereda el código de esa plantilla
--      (IVA_0 o IVA_EXCLUIDO) cuando no trae uno, e is_excluded = 1 si es
--      IVA_EXCLUIDO. Una línea con tax_code = 'IVA_EXCLUIDO' siempre queda
--      is_excluded = 1. Una línea al 0 % por «Excluir impuesto» sobre un
--      producto gravado NO cambia (su relación suma > 0).
--   3. No reescribe líneas existentes ni reenvía documentos ya emitidos.

-- ── 1. Plantilla «Excluido de IVA» ──────────────────────────────────────────
insert into public.tax_templates (country, code, name, rate, description)
select 'COL', 'IVA_EXCLUIDO', 'Excluido de IVA', 0,
       'Bienes y servicios excluidos: no causan IVA (distinto de exento, que es IVA a tarifa 0).'
where not exists (select 1 from public.tax_templates where code = 'IVA_EXCLUIDO');

-- ── 2. Marca de la línea ────────────────────────────────────────────────────
create or replace function public.fn_invoice_items_marca_excluido()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org   integer;
  v_suma  numeric;
  v_codes text[];
begin
  if coalesce(NEW.invoice_type, 'sale') <> 'sale' then
    return NEW;
  end if;

  if upper(coalesce(NEW.tax_code, '')) = 'IVA_EXCLUIDO' then
    NEW.is_excluded := 1;
    return NEW;
  end if;

  if coalesce(NEW.tax_rate, 0) <> 0 or NEW.product_id is null or NEW.tax_code is not null then
    return NEW;
  end if;

  select i.organization_id into v_org
    from public.invoice_sales i
   where i.id = coalesce(NEW.invoice_sales_id, NEW.invoice_id);
  if v_org is null then
    return NEW;
  end if;

  select sum(ot.rate), array_agg(distinct t.code) filter (where t.code is not null)
    into v_suma, v_codes
    from public.product_tax_relations r
    join public.organization_taxes ot on ot.id = r.tax_id and ot.organization_id = v_org and ot.is_active
    left join public.tax_templates t on t.id = ot.template_id
   where r.product_id = NEW.product_id;

  -- Sin relación, o relación gravada: la línea queda como vino.
  if v_suma is null or v_suma <> 0 then
    return NEW;
  end if;

  if 'IVA_EXCLUIDO' = any(coalesce(v_codes, '{}')) then
    NEW.tax_code := 'IVA_EXCLUIDO';
    NEW.is_excluded := 1;
  elsif 'IVA_0' = any(coalesce(v_codes, '{}')) then
    NEW.tax_code := 'IVA_0';
    NEW.is_excluded := coalesce(NEW.is_excluded, 0);
  end if;
  return NEW;
end;
$function$;

revoke all on function public.fn_invoice_items_marca_excluido() from public, anon, authenticated;

drop trigger if exists trg_invoice_items_marca_excluido on public.invoice_items;
create trigger trg_invoice_items_marca_excluido
  before insert on public.invoice_items
  for each row execute function public.fn_invoice_items_marca_excluido();

comment on function public.fn_invoice_items_marca_excluido() is
  'Línea de venta al 0 % de un producto configurado exento (IVA_0) o excluido (IVA_EXCLUIDO): hereda el código y, si es excluido, is_excluded = 1 para la factura electrónica.';
