-- El asiento que no se crea deja rastro, venga de donde venga.
--
-- Medido al aplicar: fn_create_journal_entry YA registra en
-- journal_entry_failures sus rechazos (monto inválido, cuenta inexistente de
-- débito, crédito o impuesto, débito = crédito, periodo cerrado) desde
-- d8090114; tres sondas en la org 149 dejaron amount_invalid,
-- debit_account_missing y tax_account_missing. Quedaban dos silencios:
--
-- 1. fn_create_journal_entry_with_discount (con descuento de pronto pago)
--    rechazaba con RAISE NOTICE, que nadie lee.
-- 2. 18 disparadores fn_auto_journal_* salían con
--    `IF v_rule IS NULL THEN RETURN NEW;` antes de llegar a
--    fn_create_journal_entry: sin regla contable, el hecho quedaba sin asiento y
--    sin rastro.
--
-- Ambos pasan a registrar en journal_entry_failures sin lanzar excepción: la
-- operación del usuario nunca se bloquea por esto. La transformación de los 18
-- disparadores es mecánica y marcada (/* registro-sin-regla */) para que el
-- rollback la revierta exacta.
--
-- Además: v_salud_contable, una fila por organización con los rechazos (total,
-- últimos 7 días, por motivo), el cuadre del balance de prueba y la diferencia
-- de cartera de v_cartera_vs_documentos. Solo service_role.

-- ── 1. Descuento de pronto pago ─────────────────────────────────────────────
create or replace function public.fn_create_journal_entry_with_discount(
  p_organization_id integer, p_branch_id integer, p_entry_date timestamp with time zone,
  p_memo text, p_source text, p_source_id text, p_debit_account text, p_credit_account text,
  p_amount numeric, p_discount_account text, p_discount_amount numeric,
  p_discount_on_debit boolean, p_created_by uuid DEFAULT NULL::uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_entry_id integer;
    v_branch_id integer;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'amount_invalid', 'Importe nulo o no positivo (con descuento)');
        RETURN NULL;
    END IF;

    IF p_debit_account IS NULL OR p_credit_account IS NULL THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'account_null', 'La regla contable no trae cuenta de debito o de credito (con descuento)');
        RETURN NULL;
    END IF;

    -- Sin descuento válido: asiento simple por la función estándar (que ya
    -- registra sus propios rechazos).
    IF p_discount_amount IS NULL OR p_discount_amount <= 0 OR p_discount_account IS NULL THEN
        RETURN fn_create_journal_entry(
            p_organization_id := p_organization_id,
            p_branch_id := p_branch_id,
            p_entry_date := p_entry_date,
            p_memo := p_memo,
            p_source := p_source,
            p_source_id := p_source_id,
            p_debit_account := p_debit_account,
            p_credit_account := p_credit_account,
            p_amount := p_amount,
            p_created_by := p_created_by
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts
                   WHERE organization_id = p_organization_id AND account_code = p_debit_account) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'debit_account_missing',
            'La cuenta de debito ' || p_debit_account || ' no esta en el plan contable de la organizacion');
        RETURN NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts
                   WHERE organization_id = p_organization_id AND account_code = p_credit_account) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'credit_account_missing',
            'La cuenta de credito ' || p_credit_account || ' no esta en el plan contable de la organizacion');
        RETURN NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts
                   WHERE organization_id = p_organization_id AND account_code = p_discount_account) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'discount_account_missing',
            'La cuenta de descuento ' || p_discount_account || ' no esta en el plan contable de la organizacion');
        RETURN NULL;
    END IF;

    IF NOT fn_is_period_open(p_organization_id, p_entry_date::date) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, NULL,
            p_debit_account, p_credit_account, p_amount, 'period_closed',
            'Periodo contable cerrado para la fecha ' || p_entry_date::date);
        RETURN NULL;
    END IF;

    IF p_branch_id IS NULL OR p_branch_id = 0 OR NOT EXISTS (
        SELECT 1 FROM branches WHERE id = p_branch_id AND organization_id = p_organization_id
    ) THEN
        SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = p_organization_id;
    ELSE
        v_branch_id := p_branch_id;
    END IF;

    INSERT INTO journal_entries (
        organization_id, branch_id, entry_date, memo,
        source, source_id, posted, created_by
    ) VALUES (
        p_organization_id, v_branch_id, p_entry_date, p_memo,
        p_source, p_source_id, true, p_created_by
    ) RETURNING id INTO v_entry_id;

    IF p_discount_on_debit THEN
        -- COBRO (venta): Caja/Banco + Descuento concedido (débito) = CxC (crédito total)
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_debit_account, p_memo, p_amount, 0);
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_discount_account, 'Descuento pronto pago - ' || p_memo, p_discount_amount, 0);
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount + p_discount_amount);
    ELSE
        -- PAGO (compra): CxP (débito total) = Caja/Banco + Descuento obtenido (crédito)
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_debit_account, p_memo, p_amount + p_discount_amount, 0);
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount);
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_discount_account, 'Descuento pronto pago - ' || p_memo, 0, p_discount_amount);
    END IF;

    RETURN v_entry_id;
END;
$function$;

revoke all on function public.fn_create_journal_entry_with_discount(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, boolean, uuid) from public, anon, authenticated;
grant execute on function public.fn_create_journal_entry_with_discount(integer, integer, timestamp with time zone, text, text, text, text, text, numeric, text, numeric, boolean, uuid) to service_role;

-- ── 2. Disparadores que salían sin regla y sin rastro ───────────────────────
do $$
declare
  r record;
  v_def text;
  v_org text;
  v_n integer := 0;
begin
  for r in
    select p.oid, p.proname, p.prosrc
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname like 'fn_auto_journal%'
      and p.prosrc ~* 'IF\s+v_rule\s+IS\s+NULL\s+THEN\s+RETURN\s+NEW\s*;'
  loop
    -- La organización: la de la fila; si la tabla no la tiene, la variable
    -- v_org_id que la función ya resolvió antes de buscar la regla.
    v_org := case when r.prosrc ~* 'v_org_id\s+integer'
                  then 'coalesce((to_jsonb(NEW)->>''organization_id'')::integer, v_org_id)'
                  else '(to_jsonb(NEW)->>''organization_id'')::integer' end;
    v_def := pg_get_functiondef(r.oid);
    v_def := regexp_replace(v_def,
      'IF\s+v_rule\s+IS\s+NULL\s+THEN\s+RETURN\s+NEW\s*;',
      'IF v_rule IS NULL THEN /* registro-sin-regla */ PERFORM fn_log_journal_failure(' || v_org
        || ', NULL, now(), TG_TABLE_NAME, to_jsonb(NEW)->>''id'', NULL, NULL, NULL, NULL, ''no_rule'', '
        || '''Sin regla contable activa para '' || TG_TABLE_NAME || '' ('' || TG_OP || '')''); RETURN NEW;',
      'gi');
    execute v_def;
    v_n := v_n + 1;
  end loop;
  raise notice 'Disparadores transformados: %', v_n;
end $$;

-- ── 3. Vista de salud contable ──────────────────────────────────────────────
create or replace view public.v_salud_contable
with (security_invoker = true) as
with fallos as (
  select organization_id,
         count(*) as rechazos_total,
         count(*) filter (where created_at > now() - interval '7 days') as rechazos_7d,
         max(created_at) as ultimo_rechazo
  from journal_entry_failures
  group by 1
),
por_motivo as (
  select organization_id, jsonb_object_agg(reason || ' · ' || coalesce(source, '?'), n) as rechazos_por_motivo
  from (select organization_id, reason, source, count(*) as n from journal_entry_failures group by 1, 2, 3) t
  group by 1
),
balance as (
  select je.organization_id, sum(jl.debit) as debitos, sum(jl.credit) as creditos
  from journal_entries je join journal_lines jl on jl.journal_entry_id = je.id
  group by 1
)
select
  o.id as organization_id,
  coalesce(f.rechazos_total, 0) as rechazos_total,
  coalesce(f.rechazos_7d, 0) as rechazos_7d,
  f.ultimo_rechazo,
  coalesce(m.rechazos_por_motivo, '{}'::jsonb) as rechazos_por_motivo,
  coalesce(b.debitos, 0) = coalesce(b.creditos, 0) as balance_cuadra,
  c.cxc_libro,
  c.cxc_facturas_abiertas,
  c.diferencia as diferencia_cartera,
  c.importe_nc_sobre_pagadas,
  c.pagadas_sin_pago
from organizations o
left join fallos f on f.organization_id = o.id
left join por_motivo m on m.organization_id = o.id
left join balance b on b.organization_id = o.id
left join v_cartera_vs_documentos c on c.organization_id = o.id
where f.organization_id is not null or b.organization_id is not null;

revoke all on public.v_salud_contable from public, anon, authenticated;
grant select on public.v_salud_contable to service_role;

comment on view public.v_salud_contable is
  'Salud contable por organización: asientos rechazados (journal_entry_failures), cuadre del balance de prueba y diferencia de cartera. Solo service_role.';
