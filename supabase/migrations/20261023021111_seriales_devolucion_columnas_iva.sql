-- Seriales en la venta, devolución POS, reembolso de garantía y cuenta de IVA.
-- Parte 1: columnas, día de zona, cuenta de IVA y parche de fn_create_journal_entry.
-- Idempotente. Sin nombres de organizaciones y sin ids fijos.

alter table public.return_lines
  add column if not exists serial_dispositions jsonb not null default '{}'::jsonb;

comment on column public.return_lines.serial_dispositions is
  'Por serial devuelto: in_stock (vuelve a stock), damaged (dañado, no entra a stock) o returned.';

alter table public.warranty_claims
  add column if not exists credit_note_invoice_id uuid,
  add column if not exists return_id integer,
  add column if not exists claimant_name text,
  add column if not exists claimant_doc text,
  add column if not exists claimant_phone text,
  add column if not exists claimant_email text;

do $cols$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'warranty_claims_credit_note_invoice_id_fkey'
  ) then
    alter table public.warranty_claims
      add constraint warranty_claims_credit_note_invoice_id_fkey
      foreign key (credit_note_invoice_id) references public.invoice_sales (id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'warranty_claims_return_id_fkey'
  ) then
    alter table public.warranty_claims
      add constraint warranty_claims_return_id_fkey
      foreign key (return_id) references public.returns (id);
  end if;
end
$cols$;

comment on column public.warranty_claims.credit_note_invoice_id is
  'Nota crédito contable creada al resolver el reclamo con reembolso.';
comment on column public.warranty_claims.return_id is
  'Devolución POS que materializa el reembolso de la garantía.';
comment on column public.warranty_claims.claimant_name is
  'Nombre de quien reclama cuando la venta no tiene cliente.';

create or replace function public.fn_dia_zona(p_instante timestamptz, p_zona text)
returns date
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_instante is null then
    return null;
  end if;
  return (p_instante at time zone coalesce(nullif(btrim(p_zona), ''), 'America/Bogota'))::date;
exception when others then
  return (p_instante at time zone 'America/Bogota')::date;
end;
$function$;

comment on function public.fn_dia_zona(timestamptz, text) is
  'Día calendario de un instante en una zona IANA. Si la zona no existe, America/Bogota.';

revoke all on function public.fn_dia_zona(timestamptz, text) from public, anon;
grant execute on function public.fn_dia_zona(timestamptz, text) to authenticated, service_role;

create or replace function public.fn_cuenta_iva(
  p_organization_id integer,
  p_branch_id integer,
  p_source text,
  p_cuenta_regla text
) returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_map text;
  v_clave text;
  v_conf text;
begin
  select tam.account_code into v_map
    from public.tax_account_mapping tam
    left join public.organization_taxes ot
      on ot.id = tam.organization_tax_id
     and ot.organization_id = p_organization_id
    left join public.tax_templates tt
      on tt.id = tam.tax_template_id
   where tam.organization_id = p_organization_id
     and coalesce(tam.is_active, true)
     and (
       (ot.id is not null and coalesce(ot.is_active, true) and ot.kind = 'tax'
         and ot.name ilike '%iva%' and ot.name not ilike '%rete%')
       or (tt.id is not null and coalesce(tt.kind, 'tax') = 'tax'
         and (coalesce(tt.code, '') ilike '%iva%' or coalesce(tt.name, '') ilike '%iva%')
         and coalesce(tt.code, '') not ilike '%rete%'
         and coalesce(tt.name, '') not ilike '%rete%')
     )
     and exists (
       select 1 from public.chart_of_accounts c
        where c.organization_id = p_organization_id
          and c.account_code = tam.account_code
          and c.es_movimiento is distinct from false
     )
   order by tam.updated_at desc nulls last, tam.id desc
   limit 1;
  if v_map is not null then
    return v_map;
  end if;

  v_clave := public.fn_clave_cuenta_configurable(
    p_source,
    'impuesto',
    case
      when coalesce(p_source, '') = any (array[
        'purchase', 'purchases', 'invoice_purchase', 'purchase_order', 'purchase_orders'
      ]) then '2405'
      else '2408'
    end
  );
  if v_clave is not null then
    select c.account_code into v_conf
      from public.configuracion_contable c
     where c.organization_id = p_organization_id
       and c.clave = v_clave
       and (c.branch_id = p_branch_id or c.branch_id is null)
     order by c.branch_id nulls last
     limit 1;
    if v_conf is not null and exists (
      select 1 from public.chart_of_accounts c
       where c.organization_id = p_organization_id
         and c.account_code = v_conf
         and c.es_movimiento is distinct from false
    ) then
      return v_conf;
    end if;
  end if;

  return nullif(btrim(p_cuenta_regla), '');
end;
$function$;

comment on function public.fn_cuenta_iva(integer, integer, text, text) is
  'Cuenta de IVA de un asiento nuevo. Orden: tax_account_mapping de un IVA activo, luego configuracion_contable (sede y después organización), luego la cuenta de la regla. No lee ni reescribe asientos ya hechos.';

revoke all on function public.fn_cuenta_iva(integer, integer, text, text) from public, anon;
grant execute on function public.fn_cuenta_iva(integer, integer, text, text) to authenticated, service_role;

do $patch$
declare
  v_def text;
  v_nuevo text;
begin
  v_def := pg_get_functiondef('public.fn_create_journal_entry(integer,integer,timestamptz,text,text,text,text,text,numeric,text,numeric,uuid,boolean,text)'::regprocedure);
  if position('cuenta_iva_20261023' in v_def) > 0 then
    return;
  end if;

  v_nuevo := replace(v_def,
    $old$  v_entry_id integer;
  v_branch_id integer;
  v_cfg record;
begin$old$,
    $new$  v_entry_id integer;
  v_branch_id integer;
  v_cfg record;
  v_iva_regla text;
begin$new$);
  if v_nuevo = v_def then
    raise exception 'fn_create_journal_entry: no está el declare esperado';
  end if;
  v_def := v_nuevo;

  v_nuevo := replace(v_def,
    $old$  select * into v_cfg
  from public.fn_aplicar_configuracion_contable($old$,
    $new$  v_iva_regla := p_tax_account;
  select * into v_cfg
  from public.fn_aplicar_configuracion_contable($new$);
  if v_nuevo = v_def then
    raise exception 'fn_create_journal_entry: no está la llamada a fn_aplicar_configuracion_contable';
  end if;
  v_def := v_nuevo;

  v_nuevo := replace(v_def,
    $old$  p_debit_account := v_cfg.debito;
  p_credit_account := v_cfg.credito;
  p_tax_account := v_cfg.impuesto;

  p_debit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_debit_account);$old$,
    $new$  p_debit_account := v_cfg.debito;
  p_credit_account := v_cfg.credito;
  p_tax_account := v_cfg.impuesto;

  -- cuenta_iva_20261023: mapeo del impuesto, si no la configuración, si no la regla.
  if v_iva_regla is not null or p_tax_account is not null then
    p_tax_account := public.fn_cuenta_iva(
      p_organization_id, v_branch_id, p_source, coalesce(v_iva_regla, p_tax_account));
  end if;

  p_debit_account := public.fn_puc_cuenta_de_sede(p_organization_id, v_branch_id, p_debit_account);$new$);
  if v_nuevo = v_def then
    raise exception 'fn_create_journal_entry: no está la asignación de cuentas';
  end if;
  execute v_nuevo;
end
$patch$;
