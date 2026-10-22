-- Fase 5. Cuentas por línea, tercero, comprobante y plantillas.
-- No reescribe fn_create_journal_entry. Las columnas nuevas quedan en null.

alter table public.products
  add column if not exists cuenta_ingreso text,
  add column if not exists cuenta_costo text,
  add column if not exists cuenta_inventario text,
  add column if not exists cuenta_devolucion text;

alter table public.categories
  add column if not exists cuenta_ingreso text,
  add column if not exists cuenta_costo text,
  add column if not exists cuenta_inventario text,
  add column if not exists cuenta_devolucion text;

alter table public.invoice_items
  add column if not exists cuenta_contable text;

alter table public.journal_lines
  add column if not exists tercero_nit text,
  add column if not exists tercero_nombre text;

alter table public.journal_entries
  add column if not exists comprobante_tipo text,
  add column if not exists comprobante_prefijo text,
  add column if not exists comprobante_numero integer;

alter table public.journal_entries
  drop constraint if exists journal_entries_comprobante_tipo_chk;
alter table public.journal_entries
  add constraint journal_entries_comprobante_tipo_chk
  check (
    comprobante_tipo is null
    or comprobante_tipo in ('recibo_caja', 'comprobante_egreso', 'nota_contable', 'factura')
  );

create unique index if not exists uq_journal_entries_comprobante
  on public.journal_entries (organization_id, comprobante_tipo, comprobante_numero)
  where comprobante_numero is not null;

comment on column public.products.cuenta_ingreso is
  'Cuenta de ingreso sugerida. Null: se usa la de la categoría o la configuración contable.';
comment on column public.products.cuenta_costo is
  'Cuenta de costo sugerida para compras de productos que no mueven inventario.';
comment on column public.products.cuenta_inventario is
  'Cuenta de inventario sugerida para compras de productos que controlan existencias.';
comment on column public.products.cuenta_devolucion is
  'Cuenta de devolución sugerida en notas crédito. Null: se usa la de ingreso.';
comment on column public.invoice_items.cuenta_contable is
  'Cuenta de la línea. Null: producto, categoría y, si tampoco hay, la regla contable.';
comment on column public.journal_lines.tercero_nit is
  'NIT o cédula del tercero de la línea. Obligatorio si la cuenta lo exige.';
comment on column public.journal_entries.comprobante_tipo is
  'recibo_caja, comprobante_egreso, nota_contable o factura. Null en asientos anteriores.';

create table if not exists public.comprobante_consecutivos (
  organization_id integer not null references public.organizations (id),
  tipo text not null,
  prefijo text not null default '',
  siguiente integer not null default 1,
  primary key (organization_id, tipo),
  constraint comprobante_consecutivos_tipo_chk check (
    tipo in ('recibo_caja', 'comprobante_egreso', 'nota_contable', 'factura')
  ),
  constraint comprobante_consecutivos_siguiente_chk check (siguiente >= 1)
);

create table if not exists public.plantillas_asiento (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations (id),
  nombre text not null,
  memo text,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plantillas_asiento_nombre_chk check (char_length(btrim(nombre)) between 1 and 120)
);

create unique index if not exists uq_plantillas_asiento_nombre
  on public.plantillas_asiento (organization_id, lower(btrim(nombre)))
  where activa;

create table if not exists public.plantillas_asiento_lineas (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.plantillas_asiento (id) on delete cascade,
  organization_id integer not null,
  orden integer not null,
  account_code text not null,
  descripcion text,
  debito numeric(14, 2) not null default 0,
  credito numeric(14, 2) not null default 0,
  tercero_nit text,
  tercero_nombre text,
  cost_center_id uuid,
  constraint plantillas_asiento_lineas_lado_chk check (
    debito >= 0 and credito >= 0 and not (debito > 0 and credito > 0) and (debito > 0 or credito > 0)
  )
);

create index if not exists idx_plantillas_asiento_lineas_plantilla
  on public.plantillas_asiento_lineas (plantilla_id, orden);

create or replace function public.fn_validar_cuenta_movimiento(
  p_organization_id integer,
  p_cuenta text
) returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_cuenta text := nullif(btrim(p_cuenta), '');
  v_activa boolean;
  v_mov boolean;
begin
  if v_cuenta is null then
    return 'Elige una cuenta de movimiento';
  end if;
  select a.is_active, a.es_movimiento
    into v_activa, v_mov
    from public.chart_of_accounts a
   where a.organization_id = p_organization_id
     and a.account_code = v_cuenta;
  if not found then
    return 'La cuenta ' || v_cuenta || ' no está en el plan contable';
  end if;
  if v_activa is false then
    return 'La cuenta ' || v_cuenta || ' no está activa';
  end if;
  if v_mov is false or public.fn_es_cuenta_de_titulo(p_organization_id, v_cuenta) then
    return 'La cuenta ' || v_cuenta || ' no es de movimiento';
  end if;
  return null;
end;
$fn$;

create or replace function public.fn_cuenta_catalogo_linea(
  p_organization_id integer,
  p_product_id integer,
  p_rol text,
  p_cuenta_linea text
) returns text
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(
    nullif(btrim(p_cuenta_linea), ''),
    case p_rol
      when 'costo' then nullif(btrim(p.cuenta_costo), '')
      when 'inventario' then nullif(btrim(p.cuenta_inventario), '')
      when 'devolucion' then coalesce(nullif(btrim(p.cuenta_devolucion), ''), nullif(btrim(p.cuenta_ingreso), ''))
      else nullif(btrim(p.cuenta_ingreso), '')
    end,
    case p_rol
      when 'costo' then nullif(btrim(c.cuenta_costo), '')
      when 'inventario' then nullif(btrim(c.cuenta_inventario), '')
      when 'devolucion' then coalesce(nullif(btrim(c.cuenta_devolucion), ''), nullif(btrim(c.cuenta_ingreso), ''))
      else nullif(btrim(c.cuenta_ingreso), '')
    end
  )
  from (select 1) semilla
  left join public.products p
    on p.id = p_product_id and p.organization_id = p_organization_id
  left join public.categories c
    on c.id = p.category_id and c.organization_id = p.organization_id;
$fn$;

create or replace function public.fn_exigencias_cuenta(
  p_organization_id integer,
  p_cuenta text,
  out requiere_tercero boolean,
  out requiere_centro_costo boolean
) returns record
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(a.requiere_tercero, false), coalesce(a.requiere_centro_costo, false)
    from public.chart_of_accounts a
   where a.organization_id = p_organization_id
     and a.account_code = nullif(btrim(p_cuenta), '');
$fn$;

create or replace function public.fn_tercero_de_documento(
  p_tipo text,
  p_id uuid,
  out nit text,
  out nombre text
) returns record
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $fn$
begin
  nit := null;
  nombre := null;
  if p_tipo in ('venta', 'nota_debito', 'nota_credito') then
    select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
           nullif(btrim(c.full_name), '')
      into nit, nombre
      from public.invoice_sales i
      left join public.customers c on c.id = i.customer_id
     where i.id = p_id;
  elsif p_tipo = 'compra' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')),
           nullif(btrim(s.name), '')
      into nit, nombre
      from public.invoice_purchase i
      left join public.suppliers s on s.id = i.supplier_id
     where i.id = p_id;
  elsif p_tipo = 'documento_soporte' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), ''), nullif(btrim(d.provider->>'identification'), '')),
           coalesce(nullif(btrim(s.name), ''), nullif(btrim(d.provider->>'names'), ''))
      into nit, nombre
      from public.support_documents d
      left join public.suppliers s on s.id = d.supplier_id
     where d.id = p_id;
  end if;
end;
$fn$;

create or replace function public.fn_bloqueo_tercero_documento(
  p_organization_id integer,
  p_branch_id integer,
  p_source text,
  p_id uuid
) returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_debito text;
  v_credito text;
  v_impuesto text;
  v_usa_impuesto boolean := false;
  v_cfg record;
  v_nit text;
  v_nombre text;
  v_tipo text;
  v_cuenta text;
  v_exige record;
begin
  if p_source = 'invoice_purchase' then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_compra(p_organization_id) r;
    v_tipo := 'compra';
  elsif p_source = 'sale_credit_note' then
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.accounting_rules r
     where r.organization_id = p_organization_id
       and r.source_type = 'sale_credit_note'
       and r.event_type = 'created'
       and r.is_active = true
     order by r.priority
     limit 1;
    v_tipo := 'nota_credito';
  else
    select r.debit_account_code, r.credit_account_code, r.tax_account_code, r.use_tax_from_document
      into v_debito, v_credito, v_impuesto, v_usa_impuesto
      from public.fn_regla_devengo_venta(p_organization_id) r;
    v_tipo := 'venta';
  end if;
  if v_debito is null then
    return null;
  end if;
  select * into v_cfg
    from public.fn_aplicar_configuracion_contable(
      p_organization_id, p_branch_id, p_source, v_debito, v_credito, v_impuesto
    );
  if v_cfg.fallo is not null then
    return null;
  end if;
  select t.nit into v_nit from public.fn_tercero_de_documento(v_tipo, p_id) t;
  if v_nit is not null then
    return null;
  end if;
  foreach v_cuenta in array array[v_cfg.debito, v_cfg.credito, case when v_usa_impuesto then v_cfg.impuesto else null end]
  loop
    if v_cuenta is null then
      continue;
    end if;
    select * into v_exige from public.fn_exigencias_cuenta(p_organization_id, v_cuenta);
    if coalesce(v_exige.requiere_tercero, false) then
      return 'La cuenta ' || v_cuenta || ' exige el NIT o la cédula del tercero';
    end if;
  end loop;
  return null;
end;
$fn$;

create or replace function public.fn_documento_tiene_cuenta_propia(
  p_organization_id integer,
  p_id uuid,
  p_tipo text
) returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select exists (
    select 1
      from public.invoice_items ii
      left join public.products p
        on p.id = ii.product_id and p.organization_id = p_organization_id
     where case p_tipo
             when 'compra' then ii.invoice_purchase_id = p_id
             when 'documento_soporte' then ii.support_document_id = p_id
             else ii.invoice_sales_id = p_id
           end
       and public.fn_cuenta_catalogo_linea(
             p_organization_id,
             ii.product_id,
             case
               when p_tipo in ('compra', 'documento_soporte') and coalesce(p.track_stock, false)
                 then 'inventario'
               when p_tipo in ('compra', 'documento_soporte') then 'costo'
               when p_tipo = 'nota_credito' then 'devolucion'
               else 'ingreso'
             end,
             ii.cuenta_contable
           ) is not null
  );
$fn$;

create or replace function public.fn_documento_lineas_json_tienen_cuenta(
  p_organization_id integer,
  p_lineas jsonb,
  p_rol text
) returns boolean
language sql
stable
set search_path to 'public', 'pg_temp'
as $fn$
  select exists (
    select 1
      from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) l
     where public.fn_cuenta_catalogo_linea(
             p_organization_id,
             nullif(l->>'product_id', '')::integer,
             p_rol,
             coalesce(l->>'cuenta_contable', '')
           ) is not null
  );
$fn$;

revoke all on function public.fn_validar_cuenta_movimiento(integer, text) from public, anon, authenticated;
revoke all on function public.fn_cuenta_catalogo_linea(integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_exigencias_cuenta(integer, text) from public, anon, authenticated;
revoke all on function public.fn_tercero_de_documento(text, uuid) from public, anon, authenticated;
revoke all on function public.fn_bloqueo_tercero_documento(integer, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.fn_documento_tiene_cuenta_propia(integer, uuid, text) from public, anon, authenticated;
revoke all on function public.fn_documento_lineas_json_tienen_cuenta(integer, jsonb, text) from public, anon, authenticated;
