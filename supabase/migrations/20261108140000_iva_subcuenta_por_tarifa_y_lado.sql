-- H1 de la nota técnica del Contador (docs/contador/NOTA-TECNICA-TRIBUTARIO-Y-ANTICIPOS-2026-11-07.md, §6):
-- la subcuenta de IVA de la contabilización automática sale de la TARIFA y del LADO.
-- ESCRITA, NO APLICADA. Se aplica por el MCP (apply_migration) cuando el dueño lo ordene.
-- Reversión: supabase/rollbacks/20261108140000_iva_subcuenta_por_tarifa_y_lado_rollback.sql
-- Anexo para el Contador: docs/contador/ANEXO-H1-H2-IVA-Y-RUT-2026-11-07.md
--
-- Causa (verificado por el MCP el 2026-11-07, proyecto taqjemqjtumhwptchcxk, solo SELECT):
--   fn_cuenta_iva(org, sede, origen, cuenta_regla) devolvía la ÚLTIMA cuenta de IVA mapeada en
--   tax_account_mapping (orden updated_at desc) sin mirar la tarifa ni si el documento es de venta o de
--   compra. Las 35 organizaciones tienen IVA_19 → 24080501 e IVA_5 → 24080502 (las dos de «generado»):
--   en 19 devuelve 24080502 y en 16 devuelve 24080501, para ventas Y compras.
--   La llaman: fn_create_journal_entry (todo asiento de una línea de IVA: facturas de venta y notas débito
--   sin cuenta propia, ventas POS, notas crédito por disparador, compras), fn_nc_asiento_devolucion (nota
--   crédito de devolución con varias cuentas) y fn_auto_journal_purchase (respaldo cuando la regla trae
--   2408). fn_armar_asiento_documento (asiento por líneas: compras, documento soporte, notas crédito
--   emitidas, ventas/notas débito con cuenta propia o INC+IVA) NO la llamaba: usaba la cuenta de la regla
--   (24080501 / 24081001) para toda tarifa, así que el 5 % caía en la del 19 %.
--   Además todos esos caminos escriben UNA sola línea de IVA: una compra al 19 % + 5 % no puede quedar
--   bien con una sola subcuenta.
--
-- Esta migración (aditiva; sin DROP ni cambios de tipo; no toca asientos existentes):
--   1. fn_iva_lado(origen, cuenta_regla, lado)        → 'generado' | 'descontable'.
--   2. fn_cuenta_iva_tarifa(org, sede, origen, cuenta_regla, tarifa, lado) → subcuenta o NULL.
--        a) INC (2495…) de movimiento en la regla: se respeta tal cual (igual que antes).
--        b) Mapeo del impuesto de ESA tarifa (tax_account_mapping) cuya cuenta es del lado
--           (240805… generado, 240810… descontable).
--        c) Solo tarifa 19 % (general): «Configuración contable» iva_generado / iva_descontable y,
--           si no, la cuenta de la regla, siempre que sean del lado.
--        d) Respaldo documentado de fn_cuenta_auxiliar_de_titulo, SOLO 19 % y 5 %:
--           240805 → 24080501 / 24080502 y 240810 → 24081001 / 24081002 (con el auxiliar de la sede).
--        e) Nada sirve → NULL. No se inventa una cuenta.
--        Tarifa no identificada → 19 % (la regla de respaldo que ya documentaban fn_cuenta_auxiliar_de_titulo
--        y fn_auto_journal_purchase: «tarifa 19 % si la línea no la trae»).
--   3. fn_iva_pesos_por_tarifa(org, origen, id)       → IVA de las líneas del documento por tarifa
--        (sale_items / invoice_items de venta, compra o documento soporte; INC excluido, como
--        fn_impuesto_inc_parte). En el POS la línea suele guardar el IVA con tarifa 0: la tarifa se
--        deduce SOLO si el IVA de la línea coincide (±$1) con UNA tarifa de IVA configurada en la
--        organización; si no, queda sin identificar. Nota crédito cuyo asiento se arma al insertar la
--        cabecera (antes de sus líneas, fn_auto_journal_credit_note): la tarifa sale de la factura que acredita
--        (la que coincide con IVA/base de la nota, o la mezcla de la factura).
--   4. fn_iva_reparto(org, sede, origen, id, cuenta_regla, iva, lado, decimales)
--        → una fila por tarifa: subcuenta e IVA (proporcional al IVA de las líneas; el residuo de redondeo
--        a la fila de más peso; la suma es exactamente el IVA pedido). Sin subcuenta: cuenta NULL y motivo.
--   5. fn_cuenta_iva conserva su firma y delega en fn_cuenta_iva_tarifa (tarifa no identificada).
--   6. Llamadores, con reemplazo verificado (cada texto viejo debe aparecer exactamente UNA vez; el resto
--      del cuerpo queda idéntico; CREATE OR REPLACE conserva dueño y ACL; el rollback hace el inverso):
--        · fn_create_journal_entry: una línea de IVA por tarifa (asiento y pendiente de redondeo). Sin
--          subcuenta: pendiente contable 'cuenta_no_configurada' con el motivo, y no hay asiento (como
--          las demás validaciones de la función).
--        · fn_armar_asiento_documento: una línea de IVA por tarifa. Sin subcuenta: ok=false con el motivo
--          (fn_asiento_documento_por_lineas lo deja en la bandeja como 'cuenta_linea').
--        · fn_nc_asiento_devolucion (camino de varias cuentas): una línea de IVA por tarifa; sin subcuenta,
--          pendiente 'cuenta_no_configurada' ANTES de crear la cabecera del asiento.
--        · fn_auto_journal_purchase: el respaldo de la cuenta de IVA descontable usa fn_cuenta_iva_tarifa.
--
-- Asientos ya publicados: NO se reescriben. Medición 2026-11-07: 86 asientos con IVA en 2 organizaciones
-- (org 333: 77 ventas POS + 1 factura; org 338: 6 ventas POS + 2 facturas), todos en 24080501 y todas sus
-- líneas con IVA al 19 % (sale_items deducidas, invoice_items IVA_19): 0 mal clasificados. 0 compras con
-- IVA contabilizadas. Detalle en el anexo.
--
-- Prueba en seco (org 374, begin … rollback, usuario simulado; 32 de 32): docs/contador/pruebas/07_iva_subcuenta_por_tarifa.sql
-- y su .resultado.txt. Ventas 19/5/mixta, POS 19/5 (tarifa 0 en la línea), compras 19/5/mixta, notas crédito
-- (total, parcial, devolución mixta), documento soporte mixto, compra al 16 % sin subcuenta → pendiente.

-- ── 1. Lado del IVA ─────────────────────────────────────────────────────────────
create or replace function public.fn_iva_lado(p_source text, p_cuenta_regla text, p_lado text default null)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when lower(btrim(coalesce(p_lado, ''))) in ('descontable', 'compra', 'purchase') then 'descontable'
    when lower(btrim(coalesce(p_lado, ''))) in ('generado', 'venta', 'sale') then 'generado'
    when btrim(coalesce(p_cuenta_regla, '')) like '240810%' then 'descontable'
    when btrim(coalesce(p_cuenta_regla, '')) like '240805%' then 'generado'
    when coalesce(p_source, '') = any (array['purchase', 'purchases', 'invoice_purchase', 'purchase_order',
      'purchase_orders', 'support_documents', 'documento_soporte']) then 'descontable'
    else 'generado'
  end;
$function$;

comment on function public.fn_iva_lado(text, text, text) is
  'Lado del IVA: generado (ventas, notas débito y crédito de venta) o descontable (compras, documento soporte). Orden: lado explícito, título de la cuenta de la regla (240805/240810), origen.';

-- ── 2. Subcuenta por tarifa y lado ──────────────────────────────────────────────
create or replace function public.fn_cuenta_iva_tarifa(
  p_organization_id integer,
  p_branch_id integer,
  p_source text,
  p_cuenta_regla text,
  p_tarifa numeric default null,
  p_lado text default null
)
returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_regla text := nullif(btrim(p_cuenta_regla), '');
  v_lado text := public.fn_iva_lado(p_source, p_cuenta_regla, p_lado);
  v_titulo text;
  -- Tarifa no identificada: 19 % (regla de respaldo documentada en fn_cuenta_auxiliar_de_titulo).
  v_tarifa numeric := coalesce(round(nullif(p_tarifa, 0), 2), 19);
  v_cta text;
begin
  if p_organization_id is null then
    return null;
  end if;

  -- a) El INC (2495…) NO es IVA (Contador 25-oct-2026): si la regla trae un auxiliar de INC de movimiento,
  --    se usa tal cual.
  if v_regla like '2495%' and exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = p_organization_id and c.account_code = v_regla
       and c.es_movimiento is true) then
    return v_regla;
  end if;

  v_titulo := case v_lado when 'descontable' then '240810' else '240805' end;

  -- b) Mapeo del impuesto de esa tarifa, si su cuenta es del lado.
  select tam.account_code into v_cta
    from public.tax_account_mapping tam
    left join public.organization_taxes ot
      on ot.id = tam.organization_tax_id
     and ot.organization_id = p_organization_id
    left join public.tax_templates tt
      on tt.id = tam.tax_template_id
   where tam.organization_id = p_organization_id
     and coalesce(tam.is_active, true)
     and (
       (ot.id is not null and coalesce(ot.is_active, true) and ot.kind = 'tax'
         and ot.name ilike '%iva%' and ot.name not ilike '%rete%')
       or (tt.id is not null and coalesce(tt.kind, 'tax') = 'tax'
         and (coalesce(tt.code, '') ilike '%iva%' or coalesce(tt.name, '') ilike '%iva%')
         and coalesce(tt.code, '') not ilike '%rete%'
         and coalesce(tt.name, '') not ilike '%rete%')
     )
     and round(coalesce(ot.rate, tt.rate), 2) = v_tarifa
     and tam.account_code like v_titulo || '%'
     and exists (
       select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id
          and c.account_code = tam.account_code
          and c.es_movimiento is true
          and coalesce(c.is_active, true)
     )
   order by (ot.id is not null) desc, tam.updated_at desc nulls last, tam.id desc
   limit 1;
  if v_cta is not null then
    return v_cta;
  end if;

  -- c) Tarifa general (19 %): la cuenta de «Configuración contable» del lado y, si no, la de la regla.
  if v_tarifa = 19 then
    select c.account_code into v_cta
      from public.configuracion_contable c
     where c.organization_id = p_organization_id
       and c.clave = case v_lado when 'descontable' then 'iva_descontable' else 'iva_generado' end
       and (c.branch_id = p_branch_id or c.branch_id is null)
     order by c.branch_id nulls last
     limit 1;
    if v_cta like v_titulo || '%' and exists (
      select 1 from public.chart_of_accounts c
       where c.organization_id = p_organization_id and c.account_code = v_cta
         and c.es_movimiento is true and coalesce(c.is_active, true)) then
      return v_cta;
    end if;
    if v_regla like v_titulo || '%' and exists (
      select 1 from public.chart_of_accounts c
       where c.organization_id = p_organization_id and c.account_code = v_regla
         and c.es_movimiento is true and coalesce(c.is_active, true)) then
      return v_regla;
    end if;
  end if;

  -- d) Respaldo documentado (fn_cuenta_auxiliar_de_titulo): solo conoce 19 % y 5 %.
  if v_tarifa in (19, 5) then
    v_cta := public.fn_cuenta_auxiliar_de_titulo(p_organization_id, p_branch_id, v_titulo, v_tarifa, v_lado);
    if v_cta like v_titulo || '%' and exists (
      select 1 from public.chart_of_accounts c
       where c.organization_id = p_organization_id and c.account_code = v_cta
         and c.es_movimiento is true and coalesce(c.is_active, true)) then
      return v_cta;
    end if;
  end if;

  -- e) No se inventa: el llamador deja el pendiente contable.
  return null;
end;
$function$;

comment on function public.fn_cuenta_iva_tarifa(integer, integer, text, text, numeric, text) is
  'Subcuenta de IVA por tarifa y lado (H1, 2026-11-08): mapeo del impuesto de esa tarifa → (19 %) configuración contable / regla → auxiliar del título (19 % y 5 %) → NULL. Tarifa NULL = 19 %.';

-- ── 3. IVA de las líneas del documento, por tarifa ──────────────────────────────
create or replace function public.fn_iva_pesos_por_tarifa(p_organization_id integer, p_source text, p_source_id text)
returns table(tarifa numeric, peso numeric)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_id uuid;
  v_rel uuid;
  v_iva_doc numeric;
  v_base_doc numeric;
begin
  if p_source_id is null
     or p_source_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return;
  end if;
  v_id := p_source_id::uuid;

  if p_source = 'sales' then
    return query
    with tasas as (
      select distinct round(ot.rate, 2) as t
        from public.organization_taxes ot
       where ot.organization_id = p_organization_id
         and coalesce(ot.is_active, true) and coalesce(ot.kind, 'tax') = 'tax'
         and ot.name ilike '%iva%' and ot.name not ilike '%rete%'
         and ot.rate > 0 and round(ot.rate, 2) <> 8
    ), l as (
      select abs(coalesce(si.tax_amount, 0)) as iva,
             abs(coalesce(si.total, 0)) as total,
             round(case when coalesce(si.tax_rate, 0) > 1 then si.tax_rate
                        else coalesce(si.tax_rate, 0) * 100 end, 2) as r
        from public.sale_items si
       where si.sale_id = v_id and coalesce(si.tax_amount, 0) <> 0
    ), d as (
      select l.iva,
             case
               when l.r > 0 then l.r
               -- El POS guarda el IVA con tarifa 0: se deduce solo si coincide (±$1) con UNA tarifa configurada,
               -- con el precio con IVA incluido o sin él.
               else (select min(t.t) from tasas t
                      where abs(l.iva - (l.total - l.iva) * t.t / 100) <= 1
                         or abs(l.iva - l.total * t.t / 100) <= 1
                     having count(*) = 1)
             end as tarifa
        from l
    )
    select d.tarifa, sum(d.iva)
      from d
     where d.tarifa is distinct from 8          -- INC (8 %): no es IVA (fn_impuesto_inc_parte)
     group by d.tarifa;
    return;
  end if;

  if p_source in ('invoice_sales', 'invoice_purchase', 'support_documents') then
    return query
    with l as (
      select it.qty, it.unit_price, it.discount_amount, it.tax_included as ti_linea, it.tax_code,
             case p_source
               when 'invoice_purchase' then (select p.tax_included from public.invoice_purchase p where p.id = v_id)
               when 'support_documents' then (select d.tax_included from public.support_documents d where d.id = v_id)
               else (select f.tax_included from public.invoice_sales f where f.id = v_id)
             end as ti_doc,
             coalesce(
               nullif(round(case when coalesce(it.tax_rate, 0) > 1 then it.tax_rate
                                 else coalesce(it.tax_rate, 0) * 100 end, 2), 0),
               case when upper(coalesce(it.tax_code, '')) ~ '^IVA_[0-9]+(\.[0-9]+)?$'
                    then substring(upper(it.tax_code) from '^IVA_([0-9]+(?:\.[0-9]+)?)$')::numeric end,
               0) as t
        from public.invoice_items it
       where case p_source
               when 'invoice_purchase' then it.invoice_purchase_id = v_id
               when 'support_documents' then it.support_document_id = v_id
               else it.invoice_sales_id = v_id
             end
    ), b as (
      -- Base como el borrador del IVA: cantidad × precio − descuento; si el precio incluye IVA, se le quita.
      select l.t,
             abs(case when coalesce(l.ti_linea, l.ti_doc, false)
                      then (coalesce(l.qty, 0) * coalesce(l.unit_price, 0) - coalesce(l.discount_amount, 0)) / (1 + l.t / 100)
                      else coalesce(l.qty, 0) * coalesce(l.unit_price, 0) - coalesce(l.discount_amount, 0) end) as base
        from l
       where l.t > 0
         and upper(coalesce(l.tax_code, '')) not like 'INC%'
         and abs(l.t - 8) >= 0.05                -- INC (8 %): no es IVA (fn_impuesto_inc_parte)
    )
    select b.t, sum(b.base * b.t / 100)
      from b
     group by b.t;
    if found then
      return;
    end if;

    -- Nota crédito sin líneas todavía: el disparador de la nota (fn_auto_journal_credit_note) arma el asiento
    -- al insertar la cabecera, antes de las líneas. La tarifa sale de la factura que acredita: si el IVA/base
    -- de la nota coincide (±$1) con UNA de sus tarifas, esa; si no, la mezcla de tarifas de la factura.
    if p_source = 'invoice_sales' then
      select f.related_invoice_id, abs(coalesce(f.tax_total, 0)), abs(coalesce(f.subtotal, 0))
        into v_rel, v_iva_doc, v_base_doc
        from public.invoice_sales f
       where f.id = v_id and f.document_type = 'credit_note';
      if v_rel is not null and v_rel <> v_id then
        return query
        with w as (
          select x.tarifa, x.peso from public.fn_iva_pesos_por_tarifa(p_organization_id, 'invoice_sales', v_rel::text) x
        ), m as (
          select w.tarifa from w where w.tarifa is not null and abs(v_iva_doc - v_base_doc * w.tarifa / 100) <= 1
        )
        select w.tarifa, w.peso
          from w
         where (select count(*) from m) <> 1 or w.tarifa = (select m.tarifa from m);
      end if;
    end if;
    return;
  end if;
  -- Otros orígenes (folios, membresías, parqueadero…): sin líneas con tarifa → tarifa no identificada.
end;
$function$;

comment on function public.fn_iva_pesos_por_tarifa(integer, text, text) is
  'IVA de las líneas de un documento (sales, invoice_sales, invoice_purchase, support_documents) agrupado por tarifa; tarifa NULL = IVA sin tarifa identificable. Excluye INC.';

-- ── 4. Reparto del IVA de un asiento por tarifa, con su subcuenta ───────────────
create or replace function public.fn_iva_reparto(
  p_organization_id integer,
  p_branch_id integer,
  p_source text,
  p_source_id text,
  p_cuenta_regla text,
  p_iva numeric,
  p_lado text default null,
  p_decimales integer default 2
)
returns table(orden integer, tarifa numeric, lado text, cuenta text, iva numeric, motivo text)
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_lado text := public.fn_iva_lado(p_source, p_cuenta_regla, p_lado);
  v_dec integer := greatest(coalesce(p_decimales, 2), 0);
  v_total numeric := round(coalesce(p_iva, 0), greatest(coalesce(p_decimales, 2), 0));
  v_peso_total numeric := 0;
  v_n integer := 0;
  v_i integer := 0;
  v_asignado numeric := 0;
  v_parte numeric;
  v_f record;
  v_cta text;
begin
  if v_total <= 0 then
    return;
  end if;

  for v_f in
    select coalesce(w.tarifa, 19) as tarifa, sum(w.peso) as peso   -- sin tarifa identificada: 19 %
      from public.fn_iva_pesos_por_tarifa(p_organization_id, p_source, p_source_id) w
     where w.peso > 0
     group by coalesce(w.tarifa, 19)
  loop
    v_n := v_n + 1;
    v_peso_total := v_peso_total + v_f.peso;
  end loop;

  if v_n = 0 or v_peso_total <= 0 then
    v_cta := public.fn_cuenta_iva_tarifa(p_organization_id, p_branch_id, p_source, p_cuenta_regla, null, v_lado);
    orden := 1; tarifa := null; lado := v_lado; cuenta := v_cta; iva := v_total;
    motivo := case when v_cta is null then
      format('Falta la subcuenta de IVA %s de la tarifa general (19 %%): créela bajo %s en el plan de cuentas y asígnela en Impuestos o en Configuración contable; luego reintente este pendiente.',
             v_lado, case v_lado when 'descontable' then '240810' else '240805' end) end;
    return next;
    return;
  end if;

  for v_f in
    select coalesce(w.tarifa, 19) as tarifa, sum(w.peso) as peso
      from public.fn_iva_pesos_por_tarifa(p_organization_id, p_source, p_source_id) w
     where w.peso > 0
     group by coalesce(w.tarifa, 19)
     order by sum(w.peso), coalesce(w.tarifa, 19)        -- el residuo de redondeo va a la de más peso (la última)
  loop
    v_i := v_i + 1;
    if v_i = v_n then
      v_parte := v_total - v_asignado;
    else
      v_parte := round(v_total * v_f.peso / v_peso_total, v_dec);
      v_asignado := v_asignado + v_parte;
    end if;
    continue when v_parte = 0;
    v_cta := public.fn_cuenta_iva_tarifa(p_organization_id, p_branch_id, p_source, p_cuenta_regla, v_f.tarifa, v_lado);
    orden := v_i; tarifa := v_f.tarifa; lado := v_lado; cuenta := v_cta; iva := v_parte;
    motivo := case when v_cta is null then
      format('Falta la subcuenta de IVA %s al %s %%: créela bajo %s en el plan de cuentas y asígnela al impuesto de esa tarifa en Impuestos; luego reintente este pendiente.',
             v_lado, trim(trailing '.' from to_char(v_f.tarifa, 'FM990.99')), case v_lado when 'descontable' then '240810' else '240805' end) end;
    return next;
  end loop;
end;
$function$;

comment on function public.fn_iva_reparto(integer, integer, text, text, text, numeric, text, integer) is
  'Reparte el IVA de un asiento por las tarifas de las líneas del documento, con la subcuenta de cada tarifa y lado. La suma de iva es exactamente p_iva (redondeado a p_decimales). cuenta NULL + motivo = falta la subcuenta.';

-- ── 5. fn_cuenta_iva: misma firma, delega (tarifa no identificada) ──────────────
create or replace function public.fn_cuenta_iva(p_organization_id integer, p_branch_id integer, p_source text, p_cuenta_regla text)
returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  -- H1 (2026-11-08): antes devolvía la última cuenta de IVA mapeada sin mirar tarifa ni lado.
  select public.fn_cuenta_iva_tarifa(p_organization_id, p_branch_id, p_source, p_cuenta_regla, null, null);
$function$;

revoke all on function public.fn_iva_lado(text, text, text) from public, anon;
revoke all on function public.fn_cuenta_iva_tarifa(integer, integer, text, text, numeric, text) from public, anon;
revoke all on function public.fn_iva_pesos_por_tarifa(integer, text, text) from public, anon;
revoke all on function public.fn_iva_reparto(integer, integer, text, text, text, numeric, text, integer) from public, anon;
grant execute on function public.fn_iva_lado(text, text, text) to authenticated, service_role;
grant execute on function public.fn_cuenta_iva_tarifa(integer, integer, text, text, numeric, text) to authenticated, service_role;
grant execute on function public.fn_iva_pesos_por_tarifa(integer, text, text) to authenticated, service_role;
grant execute on function public.fn_iva_reparto(integer, integer, text, text, text, numeric, text, integer) to authenticated, service_role;

-- ── 6. Llamadores: reemplazos verificados ───────────────────────────────────────
create or replace function pg_temp.fn_reemplazo_verificado(p_def text, p_viejo text, p_nuevo text, p_etiqueta text)
returns text
language plpgsql
as $function$
declare
  v_veces integer := (length(p_def) - length(replace(p_def, p_viejo, ''))) / length(p_viejo);
begin
  if v_veces <> 1 then
    raise exception '%: se esperaba 1 aparición del texto a reemplazar y hay %', p_etiqueta, v_veces;
  end if;
  return replace(p_def, p_viejo, p_nuevo);
end;
$function$;

-- 6.1 fn_create_journal_entry
do $do$
declare
  v_firma constant regprocedure :=
    'public.fn_create_journal_entry(integer,integer,timestamp with time zone,text,text,text,text,text,numeric,text,numeric,uuid,boolean,text,uuid,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_tarifa_lado_20261108' in v_def) > 0 then
    raise notice 'fn_create_journal_entry ya reparte el IVA por tarifa';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  v_red jsonb;
  v_lineas jsonb;
begin$v$,
$v$  v_red jsonb;
  v_lineas jsonb;
  v_iva_lineas jsonb := '[]'::jsonb;
begin$v$, 'fn_create_journal_entry/declare');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  -- cuenta_iva_20261023: mapeo del impuesto, si no la configuración, si no la regla.
  if v_iva_regla is not null or p_tax_account is not null then
    p_tax_account := public.fn_cuenta_iva(
      p_organization_id, v_branch_id, p_source, coalesce(v_iva_regla, p_tax_account));
  end if;$v$,
$v$  -- iva_tarifa_lado_20261108 (H1): la subcuenta de IVA sale de la TARIFA de las líneas del documento y del
  -- LADO (generado / descontable); una línea de IVA por tarifa. Sin subcuenta: pendiente contable, sin asiento.
  if v_iva_regla is not null or p_tax_account is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'tarifa', r.tarifa, 'lado', r.lado, 'motivo', r.motivo, 'iva', r.iva,
             'cuenta', public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, r.cuenta)) order by r.orden), '[]'::jsonb)
      into v_iva_lineas
      from public.fn_iva_reparto(
             p_organization_id, v_branch_id, p_source, p_source_id, coalesce(v_iva_regla, p_tax_account),
             least(greatest(round(coalesce(p_tax_amount, 0), 0), 0), round(p_amount, 0)),
             null, 0) r;
    if exists (select 1 from jsonb_array_elements(v_iva_lineas) e where nullif(e->>'cuenta', '') is null) then
      perform fn_log_journal_failure(p_organization_id, v_branch_id, p_entry_date, p_source,
        p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
        'cuenta_no_configurada',
        (select string_agg(e->>'motivo', ' · ') from jsonb_array_elements(v_iva_lineas) e
          where nullif(e->>'cuenta', '') is null));
      return null;
    end if;
    p_tax_account := coalesce(v_iva_lineas->0->>'cuenta',
      public.fn_cuenta_iva_tarifa(p_organization_id, v_branch_id, p_source, coalesce(v_iva_regla, p_tax_account), null, null));
  end if;$v$, 'fn_create_journal_entry/cuenta');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$      perform public.fn_redondeo_pendiente_registrar($v$,
$v$      -- iva_tarifa_lado_20261108: la línea de IVA del pendiente se abre por tarifa, igual que en el asiento.
      if p_tax_account is not null and p_tax_amount > 0 and jsonb_array_length(v_iva_lineas) > 0 then
        v_lineas := jsonb_build_array(v_lineas->0)
          || (select jsonb_agg(jsonb_build_object('cuenta', x.e->>'cuenta', 'descripcion', 'IVA - ' || p_memo,
                 'debito', case when p_tax_is_credit then 0 else (x.e->>'iva')::numeric end,
                 'credito', case when p_tax_is_credit then (x.e->>'iva')::numeric else 0 end,
                 'cost_center_id', public.fn_centro_para_cuenta(p_organization_id, p_branch_id, x.e->>'cuenta', p_cost_center_id, p_cuenta_sin_centro))
                 order by x.o)
                from jsonb_array_elements(v_iva_lineas) with ordinality x(e, o))
          || jsonb_build_array(v_lineas->2);
      end if;
      perform public.fn_redondeo_pendiente_registrar($v$, 'fn_create_journal_entry/pendiente');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, 0, p_tax_amount, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_tax_account, p_cost_center_id, p_cuenta_sin_centro));$v$,
$v$      -- iva_tarifa_lado_20261108: una línea de IVA por tarifa (la suma es p_tax_amount).
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      select v_entry_id, x.e->>'cuenta', 'IVA - ' || p_memo, 0, (x.e->>'iva')::numeric, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, x.e->>'cuenta', p_cost_center_id, p_cuenta_sin_centro)
        from jsonb_array_elements(case when jsonb_array_length(v_iva_lineas) > 0 then v_iva_lineas
               else jsonb_build_array(jsonb_build_object('cuenta', p_tax_account, 'iva', p_tax_amount)) end) with ordinality x(e, o)
       order by x.o;$v$, 'fn_create_journal_entry/iva_credito');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      values (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, p_tax_account, p_cost_center_id, p_cuenta_sin_centro));$v$,
$v$      -- iva_tarifa_lado_20261108: una línea de IVA por tarifa (la suma es p_tax_amount).
      insert into journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id)
      select v_entry_id, x.e->>'cuenta', 'IVA - ' || p_memo, (x.e->>'iva')::numeric, 0, public.fn_centro_para_cuenta(p_organization_id, p_branch_id, x.e->>'cuenta', p_cost_center_id, p_cuenta_sin_centro)
        from jsonb_array_elements(case when jsonb_array_length(v_iva_lineas) > 0 then v_iva_lineas
               else jsonb_build_array(jsonb_build_object('cuenta', p_tax_account, 'iva', p_tax_amount)) end) with ordinality x(e, o)
       order by x.o;$v$, 'fn_create_journal_entry/iva_debito');

  execute v_def;
end;
$do$;

-- 6.2 fn_armar_asiento_documento
do $do$
declare
  v_firma constant regprocedure := 'public.fn_armar_asiento_documento(text,uuid,jsonb)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_tarifa_lado_20261108' in v_def) > 0 then
    raise notice 'fn_armar_asiento_documento ya reparte el IVA por tarifa';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  if v_tax > 0 and v_cfg.impuesto is not null then
    v_cuenta := public.fn_cuenta_movimiento_o_detalle(v_org, v_branch, v_cfg.impuesto);
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cuenta);
    if coalesce(v_exige.requiere_tercero, false) and v_nit is null and nullif(btrim(v_nombre), '') is null then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_cuenta,
      'descripcion', 'IVA - ' || v_memo,
      'debito', case when v_impuesto_al_credito then 0 else v_tax end,
      'credito', case when v_impuesto_al_credito then v_tax else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));
  end if;$v$,
$v$  -- iva_tarifa_lado_20261108 (H1): una línea de IVA por tarifa; la subcuenta sale de la tarifa y del lado.
  if v_tax > 0 and v_cfg.impuesto is not null then
    for v_fila in
      select r.cuenta, r.iva, r.motivo
        from public.fn_iva_reparto(v_org, v_branch, v_source, p_id::text, v_cfg.impuesto, v_tax,
               case when p_tipo in ('compra', 'documento_soporte') then 'descontable' else 'generado' end, 2) r
       order by r.orden
    loop
    if v_fila.cuenta is null then
      return jsonb_build_object('ok', false, 'fallo', v_fila.motivo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_cuenta := public.fn_cuenta_movimiento_o_detalle(v_org, v_branch, v_fila.cuenta);
    v_fallo := public.fn_validar_cuenta_movimiento(v_org, v_cuenta);
    if v_fallo is not null then
      return jsonb_build_object('ok', false, 'fallo', v_fallo, 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(v_org, v_cuenta);
    if coalesce(v_exige.requiere_tercero, false) and v_nit is null and nullif(btrim(v_nombre), '') is null then
      return jsonb_build_object('ok', false, 'fallo', 'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero', 'lineas', '[]'::jsonb, 'organization_id', v_org);
    end if;
    v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
      'cuenta', v_cuenta,
      'descripcion', 'IVA - ' || v_memo,
      'debito', case when v_impuesto_al_credito then 0 else v_fila.iva end,
      'credito', case when v_impuesto_al_credito then v_fila.iva else 0 end,
      'tercero_nit', v_nit,
      'tercero_nombre', v_nombre
    ));
    end loop;
  end if;$v$, 'fn_armar_asiento_documento/iva');

  execute v_def;
end;
$do$;

-- 6.3 fn_nc_asiento_devolucion
do $do$
declare
  v_firma constant regprocedure := 'public.fn_nc_asiento_devolucion(integer,uuid)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
begin
  if position('iva_tarifa_lado_20261108' in v_def) > 0 then
    raise notice 'fn_nc_asiento_devolucion ya reparte el IVA por tarifa';
    return;
  end if;

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$  insert into public.journal_entries (
    organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
  ) values ($v$,
$v$  -- iva_tarifa_lado_20261108 (H1): sin la subcuenta de una tarifa no se crea el asiento; queda el pendiente.
  if v_tax > 0 and v_rule.tax_account_code is not null and v_tax_cta is null and exists (
    select 1 from public.fn_iva_reparto(p_org, v_nc.branch_id, 'invoice_sales', p_nc::text,
                                        v_rule.tax_account_code, v_tax, 'generado', 2) r
     where r.cuenta is null) then
    perform public.fn_log_journal_failure(
      p_org, v_nc.branch_id, coalesce(v_nc.issue_date, now()),
      'invoice_sales', p_nc::text, 'accrual:credit_note:' || p_nc::text,
      null, v_rule.credit_account_code, v_total,
      'cuenta_no_configurada',
      (select string_agg(r.motivo, ' · ') from public.fn_iva_reparto(p_org, v_nc.branch_id, 'invoice_sales', p_nc::text,
                                        v_rule.tax_account_code, v_tax, 'generado', 2) r where r.cuenta is null));
    return;
  end if;

  insert into public.journal_entries (
    organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key
  ) values ($v$, 'fn_nc_asiento_devolucion/guarda');

  v_def := pg_temp.fn_reemplazo_verificado(v_def,
$v$    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
    ) values (
      v_entry,
      public.fn_puc_cuenta_de_sede(
        p_org, v_nc.branch_id,
        coalesce(v_tax_cta, public.fn_cuenta_iva(p_org, v_nc.branch_id, 'invoice_sales', v_rule.tax_account_code))),
      'IVA - Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      v_tax, 0, v_tax, 0
    );$v$,
$v$    -- iva_tarifa_lado_20261108: una línea de IVA por tarifa (la suma es v_tax).
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, debit_base, credit_base
    )
    select v_entry,
      public.fn_puc_cuenta_de_sede(p_org, v_nc.branch_id, coalesce(v_tax_cta, r.cuenta)),
      'IVA - Nota Crédito ' || coalesce(v_nc.number, p_nc::text),
      r.iva, 0, r.iva, 0
      from public.fn_iva_reparto(p_org, v_nc.branch_id, 'invoice_sales', p_nc::text,
             coalesce(v_tax_cta, v_rule.tax_account_code), v_tax, 'generado', 2) r
     order by r.orden;$v$, 'fn_nc_asiento_devolucion/iva');

  execute v_def;
end;
$do$;

-- 6.4 fn_auto_journal_purchase
do $do$
declare
  v_firma constant regprocedure := 'public.fn_auto_journal_purchase()'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
  v_nuevo constant text := $v$public.fn_cuenta_iva_tarifa(new.organization_id, new.branch_id, 'invoice_purchase', null, null, 'descontable')$v$;
begin
  if position(v_nuevo in v_def) > 0 then
    raise notice 'fn_auto_journal_purchase ya usa fn_cuenta_iva_tarifa';
    return;
  end if;
  v_def := pg_temp.fn_reemplazo_verificado(v_def,
    $v$public.fn_cuenta_iva(new.organization_id, new.branch_id, 'invoice_purchase', null)$v$,
    v_nuevo, 'fn_auto_journal_purchase/iva');
  execute v_def;
end;
$do$;

drop function if exists pg_temp.fn_reemplazo_verificado(text, text, text, text);
