-- ADR-CC-012 · Un asiento publicado no se edita ni se borra: se revierte
--
-- Decisión del dueño (2026-09-23, docs/design/FINANZAS-CONTABILIDAD-FIGMA.md
-- «Decisiones del dueño»):
--   1. Revertir exige el permiso «Revertir asientos» (accounting.reverse),
--      resuelto en el servidor; por defecto lo tienen el rol «Admin de
--      organización» y el cargo CONTADOR.
--   2. Un asiento publicado nunca se edita ni se borra: se revierte con un
--      contra-asiento y un motivo obligatorio. Si el periodo del original está
--      cerrado, el contra-asiento se fecha hoy (periodo abierto).
--   3. Los automáticos se revierten anulando su documento; solo los manuales
--      se revierten directo.
--
-- Antes: journal_entries y journal_lines tenían una política ALL para
-- authenticated por pertenencia: cualquier miembro podía editar o borrar por
-- API asientos publicados, incluidos los 5.901 contra-asientos de la reversión
-- histórica. El asiento manual se grababa desde el navegador en varias
-- llamadas, sin transacción y sin mirar el periodo.

-- ── 1. Permiso «Revertir asientos» ──────────────────────────────────────────
insert into public.permissions (code, name, description, module, category)
select 'accounting.reverse', 'Revertir asientos',
       'Revertir un asiento contable manual con un contra-asiento y un motivo', 'finance', 'finance'
where not exists (select 1 from public.permissions where code = 'accounting.reverse');

-- Rol «Admin de organización» (id 2): accounting.reverse. finance.create ya lo tiene.
insert into public.role_permissions (role_id, permission_id, allowed)
select 2, p.id, true
  from public.permissions p
 where p.code = 'accounting.reverse'
   and not exists (select 1 from public.role_permissions rp where rp.role_id = 2 and rp.permission_id = p.id);

-- Cargo CONTADOR (creado por fn_create_default_org_structure): crear asientos
-- manuales (finance.create) y revertirlos (accounting.reverse).
create or replace function public.fn_conceder_permisos_contador(p_job_position_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select p_job_position_id, p.id, true
    from public.permissions p
   where p.code in ('accounting.reverse', 'finance.create')
  on conflict (job_position_id, permission_id) do nothing;
$$;
revoke all on function public.fn_conceder_permisos_contador(uuid) from public, anon, authenticated;

select public.fn_conceder_permisos_contador(j.id) from public.job_positions j where j.code = 'CONTADOR';

create or replace function public.fn_job_positions_permisos_por_defecto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.code = 'CONTADOR' then
    perform public.fn_conceder_permisos_contador(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.fn_job_positions_permisos_por_defecto() from public, anon, authenticated;

drop trigger if exists trg_job_positions_permisos_por_defecto on public.job_positions;
create trigger trg_job_positions_permisos_por_defecto
  after insert on public.job_positions
  for each row execute function public.fn_job_positions_permisos_por_defecto();

-- Resolución en el servidor: el usuario sale de la sesión, nunca del cliente.
create or replace function public.fn_tiene_permiso(p_organization_id integer, p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and exists (select 1 from public.organization_members om
                  where om.user_id = auth.uid() and om.organization_id = p_organization_id and om.is_active)
     and p_code = any (coalesce(public.get_user_permission_codes(auth.uid(), p_organization_id), array[]::text[]));
$$;
revoke all on function public.fn_tiene_permiso(integer, text) from public, anon;
grant execute on function public.fn_tiene_permiso(integer, text) to authenticated, service_role;

-- ── 2. Periodo abierto: también lo cierra un periodo anual o trimestral ─────
create or replace function public.fn_is_period_open(p_organization_id integer, p_date date)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  perform public.fn_assert_acceso_org(p_organization_id::integer);

  select status into v_status
    from public.fiscal_periods
   where organization_id = p_organization_id
     and p_date between start_date and end_date
     and period_type = 'monthly'
   limit 1;

  -- Sin periodo mensual se considera abierto, salvo que lo cierre uno mayor.
  if v_status is not null and v_status <> 'open' then
    return false;
  end if;

  if exists (select 1 from public.fiscal_periods
              where organization_id = p_organization_id
                and p_date between start_date and end_date
                and period_type in ('quarterly', 'yearly')
                and status <> 'open') then
    return false;
  end if;

  return true;
end;
$$;

-- ── 3. Bitácora de reversiones: motivo y autor ──────────────────────────────
alter table public.journal_reversals add column if not exists motivo text;
alter table public.journal_reversals add column if not exists created_by uuid references auth.users(id);

alter table public.journal_reversals drop constraint if exists journal_reversals_categoria_check;
alter table public.journal_reversals add constraint journal_reversals_categoria_check
  check (categoria = any (array['F-48', 'F-45', 'F-49', 'CC-001', 'F-01', 'CC-009', 'F-63', 'manual']));

-- Contra-asiento exacto en una fecha dada (fn_revertir_asiento conserva la del
-- original). Solo lo llama código de confianza.
create or replace function public.fn_revertir_asiento_en_fecha(
  p_entry_id integer, p_categoria text, p_lote text, p_fecha timestamptz, p_created_by uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_orig public.journal_entries%rowtype;
  v_rev_id integer;
  v_d numeric;
  v_c numeric;
begin
  select * into v_orig from public.journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'Asiento % no existe', p_entry_id;
  end if;
  if not coalesce(v_orig.posted, false) then
    raise exception 'Asiento % no está publicado: no se revierte con contra-asiento', p_entry_id;
  end if;
  if exists (select 1 from public.journal_entries
             where organization_id = v_orig.organization_id and fact_key = 'reversal:' || p_entry_id) then
    raise exception 'ASIENTO_YA_REVERTIDO: el asiento % ya tiene contra-asiento', p_entry_id using errcode = '23505';
  end if;

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                                      created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (v_orig.organization_id, v_orig.branch_id, p_fecha,
          'REVERSION ' || p_categoria || ' | ' || p_lote || ' | asiento ' || p_entry_id || ' | ' || coalesce(v_orig.memo, ''),
          'reversal', p_entry_id::text, true, p_created_by,
          v_orig.currency_code, v_orig.exchange_rate, v_orig.base_currency_code,
          'reversal:' || p_entry_id)
  returning id into v_rev_id;

  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit,
                                    organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id)
  select v_rev_id, jl.account_code, 'REVERSION ' || coalesce(jl.description, ''), jl.credit, jl.debit,
         jl.organization_id, jl.currency_code, jl.exchange_rate, jl.credit_base, jl.debit_base, jl.cost_center_id
    from public.journal_lines jl
   where jl.journal_entry_id = p_entry_id;

  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = v_rev_id;
  if v_d is distinct from v_c then
    raise exception 'El contra-asiento de % no cuadra (D % / C %)', p_entry_id, v_d, v_c;
  end if;

  return v_rev_id;
end;
$$;
revoke all on function public.fn_revertir_asiento_en_fecha(integer, text, text, timestamptz, uuid) from public, anon, authenticated;

-- ── 4. Asiento manual en una sola transacción ───────────────────────────────
-- p_lineas: [{"account_code":"1105","description":"...","debit":100,"credit":0,"cost_center_id":null}, ...]
create or replace function public.fn_asiento_manual_crear(
  p_organization_id integer,
  p_branch_id integer,
  p_fecha timestamptz,
  p_memo text,
  p_lineas jsonb,
  p_publicar boolean default true,
  p_currency_code text default 'COP',
  p_exchange_rate numeric default 1,
  p_base_currency_code text default 'COP'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_entry_id integer;
  v_linea jsonb;
  v_debe numeric := 0;
  v_haber numeric := 0;
  v_d numeric;
  v_c numeric;
  v_cuenta text;
  v_tasa numeric := coalesce(nullif(p_exchange_rate, 0), 1);
  v_dia date;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO: crear asientos manuales requiere el permiso finance.create' using errcode = '42501';
  end if;
  if p_branch_id is null or not exists (select 1 from public.branches b
                                         where b.id = p_branch_id and b.organization_id = p_organization_id) then
    raise exception 'SUCURSAL_INVALIDA' using errcode = '22023';
  end if;
  if p_fecha is null then
    raise exception 'FECHA_REQUERIDA' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) < 2 then
    raise exception 'LINEAS_INSUFICIENTES: un asiento necesita al menos dos líneas' using errcode = '22023';
  end if;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_cuenta := v_linea->>'account_code';
    v_d := coalesce((v_linea->>'debit')::numeric, 0);
    v_c := coalesce((v_linea->>'credit')::numeric, 0);
    if v_d < 0 or v_c < 0 or (v_d > 0 and v_c > 0) or (v_d = 0 and v_c = 0) then
      raise exception 'LINEA_INVALIDA: cada línea va al débito o al crédito, con importe positivo (cuenta %)', v_cuenta
        using errcode = '22023';
    end if;
    if not exists (select 1 from public.chart_of_accounts a
                    where a.organization_id = p_organization_id and a.account_code = v_cuenta
                      and coalesce(a.is_active, true)) then
      raise exception 'CUENTA_INEXISTENTE: %', v_cuenta using errcode = '22023';
    end if;
    if exists (select 1 from public.chart_of_accounts h
                where h.organization_id = p_organization_id and h.parent_code = v_cuenta) then
      raise exception 'CUENTA_NO_ES_DE_DETALLE: % tiene subcuentas; use una de ellas', v_cuenta using errcode = '22023';
    end if;
    v_debe := v_debe + v_d;
    v_haber := v_haber + v_c;
  end loop;

  if round(v_debe, 2) <> round(v_haber, 2) then
    raise exception 'ASIENTO_DESCUADRADO: débitos % y créditos %', v_debe, v_haber using errcode = '22023';
  end if;

  v_dia := (p_fecha at time zone public.fn_timezone_for(p_organization_id, p_branch_id))::date;
  if p_publicar and not public.fn_is_period_open(p_organization_id, v_dia) then
    raise exception 'PERIODO_CERRADO: el periodo del % está cerrado', v_dia using errcode = '22023';
  end if;

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted,
                                      created_by, currency_code, exchange_rate, base_currency_code, fact_key)
  values (p_organization_id, p_branch_id, p_fecha, nullif(trim(p_memo), ''), 'manual', null, p_publicar,
          v_uid, coalesce(p_currency_code, 'COP'), v_tasa, coalesce(p_base_currency_code, 'COP'),
          'manual:' || gen_random_uuid())
  returning id into v_entry_id;

  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit,
                                    organization_id, currency_code, exchange_rate, debit_base, credit_base, cost_center_id)
  select v_entry_id, l->>'account_code', nullif(l->>'description', ''),
         coalesce((l->>'debit')::numeric, 0), coalesce((l->>'credit')::numeric, 0),
         p_organization_id, coalesce(p_currency_code, 'COP'), v_tasa,
         coalesce((l->>'debit')::numeric, 0) * v_tasa, coalesce((l->>'credit')::numeric, 0) * v_tasa,
         nullif(l->>'cost_center_id', '')::uuid
    from jsonb_array_elements(p_lineas) l;

  return v_entry_id;
end;
$$;
revoke all on function public.fn_asiento_manual_crear(integer, integer, timestamptz, text, jsonb, boolean, text, numeric, text) from public, anon;
grant execute on function public.fn_asiento_manual_crear(integer, integer, timestamptz, text, jsonb, boolean, text, numeric, text) to authenticated;

-- Publicar un borrador manual.
create or replace function public.fn_asiento_manual_publicar(p_entry_id integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_je public.journal_entries%rowtype;
  v_d numeric;
  v_c numeric;
begin
  select * into v_je from public.journal_entries where id = p_entry_id for update;
  if not found then
    raise exception 'ASIENTO_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_je.organization_id);
  if not public.fn_tiene_permiso(v_je.organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if v_je.source is distinct from 'manual' then
    raise exception 'NO_ES_MANUAL' using errcode = '22023';
  end if;
  if coalesce(v_je.posted, false) then
    return;
  end if;
  select sum(debit), sum(credit) into v_d, v_c from public.journal_lines where journal_entry_id = p_entry_id;
  if coalesce(v_d, 0) = 0 or round(v_d, 2) <> round(v_c, 2) then
    raise exception 'ASIENTO_DESCUADRADO' using errcode = '22023';
  end if;
  if not public.fn_is_period_open(v_je.organization_id,
        (v_je.entry_date at time zone public.fn_timezone_for(v_je.organization_id, v_je.branch_id))::date) then
    raise exception 'PERIODO_CERRADO' using errcode = '22023';
  end if;
  update public.journal_entries set posted = true, updated_at = now() where id = p_entry_id;
end;
$$;
revoke all on function public.fn_asiento_manual_publicar(integer) from public, anon;
grant execute on function public.fn_asiento_manual_publicar(integer) to authenticated;

-- Descartar un borrador manual (nunca publicado).
create or replace function public.fn_asiento_manual_descartar(p_entry_id integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_je public.journal_entries%rowtype;
begin
  select * into v_je from public.journal_entries where id = p_entry_id for update;
  if not found then
    return;
  end if;
  perform public.fn_assert_acceso_org(v_je.organization_id);
  if not public.fn_tiene_permiso(v_je.organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO' using errcode = '42501';
  end if;
  if v_je.source is distinct from 'manual' or coalesce(v_je.posted, false) then
    raise exception 'ASIENTO_PUBLICADO_INMUTABLE: solo se descartan borradores manuales' using errcode = '42501';
  end if;
  delete from public.journal_lines where journal_entry_id = p_entry_id;
  delete from public.journal_entries where id = p_entry_id;
end;
$$;
revoke all on function public.fn_asiento_manual_descartar(integer) from public, anon;
grant execute on function public.fn_asiento_manual_descartar(integer) to authenticated;

-- ── 5. Revertir un asiento manual con motivo ────────────────────────────────
create or replace function public.fn_revertir_asiento_manual(p_entry_id integer, p_motivo text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_je public.journal_entries%rowtype;
  v_tz text;
  v_fecha timestamptz;
  v_rev integer;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  select * into v_je from public.journal_entries where id = p_entry_id;
  if not found then
    raise exception 'ASIENTO_INEXISTENTE' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_je.organization_id);
  if not public.fn_tiene_permiso(v_je.organization_id, 'accounting.reverse') then
    raise exception 'SIN_PERMISO: revertir asientos requiere el permiso «Revertir asientos»' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'MOTIVO_REQUERIDO: explique en al menos 5 caracteres por qué se revierte' using errcode = '22023';
  end if;
  if v_je.source = 'reversal' then
    raise exception 'ES_CONTRA_ASIENTO: un contra-asiento no se revierte; registre un asiento manual nuevo' using errcode = '22023';
  end if;
  if v_je.source is distinct from 'manual' then
    raise exception 'AUTOMATICO_SE_REVIERTE_ANULANDO_DOCUMENTO: el asiento % viene de % y se revierte anulando ese documento',
      p_entry_id, coalesce(v_je.source, 'un documento') using errcode = '22023';
  end if;
  if not coalesce(v_je.posted, false) then
    raise exception 'ES_BORRADOR: un borrador se descarta, no se revierte' using errcode = '22023';
  end if;

  v_tz := public.fn_timezone_for(v_je.organization_id, v_je.branch_id);
  if public.fn_is_period_open(v_je.organization_id, (v_je.entry_date at time zone v_tz)::date) then
    v_fecha := v_je.entry_date;
  elsif public.fn_is_period_open(v_je.organization_id, public.fn_today_for(v_je.organization_id, v_je.branch_id)) then
    v_fecha := now();
  else
    raise exception 'PERIODO_CERRADO: ni el periodo del asiento ni el actual están abiertos' using errcode = '22023';
  end if;

  v_rev := public.fn_revertir_asiento_en_fecha(p_entry_id, 'manual',
             'manual-' || to_char(now() at time zone v_tz, 'YYYY-MM-DD'), v_fecha, v_uid);

  insert into public.journal_reversals (organization_id, lote, categoria, original_entry_id, reversal_entry_id, motivo, created_by)
  values (v_je.organization_id, 'manual-' || to_char(now() at time zone v_tz, 'YYYY-MM-DD'), 'manual',
          p_entry_id, v_rev, trim(p_motivo), v_uid);

  return v_rev;
end;
$$;
revoke all on function public.fn_revertir_asiento_manual(integer, text) from public, anon;
grant execute on function public.fn_revertir_asiento_manual(integer, text) to authenticated;

-- ── 6. Inmutabilidad: ningún rol edita ni borra un asiento publicado ────────
-- Vía de escape explícita para mantenimiento (p. ej. borrar una organización):
--   set local app.contabilidad_mantenimiento = 'on';
create or replace function public.fn_asiento_publicado_inmutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_entry integer;
begin
  if coalesce(current_setting('app.contabilidad_mantenimiento', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'journal_entries' then
    if coalesce(old.posted, false) then
      raise exception 'ASIENTO_PUBLICADO_INMUTABLE: el asiento % está publicado; se revierte con un contra-asiento', old.id
        using errcode = '42501';
    end if;
  else
    v_entry := old.journal_entry_id;
    if exists (select 1 from public.journal_entries e where e.id = v_entry and coalesce(e.posted, false))
       or (tg_op = 'UPDATE' and exists (select 1 from public.journal_entries e
                                         where e.id = new.journal_entry_id and coalesce(e.posted, false))) then
      raise exception 'ASIENTO_PUBLICADO_INMUTABLE: las líneas del asiento % no se editan ni se borran', v_entry
        using errcode = '42501';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_journal_entries_inmutable on public.journal_entries;
create trigger trg_journal_entries_inmutable
  before update or delete on public.journal_entries
  for each row execute function public.fn_asiento_publicado_inmutable();

drop trigger if exists trg_journal_lines_inmutable on public.journal_lines;
create trigger trg_journal_lines_inmutable
  before update or delete on public.journal_lines
  for each row execute function public.fn_asiento_publicado_inmutable();

-- ── 7. La API solo lee asientos; se escriben por funciones ──────────────────
drop policy if exists journal_entries_insert_update_delete_policy on public.journal_entries;
drop policy if exists journal_lines_insert_update_delete_policy on public.journal_lines;

revoke insert, update, delete, truncate on public.journal_entries, public.journal_lines from authenticated;
revoke all on public.journal_entries, public.journal_lines from anon;

-- ── 8. «Deshacer» del GO Assistant: escribe asientos, así que corre como
-- definer, con guarda de pertenencia y el usuario de la sesión, y sin anon.
-- El resto del cuerpo es el vigente, sin cambios.
create or replace function public.assistant_void_purchase_invoice(p_organization_id integer, p_user_id uuid, p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_inv        record;
  v_mov        record;
  v_je         record;
  v_new_je     integer;
  v_asientos   integer := 0;
  v_salidas    integer := 0;
  v_ap_id      uuid;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'USUARIO_NO_COINCIDE' using errcode = '42501';
  end if;

  select * into v_inv from public.invoice_purchase
   where id = p_invoice_id and organization_id = p_organization_id;
  if v_inv.id is null then
    raise exception 'INVOICE_NOT_IN_ORG' using errcode = 'P0002';
  end if;
  if v_inv.status = 'void' then
    return jsonb_build_object('invoice_id', p_invoice_id, 'already_void', true);
  end if;
  if exists (select 1 from public.payments
              where source = 'invoice_purchase' and source_id = p_invoice_id::text and status = 'completed') then
    raise exception 'VOID_HAS_PAYMENTS' using errcode = '22023';
  end if;

  for v_mov in select * from public.stock_movements
                where organization_id = p_organization_id and source = 'purchase'
                  and source_id = p_invoice_id::text and direction = 'in' loop
    insert into public.stock_movements (
      organization_id, branch_id, product_id, direction, qty, source, source_id, note, updated_by
    ) values (
      p_organization_id, v_mov.branch_id, v_mov.product_id, 'out', v_mov.qty, 'return', p_invoice_id::text,
      'Anulación de compra ' || coalesce(v_inv.number_ext, ''), p_user_id
    );
    update public.stock_levels
       set qty_on_hand = qty_on_hand - v_mov.qty, updated_at = now()
     where product_id = v_mov.product_id and branch_id = v_mov.branch_id and lot_id is null;
    v_salidas := v_salidas + 1;
  end loop;

  update public.accounts_payable
     set balance = 0, status = 'void', updated_at = now()
   where organization_id = p_organization_id and invoice_id = p_invoice_id
  returning id into v_ap_id;

  for v_je in select * from public.journal_entries
               where organization_id = p_organization_id
                 and ((source = 'invoice_purchase' and source_id = p_invoice_id::text)
                   or (v_ap_id is not null and source = 'accounts_payable' and source_id = v_ap_id::text))
                 and not exists (select 1 from public.journal_entries r
                                  where r.source = journal_entries.source || '_void' and r.source_id = journal_entries.source_id) loop
    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, posted, source, source_id, created_by,
      currency_code, exchange_rate, base_currency_code
    ) values (
      v_je.organization_id, v_je.branch_id, now(), 'Reversión ' || coalesce(v_je.memo, ''), v_je.posted,
      v_je.source || '_void', v_je.source_id, p_user_id, v_je.currency_code, v_je.exchange_rate, v_je.base_currency_code
    ) returning id into v_new_je;
    insert into public.journal_lines (
      journal_entry_id, account_code, description, debit, credit, organization_id,
      currency_code, exchange_rate, debit_base, credit_base, cost_center_id
    )
    select v_new_je, account_code, 'Reversión: ' || coalesce(description, ''), credit, debit, organization_id,
           currency_code, exchange_rate, credit_base, debit_base, cost_center_id
      from public.journal_lines where journal_entry_id = v_je.id;
    v_asientos := v_asientos + 1;
  end loop;

  update public.invoice_purchase
     set status = 'void', balance = 0, updated_at = now(),
         notes = coalesce(notes, '') || E'\nAnulada desde GO Assistant (deshacer).'
   where id = p_invoice_id;

  return jsonb_build_object(
    'invoice_id', p_invoice_id, 'number_ext', v_inv.number_ext,
    'salidas_stock', v_salidas, 'asientos_revertidos', v_asientos, 'accounts_payable_id', v_ap_id
  );
end;
$function$;
revoke all on function public.assistant_void_purchase_invoice(integer, uuid, uuid) from public, anon;
grant execute on function public.assistant_void_purchase_invoice(integer, uuid, uuid) to authenticated, service_role;
