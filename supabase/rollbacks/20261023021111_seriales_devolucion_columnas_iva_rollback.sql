-- Rollback de 20261023021111_seriales_devolucion_columnas_iva.sql
-- Quita el orden de IVA en fn_create_journal_entry y borra columnas y funciones nuevas.
-- No reescribe asientos ya publicados.
-- Ejecutar al final de este bloque, cuando procesar_devolucion y las garantías
-- ya no usen serial_dispositions, fn_cuenta_iva ni las columnas del reclamo.

do $rollback$
declare
  v_def text;
  v_nuevo text;
begin
  v_def := pg_get_functiondef('public.fn_create_journal_entry(integer,integer,timestamptz,text,text,text,text,text,numeric,text,numeric,uuid,boolean,text)'::regprocedure);
  if position('cuenta_iva_20261023' in v_def) = 0 then
    return;
  end if;
  v_nuevo := replace(v_def, $rb_new_1$  p_debit_account := v_cfg.debito;
  p_credit_account := v_cfg.credito;
  p_tax_account := v_cfg.impuesto;

  -- cuenta_iva_20261023: mapeo del impuesto, si no la configuración, si no la regla.
  if v_iva_regla is not null or p_tax_account is not null then
    p_tax_account := public.fn_cuenta_iva(
      p_organization_id, v_branch_id, p_source, coalesce(v_iva_regla, p_tax_account));
  end if;

  p_debit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_debit_account);$rb_new_1$, $rb_old_1$  p_debit_account := v_cfg.debito;
  p_credit_account := v_cfg.credito;
  p_tax_account := v_cfg.impuesto;

  p_debit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_debit_account);$rb_old_1$);
  if v_nuevo = v_def then
    raise exception 'rollback iva: no está el tramo 1';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $rb_new_2$  v_iva_regla := p_tax_account;
  select * into v_cfg
  from public.fn_aplicar_configuracion_contable($rb_new_2$, $rb_old_2$  select * into v_cfg
  from public.fn_aplicar_configuracion_contable($rb_old_2$);
  if v_nuevo = v_def then
    raise exception 'rollback iva: no está el tramo 2';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $rb_new_3$  v_entry_id integer;
  v_branch_id integer;
  v_cfg record;
  v_iva_regla text;
begin$rb_new_3$, $rb_old_3$  v_entry_id integer;
  v_branch_id integer;
  v_cfg record;
begin$rb_old_3$);
  if v_nuevo = v_def then
    raise exception 'rollback iva: no está el tramo 3';
  end if;
  v_def := v_nuevo;
  execute v_def;
end
$rollback$;

drop function if exists public.fn_cuenta_iva(integer, integer, text, text);
drop function if exists public.fn_dia_zona(timestamptz, text);

alter table public.warranty_claims drop constraint if exists warranty_claims_credit_note_invoice_id_fkey;
alter table public.warranty_claims drop constraint if exists warranty_claims_return_id_fkey;
alter table public.warranty_claims
  drop column if exists credit_note_invoice_id,
  drop column if exists return_id,
  drop column if exists claimant_name,
  drop column if exists claimant_doc,
  drop column if exists claimant_phone,
  drop column if exists claimant_email;
alter table public.return_lines drop column if exists serial_dispositions;
