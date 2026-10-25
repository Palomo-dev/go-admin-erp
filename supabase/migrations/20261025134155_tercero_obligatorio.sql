-- Tanda 4 (25-oct-2026, spec producto/tercero_obligatorio_spec.md): tercero obligatorio. NO aplicada.
-- Objetivo: que no vuelva a quedar saldo sin tercero (caso 2205). NO mueve datos: solo valida lo NUEVO.
-- Interpretación CONSERVADORA (no bloquear flujos legítimos que hoy funcionan):
--   1. Documento: factura de compra y documento soporte NUEVOS (o al cambiar el proveedor) exigen un tercero
--      real: proveedor con NIT/tax_id (o, en el documento soporte, provider->>'identification') que NO sea genérico
--      (222222222222 / 2222222222 cuentan como vacío). Error 'tercero_obligatorio'.
--   2. Asiento: una línea en cuenta que exige tercero (chart_of_accounts.requiere_tercero, o grupos 13/22/23,
--      que cubre 1355, 2365, 2367, 2368) se RECHAZA sin tercero (o con NIT genérico) solo si el asiento es
--      manual/importación (source null, 'manual', 'import*', 'reclasificacion*') o de compras ('invoice_purchase',
--      'support_documents'), que el trigger trg_tercero_linea_asiento ya completa desde el documento.
--   3. Resto de orígenes automáticos (ventas POS a consumidor final con 222222222222, pagos a proveedor, nómina,
--      reservas, comisiones…): NO se bloquean; quedan en la cola public.v_lineas_sin_tercero para revisión.
--   Fuera de alcance (pendiente UI): selector/creación rápida de proveedor y datos tributarios del proveedor.
--   Las notas débito/crédito de proveedor y los egresos no tienen tabla propia hoy (pagos: cola, punto 3).
-- Rollback: supabase/rollbacks/20261025134155_tercero_obligatorio_rollback.sql

create or replace function public.fn_tercero_vacio(p_nit text)
returns boolean language sql immutable set search_path to 'public', 'pg_temp' as $$
  select coalesce(regexp_replace(split_part(coalesce(p_nit, ''), '-', 1), '[^0-9A-Za-z]', '', 'g'), '')
         in ('', '222222222222', '2222222222')
$$;

create or replace function public.fn_cuenta_exige_tercero(p_org integer, p_cuenta text)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(p_cuenta ~ '^(13|22|23)', false)
      or exists (select 1 from public.chart_of_accounts c where c.organization_id = p_org
                   and c.account_code = p_cuenta and c.requiere_tercero is true)
$$;
revoke all on function public.fn_cuenta_exige_tercero(integer, text) from public, anon;

-- Origen que se bloquea (manual, importación o compras).
create or replace function public.fn_origen_exige_tercero(p_source text)
returns boolean language sql immutable set search_path to 'public', 'pg_temp' as $$
  select p_source is null or p_source in ('manual', 'invoice_purchase', 'support_documents')
      or p_source like 'import%' or p_source like 'reclasificacion%'
$$;

create or replace function public.fn_trg_tercero_obligatorio_linea()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_source text; v_org integer;
begin
  if not public.fn_tercero_vacio(new.tercero_nit) then
    return new;
  end if;
  select e.source, e.organization_id into v_source, v_org from public.journal_entries e where e.id = new.journal_entry_id;
  if public.fn_origen_exige_tercero(v_source)
     and public.fn_cuenta_exige_tercero(coalesce(v_org, new.organization_id), new.account_code) then
    raise exception 'tercero_obligatorio: la cuenta % exige tercero (NIT real, no genérico) en el asiento %',
      new.account_code, new.journal_entry_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Después de trg_tercero_linea_asiento (que completa el tercero del documento) por orden alfabético.
drop trigger if exists zy_trg_tercero_obligatorio_linea on public.journal_lines;
create trigger zy_trg_tercero_obligatorio_linea
  before insert or update of account_code, tercero_nit on public.journal_lines
  for each row execute function public.fn_trg_tercero_obligatorio_linea();

create or replace function public.fn_trg_tercero_obligatorio_documento()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_nit text;
begin
  if tg_op = 'UPDATE' and new.supplier_id is not distinct from old.supplier_id
     and (to_jsonb(new)->'provider') is not distinct from (to_jsonb(old)->'provider') then
    return new;
  end if;
  select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')) into v_nit
    from public.suppliers s where s.id = new.supplier_id;
  if public.fn_tercero_vacio(v_nit) and tg_table_name = 'support_documents' then
    v_nit := nullif(btrim(to_jsonb(new)->'provider'->>'identification'), '');
  end if;
  if public.fn_tercero_vacio(v_nit) then
    raise exception 'tercero_obligatorio: el documento exige un proveedor con NIT o documento real (no genérico)'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_00_tercero_obligatorio on public.invoice_purchase;
create trigger trg_00_tercero_obligatorio before insert or update of supplier_id on public.invoice_purchase
  for each row execute function public.fn_trg_tercero_obligatorio_documento();
drop trigger if exists trg_00_tercero_obligatorio on public.support_documents;
create trigger trg_00_tercero_obligatorio before insert or update of supplier_id, provider on public.support_documents
  for each row execute function public.fn_trg_tercero_obligatorio_documento();

-- Cola de revisión: líneas en cuentas que exigen tercero sin tercero real (no bloqueadas o históricas).
create or replace view public.v_lineas_sin_tercero with (security_invoker = true) as
select l.id as line_id, e.id as journal_entry_id, e.organization_id, e.entry_date, e.source, e.source_id, e.posted,
       l.account_code, l.debit, l.credit, l.tercero_nit
  from public.journal_lines l
  join public.journal_entries e on e.id = l.journal_entry_id
 where public.fn_tercero_vacio(l.tercero_nit)
   and public.fn_cuenta_exige_tercero(e.organization_id, l.account_code);

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261025134155', 'tercero_obligatorio', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
