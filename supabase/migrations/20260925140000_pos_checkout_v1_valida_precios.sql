-- Punto 3 (2026-09-24): precios y descuentos validados en el servidor.
--
-- pos_checkout_v1 aceptaba unit_price, discount_amount, tax_amount y total de
-- cada línea tal como llegaban del navegador: se podían manipular desde
-- localStorage (pos_carts_<org>) o llamando la RPC por PostgREST. En una venta
-- NUEVA la función ahora comprueba, por línea:
--   - el producto existe y es de la organización (antes no se miraba);
--   - precio = precio vigente de product_prices (effective_from <= t <
--     coalesce(effective_to, infinito)) + extras de los modificadores
--     configurados (product_modifiers del producto o de su padre), con 0,01 de
--     tolerancia de redondeo. t puede ser ahora, la fecha de la venta (venta
--     del escritorio sin red que se sincroniza después) o el momento en que la
--     línea entró al carrito (`priced_at`), estas dos solo dentro de los
--     últimos 30 días: un carrito abierto antes de un cambio de precio se
--     cobra al precio con que se armó, no a un precio viejo cualquiera;
--   - descuento <= cantidad × precio (la línea no puede quedar negativa);
--   - total e impuesto coherentes con la regla única de la línea
--     (neto = cantidad × precio − descuento; incluido: total = neto; si no,
--     total = neto + round(neto × tasa / 100, 2)), tolerancia 0,05.
-- No hay en el POS ningún flujo de precio manual (verificado: el carrito, la
-- mesa y «Nueva venta» toman el precio del catálogo), así que un precio
-- distinto se rechaza siempre; si algún día existe, irá con permiso propio.
--
-- Enganche (sin implementar) para el límite de descuento por rol y la
-- autorización de supervisor: fn_pos_autorizar_descuento, llamada por cada
-- línea con descuento; hoy no rechaza nada.
--
-- Además, en cualquier venta (nueva o repetida), las líneas de la factura y el
-- descuento de stock salen de sale_items ya guardados, no del sobre: repetir
-- un sale_id existente con un sobre fabricado ya no puede meter líneas
-- inventadas en la factura. Para conservar el modo de impuesto por línea en la
-- factura se añade sale_items.tax_included (NULL-able; NULL = el de la venta).
--
-- Base: definición de pos_checkout_v1 en la BD el 2026-09-24
-- (md5 3f9e33f74dfa8a8dfd27b66339e8ef8a, migración 20260925100100).

alter table public.sale_items add column if not exists tax_included boolean;
comment on column public.sale_items.tax_included is
  'Modo del impuesto de la línea (true = el precio lo incluye). NULL = el de la venta (sales.tax_included). Lo escribe pos_checkout_v1 y la mesa.';

-- ── Precio base vigente ─────────────────────────────────────────────────────
create or replace function public.fn_pos_precio_base_vigente(p_product_id integer, p_at timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select pp.price
    from public.product_prices pp
   where pp.product_id = p_product_id
     and pp.effective_from <= p_at
     and (pp.effective_to is null or pp.effective_to > p_at)
   order by pp.effective_from desc, pp.id desc
   limit 1
$$;

comment on function public.fn_pos_precio_base_vigente(integer, timestamptz) is
  'Precio de product_prices vigente en p_at (effective_from <= p_at < coalesce(effective_to, infinito)). Misma regla que src/lib/pos/precioVigente.ts.';

revoke all on function public.fn_pos_precio_base_vigente(integer, timestamptz) from public, anon, authenticated;

-- ── Extras de modificadores configurados ────────────────────────────────────
-- NULL si algún modificador no trae id o no pertenece al producto (o a su
-- padre) de la organización: la línea se rechaza.
create or replace function public.fn_pos_extra_modificadores(p_org integer, p_product_id integer, p_modifiers jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent integer;
  v_total  numeric := 0;
  v_m      jsonb;
  v_id     integer;
  v_extra  numeric;
begin
  if p_modifiers is null or jsonb_typeof(p_modifiers) <> 'array' or jsonb_array_length(p_modifiers) = 0 then
    return 0;
  end if;
  select p.parent_product_id into v_parent from public.products p where p.id = p_product_id;
  for v_m in select value from jsonb_array_elements(p_modifiers) loop
    v_id := nullif(coalesce(v_m->>'modifier_id', v_m->>'modifierId'), '')::integer;
    if v_id is null then
      return null;
    end if;
    select pm.extra_price into v_extra
      from public.product_modifiers pm
      join public.product_modifier_groups g on g.id = pm.group_id
     where pm.id = v_id
       and g.organization_id = p_org
       and g.product_id in (p_product_id, v_parent);
    if not found then
      return null;
    end if;
    v_total := v_total + coalesce(v_extra, 0);
  end loop;
  return v_total;
end;
$$;

revoke all on function public.fn_pos_extra_modificadores(integer, integer, jsonb) from public, anon, authenticated;

-- ── Enganche: límite de descuento por rol / autorización de supervisor ─────
-- Hoy no rechaza nada (el tope duro «descuento <= línea» lo aplica
-- pos_checkout_v1). Cuando exista docs/design/POS-AUTORIZACION-SUPERVISOR.md
-- aquí se comprobará el límite del rol del actor y, por encima, una
-- autorización vigente de supervisor que llegue en p_autorizacion.
create or replace function public.fn_pos_autorizar_descuento(p_org integer, p_actor uuid, p_linea jsonb, p_autorizacion jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return;
end;
$$;

revoke all on function public.fn_pos_autorizar_descuento(integer, uuid, jsonb, jsonb) from public, anon, authenticated;

-- ── Validación de una línea nueva (errores con código estable) ─────────────
create or replace function public.fn_pos_validar_linea_venta(
  p_org integer,
  p_actor uuid,
  p_item jsonb,
  p_created_at timestamptz,
  p_autorizacion jsonb
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_product  integer := nullif(p_item->>'product_id', '')::integer;
  v_qty      numeric := (p_item->>'quantity')::numeric;
  v_price    numeric := coalesce((p_item->>'unit_price')::numeric, 0);
  v_disc     numeric := coalesce((p_item->>'discount_amount')::numeric, 0);
  v_rate     numeric := coalesce((p_item->>'tax_rate')::numeric, 0);
  v_incl     boolean := coalesce((p_item->>'tax_included')::boolean, false);
  v_total    numeric := coalesce((p_item->>'total')::numeric, 0);
  v_tax      numeric := coalesce((p_item->>'tax_amount')::numeric, 0);
  v_mods     jsonb;
  v_extra    numeric;
  v_base     numeric;
  v_hay_base boolean := false;
  v_ok       boolean := false;
  v_momento  timestamptz;
  v_priced   timestamptz;
  v_net      numeric;
  v_exp_tax  numeric;
  v_exp_tot  numeric;
  v_nombre   text;
begin
  if v_product is null then
    raise exception 'producto_invalido' using errcode = '22023',
      detail = 'La línea no trae producto.';
  end if;
  select p.name into v_nombre from public.products p where p.id = v_product and p.organization_id = p_org;
  if not found then
    raise exception 'producto_invalido' using errcode = '22023',
      detail = format('El producto %s no es de la organización.', v_product);
  end if;

  if v_disc > round(v_qty * v_price, 2) + 0.01 then
    raise exception 'descuento_excede_linea' using errcode = '22023',
      detail = format('Producto %s: descuento %s mayor que la línea %s.', v_product, v_disc, round(v_qty * v_price, 2));
  end if;
  if v_disc > 0 then
    perform public.fn_pos_autorizar_descuento(p_org, p_actor, p_item, p_autorizacion);
  end if;

  -- Modificadores: los del sobre o, en sobres antiguos, los de las notas.
  v_mods := case
    when jsonb_typeof(p_item->'modifiers') = 'array'
         and exists (select 1 from jsonb_array_elements(p_item->'modifiers') m
                      where coalesce(m->>'modifier_id', m->>'modifierId') is not null)
      then p_item->'modifiers'
    when jsonb_typeof(p_item->'notes'->'modifiers') = 'array' then p_item->'notes'->'modifiers'
    else p_item->'modifiers'
  end;
  v_extra := public.fn_pos_extra_modificadores(p_org, v_product, v_mods);
  if v_extra is null then
    raise exception 'modificador_invalido' using errcode = '22023',
      detail = format('Producto %s: un modificador no está configurado para el producto.', v_product);
  end if;

  v_priced := nullif(p_item->>'priced_at', '')::timestamptz;
  for v_momento in
    select m from unnest(array[
      now(),
      case when p_created_at between now() - interval '30 days' and now() + interval '5 minutes' then p_created_at end,
      case when v_priced between now() - interval '30 days' and now() + interval '5 minutes' then v_priced end
    ]) m
    where m is not null
  loop
    v_base := public.fn_pos_precio_base_vigente(v_product, v_momento);
    if v_base is not null then
      v_hay_base := true;
      if abs(v_base + v_extra - v_price) <= 0.01 then
        v_ok := true;
        exit;
      end if;
    end if;
  end loop;
  if not v_hay_base then
    raise exception 'precio_no_vigente' using errcode = '22023',
      detail = format('«%s» (producto %s) no tiene precio vigente.', v_nombre, v_product);
  end if;
  if not v_ok then
    raise exception 'precio_no_coincide' using errcode = '22023',
      detail = format('«%s» (producto %s): precio enviado %s, vigente %s.', v_nombre, v_product, v_price,
                      public.fn_pos_precio_base_vigente(v_product, now()) + v_extra);
  end if;

  -- Regla única de la línea (la misma de POSService.checkout).
  if v_rate < 0 or v_rate > 100 then
    raise exception 'linea_incoherente' using errcode = '22023',
      detail = format('Producto %s: tasa de impuesto %s fuera de rango.', v_product, v_rate);
  end if;
  v_net := v_qty * v_price - v_disc;
  v_exp_tax := round(case when v_incl then v_net - v_net / (1 + v_rate / 100) else v_net * v_rate / 100 end, 2);
  v_exp_tot := case when v_incl then v_net else v_net + v_exp_tax end;
  if abs(v_total - v_exp_tot) > 0.05 or abs(v_tax - v_exp_tax) > 0.05 then
    raise exception 'linea_incoherente' using errcode = '22023',
      detail = format('Producto %s: total %s / impuesto %s; esperado %s / %s.', v_product, v_total, v_tax, v_exp_tot, v_exp_tax);
  end if;
end;
$$;

comment on function public.fn_pos_validar_linea_venta(integer, uuid, jsonb, timestamptz, jsonb) is
  'Valida una línea nueva de pos_checkout_v1: producto de la organización, precio vigente + modificadores, descuento <= línea, total e impuesto coherentes. Errores: producto_invalido, descuento_excede_linea, modificador_invalido, precio_no_vigente, precio_no_coincide, linea_incoherente.';

revoke all on function public.fn_pos_validar_linea_venta(integer, uuid, jsonb, timestamptz, jsonb) from public, anon, authenticated;

-- ── pos_checkout_v1 ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pos_checkout_v1(p_envelope jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org         integer;
  v_branch      integer;
  v_sale_id     uuid;
  v_created_at  timestamptz;
  v_user_id     uuid;   -- cajero: sales.user_id
  v_actor       uuid;   -- quien ejecuta: created_by de factura y pagos
  v_customer    uuid;
  v_currency    text;
  v_tax_included boolean;
  v_totals      jsonb;
  v_subtotal    numeric;
  v_tax_total   numeric;
  v_discount    numeric;
  v_total       numeric;
  v_total_paid  numeric;
  v_change      numeric;
  v_shipping    numeric;
  v_tip         numeric;
  v_balance     numeric;
  v_items       jsonb;
  v_items_total numeric;
  v_payments    jsonb;
  v_pay_sum     numeric;
  v_status      text;
  v_pay_status  text;
  v_sale        public.sales%rowtype;
  v_invoice     public.invoice_sales%rowtype;
  v_replayed    boolean := false;
  v_completed   text[] := '{}';
  v_warnings    text[] := '{}';
  v_item        jsonb;
  v_pay         jsonb;
  v_ord         integer;
  v_product_id  integer;
  v_qty         numeric;
  v_unit_price  numeric;
  v_sp          jsonb;
  v_sp_id       uuid;
  v_sp_rate     numeric;
  v_sp_type     text;
  v_inv         jsonb;
  v_prefix      text;
  v_max         integer;
  v_n           integer;
  v_number      text;
  v_first_method text;
  v_existing_payments integer;
  v_idx         integer;
  v_change_assigned boolean := false;
  v_takes_change boolean;
  v_payment_rows jsonb;
  v_desc        text;
  v_pname       text;
  v_parent_name text;
  v_mods        text;
  v_promos      uuid[];
  v_serial_ids  integer[];
  v_serial      record;
  v_payee_name  text;
  v_tip_server  uuid;
  v_tip_type    text;
  v_tip_method  text;
  v_si          record;
begin
  -- ── 1. Sobre ─────────────────────────────────────────────────────────────
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then
    raise exception 'Sobre de venta inválido' using errcode = '22023';
  end if;

  v_org        := (p_envelope->>'organization_id')::integer;
  v_branch     := (p_envelope->>'branch_id')::integer;
  v_sale_id    := (p_envelope->>'sale_id')::uuid;
  v_created_at := coalesce((p_envelope->>'created_at')::timestamptz, now());
  v_user_id    := nullif(p_envelope->>'user_id', '')::uuid;
  v_customer   := nullif(p_envelope->>'customer_id', '')::uuid;

  if v_org is null or v_branch is null or v_sale_id is null then
    raise exception 'El sobre necesita organization_id, branch_id y sale_id' using errcode = '22023';
  end if;

  -- ── 2. Guarda de pertenencia ─────────────────────────────────────────────
  -- Afirmación positiva incondicional: con anon `auth.uid()` es NULL y el
  -- EXISTS falla cerrado. Con service_role (sin sub en el JWT) el actor es el
  -- cajero del sobre, que igualmente debe ser miembro activo.
  v_actor := auth.uid();
  if v_actor is null and auth.role() = 'service_role' then
    v_actor := v_user_id;
  end if;
  if v_actor is null or not exists (
    select 1 from public.organization_members om
    where om.user_id = v_actor
      and om.organization_id = v_org
      and om.is_active
  ) then
    raise exception 'No perteneces a esta organización' using errcode = '42501';
  end if;
  v_user_id := coalesce(v_user_id, v_actor);

  if not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = v_org) then
    raise exception 'La sucursal % no pertenece a la organización', v_branch using errcode = '22023';
  end if;
  if v_customer is not null and not exists (
    select 1 from public.customers c where c.id = v_customer and c.organization_id = v_org
  ) then
    raise exception 'El cliente % no pertenece a la organización', v_customer using errcode = '22023';
  end if;

  -- ── 3. Totales e ítems: valores ya calculados, aquí solo se validan ──────
  v_totals       := coalesce(p_envelope->'totals', '{}'::jsonb);
  v_subtotal     := coalesce((v_totals->>'subtotal')::numeric, 0);
  v_tax_total    := coalesce((v_totals->>'tax_total')::numeric, 0);
  v_discount     := coalesce((v_totals->>'discount_total')::numeric, 0);
  v_total        := (v_totals->>'total')::numeric;
  v_total_paid   := coalesce((v_totals->>'total_paid')::numeric, 0);
  v_change       := coalesce((v_totals->>'change')::numeric, 0);
  v_shipping     := coalesce((v_totals->>'shipping_fee')::numeric, 0);
  v_tip          := coalesce((v_totals->>'tip_amount')::numeric, 0);
  v_tax_included := coalesce((p_envelope->>'tax_included')::boolean, false);
  v_items        := coalesce(p_envelope->'items', '[]'::jsonb);
  v_payments     := coalesce(p_envelope->'payments', '[]'::jsonb);

  if v_total is null or v_total < 0 then
    raise exception 'Total de la venta inválido' using errcode = '22023';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'La venta no tiene ítems' using errcode = '22023';
  end if;
  if v_tip < 0 or v_shipping < 0 or v_total_paid < 0 or v_change < 0 then
    raise exception 'Importes negativos en el sobre' using errcode = '22023';
  end if;

  v_items_total := 0;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Ítem con cantidad inválida (producto %)', v_item->>'product_id' using errcode = '22023';
    end if;
    if v_unit_price < 0 or coalesce((v_item->>'discount_amount')::numeric, 0) < 0 then
      raise exception 'Ítem con importes negativos (producto %)', v_item->>'product_id' using errcode = '22023';
    end if;
    v_items_total := v_items_total + coalesce((v_item->>'total')::numeric, 0);
  end loop;
  if abs(v_items_total + v_shipping + v_tip - v_total) > 0.05 then
    raise exception 'Totales incoherentes: ítems % + flete % + propina % ≠ total %',
      v_items_total, v_shipping, v_tip, v_total using errcode = '22023';
  end if;

  -- Punto 3: una venta NUEVA no se guarda con precios, descuentos o totales de
  -- línea manipulados. Una venta que ya existe (reproducción del mismo sobre,
  -- o la cartera de una mesa) no vuelve a insertar líneas: no se revalida.
  if not exists (select 1 from public.sales s where s.id = v_sale_id) then
    for v_item in select value from jsonb_array_elements(v_items) loop
      perform public.fn_pos_validar_linea_venta(v_org, v_actor, v_item, v_created_at, p_envelope->'discount_authorization');
    end loop;
    if abs(v_discount - (select coalesce(sum(coalesce((i->>'discount_amount')::numeric, 0)), 0)
                           from jsonb_array_elements(v_items) i)) > 0.05 then
      raise exception 'linea_incoherente' using errcode = '22023',
        detail = 'El descuento total no es la suma de los descuentos de las líneas.';
    end if;
  end if;

  v_pay_sum := 0;
  for v_pay in select value from jsonb_array_elements(v_payments) loop
    if coalesce((v_pay->>'amount')::numeric, 0) < 0 then
      raise exception 'Pago con importe negativo' using errcode = '22023';
    end if;
    v_pay_sum := v_pay_sum + coalesce((v_pay->>'amount')::numeric, 0);
  end loop;
  if abs(v_pay_sum - v_total_paid) > 0.05 then
    raise exception 'Pagos incoherentes: Σ pagos % ≠ total_paid %', v_pay_sum, v_total_paid using errcode = '22023';
  end if;

  v_balance    := greatest(0, v_total - v_total_paid);
  v_status     := case when v_total_paid >= v_total then 'paid' else 'pending' end;
  v_pay_status := case when v_total_paid >= v_total then 'paid' else 'partial' end;

  v_currency := coalesce(
    nullif(p_envelope->>'currency', ''),
    (select oc.currency_code from public.organization_currencies oc
      where oc.organization_id = v_org order by oc.is_base desc, oc.currency_code asc limit 1),
    'COP');

  v_sp      := case when jsonb_typeof(p_envelope->'salesperson') = 'object' then p_envelope->'salesperson' else null end;
  v_sp_id   := nullif(v_sp->>'id', '')::uuid;
  v_sp_rate := coalesce((v_sp->>'commission_rate')::numeric, 0);
  v_sp_type := coalesce(nullif(v_sp->>'commission_type', ''), 'none');
  if v_sp_id is null or v_sp_rate <= 0 then
    v_sp_type := 'none';
  end if;
  v_inv := coalesce(p_envelope->'invoice', '{}'::jsonb);

  -- ── 4. Venta (idempotente por id) ────────────────────────────────────────
  perform pg_advisory_xact_lock(hashtext('pos_checkout:' || v_sale_id::text));

  select * into v_sale from public.sales s where s.id = v_sale_id for update;
  if found then
    if v_sale.organization_id <> v_org then
      raise exception 'La venta pertenece a otra organización' using errcode = '42501';
    end if;
    v_replayed := true;
  else
    begin
      insert into public.sales (
        id, created_at, organization_id, branch_id, customer_id, user_id,
        subtotal, tax_total, discount_total, total, balance,
        status, payment_status, tax_included, tax_breakdown, sale_date,
        salesperson_id, commission_rate, commission_type, delivery_fee, tip_amount
      ) values (
        v_sale_id, v_created_at, v_org, v_branch, v_customer, v_user_id,
        v_subtotal, v_tax_total, v_discount, v_total, v_balance,
        v_status, v_pay_status, v_tax_included,
        case when jsonb_typeof(p_envelope->'tax_breakdown') in ('array', 'object') then p_envelope->'tax_breakdown' else null end,
        v_created_at,
        v_sp_id, coalesce((v_sp->>'commission_rate')::numeric, 0),
        case when v_sp_type in ('salesperson', 'intermediation_sale') then v_sp_type else 'none' end,
        case when v_shipping > 0 then v_shipping else 0 end,
        case when v_tip > 0 then v_tip else null end
      ) returning * into v_sale;
    exception when unique_violation then
      -- Otra reproducción insertó el mismo id entre el SELECT y el INSERT.
      select * into v_sale from public.sales s where s.id = v_sale_id;
      if v_sale.id is null or v_sale.organization_id <> v_org then
        raise;
      end if;
      v_replayed := true;
    end;
  end if;

  -- ── 5. Promociones (estadística; solo en venta nueva, como en Node) ──────
  v_promos := array(
    select x::uuid from jsonb_array_elements_text(coalesce(p_envelope->'promotion_ids', '[]'::jsonb)) x
  );
  if not v_replayed and cardinality(v_promos) > 0 then
    begin
      perform public.increment_promotion_usage(v_org, v_promos);
    exception when others then
      v_warnings := array_append(v_warnings, 'promociones: ' || sqlerrm);
    end;
  end if;

  -- ── 6. Comisión (no bloquea; una sola por venta) ─────────────────────────
  if v_sp_type <> 'none' and not exists (
    select 1 from public.commissions c where c.source_type = 'sale' and c.source_id = v_sale_id::text
  ) then
    begin
      select nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
        into v_payee_name from public.profiles p where p.id = v_sp_id;
      insert into public.commissions (
        organization_id, branch_id, commission_type, source_type, source_id,
        payee_type, payee_id, payee_name, base_amount, commission_rate, commission_amount,
        currency, status, accrued_at, created_by, metadata
      ) values (
        v_org, v_branch, v_sp_type, 'sale', v_sale_id::text,
        'employee', v_sp_id, coalesce(v_payee_name, 'N/A'),
        coalesce((v_sp->>'base_amount')::numeric, v_subtotal), v_sp_rate,
        coalesce((v_sp->>'commission_amount')::numeric, 0),
        v_currency, 'accrued', now(), v_actor,
        jsonb_build_object('sale_id', v_sale_id, 'commission_method', coalesce(nullif(v_sp->>'commission_method', ''), 'percentage'))
      );
      if v_replayed then v_completed := array_append(v_completed, 'commissions'); end if;
    exception when others then
      v_warnings := array_append(v_warnings, 'comisión: ' || sqlerrm);
    end;
  end if;

  -- ── 7. Líneas de venta ───────────────────────────────────────────────────
  if not exists (select 1 from public.sale_items si where si.sale_id = v_sale_id) then
    insert into public.sale_items (
      sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes, tax_included
    )
    select
      v_sale_id,
      nullif(i.value->>'product_id', '')::integer,
      (i.value->>'quantity')::numeric,
      coalesce((i.value->>'unit_price')::numeric, 0),
      coalesce((i.value->>'total')::numeric, 0),
      coalesce((i.value->>'tax_amount')::numeric, 0),
      coalesce((i.value->>'tax_rate')::numeric, 0),
      coalesce((i.value->>'discount_amount')::numeric, 0),
      case when jsonb_typeof(i.value->'notes') = 'object' then i.value->'notes' else null end,
      (i.value->>'tax_included')::boolean
    from jsonb_array_elements(v_items) with ordinality as i(value, ord)
    order by i.ord;
    if v_replayed then v_completed := array_append(v_completed, 'sale_items'); end if;
  end if;

  -- ── 8. Stock y seriales (no bloquean; un solo descuento por venta) ───────
  -- Las cantidades salen de sale_items guardados (no del sobre).
  if not exists (
    select 1 from public.stock_movements sm
    where sm.source in ('sale', 'mesa_sale') and sm.source_id = v_sale_id::text
  ) then
    for v_si in
      select si.product_id, si.quantity, si.unit_price
        from public.sale_items si
       where si.sale_id = v_sale_id and si.product_id is not null and si.quantity > 0
       order by si.created_at, si.id
    loop
      begin
        perform public.decrement_stock_with_recipe(
          v_org, v_branch, v_si.product_id, v_si.quantity, 'sale', v_sale_id::text, v_si.unit_price, v_user_id
        );
      exception when others then
        v_warnings := array_append(v_warnings, 'stock producto ' || v_si.product_id || ': ' || sqlerrm);
      end;
    end loop;

    for v_item, v_ord in select i.value, i.ord from jsonb_array_elements(v_items) with ordinality as i(value, ord) order by i.ord loop
      v_product_id := nullif(v_item->>'product_id', '')::integer;
      v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
      if v_product_id is null then continue; end if;
      v_serial_ids := array(
        select x::integer from jsonb_array_elements_text(coalesce(v_item->'serial_ids', '[]'::jsonb)) x
      );
      if cardinality(v_serial_ids) > 0 then
        for v_serial in
          select sn.id, sn.status, sn.organization_id, sn.current_branch_id, sn.product_id
          from public.serial_numbers sn where sn.id = any(v_serial_ids)
        loop
          if v_serial.organization_id <> v_org then
            v_warnings := array_append(v_warnings, 'serial ' || v_serial.id || ': de otra organización');
            continue;
          end if;
          if v_serial.status not in ('in_stock', 'reserved') then
            v_warnings := array_append(v_warnings, 'serial ' || v_serial.id || ': estado ' || v_serial.status || ', no disponible');
            continue;
          end if;
          update public.serial_numbers set
            status = 'sold', sale_channel = 'pos', sale_date = now(), sale_id = v_sale_id::text,
            sold_to_customer_id = v_customer, sold_by_user_id = v_user_id, price_at_sale = v_unit_price,
            current_branch_id = v_branch, updated_at = now(), updated_by = v_user_id
          where id = v_serial.id;
          insert into public.serial_tracking_events (
            serial_number_id, organization_id, event_type, from_status, to_status, to_branch_id,
            source_table, source_id, sale_id, customer_id, performed_by
          ) values (
            v_serial.id, v_org, 'sold', v_serial.status, 'sold', v_branch,
            'sales', v_sale_id::text, v_sale_id, v_customer, v_user_id
          );
        end loop;
      end if;
    end loop;
    if v_replayed then v_completed := array_append(v_completed, 'stock'); end if;
  end if;

  -- ── 9. Factura (se reutiliza si ya existe: no consume otro consecutivo) ──
  select * into v_invoice from public.invoice_sales inv
  where inv.sale_id = v_sale_id and inv.organization_id = v_org
  order by inv.created_at asc limit 1;

  select p.value->>'method' into v_first_method
  from jsonb_array_elements(v_payments) with ordinality as p(value, ord) order by p.ord limit 1;

  if v_invoice.id is null then
    v_prefix := coalesce(nullif(v_inv->>'prefix', ''), 'FACT');
    -- Misma regla que generateInvoiceNumber: máximo secuencial (1-7 dígitos,
    -- ignorando sufijos y respaldos con timestamp) + 1, saltando los usados.
    perform pg_advisory_xact_lock(hashtext('invoice_number:' || v_org::text));
    select coalesce(max(substring(inv.number from ('(?i)' || v_prefix || '\s*-\s*(\d{1,7})(?:\D|$)'))::integer), 0)
      into v_max
    from public.invoice_sales inv
    where inv.organization_id = v_org and inv.number like v_prefix || '-%';
    v_n := v_max + 1;
    v_number := v_prefix || '-' || lpad(v_n::text, 4, '0');
    while exists (
      select 1 from public.invoice_sales inv
      where inv.organization_id = v_org
        and upper(regexp_replace(trim(inv.number), '\s+', ' ', 'g')) = v_number
    ) loop
      v_n := v_n + 1;
      v_number := v_prefix || '-' || lpad(v_n::text, 4, '0');
    end loop;

    insert into public.invoice_sales (
      organization_id, branch_id, customer_id, sale_id, number, issue_date, due_date, currency,
      subtotal, tax_total, total, balance, status, tax_included, payment_method, payment_terms,
      created_by, notes, salesperson_id, commission_rate, commission_type, commission_method, commission_amount
    ) values (
      v_org, v_branch, v_customer, v_sale_id, v_number, v_created_at, v_created_at, v_currency,
      v_subtotal, v_tax_total, v_total, v_sale.balance,
      case when v_sale.balance > 0 then 'partial' else 'paid' end,
      v_tax_included, coalesce(v_first_method, 'cash'), 0,
      v_actor, 'Factura generada automáticamente desde POS - Venta #' || v_sale_id::text,
      v_sp_id, coalesce((v_sp->>'commission_rate')::numeric, 0),
      case when v_sp_type <> 'none' then v_sp_type else 'none' end,
      coalesce(nullif(v_sp->>'commission_method', ''), 'percentage'),
      coalesce((v_inv->>'commission_amount')::numeric, 0)
    ) returning * into v_invoice;
    if v_replayed then v_completed := array_append(v_completed, 'invoice_sales'); end if;
  end if;

  -- ── 10. Pagos (antes que invoice_items; solo los que faltan, en orden) ───
  select count(*) into v_existing_payments
  from public.payments p where p.source = 'invoice_sales' and p.source_id = v_invoice.id::text;

  v_idx := 0;
  for v_pay, v_ord in select p.value, p.ord from jsonb_array_elements(v_payments) with ordinality as p(value, ord) order by p.ord loop
    if coalesce((v_pay->>'amount')::numeric, 0) <= 0 then continue; end if;
    -- El cambio se asigna al primer pago en efectivo, exista ya o no.
    v_takes_change := (not v_change_assigned) and v_change > 0 and (v_pay->>'method') = 'cash';
    if v_takes_change then v_change_assigned := true; end if;
    if v_idx < v_existing_payments then
      v_idx := v_idx + 1;
      continue;
    end if;
    v_idx := v_idx + 1;
    insert into public.payments (
      organization_id, branch_id, amount, method, currency, status, change_amount,
      source, source_id, created_by
    ) values (
      v_org, v_branch, (v_pay->>'amount')::numeric, v_pay->>'method', v_currency, 'completed',
      case when v_takes_change then v_change else 0 end,
      'invoice_sales', v_invoice.id::text, v_actor
    );
    if v_replayed and not ('payments' = any(v_completed)) then v_completed := array_append(v_completed, 'payments'); end if;
  end loop;

  -- ── 11. Líneas de factura (de sale_items guardados, no del sobre) ───────
  if not exists (select 1 from public.invoice_items ii where ii.invoice_id = v_invoice.id) then
    for v_si in
      select si.* from public.sale_items si
       where si.sale_id = v_sale_id and si.quantity > 0
       order by si.created_at, si.id
    loop
      v_pname := null; v_parent_name := null; v_mods := null;
      if v_si.product_id is not null then
        select p.name, pp.name into v_pname, v_parent_name
        from public.products p left join public.products pp on pp.id = p.parent_product_id
        where p.id = v_si.product_id and p.organization_id = v_org;
      end if;
      v_desc := coalesce(v_pname, nullif(v_si.notes->>'product_name', ''), 'Producto ID: ' || coalesce(v_si.product_id::text, '?'));
      if v_pname is not null and v_parent_name is not null then
        v_desc := v_parent_name || ' - ' || v_desc;
      end if;
      select string_agg(m.value->>'name', ', ') into v_mods
      from jsonb_array_elements(case when jsonb_typeof(v_si.notes->'modifiers') = 'array' then v_si.notes->'modifiers' else '[]'::jsonb end) m
      where coalesce(m.value->>'name', '') <> '';
      if v_mods is not null then
        v_desc := v_desc || ' (' || v_mods || ')';
      end if;

      insert into public.invoice_items (
        invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
        total_line, tax_rate, tax_included, discount_amount, note
      ) values (
        v_invoice.id, v_invoice.id, 'sale', v_si.product_id, left(v_desc, 255),
        v_si.quantity, coalesce(v_si.unit_price, 0),
        coalesce(v_si.total, 0), coalesce(v_si.tax_rate, 0),
        coalesce(v_si.tax_included, v_tax_included),
        coalesce(v_si.discount_amount, 0),
        nullif(left(btrim(coalesce(v_si.notes->>'customer_note', '')), 250), '')
      );
    end loop;
    if v_replayed then v_completed := array_append(v_completed, 'invoice_items'); end if;
  end if;

  -- ── 12. Propina ──────────────────────────────────────────────────────────
  if v_tip > 0 and not exists (select 1 from public.tips t where t.sale_id = v_sale_id) then
    v_tip_server := coalesce(nullif(p_envelope->'tip'->>'server_id', '')::uuid, v_user_id);
    -- tips.tip_type solo admite cash/card/split/pooled (CHECK). Todo lo que
    -- no es efectivo —tarjeta, datáfono, transferencia, QR Bre-B/Nequi/Bold—
    -- es propina electrónica → 'card'. Se mira el primer pago con importe,
    -- no el primer elemento del sobre: misma regla que el camino de respaldo
    -- de POSService.checkout (2026-09-22).
    select p.value->>'method' into v_tip_method
    from jsonb_array_elements(v_payments) with ordinality as p(value, ord)
    where coalesce((p.value->>'amount')::numeric, 0) > 0
    order by p.ord limit 1;
    v_tip_type := case when coalesce(v_tip_method, 'cash') = 'cash' then 'cash' else 'card' end;
    insert into public.tips (
      organization_id, branch_id, sale_id, server_id, amount, tip_type, is_distributed, notes
    ) values (
      v_org, v_branch, v_sale_id, v_tip_server, v_tip, v_tip_type, false,
      'Propina de venta #' || right(v_sale_id::text, 8)
    );
    if v_replayed then v_completed := array_append(v_completed, 'tips'); end if;
  end if;

  -- ── 13. Resultado (filas frescas: los disparadores ya recalcularon) ──────
  select * into v_sale from public.sales s where s.id = v_sale_id;
  select * into v_invoice from public.invoice_sales inv where inv.id = v_invoice.id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at, p.id), '[]'::jsonb) into v_payment_rows
  from public.payments p where p.source = 'invoice_sales' and p.source_id = v_invoice.id::text;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'invoice', to_jsonb(v_invoice),
    'payments', v_payment_rows,
    'replayed', v_replayed,
    'completed', to_jsonb(v_completed),
    'warnings', to_jsonb(v_warnings)
  );
end;
$function$;

revoke all on function public.pos_checkout_v1(jsonb) from public, anon;
grant execute on function public.pos_checkout_v1(jsonb) to authenticated, service_role;
