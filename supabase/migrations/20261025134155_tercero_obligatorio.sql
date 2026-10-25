-- Tanda 4 (25-oct-2026, spec producto/tercero_obligatorio_spec.md), REESCRITA por decisión de Juan (25-oct):
-- la identificación del proveedor es OPCIONAL al guardar. NO se bloquea guardar facturas de compra, documentos
-- soporte ni asientos por falta de NIT. Solo es obligatoria al EMITIR/TRANSMITIR electrónicamente a la DIAN (Factus).
--   * SIN triggers de guardado: se quitan (si existían) trg_00_tercero_obligatorio en invoice_purchase y
--     support_documents, y zy_trg_tercero_obligatorio_linea en journal_lines, y sus funciones de trigger.
--   * fn_validar_identificacion_para_dian(p_supplier_id, p_identificacion): valida al transmitir. Devuelve la
--     identificación real (NIT; si no hay, cédula / cédula de extranjería / pasaporte del proveedor o la recibida)
--     o lanza 'tercero_obligatorio_dian'. 222222222222 / 2222222222 cuentan como vacío. No la llama ningún trigger.
--     Emisión hoy: el documento soporte se transmite desde la cola Factus (src/lib/services/einvoicing/
--     colaFacturacion.server.ts → payloadsFactus.construirDocumentoSoporte), que aplica la misma regla y el mismo
--     código de error. Las facturas de compra se RECIBEN (no se transmiten): no se validan. Ventas POS a consumidor
--     final (222222222222) no se tocan.
--   * Se conservan (inofensivos): fn_tercero_vacio, fn_cuenta_exige_tercero y la cola public.v_lineas_sin_tercero.
-- No mueve datos. Rollback: supabase/rollbacks/20261025134155_tercero_obligatorio_rollback.sql

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

-- Sin bloqueo al guardar (decisión de Juan): fuera los triggers y funciones de la versión anterior.
drop trigger if exists zy_trg_tercero_obligatorio_linea on public.journal_lines;
drop trigger if exists trg_00_tercero_obligatorio on public.invoice_purchase;
drop trigger if exists trg_00_tercero_obligatorio on public.support_documents;
drop function if exists public.fn_trg_tercero_obligatorio_linea();
drop function if exists public.fn_trg_tercero_obligatorio_documento();
drop function if exists public.fn_origen_exige_tercero(text);

-- Validación SOLO para la emisión electrónica a la DIAN (Factus). Uso:
--   select public.fn_validar_identificacion_para_dian(p_supplier_id => 12);            -- proveedor
--   select public.fn_validar_identificacion_para_dian(p_identificacion => '900123456'); -- dato del documento
-- Con ambos, vale la del proveedor y, si está vacía, la recibida. Error: 'tercero_obligatorio_dian' (22023).
create or replace function public.fn_validar_identificacion_para_dian(
  p_supplier_id integer default null,
  p_identificacion text default null
) returns text
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_id text;
begin
  if p_supplier_id is not null then
    -- NIT primero; si no hay, la identificación tributaria/personal guardada (cédula, CE, pasaporte).
    select case when not public.fn_tercero_vacio(s.nit) then btrim(s.nit)
                when not public.fn_tercero_vacio(s.tax_id) then btrim(s.tax_id) end
      into v_id
      from public.suppliers s where s.id = p_supplier_id;
  end if;
  if public.fn_tercero_vacio(v_id) and not public.fn_tercero_vacio(p_identificacion) then
    v_id := btrim(p_identificacion);
  end if;
  if public.fn_tercero_vacio(v_id) then
    raise exception 'tercero_obligatorio_dian: para transmitir a la DIAN el proveedor necesita NIT o cédula, cédula de extranjería o pasaporte (no genérico 222222222222)'
      using errcode = '22023';
  end if;
  return v_id;
end $$;
revoke all on function public.fn_validar_identificacion_para_dian(integer, text) from public, anon;
grant execute on function public.fn_validar_identificacion_para_dian(integer, text) to authenticated, service_role;

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
