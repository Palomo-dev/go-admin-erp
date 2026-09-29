-- Membresías — fase 1, M5: un producto para cada plan existente (docs/design/MEMBRESIAS-FASE-1-2.md §3 M5).
--
-- Medido el 2026-09-28: 4 planes, todos de la org 106, todos monthly/30 días y access_rules vacío;
-- 1 membresía (org 106, sin venta). Desde aquí el precio de un plan es el de su producto
-- (product_prices); membership_plans.price queda solo por compatibilidad (se retira en la fase 3).
--
-- Por plan sin producto:
--   * categoría «Membresías» (slug «membresias») de la organización, creada si no existe;
--   * producto service/membership con sku «MEM-<id del plan>», estado según is_active;
--   * precio vigente desde ahora con el precio del plan;
--   * membership_plans.product_id y duración (unidad, valor) desde frequency.
-- La membresía existente queda con source = 'manual_legacy', su producto y la copia de reglas.
-- Idempotente: un plan con producto no se vuelve a migrar.

do $$
declare
  v_plan record;
  v_cat integer;
  v_prod integer;
  v_sku text;
  v_n integer;
begin
  for v_plan in
    select mp.* from public.membership_plans mp where mp.product_id is null order by mp.organization_id, mp.id
  loop
    select id into v_cat from public.categories
     where organization_id = v_plan.organization_id and slug = 'membresias';
    if v_cat is null then
      insert into public.categories (organization_id, name, slug)
      values (v_plan.organization_id, 'Membresías', 'membresias')
      returning id into v_cat;
    end if;

    v_sku := 'MEM-' || v_plan.id;
    v_n := 1;
    while exists (select 1 from public.products where organization_id = v_plan.organization_id and sku = v_sku) loop
      v_n := v_n + 1;
      v_sku := 'MEM-' || v_plan.id || '-' || v_n;
    end loop;

    insert into public.products (organization_id, sku, name, description, category_id, unit_code,
                                 product_type, service_type, status, track_stock)
    values (v_plan.organization_id, v_sku, v_plan.name, v_plan.description, v_cat, 'UN',
            'service', 'membership', case when coalesce(v_plan.is_active, true) then 'active' else 'inactive' end, false)
    returning id into v_prod;

    if coalesce(v_plan.price, 0) > 0 then
      insert into public.product_prices (product_id, price, effective_from)
      values (v_prod, v_plan.price, now());
    end if;

    update public.membership_plans set
      product_id = v_prod,
      duration_unit = case frequency
        when 'daily' then 'day' when 'weekly' then 'week' when 'monthly' then 'month'
        when 'quarterly' then 'month' when 'biannual' then 'month' when 'annual' then 'year'
        else 'day' end,
      duration_value = case frequency
        when 'daily' then 1 when 'weekly' then 1 when 'monthly' then 1
        when 'quarterly' then 3 when 'biannual' then 6 when 'annual' then 1
        else greatest(duration_days, 1) end
     where id = v_plan.id;
  end loop;
end $$;

update public.memberships m set
  source = 'manual_legacy',
  product_id = mp.product_id,
  activated_at = coalesce(m.activated_at, m.start_date),
  plan_snapshot = coalesce(m.plan_snapshot, jsonb_build_object(
    'plan_id', mp.id, 'nombre', mp.name, 'duration_unit', mp.duration_unit, 'duration_value', mp.duration_value,
    'grace_days', mp.grace_days, 'billing_mode', mp.billing_mode, 'requires_activation', mp.requires_activation,
    'freeze_allowed', mp.freeze_allowed, 'freeze_max_times', mp.freeze_max_times, 'freeze_max_days', mp.freeze_max_days,
    'allowed_branch_ids', mp.allowed_branch_ids, 'access_schedule', mp.access_schedule,
    'daily_checkin_limit', mp.daily_checkin_limit))
  from public.membership_plans mp
 where mp.id = m.membership_plan_id and m.source is null and m.sale_item_id is null;
