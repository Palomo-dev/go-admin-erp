-- ============================================================================
-- Compras F1.3 — entrada de compra al kardex y costo con vigencia, en la base.
-- Plan: docs/implementacion/FACTURAS-COMPRA-CXP-PLAN.md (§4 F1.3, R4, R7).
--
-- 1. `fn_finanzas_exigir_permiso(org, códigos[])`: permiso resuelto en la base
--    con el usuario de la sesión (dueño, super admin o rol 1/2 —el criterio de
--    `ORG_ADMIN_ROLE_IDS`—, o `check_user_permission` con cualquiera de los
--    códigos). Service role (sin usuario) pasa. Interna.
--    `fn_fc_acceso_sucursal(branch)`: las RPC SECURITY DEFINER no heredan la
--    política restrictiva por sucursal; esta la reproduce (`app_branch_access`).
-- 2. `fn_kardex_entrada_compra_int(...)` (interna) y su envoltorio público
--    `fn_kardex_entrada_compra(...)` (permiso inventory.create o finance.create).
--    Por línea, en una transacción: `track_stock` (null = sí, igual que
--    `stockMovementService.incrementOnPurchase`, prueba L6); `SELECT … FOR
--    UPDATE` del `stock_levels` con `lot_id IS NOT DISTINCT FROM` (nunca
--    `upsert onConflict`: el UNIQUE admite NULL); promedio ponderado (existencia
--    ≤ 0 → costo de la entrada); movimiento `in` con `unit_cost`; y
--    `product_costs`: si el costo cambió, cierra la vigencia abierta
--    (`effective_to = now()`) e inserta la nueva con el proveedor. Devuelve las
--    líneas procesadas y las saltadas con su motivo (contrato de
--    `describeSkippedItems`). Idempotente por (origen, id) salvo que se pida lo
--    contrario (recepciones parciales de una OC).
-- 3. R7: `fn_auto_journal_stock_movement` excluye también `purchase_void`. La
--    anulación de una compra ya registra el contra-asiento espejo del devengo
--    (que incluye el inventario); el asiento de ajuste del movimiento lo
--    duplicaba. Resto de la función idéntico.
-- ============================================================================

-- ── 1. Permiso y sucursal ──────────────────────────────────────────────────
create or replace function public.fn_finanzas_exigir_permiso(p_org integer, p_codigos text[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_codigo text;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return; -- service role: fn_assert_acceso_org ya rechazó anon/authenticated sin sesión
  end if;
  if exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = v_uid) then
    return;
  end if;
  if exists (select 1 from public.organization_members om
              where om.user_id = v_uid and om.organization_id = p_org and om.is_active
                and (om.is_super_admin or om.role_id in (1, 2))) then
    return;
  end if;
  foreach v_codigo in array coalesce(p_codigos, array[]::text[]) loop
    if public.check_user_permission(v_uid, p_org, v_codigo) then
      return;
    end if;
  end loop;
  raise exception 'SIN_PERMISO: requiere %', array_to_string(p_codigos, ' o ') using errcode = '42501';
end;
$$;

comment on function public.fn_finanzas_exigir_permiso(integer, text[]) is
  'Lanza 42501 si el usuario de la sesión no es dueño, admin (super admin o rol 1/2) ni tiene alguno de los permisos. Interna de las RPC de compras y CxP.';

create or replace function public.fn_fc_acceso_sucursal(p_branch integer)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and p_branch is not null and not public.app_branch_access(p_branch) then
    raise exception 'SUCURSAL_NO_PERMITIDA' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.fn_finanzas_exigir_permiso(integer, text[]) from public, anon, authenticated;
revoke all on function public.fn_fc_acceso_sucursal(integer) from public, anon, authenticated;

-- ── 2. Kardex de compra ────────────────────────────────────────────────────
create or replace function public.fn_kardex_entrada_compra_int(
  p_org integer,
  p_branch integer,
  p_source text,
  p_source_id text,
  p_lineas jsonb,
  p_user uuid default null,
  p_supplier_id integer default null,
  p_idempotente boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_linea jsonb;
  v_prod record;
  v_qty numeric;
  v_costo numeric;
  v_lote integer;
  v_sl record;
  v_prom numeric;
  v_mov integer;
  v_abierto record;
  v_proc jsonb := '[]'::jsonb;
  v_salt jsonb := '[]'::jsonb;
  v_user uuid := coalesce(auth.uid(), p_user);
begin
  perform public.fn_assert_acceso_org(p_org);
  if not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'SUCURSAL_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  perform public.fn_fc_acceso_sucursal(p_branch);
  if p_source not in ('purchase', 'purchase_order', 'purchase_invoice') then
    raise exception 'ORIGEN_INVALIDO' using errcode = '22023';
  end if;
  if p_source_id is null or btrim(p_source_id) = '' then
    raise exception 'ORIGEN_SIN_ID' using errcode = '22023';
  end if;

  -- Dos recepciones simultáneas de la misma fuente se serializan.
  perform pg_advisory_xact_lock(hashtextextended('kardex_compra:' || p_org || ':' || p_source || ':' || p_source_id, 0));

  if p_idempotente and exists (
    select 1 from public.stock_movements
     where organization_id = p_org and source = p_source and source_id = p_source_id and direction = 'in'
  ) then
    return jsonb_build_object('ya_recepcionado', true, 'procesadas', '[]'::jsonb, 'saltadas', '[]'::jsonb);
  end if;

  for v_linea in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    if nullif(v_linea->>'product_id', '') is null then
      v_salt := v_salt || jsonb_build_object('product_id', null, 'reason', 'no_product');
      continue;
    end if;

    v_qty := nullif(v_linea->>'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then
      v_salt := v_salt || jsonb_build_object('product_id', (v_linea->>'product_id')::integer, 'reason', 'invalid_qty');
      continue;
    end if;

    select p.id, p.name, p.track_stock, p.organization_id into v_prod
      from public.products p where p.id = (v_linea->>'product_id')::integer;
    if v_prod.id is null then
      v_salt := v_salt || jsonb_build_object('product_id', (v_linea->>'product_id')::integer, 'reason', 'product_not_found');
      continue;
    end if;
    if v_prod.organization_id is distinct from p_org then
      raise exception 'PRODUCTO_NO_ES_DE_LA_ORG' using errcode = '42501';
    end if;
    if v_prod.track_stock is false then
      v_salt := v_salt || jsonb_build_object('product_id', v_prod.id, 'product_name', v_prod.name, 'reason', 'not_tracked');
      continue;
    end if;

    v_costo := greatest(coalesce(nullif(v_linea->>'unit_cost', '')::numeric, 0), 0);
    v_lote := nullif(v_linea->>'lot_id', '')::integer;

    select sl.id, sl.qty_on_hand, sl.avg_cost into v_sl
      from public.stock_levels sl
     where sl.product_id = v_prod.id and sl.branch_id = p_branch and sl.lot_id is not distinct from v_lote
     order by sl.id
     limit 1
     for update;

    if v_sl.id is null then
      v_prom := v_costo;
      insert into public.stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
      values (v_prod.id, p_branch, v_lote, v_qty, 0, v_costo, 0);
    else
      v_prom := case
        when coalesce(v_sl.qty_on_hand, 0) > 0
          then (v_sl.qty_on_hand * coalesce(v_sl.avg_cost, 0) + v_qty * v_costo) / (v_sl.qty_on_hand + v_qty)
        else v_costo
      end;
      update public.stock_levels
         set qty_on_hand = coalesce(qty_on_hand, 0) + v_qty,
             avg_cost = v_prom,
             updated_at = now()
       where id = v_sl.id;
    end if;

    insert into public.stock_movements (
      organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note, updated_by
    ) values (
      p_org, p_branch, v_prod.id, v_lote, 'in', v_qty, v_costo, p_source, p_source_id, nullif(v_linea->>'note', ''), v_user
    ) returning id into v_mov;

    -- Costo con vigencia: solo si cambió. `product_costs` no tiene UPDATE para
    -- el cliente; aquí se cierra la vigencia abierta y se abre la nueva.
    if v_costo > 0 then
      select pc.id, pc.cost into v_abierto
        from public.product_costs pc
       where pc.product_id = v_prod.id and pc.effective_to is null
       order by pc.effective_from desc, pc.id desc
       limit 1
       for update;
      if v_abierto.id is null or round(v_abierto.cost, 6) <> round(v_costo, 6) then
        update public.product_costs
           set effective_to = now()
         where product_id = v_prod.id and effective_to is null;
        insert into public.product_costs (product_id, cost, effective_from, supplier_id)
        values (v_prod.id, round(v_costo, 6), now(), p_supplier_id);
      end if;
    end if;

    v_proc := v_proc || jsonb_build_object(
      'product_id', v_prod.id, 'product_name', v_prod.name, 'qty', v_qty, 'unit_cost', v_costo,
      'avg_cost', round(v_prom, 6), 'lot_id', v_lote, 'movement_id', v_mov);
  end loop;

  return jsonb_build_object('ya_recepcionado', false, 'procesadas', v_proc, 'saltadas', v_salt);
end;
$$;

comment on function public.fn_kardex_entrada_compra_int(integer, integer, text, text, jsonb, uuid, integer, boolean) is
  'Entrada de compra al kardex (stock_levels + stock_movements + product_costs con vigencia) en una transacción. Interna: la llaman las RPC de compras.';

revoke all on function public.fn_kardex_entrada_compra_int(integer, integer, text, text, jsonb, uuid, integer, boolean) from public, anon, authenticated;

create or replace function public.fn_kardex_entrada_compra(
  p_org integer,
  p_branch integer,
  p_source text,
  p_source_id text,
  p_lineas jsonb,
  p_user uuid default null,
  p_supplier_id integer default null,
  p_idempotente boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_finanzas_exigir_permiso(p_org, array['inventory.create', 'finance.create']);
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier_id and s.organization_id = p_org
  ) then
    raise exception 'PROVEEDOR_NO_ES_DE_LA_ORG' using errcode = '42501';
  end if;
  return public.fn_kardex_entrada_compra_int(p_org, p_branch, p_source, p_source_id, p_lineas, p_user, p_supplier_id, p_idempotente);
end;
$$;

comment on function public.fn_kardex_entrada_compra(integer, integer, text, text, jsonb, uuid, integer, boolean) is
  'Entrada de compra al kardex con costo y vigencia (F1.3). Permiso inventory.create o finance.create. Para la recepción de órdenes de compra (R4: migrar un llamador a la vez).';

revoke all on function public.fn_kardex_entrada_compra(integer, integer, text, text, jsonb, uuid, integer, boolean) from public, anon;
grant execute on function public.fn_kardex_entrada_compra(integer, integer, text, text, jsonb, uuid, integer, boolean) to authenticated;

-- ── 3. R7: la anulación de compra no genera asiento de ajuste ──────────────
CREATE OR REPLACE FUNCTION public.fn_auto_journal_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- Excluir setup inicial, compras (las contabiliza la factura, ADR-CC-009),
    -- su anulación (la revierte el contra-asiento espejo del devengo, R7 del
    -- plan de compras) y traslados entre sucursales (no son ajustes).
    IF NEW.source IN ('initial', 'purchase', 'purchase_order', 'purchase_invoice', 'purchase_void',
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

    IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure((to_jsonb(NEW)->>'organization_id')::integer, NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>'id', NULL, NULL, NULL, NULL, 'no_rule', 'Sin regla contable activa para ' || TG_TABLE_NAME || ' (' || TG_OP || ')'); RETURN NEW;
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
