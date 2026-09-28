-- Bloque 1 contable · migración 7 (y la pieza que usan las migraciones 2 a 6)
--
-- `fn_create_journal_entry` gana dos cosas:
--
-- 1. **`p_fact_key`**, la clave natural del hecho económico
--    (docs/design/AUDITORIA-TESORERIA-CONTABILIDAD.md §P.3). La idempotencia
--    deja de depender de `source`/`source_id` —es decir, de qué tabla avisó— y
--    pasa a depender de qué pasó. Dos disparadores distintos que describen el
--    mismo hecho emiten la misma clave y el segundo no escribe nada.
--    El índice `uq_journal_entries_fact_key` (migración 1) lo garantiza incluso
--    en concurrencia; aquí se comprueba antes para no abortar la transacción
--    del POS con un error de unicidad.
--
-- 2. La validación **débito ≠ crédito**. Sin ella se pudo crear el asiento nulo
--    de las transferencias bancarias: dos líneas sobre la misma cuenta que se
--    anulan (§G.2).
--
-- Y sobre todo: **la contabilidad deja de fallar en silencio**. Hoy cada
-- rechazo es un `RAISE NOTICE` que nadie lee, así que un asiento que no se creó
-- es indistinguible de un hecho que no ocurrió (§C, C-1). Ahora cada rechazo
-- queda en `journal_entry_failures` con su motivo, su organización y el origen,
-- que es lo que permite ponerlo en pantalla y corregir la configuración.
--
-- La firma cambia (parámetro nuevo), así que se retira la versión de 13
-- argumentos: con las dos vivas, toda llamada con nombres sería ambigua.
-- Ningún código de la aplicación llama a esta RPC —solo la llaman los
-- disparadores, por nombre—, comprobado antes de aplicar.

create table if not exists public.journal_entry_failures (
  id              bigserial primary key,
  organization_id integer not null,
  branch_id       integer,
  entry_date      timestamptz,
  source          text,
  source_id       text,
  fact_key        text,
  debit_account   text,
  credit_account  text,
  amount          numeric,
  reason          text not null,
  detail          text,
  created_at      timestamptz not null default now()
);

comment on table public.journal_entry_failures is
  'Asientos que fn_create_journal_entry rechazó y por qué. Antes eran RAISE NOTICE que nadie leía: un hecho sin asiento era indistinguible de un hecho que no ocurrió.';
comment on column public.journal_entry_failures.reason is
  'Código del rechazo: amount_invalid | account_null | same_account | no_rule | debit_account_missing | credit_account_missing | tax_account_missing | period_closed.';

create index if not exists idx_journal_entry_failures_org_fecha
  on public.journal_entry_failures (organization_id, created_at desc);

alter table public.journal_entry_failures enable row level security;

drop policy if exists "Los miembros ven los rechazos de su organizacion" on public.journal_entry_failures;
create policy "Los miembros ven los rechazos de su organizacion"
  on public.journal_entry_failures
  for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
  );

-- Solo escribe la RPC, que es SECURITY DEFINER. Nadie inserta desde el cliente.
revoke all on public.journal_entry_failures from anon, authenticated;
grant select on public.journal_entry_failures to authenticated;

-- Registro del rechazo. Va aparte y con su propio manejador de errores: que no
-- se pueda anotar el fallo nunca debe tumbar la venta que lo provocó.
create or replace function public.fn_log_journal_failure(
  p_organization_id integer,
  p_branch_id integer,
  p_entry_date timestamptz,
  p_source text,
  p_source_id text,
  p_fact_key text,
  p_debit_account text,
  p_credit_account text,
  p_amount numeric,
  p_reason text,
  p_detail text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
    INSERT INTO journal_entry_failures (
        organization_id, branch_id, entry_date, source, source_id, fact_key,
        debit_account, credit_account, amount, reason, detail
    ) VALUES (
        p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, p_fact_key,
        p_debit_account, p_credit_account, p_amount, p_reason, p_detail
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo registrar el rechazo contable (%): %', p_reason, SQLERRM;
END;
$function$;

revoke all on function public.fn_log_journal_failure(
  integer, integer, timestamptz, text, text, text, text, text, numeric, text, text
) from public, anon, authenticated;

drop function if exists public.fn_create_journal_entry(
  integer, integer, timestamptz, text, text, text, text, text, numeric, text, numeric, uuid, boolean
);

create or replace function public.fn_create_journal_entry(
  p_organization_id integer,
  p_branch_id integer,
  p_entry_date timestamptz,
  p_memo text,
  p_source text,
  p_source_id text,
  p_debit_account text,
  p_credit_account text,
  p_amount numeric,
  p_tax_account text default null,
  p_tax_amount numeric default 0,
  p_created_by uuid default null,
  p_tax_is_credit boolean default false,
  p_fact_key text default null
)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_entry_id integer;
    v_branch_id integer;
BEGIN
    -- Idempotencia por el hecho, no por el origen: si este hecho ya está
    -- contabilizado en esta organización, se devuelve el asiento existente.
    IF p_fact_key IS NOT NULL THEN
        SELECT id INTO v_entry_id
        FROM journal_entries
        WHERE organization_id = p_organization_id AND fact_key = p_fact_key
        LIMIT 1;

        IF v_entry_id IS NOT NULL THEN
            RETURN v_entry_id;
        END IF;
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'amount_invalid', 'Importe nulo o no positivo');
        RETURN NULL;
    END IF;

    IF p_debit_account IS NULL OR p_credit_account IS NULL THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'account_null', 'La regla contable no trae cuenta de débito o de crédito');
        RETURN NULL;
    END IF;

    -- Un asiento con la misma cuenta a los dos lados no mueve nada: es el
    -- defecto que hacía nulo el asiento de las transferencias bancarias.
    IF p_debit_account = p_credit_account THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'same_account', 'Débito y crédito sobre la misma cuenta ' || p_debit_account);
        RETURN NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM chart_of_accounts
        WHERE organization_id = p_organization_id AND account_code = p_debit_account
    ) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'debit_account_missing', 'La cuenta de débito ' || p_debit_account || ' no está en el plan contable de la organización');
        RETURN NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM chart_of_accounts
        WHERE organization_id = p_organization_id AND account_code = p_credit_account
    ) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'credit_account_missing', 'La cuenta de crédito ' || p_credit_account || ' no está en el plan contable de la organización');
        RETURN NULL;
    END IF;

    IF p_tax_account IS NOT NULL AND p_tax_amount > 0 AND NOT EXISTS (
        SELECT 1 FROM chart_of_accounts
        WHERE organization_id = p_organization_id AND account_code = p_tax_account
    ) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'tax_account_missing', 'La cuenta de impuesto ' || p_tax_account || ' no está en el plan contable de la organización');
        RETURN NULL;
    END IF;

    IF NOT fn_is_period_open(p_organization_id, p_entry_date::date) THEN
        PERFORM fn_log_journal_failure(p_organization_id, p_branch_id, p_entry_date, p_source,
            p_source_id, p_fact_key, p_debit_account, p_credit_account, p_amount,
            'period_closed', 'Periodo contable cerrado para la fecha ' || p_entry_date::date);
        RETURN NULL;
    END IF;

    -- F-03: branch_id nulo, 0 o de otra organización -> sucursal principal.
    IF p_branch_id IS NULL OR p_branch_id = 0 OR NOT EXISTS (
        SELECT 1 FROM branches WHERE id = p_branch_id AND organization_id = p_organization_id
    ) THEN
        SELECT id INTO v_branch_id
        FROM branches
        WHERE organization_id = p_organization_id AND is_main = true AND is_active = true
        LIMIT 1;

        IF v_branch_id IS NULL THEN
            SELECT MIN(id) INTO v_branch_id FROM branches WHERE organization_id = p_organization_id;
        END IF;
    ELSE
        v_branch_id := p_branch_id;
    END IF;

    BEGIN
        INSERT INTO journal_entries (
            organization_id, branch_id, entry_date, memo,
            source, source_id, posted, created_by, fact_key
        ) VALUES (
            p_organization_id, v_branch_id, p_entry_date, p_memo,
            p_source, p_source_id, true, p_created_by, p_fact_key
        ) RETURNING id INTO v_entry_id;
    EXCEPTION WHEN unique_violation THEN
        -- Carrera contra otra transacción que contabilizó el mismo hecho.
        -- El índice hizo su trabajo; se devuelve el asiento que ganó.
        IF p_fact_key IS NULL THEN
            RAISE;  -- la unicidad violada es otra: no se tapa
        END IF;

        SELECT id INTO v_entry_id
        FROM journal_entries
        WHERE organization_id = p_organization_id AND fact_key = p_fact_key
        LIMIT 1;
        RETURN v_entry_id;
    END;

    -- F-45: el lado del impuesto depende de si es venta (por pagar) o compra.
    IF p_tax_is_credit THEN
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_debit_account, p_memo, p_amount, 0);

        IF p_tax_account IS NOT NULL AND p_tax_amount > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
            VALUES (v_entry_id, p_tax_account, 'IVA - ' || p_memo, 0, p_tax_amount);
        END IF;

        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount - COALESCE(p_tax_amount, 0));
    ELSE
        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_debit_account, p_memo, p_amount - COALESCE(p_tax_amount, 0), 0);

        IF p_tax_account IS NOT NULL AND p_tax_amount > 0 THEN
            INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
            VALUES (v_entry_id, p_tax_account, 'IVA - ' || p_memo, p_tax_amount, 0);
        END IF;

        INSERT INTO journal_lines (journal_entry_id, account_code, description, debit, credit)
        VALUES (v_entry_id, p_credit_account, p_memo, 0, p_amount);
    END IF;

    RETURN v_entry_id;
END;
$function$;

revoke all on function public.fn_create_journal_entry(
  integer, integer, timestamptz, text, text, text, text, text, numeric, text, numeric, uuid, boolean, text
) from public, anon;
