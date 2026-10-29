-- 20261028180000 · Métodos de pago por sucursal y promociones por método de pago
-- NO APLICADA EN PROD: la aplica Juan tras revisarla.
-- 1) organization_payment_methods.branch_ids integer[] NULL (NULL = todas las sucursales,
--    igual que promotions.branches). Las filas existentes quedan en NULL.
-- 2) promotions.payment_method_codes text[] NULL (NULL = cualquier método).
-- 3) pos_checkout_v1: misma definición que hoy en prod (pg_get_functiondef del 2026-10-28)
--    más el bloque 4b, que valida ambas reglas.

alter table public.organization_payment_methods
  add column if not exists branch_ids integer[] null;
comment on column public.organization_payment_methods.branch_ids is
  'Sucursales donde se puede cobrar con este método. NULL = todas.';
create index if not exists idx_opm_branch_ids_gin
  on public.organization_payment_methods using gin (branch_ids)
  where branch_ids is not null;

create or replace function public.fn_opm_validar_branch_ids()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.branch_ids is not null then
    if cardinality(new.branch_ids) = 0 then
      new.branch_ids := null;  -- lista vacía = todas
    elsif exists (
      select 1 from unnest(new.branch_ids) b(id)
       where not exists (select 1 from public.branches br
                          where br.id = b.id and br.organization_id = new.organization_id)
    ) then
      raise exception 'Las sucursales del método de pago deben ser de la misma organización'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_opm_validar_branch_ids on public.organization_payment_methods;
create trigger trg_opm_validar_branch_ids
  before insert or update of branch_ids, organization_id on public.organization_payment_methods
  for each row execute function public.fn_opm_validar_branch_ids();

alter table public.promotions
  add column if not exists payment_method_codes text[] null;
comment on column public.promotions.payment_method_codes is
  'Códigos de método de pago con los que aplica la promoción. NULL = cualquiera.';

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
  v_hora_equipo timestamptz;   -- Hora oficial (20260930190003): la que mandó el equipo
  v_sin_conexion boolean;
  v_desfase_ms  bigint;
  v_revision    text;
  v_hora_precio timestamptz;
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
  v_pm_bloq     text;       -- 20261028180000: método no permitido en la sucursal
  v_promo_bloq  text;       -- 20261028180000: promoción sin el método de cobro exigido
  v_serial_ids  integer[];
  v_serial      record;
  v_payee_name  text;
  v_tip_server  uuid;
  v_tip_type    text;
  v_tip_method  text;
  v_si          record;
  v_mode        text;       -- 'sale' (venta nueva) | 'debt' (venta nueva a crédito) | 'settle' (cobrar una venta que ya existe)
  v_key         uuid;       -- settle: intento de cobro (idempotencia de pagos y propina)
  v_cobro       public.pos_cobros%rowtype;
  v_debt        jsonb;
  v_terms       integer;
  v_pagado      numeric;
  v_pay_ids     uuid[] := '{}';
  v_pay_id      uuid;
  v_lineas_nuevas boolean := false;
  v_mesa        uuid;       -- settle de una mesa: su sesión
  v_tol         numeric;    -- Cuenta dividida (20260929060000): tolerancia de redondeo de la moneda
  v_abono       numeric;    -- lo que este cobro abona a las líneas (pagos − cambio − propina − flete)
  v_porcion     numeric;
  v_saldo_antes numeric;
  v_membresias  jsonb;      -- Membresías (20260929001100): activadas o pendientes por esta venta
begin
  -- ── 1. Sobre ─────────────────────────────────────────────────────────────
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then
    raise exception 'Sobre de venta inválido' using errcode = '22023';
  end if;

  v_org        := (p_envelope->>'organization_id')::integer;
  v_branch     := (p_envelope->>'branch_id')::integer;
  v_sale_id    := (p_envelope->>'sale_id')::uuid;
  -- Hora oficial (20260930190003): la pone el servidor. La del sobre es la del
  -- equipo: se guarda en sales.device_created_at y solo cuenta en una venta
  -- sin conexión con el desfase medido ≤ 10 min (fn_hora_oficial_resolver).
  v_hora_equipo  := nullif(p_envelope->>'created_at', '')::timestamptz;
  v_sin_conexion := coalesce(nullif(p_envelope->>'offline', '')::boolean, false);
  v_desfase_ms   := nullif(p_envelope->>'clock_offset_ms', '')::numeric::bigint;
  select r.instante, r.motivo_revision into v_created_at, v_revision
    from public.fn_hora_oficial_resolver(v_hora_equipo, v_desfase_ms, v_sin_conexion) r;
  -- Precio vigente al momento real de la venta: sin conexión, la hora del equipo (nunca futura).
  v_hora_precio  := case when v_sin_conexion then least(coalesce(v_hora_equipo, now()), now()) else now() end;
  v_user_id    := nullif(p_envelope->>'user_id', '')::uuid;
  v_customer   := nullif(p_envelope->>'customer_id', '')::uuid;

  if v_org is null or v_branch is null or v_sale_id is null then
    raise exception 'El sobre necesita organization_id, branch_id y sale_id' using errcode = '22023';
  end if;

  -- Punto 6: un solo cobro para la venta de mostrador, la venta a crédito
  -- (deuda) y el cobro de una venta que ya existe (deuda, mesa).
  v_mode := coalesce(nullif(p_envelope->>'mode', ''), 'sale');
  if v_mode not in ('sale', 'debt', 'settle') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  v_key := nullif(p_envelope->>'payment_key', '')::uuid;
  if v_mode = 'settle' and v_key is null then
    raise exception 'El cobro de una venta existente necesita payment_key' using errcode = '22023';
  end if;
  v_debt := case when jsonb_typeof(p_envelope->'debt') = 'object' then p_envelope->'debt' else '{}'::jsonb end;
  v_terms := coalesce(nullif(v_debt->>'payment_terms', '')::integer, 30);
  if v_terms < 0 or v_terms > 3650 then
    raise exception 'plazo_invalido' using errcode = '22023';
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
  if jsonb_typeof(v_items) <> 'array' or (v_mode <> 'settle' and jsonb_array_length(v_items) = 0) then
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
  if v_mode <> 'settle' and abs(v_items_total + v_shipping + v_tip - v_total) > 0.05 then
    raise exception 'Totales incoherentes: ítems % + flete % + propina % ≠ total %',
      v_items_total, v_shipping, v_tip, v_total using errcode = '22023';
  end if;

  -- Punto 3: una venta NUEVA no se guarda con precios, descuentos o totales de
  -- línea manipulados. Una venta que ya existe (reproducción del mismo sobre,
  -- o la cartera de una mesa) no vuelve a insertar líneas: no se revalida.
  if v_mode <> 'settle' and not exists (select 1 from public.sales s where s.id = v_sale_id) then
    for v_item in select value from jsonb_array_elements(v_items) loop
      perform public.fn_pos_validar_linea_venta(v_org, v_actor, v_item, v_hora_precio, p_envelope->'discount_authorization', v_branch, v_sin_conexion);
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

  -- Deuda (antes holdCartWithDebt: N inserts desde el navegador). Mismas
  -- reglas: exige cliente; no exige caja; nace sin pagos y pendiente.
  if v_mode = 'debt' then
    if v_customer is null then
      raise exception 'deuda_sin_cliente' using errcode = '22023';
    end if;
    if v_total_paid > 0 or v_pay_sum > 0 then
      raise exception 'deuda_con_pagos' using errcode = '22023';
    end if;
    if v_total <= 0 then
      raise exception 'Total de la venta inválido' using errcode = '22023';
    end if;
    v_balance    := v_total;
    v_status     := 'pending';
    v_pay_status := 'pending';
  end if;

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

  if v_mode = 'settle' then
    -- ── 4b. Cobrar una venta que ya existe (deuda, mesa) ───────────────────
    select * into v_sale from public.sales s where s.id = v_sale_id for update;
    if not found then
      raise exception 'venta_no_encontrada' using errcode = 'P0002';
    end if;
    if v_sale.organization_id <> v_org then
      raise exception 'La venta pertenece a otra organización' using errcode = '42501';
    end if;
    -- Reintento del MISMO intento: se devuelve lo que ya quedó, sin escribir.
    select * into v_cobro from public.pos_cobros c where c.id = v_key;
    if found then
      if v_cobro.sale_id <> v_sale_id or v_cobro.organization_id <> v_org then
        raise exception 'cobro_de_otra_venta' using errcode = '22023';
      end if;
      select * into v_invoice from public.invoice_sales inv
      where inv.sale_id = v_sale_id and inv.organization_id = v_org and coalesce(inv.document_type, 'invoice') = 'invoice'
      order by inv.created_at asc limit 1;
      select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at, p.id), '[]'::jsonb) into v_payment_rows
      from public.payments p where p.id = any(v_cobro.payment_ids);
      return jsonb_build_object(
        'sale', to_jsonb(v_sale), 'invoice', to_jsonb(v_invoice), 'payments', v_payment_rows,
        'replayed', true, 'completed', '[]'::jsonb, 'warnings', '[]'::jsonb,
        'mode', v_mode, 'payment_key', v_key);
    end if;
    if v_sale.status = 'void' then
      raise exception 'venta_anulada' using errcode = '22023';
    end if;
    -- Cuenta dividida (20260929060000): pagada = saldo dentro de la tolerancia de la moneda.
    v_tol := public.fn_pos_tolerancia_moneda(v_org);
    if v_sale.status = 'paid' and coalesce(v_sale.balance, 0) <= v_tol then
      raise exception 'venta_ya_pagada' using errcode = '22023';
    end if;

    -- ── Mesa (punto 1): la cuenta se cobra con el mismo cobro del mostrador ─
    v_mesa := nullif(p_envelope->>'table_session_id', '')::uuid;
    if v_mesa is not null then
      if not exists (
        select 1 from public.table_sessions ts
         where ts.id = v_mesa and ts.organization_id = v_org and ts.sale_id = v_sale_id
           and ts.status in ('active', 'bill_requested')
      ) then
        raise exception 'sesion_mesa_invalida' using errcode = '22023';
      end if;
      -- Tasa y modo de impuesto de cada línea: los del motor del cobro (igual
      -- que en mostrador); cantidad, precio y descuento: los de la base.
      for v_item in select value from jsonb_array_elements(v_items) loop
        if coalesce(v_item->>'sale_item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          update public.sale_items si set
            tax_rate     = greatest(0, least(100, coalesce((v_item->>'tax_rate')::numeric, 0))),
            tax_included = coalesce((v_item->>'tax_included')::boolean, v_tax_included),
            updated_at   = now()
          where si.id = (v_item->>'sale_item_id')::uuid and si.sale_id = v_sale_id and si.paid_at is null;
        end if;
      end loop;
      perform public.fn_pos_recalcular_venta(v_sale_id);
      -- Punto 3 también en la mesa: sus líneas las escribió el navegador al
      -- pedir; precio vigente (al pedir o ahora), modificadores y descuento se
      -- validan al cobrar.
      for v_si in
        select si.* from public.sale_items si
         where si.sale_id = v_sale_id and si.paid_at is null and si.quantity > 0
      loop
        perform public.fn_pos_validar_linea_venta(v_org, v_actor, jsonb_build_object(
          'product_id', v_si.product_id, 'quantity', v_si.quantity, 'unit_price', v_si.unit_price,
          'discount_amount', coalesce(v_si.discount_amount, 0), 'tax_rate', coalesce(v_si.tax_rate, 0),
          'tax_included', coalesce(v_si.tax_included, false), 'total', v_si.total,
          'tax_amount', coalesce(v_si.tax_amount, 0), 'notes', coalesce(v_si.notes, '{}'::jsonb),
          'priced_at', v_si.created_at), v_si.created_at, null, coalesce((select s.branch_id from public.sales s where s.id = v_sale_id), v_branch), false);
      end loop;
      select * into v_sale from public.sales s where s.id = v_sale_id;
    end if;

    v_customer := coalesce(v_customer, v_sale.customer_id);
    -- Propina y flete de ESTE cobro se suman a la venta (total = líneas +
    -- flete + propina, igual que en mostrador).
    update public.sales set
      table_session_id = coalesce(table_session_id, v_mesa),
      customer_id     = coalesce(customer_id, v_customer),
      tip_amount      = case when v_tip > 0 then coalesce(tip_amount, 0) + v_tip else tip_amount end,
      tip_server_id   = case when v_tip > 0 then coalesce(nullif(p_envelope->'tip'->>'server_id', '')::uuid, tip_server_id, v_user_id) else tip_server_id end,
      delivery_fee    = coalesce(delivery_fee, 0) + v_shipping,
      total           = coalesce(total, 0) + v_tip + v_shipping,
      salesperson_id  = case when v_sp_type <> 'none' and salesperson_id is null then v_sp_id else salesperson_id end,
      commission_rate = case when v_sp_type <> 'none' and salesperson_id is null then v_sp_rate else commission_rate end,
      commission_type = case when v_sp_type <> 'none' and salesperson_id is null then v_sp_type else commission_type end,
      updated_at      = now()
    where id = v_sale_id
    returning * into v_sale;
    v_subtotal     := coalesce(v_sale.subtotal, 0);
    v_tax_total    := coalesce(v_sale.tax_total, 0);
    v_discount     := coalesce(v_sale.discount_total, 0);
    v_total        := coalesce(v_sale.total, 0);
    v_tax_included := coalesce(v_sale.tax_included, false);
  else

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
        salesperson_id, commission_rate, commission_type, delivery_fee, tip_amount, notes,
        device_created_at, clock_skew_seconds, time_review_reason
      ) values (
        v_sale_id, v_created_at, v_org, v_branch, v_customer, v_user_id,
        v_subtotal, v_tax_total, v_discount, v_total, v_balance,
        v_status, v_pay_status, v_tax_included,
        case when jsonb_typeof(p_envelope->'tax_breakdown') in ('array', 'object') then p_envelope->'tax_breakdown' else null end,
        v_created_at,
        v_sp_id, coalesce((v_sp->>'commission_rate')::numeric, 0),
        case when v_sp_type in ('salesperson', 'intermediation_sale') then v_sp_type else 'none' end,
        case when v_shipping > 0 then v_shipping else 0 end,
        case when v_tip > 0 then v_tip else null end,
        case when v_mode = 'debt'
          then 'Venta con deuda - ' || coalesce(nullif(btrim(v_debt->>'reason'), ''), 'Sin motivo especificado')
          else null end,
        v_hora_equipo,
        greatest(-2000000000, least(2000000000, case
          when v_sin_conexion then v_desfase_ms / 1000
          when v_hora_equipo is not null then round(extract(epoch from (v_hora_equipo - now())))
        end))::integer,
        v_revision
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
  end if;

  -- ── 4b. Métodos por sucursal y promociones por método (20261028180000) ──
  -- Un método con branch_ids no nulo solo se cobra en esas sucursales (NULL =
  -- todas). Una promoción con payment_method_codes no nulo exige que el cobro
  -- use alguno de esos métodos (NULL = cualquiera). El reintento no se revalida.
  if not v_replayed then
    select coalesce(nullif(opm.settings->>'display_name', ''), opm.payment_method_code) into v_pm_bloq
      from jsonb_array_elements(v_payments) p
      join public.organization_payment_methods opm
        on opm.organization_id = v_org and opm.payment_method_code = p.value->>'method'
     where coalesce((p.value->>'amount')::numeric, 0) > 0
       and opm.branch_ids is not null
       and not (v_branch = any(opm.branch_ids))
     limit 1;
    if v_pm_bloq is not null then
      raise exception 'El método de pago «%» no está habilitado en esta sucursal', v_pm_bloq
        using errcode = '22023', detail = 'metodo_no_permitido_en_sucursal';
    end if;
    v_promos := array(
      select x::uuid from jsonb_array_elements_text(coalesce(p_envelope->'promotion_ids', '[]'::jsonb)) x
    );
    if cardinality(v_promos) > 0 then
      select pr.name into v_promo_bloq
        from public.promotions pr
       where pr.organization_id = v_org and pr.id = any(v_promos)
         and pr.payment_method_codes is not null
         and cardinality(pr.payment_method_codes) > 0
         and not exists (
           select 1 from jsonb_array_elements(v_payments) p
            where coalesce((p.value->>'amount')::numeric, 0) > 0
              and p.value->>'method' = any(pr.payment_method_codes))
         and not (v_mode = 'debt' and 'credit' = any(pr.payment_method_codes))
       limit 1;
      if v_promo_bloq is not null then
        raise exception 'La promoción «%» solo aplica con otro método de pago; cambia el método o quita la promoción', v_promo_bloq
          using errcode = '22023', detail = 'promocion_no_aplica_metodo_pago';
      end if;
    end if;
  end if;

  -- ── 5. Promociones (estadística; solo en venta nueva, como en Node) ──────
  v_promos := array(
    select x::uuid from jsonb_array_elements_text(coalesce(p_envelope->'promotion_ids', '[]'::jsonb)) x
  );
  if not v_replayed and v_mode <> 'settle' and cardinality(v_promos) > 0 then
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
  if v_mode <> 'settle' and not exists (select 1 from public.sale_items si where si.sale_id = v_sale_id) then
    if exists (
      select 1 from jsonb_array_elements(v_items) i
       where coalesce((i->>'promo_excluded')::boolean, false)
    ) and not public.fn_pos_puede_quitar_promocion(v_org, v_actor) then
      raise exception 'sin_permiso_quitar_promocion' using errcode = '42501',
        detail = 'Se necesita el permiso pos.promotions.remove para quitar la promoción de una línea.';
    end if;
    declare
      v_linea jsonb;
      v_linea_id uuid;
      v_excluida boolean;
    begin
      for v_linea in
        select i.value
          from jsonb_array_elements(v_items) with ordinality as i(value, ord)
         order by i.ord
      loop
        v_excluida := coalesce((v_linea->>'promo_excluded')::boolean, false);
        insert into public.sale_items (
          sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes, tax_included,
          promo_excluded, promo_excluded_by, promo_excluded_at, promo_excluded_reason, serial_ids
        ) values (
          v_sale_id,
          nullif(v_linea->>'product_id', '')::integer,
          (v_linea->>'quantity')::numeric,
          coalesce((v_linea->>'unit_price')::numeric, 0),
          coalesce((v_linea->>'total')::numeric, 0),
          coalesce((v_linea->>'tax_amount')::numeric, 0),
          coalesce((v_linea->>'tax_rate')::numeric, 0),
          coalesce((v_linea->>'discount_amount')::numeric, 0),
          case when jsonb_typeof(v_linea->'notes') = 'object' then v_linea->'notes' else null end,
          (v_linea->>'tax_included')::boolean,
          v_excluida,
          case when v_excluida then v_actor else null end,
          case when v_excluida then now() else null end,
          case when v_excluida then nullif(left(coalesce(v_linea->>'promo_excluded_reason', ''), 240), '') else null end,
          -- serial_ids_en_linea_20261023
          coalesce((
            select array_agg(x::integer)
              from jsonb_array_elements_text(coalesce(v_linea->'serial_ids', '[]'::jsonb)) x
          ), '{}'::integer[])
        ) returning id into v_linea_id;
        if v_excluida then
          insert into public.ops_audit_log (
            organization_id, branch_id, user_id, entity_type, entity_id, action, metadata
          ) values (
            v_org, v_branch, v_actor, 'sale', v_sale_id::text, 'promo_excluded',
            jsonb_build_object(
              'sale_item_id', v_linea_id,
              'product_id', nullif(v_linea->>'product_id', ''),
              'promotion_id', case
                when jsonb_typeof(v_linea->'promo_removed') = 'array' and jsonb_array_length(v_linea->'promo_removed') > 0
                then nullif(v_linea->'promo_removed'->0->>'promotion_id', '')
                else null end,
              'promotion_name', (
                select string_agg(nullif(x->>'promotion_name', ''), ', ')
                  from jsonb_array_elements(coalesce(v_linea->'promo_removed', '[]'::jsonb)) x
              ),
              'amount', coalesce((
                select sum(coalesce((x->>'discount_amount')::numeric, 0))
                  from jsonb_array_elements(coalesce(v_linea->'promo_removed', '[]'::jsonb)) x
              ), 0),
              'reason', nullif(left(coalesce(v_linea->>'promo_excluded_reason', ''), 240), '')
            )
          );
        end if;
      end loop;
    end;
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
          v_org, coalesce(v_sale.branch_id, v_branch), v_si.product_id, v_si.quantity,
          case when v_mesa is not null then 'mesa_sale' else 'sale' end, v_sale_id::text, v_si.unit_price, v_user_id
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
        -- serial_ids_en_linea_20261023: también en la línea ya existente (mesa).
        update public.sale_items si
           set serial_ids = (
             select coalesce(array_agg(distinct u.x order by u.x), '{}'::integer[])
               from unnest(coalesce(si.serial_ids, '{}'::integer[]) || v_serial_ids) as u(x)
           )
         where si.sale_id = v_sale_id
           and si.product_id = v_product_id
           and si.id = coalesce(
             case when coalesce(v_item->>'sale_item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then (v_item->>'sale_item_id')::uuid end,
             (
               select s2.id from public.sale_items s2
                where s2.sale_id = v_sale_id and s2.product_id = v_product_id
                order by (cardinality(coalesce(s2.serial_ids, '{}')) = 0) desc, s2.created_at, s2.id
                limit 1
             )
           );
      end if;
    end loop;
    if v_replayed then v_completed := array_append(v_completed, 'stock'); end if;
  end if;

  -- ── 9. Factura (se reutiliza si ya existe: no consume otro consecutivo) ──
  select * into v_invoice from public.invoice_sales inv
  where inv.sale_id = v_sale_id and inv.organization_id = v_org
    and coalesce(inv.document_type, 'invoice') = 'invoice'
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
      v_org, coalesce(v_sale.branch_id, v_branch), v_customer, v_sale_id, v_number, coalesce(v_sale.sale_date, v_created_at),
      case when v_mode = 'debt' then coalesce(v_sale.sale_date, v_created_at) + make_interval(days => v_terms) else coalesce(v_sale.sale_date, v_created_at) end,
      v_currency,
      v_subtotal, v_tax_total, v_total, v_sale.balance,
      case when v_mode = 'debt' then 'issued' when v_sale.balance > 0 then 'partial' else 'paid' end,
      v_tax_included,
      case when v_mode = 'debt' then 'credit' else coalesce(v_first_method, 'cash') end,
      case when v_mode = 'debt' then v_terms else 0 end,
      v_actor,
      case when v_mode = 'debt'
        then coalesce(nullif(btrim(v_debt->>'notes'), ''),
                      'Carrito puesto en espera: ' || coalesce(nullif(btrim(v_debt->>'reason'), ''), 'Sin motivo especificado'))
        else 'Factura generada automáticamente desde POS - Venta #' || v_sale_id::text end,
      v_sp_id, coalesce((v_sp->>'commission_rate')::numeric, 0),
      case when v_sp_type <> 'none' then v_sp_type else 'none' end,
      coalesce(nullif(v_sp->>'commission_method', ''), 'percentage'),
      coalesce((v_inv->>'commission_amount')::numeric, 0)
    ) returning * into v_invoice;
    if v_replayed then v_completed := array_append(v_completed, 'invoice_sales'); end if;
  end if;

  -- ── 10. Pagos (antes que invoice_items; solo los que faltan, en orden) ───
  if v_mode = 'settle' then
    -- Cuenta dividida (20260929060000): un cobro de mesa no abona más que el saldo
    -- pendiente (con la tolerancia de redondeo de cada línea). Una parte cobrada dos
    -- veces con intentos distintos, o un «cobrar» por el total tras un abono, no cobra
    -- de más. El reintento del MISMO intento ya volvió arriba (pos_cobros).
    if v_mesa is not null then
      select coalesce(sum(p.amount - coalesce(p.change_amount, 0)), 0) into v_pagado
      from public.payments p
      where p.organization_id = v_org and p.status = 'completed'
        and ((p.source = 'sale' and p.source_id = v_sale_id::text)
          or (p.source = 'invoice_sales' and p.source_id in (
                select i.id::text from public.invoice_sales i
                where i.sale_id = v_sale_id and coalesce(i.document_type, 'invoice') = 'invoice')));
      v_saldo_antes := greatest(0, round(coalesce(v_sale.total, 0) - v_tip - v_shipping - v_pagado, 2));
      v_abono := greatest(0, v_pay_sum - v_change - v_tip - v_shipping);
      if v_abono > v_saldo_antes + v_tol * greatest(1, (select count(*) from public.sale_items si
                                                         where si.sale_id = v_sale_id and si.quantity > 0)) then
        raise exception 'pago_excede_saldo' using errcode = '22023',
          detail = format('El cobro abona %s y el saldo pendiente de la cuenta es %s.', v_abono, v_saldo_antes);
      end if;
    end if;
    for v_pay, v_ord in select p.value, p.ord from jsonb_array_elements(v_payments) with ordinality as p(value, ord) order by p.ord loop
      if coalesce((v_pay->>'amount')::numeric, 0) <= 0 then continue; end if;
      v_takes_change := (not v_change_assigned) and v_change > 0 and (v_pay->>'method') = 'cash';
      if v_takes_change then v_change_assigned := true; end if;
      insert into public.payments (
        organization_id, branch_id, amount, method, currency, status, change_amount,
        source, source_id, created_by
      ) values (
        v_org, v_branch, (v_pay->>'amount')::numeric, v_pay->>'method', v_currency, 'completed',
        case when v_takes_change then v_change else 0 end,
        'invoice_sales', v_invoice.id::text, v_actor
      ) returning id into v_pay_id;
      v_pay_ids := array_append(v_pay_ids, v_pay_id);
    end loop;
    -- Cuenta dividida (20260929060000): el cobro ABONA a las líneas lo que de verdad
    -- entró, nunca más. Primero a las líneas de la parte, hasta la porción que la parte
    -- lleva de cada una (su cantidad en el sobre / la cantidad de la línea); lo que sobre
    -- (cobro por monto: partes iguales o montos) a las demás líneas pendientes, en orden.
    -- La línea queda pagada (paid_at) solo cuando su abono cubre su total. Antes se
    -- marcaba pagada la línea entera aunque la parte llevara 1 de 3 unidades (E1).
    if v_mesa is not null then
      if jsonb_typeof(p_envelope->'paid_sale_item_ids') = 'array' then
        for v_si in
          select si.id, si.total, si.quantity, si.paid_amount,
                 (select sum((i.value->>'quantity')::numeric) from jsonb_array_elements(v_items) i
                   where i.value->>'sale_item_id' = si.id::text) as cantidad_parte
            from public.sale_items si
           where si.sale_id = v_sale_id and si.paid_at is null and si.quantity > 0
             and si.id::text in (select jsonb_array_elements_text(p_envelope->'paid_sale_item_ids'))
           order by si.created_at, si.id
        loop
          exit when v_abono <= 0;
          v_porcion := least(
            greatest(0, v_si.total - v_si.paid_amount),
            round(v_si.total * least(coalesce(v_si.cantidad_parte, v_si.quantity), v_si.quantity) / v_si.quantity, 2),
            v_abono);
          continue when v_porcion <= 0;
          update public.sale_items set
            paid_amount      = paid_amount + v_porcion,
            paid_at          = case when paid_amount + v_porcion >= total - v_tol then now() end,
            paid_by_split_id = case when paid_amount + v_porcion >= total - v_tol
                                    then nullif(p_envelope->>'split_id', '') else paid_by_split_id end,
            updated_at       = now()
          where id = v_si.id;
          v_abono := v_abono - v_porcion;
        end loop;
      end if;
      for v_si in
        select si.id, si.total, si.paid_amount from public.sale_items si
         where si.sale_id = v_sale_id and si.paid_at is null and si.quantity > 0
         order by si.created_at, si.id
      loop
        exit when v_abono <= 0;
        v_porcion := least(greatest(0, v_si.total - v_si.paid_amount), v_abono);
        continue when v_porcion <= 0;
        update public.sale_items set
          paid_amount      = paid_amount + v_porcion,
          paid_at          = case when paid_amount + v_porcion >= total - v_tol then now() end,
          paid_by_split_id = case when paid_amount + v_porcion >= total - v_tol
                                  then nullif(p_envelope->>'split_id', '') else paid_by_split_id end,
          updated_at       = now()
        where id = v_si.id;
        v_abono := v_abono - v_porcion;
      end loop;
    end if;
  end if;

  if v_mode <> 'settle' then
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
      source, source_id, created_by, created_at, payment_date
    ) values (
      v_org, v_branch, (v_pay->>'amount')::numeric, v_pay->>'method', v_currency, 'completed',
      case when v_takes_change then v_change else 0 end,
      'invoice_sales', v_invoice.id::text, v_actor,
      coalesce(v_sale.sale_date, v_created_at), coalesce(v_sale.sale_date, v_created_at)
    );
    if v_replayed and not ('payments' = any(v_completed)) then v_completed := array_append(v_completed, 'payments'); end if;
  end loop;
  end if;

  -- Mesa: si la cuenta cambió después del primer pago (platos agregados o
  -- quitados entre cobros de una cuenta dividida), las líneas de la factura se
  -- rehacen desde sale_items, solo si la factura no salió a la DIAN.
  if v_mesa is not null and v_invoice.id is not null and v_invoice.einvoice_status is null
     and v_invoice.status <> 'void'
     and exists (select 1 from public.invoice_items ii where ii.invoice_id = v_invoice.id)
     and abs((select coalesce(sum(ii.total_line), 0) from public.invoice_items ii
               where ii.invoice_id = v_invoice.id and ii.product_id is not null)
           - (select coalesce(sum(si.total), 0) from public.sale_items si
               where si.sale_id = v_sale_id and si.quantity > 0)) > 0.01 then
    delete from public.invoice_items ii where ii.invoice_id = v_invoice.id;
  end if;

  -- ── 11. Líneas de factura (de sale_items guardados, no del sobre) ───────
  if not exists (select 1 from public.invoice_items ii where ii.invoice_id = v_invoice.id) then
    v_lineas_nuevas := true;
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
    -- Punto 5: el flete es una línea de la factura. fn_recalc_invoice_totals
    -- recalcula el total de la factura con SUM(total_line): lo que no es línea
    -- desaparece de la factura (33 facturas quedaron por debajo de su venta).
    -- Misma forma que el pedido web (lineasFacturaDesdePedidoWeb): sin
    -- producto, cantidad 1, sin impuesto, en el modo de la factura. Solo al
    -- crear las líneas: una factura que ya existía no se toca.
    if coalesce(v_sale.delivery_fee, 0) > 0 then
      insert into public.invoice_items (
        invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
        total_line, tax_rate, tax_included, discount_amount
      ) values (
        v_invoice.id, v_invoice.id, 'sale', null, 'Envío (Delivery)', 1, v_sale.delivery_fee,
        v_sale.delivery_fee, 0, v_tax_included, 0
      );
    end if;
    if v_replayed then v_completed := array_append(v_completed, 'invoice_items'); end if;
  end if;
  -- Flete cobrado al saldar una venta cuya factura ya existía (deuda): su línea.
  if v_mode = 'settle' and not v_lineas_nuevas and v_shipping > 0 then
    insert into public.invoice_items (
      invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
      total_line, tax_rate, tax_included, discount_amount
    ) values (
      v_invoice.id, v_invoice.id, 'sale', null, 'Envío (Delivery)', 1, v_shipping,
      v_shipping, 0, v_tax_included, 0
    );
  end if;

  -- ── 12. Propina ──────────────────────────────────────────────────────────
  if v_tip > 0 and (v_mode = 'settle' or not exists (select 1 from public.tips t where t.sale_id = v_sale_id)) then
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

  if v_mode = 'settle' then
    select coalesce(sum(p.amount - coalesce(p.change_amount, 0)), 0) into v_pagado
    from public.payments p
    where p.organization_id = v_org and p.status = 'completed'
      and ((p.source = 'sale' and p.source_id = v_sale_id::text)
        or (p.source = 'invoice_sales' and p.source_id in (
              select i.id::text from public.invoice_sales i
              where i.sale_id = v_sale_id and coalesce(i.document_type, 'invoice') = 'invoice')));
    v_balance := greatest(0, round(coalesce(v_sale.total, 0) - v_pagado, 2));
    update public.sales set
      balance        = v_balance,
      status         = case when v_balance <= v_tol then 'paid' else 'pending' end,
      payment_status = case when v_balance <= v_tol then 'paid' when v_pagado > 0 then 'partial' else 'pending' end,
      updated_at     = now()
    where id = v_sale_id;
    -- Cuenta dividida (20260929060000): venta pagada → todas sus líneas pagadas.
    if v_mesa is not null and v_balance <= v_tol then
      update public.sale_items si set
        paid_amount = si.total, paid_at = now(),
        paid_by_split_id = coalesce(si.paid_by_split_id, nullif(p_envelope->>'split_id', '')), updated_at = now()
      where si.sale_id = v_sale_id and si.paid_at is null and si.quantity > 0;
    end if;
    -- Promociones de la mesa (promociones_limite_y_cuenta_de_mesa): el uso se suma UNA
    -- vez, en el cobro que salda la cuenta, y solo de las que quedaron en sus líneas.
    if v_mesa is not null and v_balance <= v_tol and cardinality(v_promos) > 0 then
      begin
        perform public.increment_promotion_usage(v_org, array(
          select distinct x from unnest(v_promos) x
           where exists (select 1 from public.sale_items si
                          where si.sale_id = v_sale_id and si.quantity > 0
                            and jsonb_typeof(si.notes->'promociones') = 'array'
                            and si.notes->'promociones' ? x::text)));
      exception when others then
        v_warnings := array_append(v_warnings, 'promociones: ' || sqlerrm);
      end;
    end if;
    insert into public.pos_cobros (id, organization_id, sale_id, created_by, amount, tip_amount, shipping_fee, payment_ids)
    values (v_key, v_org, v_sale_id, v_actor, v_pay_sum, v_tip, v_shipping, v_pay_ids);
  end if;

  -- ── 12b. Membresías (20260929001100): se crean o activan en esta misma transacción ──
  -- Venta pagada → activas; deuda → pendientes; settle que salda → las pendientes se activan.
  -- Una línea membresía sin cliente aborta el cobro (membresia_sin_cliente).
  v_membresias := public.fn_membresias_activar_venta(v_sale_id, v_invoice.id, 'pos', null);

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
    'warnings', to_jsonb(v_warnings),
    'mode', v_mode,
    'payment_key', v_key,
    'membresias', coalesce(v_membresias, '[]'::jsonb)
  );
end;
$function$;
