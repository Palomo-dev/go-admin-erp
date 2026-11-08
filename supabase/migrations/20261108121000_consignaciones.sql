-- Consignaciones en los dos sentidos y entre organizaciones.
-- Figma «07 Finanzas»: entregada 2335:138595 (lista), 2335:139248 (nueva nota), 2335:139356 (liquidación);
-- recibida y entre organizaciones, sección 2403:146159 (capturas docs/design/figma/89-consignacion-recibida-*).
-- Diseño y decisiones: docs/design/CONSIGNACION-RECIBIDA-Y-ENTRE-ORGANIZACIONES.md, secciones «Decisiones del
-- dueño y criterio del Contador» y «Correcciones del Contador 2 (2026-11-07)» (mandan sobre lo anterior).
--
-- PROPUESTA, SIN APLICAR. Nunca se aplicó: se reescribió entera (2026-11-07). Va DESPUÉS de
-- 20261108120500_organization_links.sql. Mientras no exista, la pantalla dice «pendiente de activar».
--
-- ═══ Clasificación del contrato (OBLIGATORIA, sin valor por defecto) ════════════════════════════════
--   'intermediacion'  mandato: la mercancía y el recaudo son del dueño; el intermediario solo gana su remuneración.
--   'estimatorio'     el consignatario adquiere lo que vende, al venderlo, por el precio estimado; lo demás lo
--                     devuelve. Base de IVA: requiere revisión del Contador (pendiente visible en cada liquidación).
--   'compra'          compra real: NO es consignación. Se registra con la factura de compra (inventario + obligación
--                     al adquirir; costo de venta al vender por el flujo de siempre) o con la factura de venta del
--                     lado del dueño. Las RPC de aquí la rechazan con 'compra_real_usa_factura'.
-- Sin clasificación no se opera ('clasificacion_obligatoria').
--
-- ═══ Otras condiciones del contrato, por nota ══════════════════════════════════════════════════════
--   precio del dueño 'fijo' o 'minimo'; remuneración 'porcentaje' (con su base: 'precio_pactado' o 'precio_venta')
--   o 'precio_liquidacion' por producto; en intermediación, cuándo nace la obligación con el dueño en ventas a
--   crédito ('venta' o 'cobro'); quién asume devoluciones, pérdidas y gastos ('dueno' | 'consignatario'); quién
--   factura al público y por cuenta de quién.
--   IVA y retenciones NO se eligen: se determinan por ley. La liquidación guarda los HECHOS (calidades tributarias
--   de las dos partes, concepto, municipio, fecha); lo que no está parametrizado queda como PENDIENTE CONTABLE
--   visible en la bandeja de siempre (journal_entry_failures, «Pendientes contables»), nunca inventado.
--
-- ═══ Asientos (cuentas por la configuración contable por clave y el PUC de la organización; si falta una, se
--     BLOQUEA con un mensaje claro y la app deja el pendiente contable; nunca se inventa) ═══════════════════
-- RECIBIDA (mercancía ajena: control físico separado por consignante, no inventario propio)
--   recibir              D grupo 94 (clave 'consignacion_recibida_contra'; si no, la primera de movimiento del 94)
--                        C 911520 «En consignación» (clave 'consignacion_recibida_orden'; si no, 911520 o su auxiliar)
--                                                                                       cantidad × precio pactado
--   vender               el flujo de siempre (posService, factura de venta). Por cada unidad, un disparador del kardex:
--                        D 911520 / C 94 (revierte el control)                          vendido × precio pactado
--                        intermediación: el recaudo es pasivo con el dueño en 281510, AUXILIAR DEL PROPIETARIO:
--                          factura de venta → la cuenta de ingreso y de devolución del producto ES ese auxiliar
--                          POS              → D ingreso de la regla de venta del POS / C auxiliar 281510 (neto)
--                        estimatorio: ingreso propio (4135, el de siempre). Sin costo: el producto no tiene costo propio.
--   devolver al dueño    kardex de salida; D 911520 / C 94                              devuelto × precio pactado
--   liquidar (intermediación)
--                        D auxiliar 281510 / C auxiliar de 8 dígitos bajo 413512 (clave 'consignacion_remuneracion')
--                                                                                      solo la remuneración
--                        El saldo del auxiliar 281510 es lo que se le debe al dueño: se paga (o se anticipa) por
--                        Tesorería › Dinero de terceros. NUNCA 2205 ni 4225.
--   liquidar (estimatorio) la adquisición nace aquí: la app crea la factura de compra de siempre por lo vendido al
--                        precio del dueño (fn_factura_compra_guardar + confirmar sin recepcionar), línea a la cuenta
--                        de costo (clave 'consignacion_costo_compra'; si no, 'costo_ventas') porque la unidad ya salió
--                        vendida; su disparador pone D costo + IVA descontable / C 2205 y la CxP.
--   anular liquidación   contra-asiento de la remuneración; lo vendido vuelve a quedar por liquidar.
-- ENTREGADA (para el dueño, enviar NO es vender: sigue siendo SU inventario)
--   entregar             reclasificación DENTRO de inventarios: D subcuenta de mercancía en poder de terceros
--                        (clave 'inventario_consignacion'; respaldo 1465; tiene que ser del grupo 14) / C inventario.
--                        Nada de ingreso ni costo.
--   liquidar (estimatorio) D inventario / C mercancía en poder de terceros (vuelve lo vendido y lo devuelto); la factura
--                        de venta de siempre pone ingreso, IVA, costo y cartera; la comisión, saldo a favor aplicado.
--   liquidar (intermediación) PENDIENTE del Contador (el dueño reconoce el ingreso sin factura al intermediario):
--                        'liquidacion_mandante_pendiente'.
--
-- Escritura SOLO por las RPC (SECURITY DEFINER, guarda de organización, sucursal y permiso); lectura por RLS de
-- pertenencia; nada para anon. Kardex solo por fn_inv_int_mover; asientos solo por fn_create_journal_entry
-- (dos líneas cuadradas, idempotentes por fact_key).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.consignment_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer not null references public.branches(id),
  direction text not null check (direction in ('entregada', 'recibida')),
  -- Entregada: el consignatario (cliente). Recibida: el consignante (proveedor).
  customer_id uuid references public.customers(id),
  supplier_id integer references public.suppliers(id),
  number text not null,
  location text,
  -- Clasificación del contrato: obligatoria, SIN default.
  contract_type text not null check (contract_type in ('intermediacion', 'estimatorio', 'compra')),
  price_mode text not null check (price_mode in ('fijo', 'minimo')),
  remuneration_mode text not null check (remuneration_mode in ('porcentaje', 'precio_liquidacion')),
  commission_base text not null check (commission_base in ('precio_pactado', 'precio_venta')),
  commission_pct numeric(5,2) not null default 0 check (commission_pct >= 0 and commission_pct <= 100),
  -- Intermediación: cuándo nace la obligación con el dueño en las ventas a crédito.
  owner_obligation_at text check (owner_obligation_at in ('venta', 'cobro')),
  -- {devoluciones, perdidas, gastos}: 'dueno' | 'consignatario'.
  risk_terms jsonb not null,
  -- {factura: 'consignatario' | 'consignante', por_cuenta_de: 'consignante' | 'consignatario'}
  billing_terms jsonb not null,
  status text not null default 'en_consignacion' check (status in ('en_consignacion', 'por_liquidar', 'liquidada')),
  account_code text,               -- entregada: mercancía en poder de terceros (grupo 14)
  inventory_account_code text,     -- entregada: inventario de la sede
  memo_account_code text,          -- recibida: 911520
  memo_contra_account_code text,   -- recibida: grupo 94
  owner_account_code text,         -- recibida intermediación: auxiliar 281510 del propietario
  remuneration_account_code text,  -- recibida intermediación: auxiliar 413512
  cost_account_code text,          -- recibida estimatorio: costo de la adquisición
  total_cost numeric(16,2) not null default 0,
  total_agreed numeric(16,2) not null default 0,
  delivered_at timestamptz not null default now(),
  due_date date,
  settlement_frequency text check (settlement_frequency in ('semanal', 'quincenal', 'mensual', 'al_vencimiento')),
  link_id uuid references public.organization_links(id),
  shared_document_id uuid references public.organization_shared_documents(id),
  external_number text check (external_number is null or length(external_number) <= 60),
  notes text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consignment_notes_numero unique (organization_id, number),
  constraint consignment_notes_clave unique (organization_id, idempotency_key),
  constraint consignment_notes_no_compra check (contract_type <> 'compra'),
  constraint consignment_notes_sentido check (
    (direction = 'entregada' and customer_id is not null and account_code is not null and inventory_account_code is not null)
    or (direction = 'recibida' and supplier_id is not null and memo_account_code is not null and memo_contra_account_code is not null)
  ),
  constraint consignment_notes_intermediacion check (
    direction = 'entregada' or contract_type <> 'intermediacion'
    or (owner_account_code is not null and remuneration_account_code is not null and owner_obligation_at is not null)
  ),
  constraint consignment_notes_estimatorio check (direction = 'entregada' or contract_type <> 'estimatorio' or cost_account_code is not null),
  constraint consignment_notes_terminos check (jsonb_typeof(risk_terms) = 'object' and jsonb_typeof(billing_terms) = 'object')
);

comment on table public.consignment_notes is
  'Notas de consignación entregadas y recibidas. Clasificación del contrato obligatoria (intermediación o estimatorio; la compra real va por la factura). Escritura solo por fn_consignacion_*.';

create unique index if not exists consignment_notes_documento_compartido
  on public.consignment_notes (organization_id, shared_document_id) where shared_document_id is not null;
create index if not exists idx_consignment_notes_supplier on public.consignment_notes (organization_id, supplier_id) where supplier_id is not null;

create table if not exists public.consignment_note_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  note_id uuid not null references public.consignment_notes(id) on delete cascade,
  product_id integer not null references public.products(id),
  qty_delivered numeric(12,3) not null check (qty_delivered > 0),
  -- Entregada: costo del dueño (promedio al entregar). Recibida: 0 (no hay costo propio).
  unit_cost numeric(16,4) not null default 0 check (unit_cost >= 0),
  -- Precio del dueño, sin IVA (fijo o mínimo); valoriza las cuentas de orden de la recibida.
  agreed_price numeric(16,2) check (agreed_price is null or agreed_price >= 0),
  -- Precio de liquidación por unidad, si la remuneración se pactó así.
  settlement_price numeric(16,2) check (settlement_price is null or settlement_price >= 0),
  external_ref text check (external_ref is null or length(external_ref) <= 120),
  external_display jsonb,
  qty_sold numeric(12,3) not null default 0 check (qty_sold >= 0),
  qty_returned numeric(12,3) not null default 0 check (qty_returned >= 0),
  constraint consignment_note_lines_cuadre check (qty_sold + qty_returned <= qty_delivered)
);

create index if not exists idx_consignment_note_lines_note on public.consignment_note_lines (note_id);
create index if not exists idx_consignment_note_lines_product on public.consignment_note_lines (product_id);

create table if not exists public.consignment_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  note_id uuid not null references public.consignment_notes(id),
  direction text not null check (direction in ('entregada', 'recibida')),
  period_from date,
  period_to date,
  -- Separados (Contador 2, punto 6): precio de venta, precio pactado, costo del dueño, remuneración, descuentos e IVA.
  sale_total numeric(16,2) not null default 0,
  agreed_total numeric(16,2) not null default 0,
  owner_cost_total numeric(16,2) not null default 0,
  discount_total numeric(16,2) not null default 0,
  tax_total numeric(16,2) not null default 0,
  commission_pct numeric(5,2) not null default 0,
  commission_amount numeric(16,2) not null default 0,
  net_amount numeric(16,2) not null default 0,
  returned_cost numeric(16,2) not null default 0,
  owner_amount numeric(16,2) not null default 0,
  payable_amount numeric(16,2) not null default 0,
  -- Hechos tributarios de la liquidación (calidades, concepto, municipio, fecha) y lo pendiente de determinar.
  tax_facts jsonb not null default '{}'::jsonb,
  invoice_id uuid references public.invoice_sales(id),
  purchase_invoice_id uuid references public.invoice_purchase(id),
  commission_credit_id uuid references public.credit_notes(id),
  shared_document_id uuid references public.organization_shared_documents(id),
  status text not null default 'por_facturar' check (status in ('por_facturar', 'liquidada', 'anulada')),
  void_reason text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid,
  constraint consignment_settlements_clave unique (organization_id, idempotency_key)
);

create index if not exists idx_consignment_settlements_note on public.consignment_settlements (note_id);

create table if not exists public.consignment_settlement_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  settlement_id uuid not null references public.consignment_settlements(id) on delete cascade,
  line_id uuid not null references public.consignment_note_lines(id),
  product_id integer not null references public.products(id),
  -- Neto de reversos: puede ser negativo (devolución después de una liquidación anterior).
  qty_sold numeric(12,3) not null default 0,
  unit_price numeric(16,2) not null default 0,
  qty_returned numeric(12,3) not null default 0 check (qty_returned >= 0),
  sale_amount numeric(16,2) not null default 0,
  owner_amount numeric(16,2) not null default 0,
  discount_amount numeric(16,2) not null default 0,
  tax_amount numeric(16,2) not null default 0
);

create index if not exists idx_consignment_settlement_lines_settlement on public.consignment_settlement_lines (settlement_id);

-- Productos de consignación: siempre aparte de los propios, de un solo consignante y una sola clasificación.
create table if not exists public.consignment_products (
  product_id integer primary key references public.products(id),
  organization_id integer not null references public.organizations(id) on delete cascade,
  supplier_id integer not null references public.suppliers(id),
  contract_type text not null check (contract_type in ('intermediacion', 'estimatorio')),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_consignment_products_org on public.consignment_products (organization_id, supplier_id);

-- Ventas y reversos de productos de consignación, por movimiento de kardex y línea de nota (FIFO por nota).
-- note_id/line_id nulos = vendido sin nota abierta que lo cubra: queda como pendiente contable.
create table if not exists public.consignment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  note_id uuid references public.consignment_notes(id),
  line_id uuid references public.consignment_note_lines(id),
  product_id integer not null references public.products(id),
  stock_movement_id integer not null,
  kind text not null check (kind in ('venta', 'reverso')),
  qty numeric(12,3) not null check (qty > 0),
  -- Neto de IVA y de descuento, según la línea de venta o de factura; si no se pudo leer, el precio pactado.
  sale_amount numeric(16,2) not null default 0,
  discount_amount numeric(16,2) not null default 0,
  tax_amount numeric(16,2) not null default 0,
  agreed_amount numeric(16,2) not null default 0,
  source text not null,
  source_id text,
  reverses_id uuid references public.consignment_allocations(id),
  settlement_id uuid references public.consignment_settlements(id),
  -- Reverso de una venta ya liquidada cuyo riesgo asume el consignatario: no toca lo del dueño.
  absorbed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint consignment_allocations_unico unique (stock_movement_id, line_id, kind)
);

create index if not exists idx_consignment_allocations_note on public.consignment_allocations (note_id) where settlement_id is null;
create index if not exists idx_consignment_allocations_product on public.consignment_allocations (organization_id, product_id);

-- Devoluciones al consignante (recibida).
create table if not exists public.consignment_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  note_id uuid not null references public.consignment_notes(id),
  lines jsonb not null,
  total_agreed numeric(16,2) not null default 0,
  shared_document_id uuid references public.organization_shared_documents(id),
  notes text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint consignment_returns_clave unique (organization_id, idempotency_key)
);

create index if not exists idx_consignment_returns_note on public.consignment_returns (note_id);

alter table public.consignment_notes enable row level security;
alter table public.consignment_note_lines enable row level security;
alter table public.consignment_settlements enable row level security;
alter table public.consignment_settlement_lines enable row level security;
alter table public.consignment_products enable row level security;
alter table public.consignment_allocations enable row level security;
alter table public.consignment_returns enable row level security;

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['consignment_notes', 'consignment_note_lines', 'consignment_settlements',
                                 'consignment_settlement_lines', 'consignment_products', 'consignment_allocations',
                                 'consignment_returns'] loop
    execute format('drop policy if exists %I on public.%I', v_tabla || '_select_miembros', v_tabla);
    execute format(
      'create policy %I on public.%I for select to authenticated using ('
      || 'organization_id in (select om.organization_id from public.organization_members om '
      || 'where om.user_id = (select auth.uid()) and om.is_active))',
      v_tabla || '_select_miembros', v_tabla);
    execute format('revoke all on public.%I from anon', v_tabla);
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from authenticated', v_tabla);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cuentas y pendientes contables
-- ─────────────────────────────────────────────────────────────────────────────

-- Mercancía entregada (sigue siendo inventario del dueño): configuración contable o 1465, SIEMPRE del grupo 14.
create or replace function public.fn_cuenta_inventario_consignacion(p_org integer, p_branch integer)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select c
    from (select coalesce(
            public.fn_cuenta_por_clave(p_org, p_branch, 'inventario_consignacion'),
            public.fn_primera_cuenta_detalle(p_org, array['14650501', '146505', '1465'])) as c) x
   where c ~ '^14';
$function$;

-- Primera cuenta de MOVIMIENTO del PUC de la organización cuyo código cumple el patrón (la más corta primero).
create or replace function public.fn_consignacion_cuenta_patron(p_org integer, p_patron text)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select c.account_code
    from public.chart_of_accounts c
   where c.organization_id = p_org
     and c.account_code ~ p_patron
     and coalesce(c.is_active, true)
     and c.es_movimiento is distinct from false
   order by length(c.account_code), c.account_code
   limit 1;
$function$;

-- Cuenta de MOVIMIENTO elegida por la persona: existe en el PUC de la organización y cumple el patrón.
create or replace function public.fn_consignacion_cuenta_valida(p_org integer, p_cuenta text, p_patron text)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select c.account_code
    from public.chart_of_accounts c
   where c.organization_id = p_org
     and c.account_code = btrim(p_cuenta)
     and c.account_code ~ p_patron
     and coalesce(c.is_active, true)
     and c.es_movimiento is distinct from false;
$function$;

-- Cuentas de la recibida. Si falta una: excepción con el código y la cuenta que hay que crear o configurar
-- (la app deja además el pendiente contable con fn_consignacion_registrar_pendiente).
create or replace function public.fn_consignacion_cuentas_recibida(
  p_org integer,
  p_branch integer,
  p_contrato text,
  p_proveedor integer,
  p_recaudo text default null
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_orden text;
  v_contra text;
  v_recaudo text;
  v_remuneracion text;
  v_costo text;
begin
  v_orden := coalesce(public.fn_cuenta_por_clave(p_org, p_branch, 'consignacion_recibida_orden'),
                      public.fn_consignacion_cuenta_patron(p_org, '^911520([0-9]{2})?$'));
  if v_orden is null then
    raise exception 'sin_cuenta_orden_consignacion' using errcode = 'P0002',
      hint = 'Cree en el plan de cuentas la subcuenta 911520 «En consignación» (o su auxiliar) o configure la clave consignacion_recibida_orden.';
  end if;
  v_contra := coalesce(public.fn_cuenta_por_clave(p_org, p_branch, 'consignacion_recibida_contra'),
                       public.fn_consignacion_cuenta_patron(p_org, '^94[0-9]{2,6}$'));
  if v_contra is null then
    raise exception 'sin_cuenta_contra_orden' using errcode = 'P0002',
      hint = 'Cree una cuenta de movimiento del grupo 94 o configure la clave consignacion_recibida_contra.';
  end if;

  if p_contrato = 'intermediacion' then
    if nullif(btrim(coalesce(p_recaudo, '')), '') is not null then
      v_recaudo := public.fn_consignacion_cuenta_valida(p_org, p_recaudo, '^281510[0-9]{2}$');
      if v_recaudo is null then
        raise exception 'cuenta_recaudo_invalida' using errcode = '22023',
          hint = 'El recaudo del dueño va a un auxiliar de 8 dígitos bajo 281510, de movimiento.';
      end if;
    else
      select n.owner_account_code into v_recaudo
        from public.consignment_notes n
       where n.organization_id = p_org and n.direction = 'recibida' and n.supplier_id = p_proveedor
         and n.owner_account_code is not null
       order by n.created_at desc
       limit 1;
    end if;
    if v_recaudo is null then
      raise exception 'sin_cuenta_recaudo_propietario' using errcode = 'P0002',
        hint = 'Cree en el plan de cuentas el auxiliar de 281510 «Venta por cuenta de terceros» para este consignante y elíjalo al recibir.';
    end if;
    v_remuneracion := coalesce(public.fn_cuenta_por_clave(p_org, p_branch, 'consignacion_remuneracion'),
                               public.fn_consignacion_cuenta_patron(p_org, '^413512[0-9]{2}$'));
    if v_remuneracion is null then
      raise exception 'sin_cuenta_remuneracion' using errcode = 'P0002',
        hint = 'Cree el auxiliar de 8 dígitos bajo 413512 «Venta a cambio de retribución o por contrata» o configure la clave consignacion_remuneracion.';
    end if;
  elsif p_contrato = 'estimatorio' then
    v_costo := coalesce(public.fn_cuenta_por_clave(p_org, p_branch, 'consignacion_costo_compra'),
                        public.fn_cuenta_por_clave(p_org, p_branch, 'costo_ventas'));
    if v_costo is null then
      raise exception 'sin_cuenta_costo' using errcode = 'P0002',
        hint = 'Configure la cuenta de costo de ventas (clave costo_ventas) en Configuración contable.';
    end if;
  end if;

  return jsonb_build_object('orden', v_orden, 'contra', v_contra, 'recaudo', v_recaudo,
                            'remuneracion', v_remuneracion, 'costo', v_costo);
end;
$function$;

-- Pendiente contable VISIBLE en la bandeja de siempre (journal_entry_failures → «Pendientes contables»).
-- La llama la app cuando una RPC de consignación se bloquea por configuración (el bloqueo revierte la RPC, así
-- que el pendiente se registra aparte). Solo códigos conocidos; nada de texto libre del cliente en el motivo.
create or replace function public.fn_consignacion_registrar_pendiente(
  p_organization_id integer,
  p_codigo text,
  p_referencia text default null
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.view', 'finance.create']);
  if p_codigo not in ('sin_cuenta_orden_consignacion', 'sin_cuenta_contra_orden', 'sin_cuenta_recaudo_propietario',
                      'sin_cuenta_remuneracion', 'sin_cuenta_costo', 'sin_cuenta_consignacion', 'sin_cuenta_inventario',
                      'cuenta_consignacion_fuera_de_inventarios', 'sin_cuenta_comisiones') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  perform public.fn_log_journal_failure(
    p_organization_id, null, now(), 'consignment_config', left(coalesce(p_referencia, ''), 80),
    'consignacion_config:' || p_codigo, null, null, null, 'consignacion_config',
    'Consignaciones: falta configuración contable (' || p_codigo || ')');
end;
$function$;

-- INTERNA. Pendiente contable de un hecho que la ley no deja resolver sin parametrizar.
create or replace function public.fn_consignacion_pendiente(
  p_org integer,
  p_branch integer,
  p_motivo text,
  p_fuente text,
  p_id text,
  p_monto numeric,
  p_detalle text
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_log_journal_failure(p_org, p_branch, now(), p_fuente, p_id, p_motivo || ':' || p_id,
                                        null, null, p_monto, p_motivo, p_detalle);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Condiciones del contrato validadas (clasificación obligatoria)
-- ─────────────────────────────────────────────────────────────────────────────
-- p_terminos: { contrato, precio_modo, remuneracion_modo, base_comision, obligacion_dueno, riesgos: {devoluciones,
--               perdidas, gastos}, factura, vence, periodicidad }
-- IVA y retenciones NO van aquí: se determinan por ley con los hechos de cada liquidación.

create or replace function public.fn_consignacion_terminos(p_terminos jsonb, p_direccion text)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  t jsonb := coalesce(p_terminos, '{}'::jsonb);
  v_contrato text := t->>'contrato';
  v_riesgos jsonb := t->'riesgos';
  v_factura text;
  v_vence date;
  v_clave text;
begin
  if jsonb_typeof(t) <> 'object' then
    raise exception 'terminos_invalidos' using errcode = '22023';
  end if;
  if v_contrato is null then
    raise exception 'clasificacion_obligatoria' using errcode = '22023',
      hint = 'Elija la clasificación del contrato: intermediación, estimatorio o compra real.';
  end if;
  if v_contrato not in ('intermediacion', 'estimatorio', 'compra') then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'contrato';
  end if;
  if v_contrato = 'compra' then
    raise exception 'compra_real_usa_factura' using errcode = '22023',
      hint = 'La compra real no es consignación: regístrela con la factura de compra (o de venta, del lado del dueño).';
  end if;
  if coalesce(t->>'precio_modo', '') not in ('fijo', 'minimo') then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'precio_modo';
  end if;
  if coalesce(t->>'remuneracion_modo', '') not in ('porcentaje', 'precio_liquidacion') then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'remuneracion_modo';
  end if;
  if t->>'remuneracion_modo' = 'porcentaje' and coalesce(t->>'base_comision', '') not in ('precio_pactado', 'precio_venta') then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'base_comision';
  end if;
  if v_contrato = 'intermediacion' and coalesce(t->>'obligacion_dueno', '') not in ('venta', 'cobro') then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'obligacion_dueno';
  end if;
  if v_riesgos is null or jsonb_typeof(v_riesgos) <> 'object' then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'riesgos';
  end if;
  foreach v_clave in array array['devoluciones', 'perdidas', 'gastos'] loop
    if coalesce(v_riesgos->>v_clave, '') not in ('dueno', 'consignatario') then
      raise exception 'terminos_invalidos' using errcode = '22023', detail = 'riesgos.' || v_clave;
    end if;
  end loop;
  -- En intermediación factura el mandatario (el consignatario) por cuenta del dueño.
  v_factura := case when v_contrato = 'intermediacion' then 'consignatario' else coalesce(t->>'factura', 'consignatario') end;
  if v_factura not in ('consignatario', 'consignante') then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'factura';
  end if;
  begin
    v_vence := nullif(t->>'vence', '')::date;
  exception when others then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'vence';
  end;
  if coalesce(t->>'periodicidad', 'mensual') not in ('semanal', 'quincenal', 'mensual', 'al_vencimiento') then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'periodicidad';
  end if;
  return jsonb_build_object(
    'contrato', v_contrato, 'precio_modo', t->>'precio_modo', 'remuneracion_modo', t->>'remuneracion_modo',
    'base_comision', coalesce(t->>'base_comision', 'precio_pactado'),
    'obligacion_dueno', case when v_contrato = 'intermediacion' then t->>'obligacion_dueno' end,
    'riesgos', jsonb_build_object('devoluciones', v_riesgos->>'devoluciones', 'perdidas', v_riesgos->>'perdidas', 'gastos', v_riesgos->>'gastos'),
    'facturacion', jsonb_build_object('factura', v_factura,
                                      'por_cuenta_de', case when v_contrato = 'intermediacion' then 'consignante' else v_factura end),
    'vence', v_vence, 'periodicidad', coalesce(t->>'periodicidad', 'mensual'));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Estado de la nota (derivado)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_consignacion_estado(p_nota uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case
    when exists (select 1 from public.consignment_settlements s where s.note_id = p_nota and s.status = 'por_facturar')
      then 'por_liquidar'
    when exists (select 1 from public.consignment_allocations a
                  where a.note_id = p_nota and a.settlement_id is null and not a.absorbed)
      then 'por_liquidar'
    when coalesce((select sum(l.qty_delivered - l.qty_sold - l.qty_returned)
                     from public.consignment_note_lines l where l.note_id = p_nota), 0) <= 0
      then 'liquidada'
    else 'en_consignacion'
  end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ENTREGADA · entregar: sigue siendo inventario del dueño (reclasificación dentro del grupo 14)
-- ─────────────────────────────────────────────────────────────────────────────
-- p_lineas: [{ product_id, qty, precio? (del dueño, sin IVA), precio_liquidacion? }]

create or replace function public.fn_consignacion_entregar(
  p_customer uuid,
  p_branch integer,
  p_lineas jsonb,
  p_comision numeric,
  p_terminos jsonb,
  p_clave_idempotencia text,
  p_organization_id integer,
  p_ubicacion text default null,
  p_notas text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_nota public.consignment_notes%rowtype;
  v_linea jsonb;
  v_producto integer;
  v_qty numeric;
  v_precio numeric;
  v_precio_liq numeric;
  v_prod record;
  v_mov jsonb;
  v_m jsonb;
  v_costo_linea numeric;
  v_total numeric := 0;
  v_pactado numeric := 0;
  v_cuenta_cons text;
  v_cuenta_inv text;
  v_numero text;
  v_entry integer;
  v_comision numeric := round(coalesce(p_comision, 0), 2);
  v_t jsonb;
  v_doc uuid;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if v_org is null then
    raise exception 'organizacion_no_permitida' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_comision < 0 or v_comision > 100 then
    raise exception 'comision_invalida' using errcode = '22023';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lineas) > 200 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  v_t := public.fn_consignacion_terminos(p_terminos, 'entregada');

  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  perform public.fn_inventario_exigir_permiso(v_org, array['trasladar']);

  perform pg_advisory_xact_lock(hashtextextended('consignacion_entregar:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_nota from public.consignment_notes
   where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_nota.customer_id is distinct from p_customer or v_nota.branch_id <> p_branch then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('nota_id', v_nota.id, 'numero', v_nota.number, 'repetida', true, 'costo', v_nota.total_cost);
  end if;

  if not exists (select 1 from public.customers c where c.id = p_customer and c.organization_id = v_org) then
    raise exception 'cliente_no_encontrado' using errcode = 'P0002';
  end if;
  if p_branch is null or not exists (
    select 1 from public.branches b where b.id = p_branch and b.organization_id = v_org and coalesce(b.is_active, true)
  ) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  if not public.app_branch_access(p_branch) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  v_cuenta_cons := public.fn_cuenta_inventario_consignacion(v_org, p_branch);
  if v_cuenta_cons is null then
    raise exception 'sin_cuenta_consignacion' using errcode = 'P0002',
      hint = 'Configure en Configuración contable la subcuenta de inventarios (grupo 14) para la mercancía en poder de terceros.';
  end if;
  v_cuenta_inv := coalesce(public.fn_cuenta_por_clave(v_org, p_branch, 'inventario'),
                           public.fn_inventario_auxiliar_1435(v_org, p_branch));
  if v_cuenta_inv is null then
    raise exception 'sin_cuenta_inventario' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('consignacion_numero:' || v_org, 0));
  select 'NCO-' || lpad((coalesce(max(nullif(regexp_replace(n.number, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 4, '0')
    into v_numero
    from public.consignment_notes n
   where n.organization_id = v_org and n.direction = 'entregada';

  insert into public.consignment_notes (
    organization_id, branch_id, direction, customer_id, number, location, contract_type, price_mode, remuneration_mode,
    commission_base, commission_pct, owner_obligation_at, risk_terms, billing_terms, status, account_code,
    inventory_account_code, due_date, settlement_frequency, notes, idempotency_key, created_by
  ) values (
    v_org, p_branch, 'entregada', p_customer, v_numero, nullif(btrim(coalesce(p_ubicacion, '')), ''),
    v_t->>'contrato', v_t->>'precio_modo', v_t->>'remuneracion_modo', v_t->>'base_comision', v_comision,
    v_t->>'obligacion_dueno', v_t->'riesgos', v_t->'facturacion', 'en_consignacion', v_cuenta_cons, v_cuenta_inv,
    (v_t->>'vence')::date, v_t->>'periodicidad', nullif(btrim(coalesce(p_notas, '')), ''), p_clave_idempotencia, v_uid
  ) returning * into v_nota;

  for v_linea in select e from jsonb_array_elements(p_lineas) e loop
    begin
      v_producto := (v_linea->>'product_id')::integer;
      v_qty := round((v_linea->>'qty')::numeric, 3);
      v_precio := round(nullif(v_linea->>'precio', '')::numeric, 2);
      v_precio_liq := round(nullif(v_linea->>'precio_liquidacion', '')::numeric, 2);
    exception when others then
      raise exception 'linea_invalida' using errcode = '22023';
    end;
    if v_producto is null or v_qty is null or v_qty <= 0 or coalesce(v_precio, 0) < 0 or coalesce(v_precio_liq, 0) < 0 then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    select p.id, p.organization_id, coalesce(p.track_stock, true) as track_stock, coalesce(p.track_serial, false) as track_serial,
           exists (select 1 from public.products c where c.parent_product_id = p.id and coalesce(c.status, 'active') <> 'deleted') as con_variantes,
           p.status
      into v_prod
      from public.products p where p.id = v_producto;
    if v_prod.id is null or v_prod.organization_id is distinct from v_org or v_prod.status = 'deleted' then
      raise exception 'producto_invalido' using errcode = '22023', detail = v_producto::text;
    end if;
    if exists (select 1 from public.consignment_products cp where cp.product_id = v_producto) then
      raise exception 'producto_ajeno' using errcode = '22023', detail = v_producto::text,
        hint = 'Un producto recibido en consignación no se entrega en consignación: no es tuyo.';
    end if;
    if not v_prod.track_stock then
      raise exception 'producto_sin_seguimiento' using errcode = '22023', detail = v_producto::text;
    end if;
    if v_prod.track_serial then
      raise exception 'producto_con_seriales' using errcode = '22023', detail = v_producto::text;
    end if;
    if v_prod.con_variantes then
      raise exception 'producto_con_variantes' using errcode = '22023', detail = v_producto::text;
    end if;

    -- Sale físicamente de la bodega como un traslado (sin asiento propio; stock insuficiente = error).
    v_mov := public.fn_inv_int_mover(v_org, p_branch, v_producto, null, 'out', v_qty, null,
                                     'transfer_out', 'consignacion:' || v_nota.id::text,
                                     'Consignación ' || v_numero, v_uid, '{}'::jsonb);
    v_costo_linea := 0;
    for v_m in select e from jsonb_array_elements(coalesce(v_mov->'movimientos', '[]'::jsonb)) e loop
      v_costo_linea := v_costo_linea + coalesce((v_m->>'qty')::numeric, 0) * coalesce((v_m->>'unit_cost')::numeric, 0);
    end loop;

    insert into public.consignment_note_lines (organization_id, note_id, product_id, qty_delivered, unit_cost, agreed_price, settlement_price)
    values (v_org, v_nota.id, v_producto, v_qty, case when v_qty > 0 then round(v_costo_linea / v_qty, 4) else 0 end, v_precio, v_precio_liq);
    v_total := v_total + v_costo_linea;
    v_pactado := v_pactado + v_qty * coalesce(v_precio, 0);
  end loop;

  v_total := round(v_total, 2);
  update public.consignment_notes set total_cost = v_total, total_agreed = round(v_pactado, 2), updated_at = now() where id = v_nota.id;

  -- Reclasificación DENTRO de inventarios (sigue siendo activo del dueño; nada de ingreso ni costo).
  if v_total > 0 then
    v_entry := public.fn_create_journal_entry(
      p_organization_id := v_org,
      p_branch_id := p_branch,
      p_entry_date := now(),
      p_memo := 'Mercancía en poder de terceros (consignación) - ' || v_numero,
      p_source := 'consignment_note',
      p_source_id := v_nota.id::text,
      p_debit_account := v_cuenta_cons,
      p_credit_account := v_cuenta_inv,
      p_amount := v_total,
      p_created_by := v_uid,
      p_fact_key := 'consignment_note:' || v_nota.id::text);
    if v_entry is null then
      raise exception 'asiento_no_creado' using errcode = 'P0001',
        hint = 'Revise el plan de cuentas (mercancía en poder de terceros e inventario) y el periodo contable.';
    end if;
  end if;

  v_doc := public.fn_consignacion_compartir_interna(v_nota.id);

  return jsonb_build_object('nota_id', v_nota.id, 'numero', v_numero, 'repetida', false, 'costo', v_total,
                            'asiento_id', v_entry, 'documento_compartido_id', v_doc);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ENTREGADA · liquidar y cerrar (estimatorio; la intermediación del dueño espera al Contador)
-- ─────────────────────────────────────────────────────────────────────────────
-- p_lineas: [{ "linea_id": uuid, "vendido": n, "precio": n, "devuelto": n }]

create or replace function public.fn_consignacion_liquidar(
  p_nota uuid,
  p_lineas jsonb,
  p_clave_idempotencia text,
  p_organization_id integer default null,
  p_desde date default null,
  p_hasta date default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_nota public.consignment_notes%rowtype;
  v_liq public.consignment_settlements%rowtype;
  v_l jsonb;
  v_linea public.consignment_note_lines%rowtype;
  v_linea_id uuid;
  v_vendido numeric;
  v_devuelto numeric;
  v_precio numeric;
  v_venta numeric := 0;
  v_costo numeric := 0;
  v_costo_vendido numeric := 0;
  v_costo_dev numeric := 0;
  v_comision numeric;
  v_entry integer;
  v_lineas_venta jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;

  select organization_id into v_org from public.consignment_notes where id = p_nota and direction = 'entregada';
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  perform public.fn_inventario_exigir_permiso(v_org, array['trasladar']);

  perform pg_advisory_xact_lock(hashtextextended('consignacion_liquidar:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_liq from public.consignment_settlements where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_liq.note_id <> p_nota then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', true, 'estado', v_liq.status,
      'venta', v_liq.sale_total, 'comision', v_liq.commission_amount, 'neto', v_liq.net_amount, 'factura_id', v_liq.invoice_id);
  end if;

  select * into v_nota from public.consignment_notes where id = p_nota and organization_id = v_org for update;
  if v_nota.contract_type <> 'estimatorio' then
    raise exception 'liquidacion_mandante_pendiente' using errcode = '22023',
      hint = 'La liquidación del dueño en intermediación espera el criterio del Contador (reconocer el ingreso sin factura al intermediario).';
  end if;
  if not public.app_branch_access(v_nota.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if exists (select 1 from public.consignment_settlements s where s.note_id = p_nota and s.status = 'por_facturar') then
    raise exception 'liquidacion_pendiente' using errcode = '22023',
      hint = 'Hay una liquidación por facturar de esta nota: factúrela antes de registrar otra.';
  end if;

  insert into public.consignment_settlements (
    organization_id, note_id, direction, period_from, period_to, commission_pct, status, idempotency_key, created_by
  ) values (
    v_org, p_nota, 'entregada', p_desde, coalesce(p_hasta, public.fn_today_for(v_org, v_nota.branch_id)), v_nota.commission_pct,
    'por_facturar', p_clave_idempotencia, v_uid
  ) returning * into v_liq;

  for v_l in select e from jsonb_array_elements(p_lineas) e loop
    begin
      v_linea_id := (v_l->>'linea_id')::uuid;
      v_vendido := round(coalesce((v_l->>'vendido')::numeric, 0), 3);
      v_devuelto := round(coalesce((v_l->>'devuelto')::numeric, 0), 3);
      v_precio := round(coalesce((v_l->>'precio')::numeric, 0), 2);
    exception when others then
      raise exception 'linea_invalida' using errcode = '22023';
    end;
    select * into v_linea from public.consignment_note_lines
     where id = v_linea_id and note_id = p_nota
     for update;
    if not found then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    if v_vendido < 0 or v_devuelto < 0 or v_precio < 0 then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    if v_vendido = 0 and v_devuelto = 0 then
      continue;
    end if;
    if v_vendido > 0 and v_precio <= 0 then
      raise exception 'precio_obligatorio' using errcode = '22023', detail = v_linea.id::text;
    end if;
    if v_vendido > 0 and v_linea.agreed_price is not null and v_nota.remuneration_mode = 'porcentaje'
       and v_precio + 0.005 < v_linea.agreed_price then
      raise exception 'precio_bajo_pactado' using errcode = '22023', detail = v_linea.id::text;
    end if;
    if v_linea.qty_sold + v_linea.qty_returned + v_vendido + v_devuelto > v_linea.qty_delivered then
      raise exception 'excede_en_su_poder' using errcode = '22023',
        detail = jsonb_build_object('linea', v_linea.id,
                                    'en_su_poder', v_linea.qty_delivered - v_linea.qty_sold - v_linea.qty_returned)::text;
    end if;

    perform public.fn_inv_int_mover(v_org, v_nota.branch_id, v_linea.product_id, null, 'in', v_vendido + v_devuelto,
                                    v_linea.unit_cost, 'transfer_in', 'consignacion:' || p_nota::text,
                                    'Liquidación de consignación ' || v_nota.number, v_uid, '{}'::jsonb);

    update public.consignment_note_lines
       set qty_sold = qty_sold + v_vendido, qty_returned = qty_returned + v_devuelto
     where id = v_linea.id;

    insert into public.consignment_settlement_lines (organization_id, settlement_id, line_id, product_id, qty_sold, unit_price, qty_returned, sale_amount, owner_amount)
    values (v_org, v_liq.id, v_linea.id, v_linea.product_id, v_vendido, v_precio, v_devuelto, round(v_vendido * v_precio, 2),
            round(v_vendido * v_linea.unit_cost, 2));

    v_venta := v_venta + v_vendido * v_precio;
    v_costo := v_costo + (v_vendido + v_devuelto) * v_linea.unit_cost;
    v_costo_vendido := v_costo_vendido + v_vendido * v_linea.unit_cost;
    v_costo_dev := v_costo_dev + v_devuelto * v_linea.unit_cost;
    if v_vendido > 0 then
      v_lineas_venta := v_lineas_venta || jsonb_build_object('product_id', v_linea.product_id, 'qty', v_vendido, 'unit_price', v_precio);
    end if;
  end loop;

  if v_venta = 0 and v_costo = 0 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;

  v_venta := round(v_venta, 2);
  v_comision := round(v_venta * v_nota.commission_pct / 100, 2);
  v_costo := round(v_costo, 2);

  if v_costo > 0 then
    v_entry := public.fn_create_journal_entry(
      p_organization_id := v_org,
      p_branch_id := v_nota.branch_id,
      p_entry_date := now(),
      p_memo := 'Regreso de mercancía en poder de terceros - ' || v_nota.number,
      p_source := 'consignment_settlement',
      p_source_id := v_liq.id::text,
      p_debit_account := v_nota.inventory_account_code,
      p_credit_account := v_nota.account_code,
      p_amount := v_costo,
      p_created_by := v_uid,
      p_fact_key := 'consignment_settlement:' || v_liq.id::text);
    if v_entry is null then
      raise exception 'asiento_no_creado' using errcode = 'P0001',
        hint = 'Revise el plan de cuentas (mercancía en poder de terceros e inventario) y el periodo contable.';
    end if;
  end if;

  update public.consignment_settlements
     set sale_total = v_venta, commission_amount = v_comision, net_amount = v_venta - v_comision,
         owner_cost_total = round(v_costo_vendido, 2), returned_cost = round(v_costo_dev, 2),
         status = case when v_venta = 0 then 'liquidada' else 'por_facturar' end,
         closed_at = case when v_venta = 0 then now() end,
         closed_by = case when v_venta = 0 then v_uid end
   where id = v_liq.id;

  update public.consignment_notes set status = public.fn_consignacion_estado(p_nota), updated_at = now() where id = p_nota;

  return jsonb_build_object(
    'liquidacion_id', v_liq.id, 'repetida', false,
    'estado', case when v_venta = 0 then 'liquidada' else 'por_facturar' end,
    'venta', v_venta, 'comision', v_comision, 'neto', v_venta - v_comision, 'asiento_id', v_entry,
    'cliente_id', v_nota.customer_id, 'sucursal_id', v_nota.branch_id, 'numero_nota', v_nota.number,
    'lineas', v_lineas_venta);
end;
$function$;

-- Con la factura todavía en borrador solo la liga y responde 'por_facturar'. Con la factura emitida, aplica
-- la comisión (saldo a favor del consignatario, débito a comisiones) y deja la liquidación «liquidada».
create or replace function public.fn_consignacion_cerrar(
  p_liquidacion uuid,
  p_factura uuid,
  p_clave_idempotencia text,
  p_organization_id integer default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_liq public.consignment_settlements%rowtype;
  v_nota public.consignment_notes%rowtype;
  v_inv public.invoice_sales%rowtype;
  v_cuenta_comision text;
  v_credito uuid;
  v_aplicacion jsonb;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 180 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;

  select organization_id into v_org from public.consignment_settlements where id = p_liquidacion and direction = 'entregada';
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then
    raise exception 'liquidacion_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);

  select * into v_liq from public.consignment_settlements where id = p_liquidacion for update;
  select * into v_nota from public.consignment_notes where id = v_liq.note_id;
  if not public.app_branch_access(v_nota.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_liq.status = 'liquidada' then
    return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', true, 'estado', 'liquidada', 'factura_id', v_liq.invoice_id);
  end if;
  if v_liq.invoice_id is not null and v_liq.invoice_id <> p_factura then
    raise exception 'factura_distinta' using errcode = '22023';
  end if;

  select * into v_inv from public.invoice_sales where id = p_factura and organization_id = v_org;
  if not found then
    raise exception 'factura_no_encontrada' using errcode = 'P0002';
  end if;
  if v_inv.customer_id is distinct from v_nota.customer_id then
    raise exception 'cliente_distinto' using errcode = '22023';
  end if;
  if v_inv.status in ('void', 'voided', 'cancelled') then
    raise exception 'documento_anulado' using errcode = '22023';
  end if;

  update public.consignment_settlements set invoice_id = p_factura where id = v_liq.id and invoice_id is null;

  if v_inv.status = 'draft' then
    return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', false, 'estado', 'por_facturar', 'factura_id', p_factura);
  end if;

  if v_liq.commission_amount > 0 then
    v_cuenta_comision := public.fn_cuenta_por_clave(v_org, v_nota.branch_id, 'comisiones');
    if v_cuenta_comision is null then
      raise exception 'sin_cuenta_comisiones' using errcode = 'P0002',
        hint = 'Configure la cuenta de comisiones (5295) en Configuración contable.';
    end if;
    v_credito := public.fn_create_customer_credit(
      v_org, v_nota.customer_id, v_liq.commission_amount, v_cuenta_comision, v_nota.branch_id,
      'Comisión de consignación ' || v_nota.number, null, v_uid);
    v_aplicacion := public.fn_apply_customer_credit(v_credito, p_factura, v_liq.commission_amount,
                                                    p_clave_idempotencia || ':comision', v_org);
  end if;

  update public.consignment_settlements
     set status = 'liquidada', commission_credit_id = v_credito, closed_at = now(), closed_by = v_uid
   where id = v_liq.id;
  update public.consignment_notes set status = public.fn_consignacion_estado(v_nota.id), updated_at = now() where id = v_nota.id;

  return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', false, 'estado', 'liquidada', 'factura_id', p_factura,
    'comision', v_liq.commission_amount, 'saldo_factura', (select balance from public.invoice_sales where id = p_factura));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Productos de consignación: siempre aparte
-- ─────────────────────────────────────────────────────────────────────────────
-- INTERNA. Un producto con costo o kardex propio NO se acepta. En intermediación, sus cuentas de ingreso y de
-- devolución pasan a ser el auxiliar 281510 del propietario por la RPC oficial de cuentas de catálogo.

create or replace function public.fn_consignacion_registrar_producto(
  p_org integer,
  p_producto integer,
  p_proveedor integer,
  p_contrato text,
  p_cuenta_recaudo text
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cp public.consignment_products%rowtype;
  v_prod record;
begin
  select p.id, p.organization_id, p.status, coalesce(p.track_stock, true) as track_stock, coalesce(p.track_serial, false) as track_serial,
         coalesce(p.is_parent, false) as es_padre, p.cuenta_costo, p.cuenta_inventario, p.cuenta_ingreso, p.cuenta_devolucion
    into v_prod
    from public.products p where p.id = p_producto;
  if v_prod.id is null or v_prod.organization_id is distinct from p_org or v_prod.status = 'deleted' then
    raise exception 'producto_invalido' using errcode = '22023', detail = p_producto::text;
  end if;
  if not v_prod.track_stock then
    raise exception 'producto_sin_seguimiento' using errcode = '22023', detail = p_producto::text;
  end if;
  if v_prod.track_serial then
    raise exception 'producto_con_seriales' using errcode = '22023', detail = p_producto::text;
  end if;
  if v_prod.es_padre or exists (select 1 from public.products c where c.parent_product_id = p_producto and coalesce(c.status, 'active') <> 'deleted') then
    raise exception 'producto_con_variantes' using errcode = '22023', detail = p_producto::text;
  end if;

  select * into v_cp from public.consignment_products where product_id = p_producto;
  if found then
    if v_cp.supplier_id <> p_proveedor then
      raise exception 'producto_de_otro_consignante' using errcode = '22023', detail = p_producto::text;
    end if;
    if v_cp.contract_type <> p_contrato then
      raise exception 'producto_otra_clasificacion' using errcode = '22023', detail = p_producto::text;
    end if;
  else
    if exists (select 1 from public.product_costs pc where pc.product_id = p_producto)
       or exists (select 1 from public.stock_movements sm
                   where sm.product_id = p_producto and sm.organization_id = p_org
                     and not (sm.source in ('transfer_in', 'transfer_out') and coalesce(sm.source_id, '') like 'consignacion:%'))
       or exists (select 1 from public.consignment_note_lines l join public.consignment_notes n on n.id = l.note_id
                   where l.product_id = p_producto and n.direction = 'entregada') then
      raise exception 'producto_propio_no_consignable' using errcode = '22023', detail = p_producto::text,
        hint = 'Los productos en consignación van aparte de los propios: cree un producto nuevo para la mercancía del consignante.';
    end if;
    insert into public.consignment_products (product_id, organization_id, supplier_id, contract_type, created_by)
    values (p_producto, p_org, p_proveedor, p_contrato, auth.uid());
  end if;

  if p_contrato = 'intermediacion'
     and (v_prod.cuenta_ingreso is distinct from p_cuenta_recaudo or v_prod.cuenta_devolucion is distinct from p_cuenta_recaudo) then
    perform public.fn_cuentas_catalogo_guardar(p_org, 'producto', p_producto, p_cuenta_recaudo,
                                               v_prod.cuenta_costo, v_prod.cuenta_inventario, p_cuenta_recaudo);
  end if;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. RECIBIDA · recibir (a mano o al aceptar una nota de otra organización)
-- ─────────────────────────────────────────────────────────────────────────────
-- p_lineas: [{ product_id, qty, precio (del dueño, sin IVA), precio_liquidacion?, ref?, ref_display? }]
-- p_terminos: ver fn_consignacion_terminos, más { cuenta_recaudo } (auxiliar 281510 del propietario).

create or replace function public.fn_consignacion_recibir_interna(
  p_org integer,
  p_proveedor integer,
  p_branch integer,
  p_lineas jsonb,
  p_comision numeric,
  p_terminos jsonb,
  p_clave_idempotencia text,
  p_notas text,
  p_link uuid,
  p_documento uuid,
  p_numero_externo text
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_nota public.consignment_notes%rowtype;
  v_t jsonb;
  v_cuentas jsonb;
  v_linea jsonb;
  v_producto integer;
  v_qty numeric;
  v_precio numeric;
  v_precio_liq numeric;
  v_total numeric := 0;
  v_numero text;
  v_entry integer;
  v_comision numeric := round(coalesce(p_comision, 0), 2);
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_comision < 0 or v_comision > 100 then
    raise exception 'comision_invalida' using errcode = '22023';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lineas) > 200 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  v_t := public.fn_consignacion_terminos(p_terminos, 'recibida');
  if v_t->>'remuneracion_modo' = 'precio_liquidacion' then
    v_comision := 0;
  end if;

  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create']);
  perform public.fn_inventario_exigir_permiso(p_org, array['recibir']);

  perform pg_advisory_xact_lock(hashtextextended('consignacion_recibir:' || p_org || ':' || p_clave_idempotencia, 0));
  select * into v_nota from public.consignment_notes
   where organization_id = p_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_nota.supplier_id is distinct from p_proveedor or v_nota.branch_id <> p_branch then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('nota_id', v_nota.id, 'numero', v_nota.number, 'repetida', true, 'pactado', v_nota.total_agreed);
  end if;

  if not exists (select 1 from public.suppliers s where s.id = p_proveedor and s.organization_id = p_org) then
    raise exception 'proveedor_no_encontrado' using errcode = 'P0002';
  end if;
  if p_branch is null or not exists (
    select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org and coalesce(b.is_active, true)
  ) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  if not public.app_branch_access(p_branch) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  v_cuentas := public.fn_consignacion_cuentas_recibida(p_org, p_branch, v_t->>'contrato', p_proveedor, p_terminos->>'cuenta_recaudo');

  perform pg_advisory_xact_lock(hashtextextended('consignacion_numero_recibida:' || p_org, 0));
  select 'NCR-' || lpad((coalesce(max(nullif(regexp_replace(n.number, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 4, '0')
    into v_numero
    from public.consignment_notes n
   where n.organization_id = p_org and n.direction = 'recibida';

  insert into public.consignment_notes (
    organization_id, branch_id, direction, supplier_id, number, contract_type, price_mode, remuneration_mode,
    commission_base, commission_pct, owner_obligation_at, risk_terms, billing_terms, status, memo_account_code,
    memo_contra_account_code, owner_account_code, remuneration_account_code, cost_account_code, due_date,
    settlement_frequency, link_id, shared_document_id, external_number, notes, idempotency_key, created_by
  ) values (
    p_org, p_branch, 'recibida', p_proveedor, v_numero, v_t->>'contrato', v_t->>'precio_modo', v_t->>'remuneracion_modo',
    v_t->>'base_comision', v_comision, v_t->>'obligacion_dueno', v_t->'riesgos', v_t->'facturacion', 'en_consignacion',
    v_cuentas->>'orden', v_cuentas->>'contra', v_cuentas->>'recaudo', v_cuentas->>'remuneracion', v_cuentas->>'costo',
    (v_t->>'vence')::date, v_t->>'periodicidad', p_link, p_documento, nullif(btrim(coalesce(p_numero_externo, '')), ''),
    nullif(btrim(coalesce(p_notas, '')), ''), p_clave_idempotencia, v_uid
  ) returning * into v_nota;

  for v_linea in select e from jsonb_array_elements(p_lineas) e loop
    begin
      v_producto := (v_linea->>'product_id')::integer;
      v_qty := round((v_linea->>'qty')::numeric, 3);
      v_precio := round((v_linea->>'precio')::numeric, 2);
      v_precio_liq := round(nullif(v_linea->>'precio_liquidacion', '')::numeric, 2);
    exception when others then
      raise exception 'linea_invalida' using errcode = '22023';
    end;
    if v_producto is null or v_qty is null or v_qty <= 0 or v_precio is null or v_precio <= 0 or coalesce(v_precio_liq, 0) < 0 then
      raise exception 'linea_invalida' using errcode = '22023', detail = coalesce(v_producto::text, '');
    end if;
    if v_t->>'remuneracion_modo' = 'precio_liquidacion' and (v_precio_liq is null or v_precio_liq <= 0 or v_precio_liq > v_precio) then
      raise exception 'precio_liquidacion_obligatorio' using errcode = '22023', detail = v_producto::text;
    end if;

    perform public.fn_consignacion_registrar_producto(p_org, v_producto, p_proveedor, v_t->>'contrato', v_cuentas->>'recaudo');

    -- Control físico: entra a la bodega como existencia del consignante, sin costo propio ni asiento de inventario.
    perform public.fn_inv_int_mover(p_org, p_branch, v_producto, null, 'in', v_qty, 0,
                                    'transfer_in', 'consignacion:' || v_nota.id::text,
                                    'Consignación recibida ' || v_numero, v_uid, '{}'::jsonb);

    insert into public.consignment_note_lines (
      organization_id, note_id, product_id, qty_delivered, unit_cost, agreed_price, settlement_price, external_ref, external_display
    ) values (
      p_org, v_nota.id, v_producto, v_qty, 0, v_precio, v_precio_liq,
      nullif(left(coalesce(v_linea->>'ref', ''), 120), ''), case when jsonb_typeof(v_linea->'ref_display') = 'object' then v_linea->'ref_display' end
    );
    v_total := v_total + v_qty * v_precio;
  end loop;

  v_total := round(v_total, 2);
  update public.consignment_notes set total_agreed = v_total, updated_at = now() where id = v_nota.id;

  v_entry := public.fn_create_journal_entry(
    p_organization_id := p_org,
    p_branch_id := p_branch,
    p_entry_date := now(),
    p_memo := 'Mercancía recibida en consignación - ' || v_numero,
    p_source := 'consignment_received',
    p_source_id := v_nota.id::text,
    p_debit_account := v_cuentas->>'contra',
    p_credit_account := v_cuentas->>'orden',
    p_amount := v_total,
    p_created_by := v_uid,
    p_fact_key := 'consignment_received:' || v_nota.id::text);
  if v_entry is null then
    raise exception 'asiento_no_creado' using errcode = 'P0001',
      hint = 'Revise las cuentas de orden (911520 y grupo 94) y el periodo contable.';
  end if;

  return jsonb_build_object('nota_id', v_nota.id, 'numero', v_numero, 'repetida', false, 'pactado', v_total, 'asiento_id', v_entry,
                            'cuentas', v_cuentas);
end;
$function$;

create or replace function public.fn_consignacion_recibir(
  p_proveedor integer,
  p_branch integer,
  p_lineas jsonb,
  p_comision numeric,
  p_terminos jsonb,
  p_clave_idempotencia text,
  p_organization_id integer,
  p_notas text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_organization_id is null then
    raise exception 'organizacion_no_permitida' using errcode = '42501';
  end if;
  return public.fn_consignacion_recibir_interna(p_organization_id, p_proveedor, p_branch, p_lineas, p_comision, p_terminos,
                                                p_clave_idempotencia, p_notas, null, null, null);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RECIBIDA · devolver al consignante
-- ─────────────────────────────────────────────────────────────────────────────
-- p_lineas: [{ linea_id, qty }]

create or replace function public.fn_consignacion_recibida_devolver(
  p_nota uuid,
  p_lineas jsonb,
  p_clave_idempotencia text,
  p_organization_id integer,
  p_notas text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_nota public.consignment_notes%rowtype;
  v_dev public.consignment_returns%rowtype;
  v_l jsonb;
  v_linea public.consignment_note_lines%rowtype;
  v_qty numeric;
  v_total numeric := 0;
  v_detalle jsonb := '[]'::jsonb;
  v_entry integer;
  v_doc uuid;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 or jsonb_array_length(p_lineas) > 200 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;
  select * into v_nota from public.consignment_notes where id = p_nota and organization_id = v_org and direction = 'recibida';
  if not found then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  perform public.fn_inventario_exigir_permiso(v_org, array['trasladar']);
  if not public.app_branch_access(v_nota.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('consignacion_devolver:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_dev from public.consignment_returns where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_dev.note_id <> p_nota then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('devolucion_id', v_dev.id, 'repetida', true, 'total', v_dev.total_agreed);
  end if;
  perform 1 from public.consignment_notes where id = p_nota for update;

  for v_l in select e from jsonb_array_elements(p_lineas) e loop
    begin
      v_qty := round(coalesce((v_l->>'qty')::numeric, 0), 3);
      select * into v_linea from public.consignment_note_lines where id = (v_l->>'linea_id')::uuid and note_id = p_nota for update;
    exception when others then
      raise exception 'linea_invalida' using errcode = '22023';
    end;
    if v_linea.id is null or v_qty < 0 then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    if v_qty = 0 then
      continue;
    end if;
    if v_linea.qty_sold + v_linea.qty_returned + v_qty > v_linea.qty_delivered then
      raise exception 'excede_en_su_poder' using errcode = '22023',
        detail = jsonb_build_object('linea', v_linea.id, 'en_su_poder', v_linea.qty_delivered - v_linea.qty_sold - v_linea.qty_returned)::text;
    end if;
    perform public.fn_inv_int_mover(v_org, v_nota.branch_id, v_linea.product_id, null, 'out', v_qty, null,
                                    'transfer_out', 'consignacion:' || p_nota::text,
                                    'Devolución al consignante ' || v_nota.number, v_uid, '{}'::jsonb);
    update public.consignment_note_lines set qty_returned = qty_returned + v_qty where id = v_linea.id;
    v_total := v_total + v_qty * coalesce(v_linea.agreed_price, 0);
    v_detalle := v_detalle || jsonb_build_object('linea_id', v_linea.id, 'product_id', v_linea.product_id, 'qty', v_qty,
                                                 'precio', v_linea.agreed_price, 'ref', v_linea.external_ref);
  end loop;
  if jsonb_array_length(v_detalle) = 0 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;
  v_total := round(v_total, 2);

  insert into public.consignment_returns (organization_id, note_id, lines, total_agreed, notes, idempotency_key, created_by)
  values (v_org, p_nota, v_detalle, v_total, nullif(btrim(coalesce(p_notas, '')), ''), p_clave_idempotencia, v_uid)
  returning * into v_dev;

  if v_total > 0 then
    v_entry := public.fn_create_journal_entry(
      p_organization_id := v_org,
      p_branch_id := v_nota.branch_id,
      p_entry_date := now(),
      p_memo := 'Devolución de mercancía en consignación - ' || v_nota.number,
      p_source := 'consignment_return',
      p_source_id := v_dev.id::text,
      p_debit_account := v_nota.memo_account_code,
      p_credit_account := v_nota.memo_contra_account_code,
      p_amount := v_total,
      p_created_by := v_uid,
      p_fact_key := 'consignment_return:' || v_dev.id::text);
    if v_entry is null then
      raise exception 'asiento_no_creado' using errcode = 'P0001';
    end if;
  end if;

  if v_nota.link_id is not null and v_nota.shared_document_id is not null
     and exists (select 1 from public.organization_links l where l.id = v_nota.link_id and l.status = 'activo') then
    v_doc := public.fn_documento_compartido_publicar(
      v_nota.link_id, v_org, 'consignacion_devolucion', v_dev.id::text,
      jsonb_build_object(
        'nota_origen', (select d.source_id from public.organization_shared_documents d where d.id = v_nota.shared_document_id),
        'nota_externa', v_nota.external_number, 'nota', v_nota.number, 'fecha', now(),
        'lineas', (select coalesce(jsonb_agg(jsonb_build_object('ref', x->>'ref', 'devuelto', (x->>'qty')::numeric)), '[]'::jsonb)
                     from jsonb_array_elements(v_detalle) x)));
    update public.consignment_returns set shared_document_id = v_doc where id = v_dev.id;
  end if;

  update public.consignment_notes set status = public.fn_consignacion_estado(p_nota), updated_at = now() where id = p_nota;
  return jsonb_build_object('devolucion_id', v_dev.id, 'repetida', false, 'total', v_total, 'asiento_id', v_entry, 'documento_compartido_id', v_doc);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RECIBIDA · venta por el POS o la factura de SIEMPRE (disparador sobre el kardex)
-- ─────────────────────────────────────────────────────────────────────────────
-- No hay una segunda implementación de la venta. Solo para productos de consignación: asigna lo vendido a las
-- notas abiertas (FIFO), revierte las cuentas de orden y, en intermediación, lleva el recaudo del POS al auxiliar
-- 281510 del dueño. NUNCA rompe la venta: lo que no se puede resolver queda como pendiente contable visible.

-- Línea de venta o de factura del producto: unitario neto de IVA y de descuento, descuento e IVA por unidad.
create or replace function public.fn_consignacion_linea_venta(p_source text, p_source_id text, p_producto integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_bruto numeric;
  v_desc numeric;
  v_neto numeric;
  v_qty numeric;
begin
  if p_source_id is null or p_source_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  v_id := p_source_id::uuid;
  if p_source in ('sale', 'mesa_sale') then
    select sum(si.unit_price * si.quantity), sum(coalesce(si.discount_amount, 0)),
           sum((si.unit_price * si.quantity - coalesce(si.discount_amount, 0))
               / case when coalesce(si.tax_included, false) then 1 + coalesce(si.tax_rate, 0) / 100 else 1 end),
           sum(si.quantity)
      into v_bruto, v_desc, v_neto, v_qty
      from public.sale_items si where si.sale_id = v_id and si.product_id = p_producto;
  elsif p_source = 'invoice_sale' then
    select sum(ii.unit_price * ii.qty), sum(coalesce(ii.discount_amount, 0)),
           sum((ii.unit_price * ii.qty - coalesce(ii.discount_amount, 0))
               / case when coalesce(ii.tax_included, false) then 1 + coalesce(ii.tax_rate, 0) / 100 else 1 end),
           sum(ii.qty)
      into v_bruto, v_desc, v_neto, v_qty
      from public.invoice_items ii where ii.invoice_sales_id = v_id and ii.product_id = p_producto;
  end if;
  if coalesce(v_qty, 0) <= 0 then
    return null;
  end if;
  return jsonb_build_object(
    'neto', round(v_neto / v_qty, 4),
    'descuento', round(v_desc / v_qty, 4),
    -- IVA por unidad: lo cobrado menos el neto (con IVA incluido) o tarifa sobre el neto (sin incluir).
    'iva', round(greatest((select coalesce(sum(case when coalesce(si.tax_included, false)
                                                     then (si.unit_price * si.quantity - coalesce(si.discount_amount, 0))
                                                          - (si.unit_price * si.quantity - coalesce(si.discount_amount, 0)) / (1 + coalesce(si.tax_rate, 0) / 100)
                                                     else (si.unit_price * si.quantity - coalesce(si.discount_amount, 0)) * coalesce(si.tax_rate, 0) / 100 end), 0)
                             from public.sale_items si where p_source in ('sale', 'mesa_sale') and si.sale_id = v_id and si.product_id = p_producto)
                          + (select coalesce(sum(case when coalesce(ii.tax_included, false)
                                                     then (ii.unit_price * ii.qty - coalesce(ii.discount_amount, 0))
                                                          - (ii.unit_price * ii.qty - coalesce(ii.discount_amount, 0)) / (1 + coalesce(ii.tax_rate, 0) / 100)
                                                     else (ii.unit_price * ii.qty - coalesce(ii.discount_amount, 0)) * coalesce(ii.tax_rate, 0) / 100 end), 0)
                             from public.invoice_items ii where p_source = 'invoice_sale' and ii.invoice_sales_id = v_id and ii.product_id = p_producto), 0) / v_qty, 4));
end;
$function$;

-- Venta cobrada: POS siempre; factura, cuando su saldo es cero (para obligación «al cobro»).
create or replace function public.fn_consignacion_venta_cobrada(p_source text, p_source_id text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case
    when p_source = 'invoice_sale' then coalesce((
      select i.status not in ('draft', 'void', 'voided', 'cancelled') and coalesce(i.balance, 0) <= 0
        from public.invoice_sales i
       where p_source_id ~ '^[0-9a-fA-F-]{36}$' and i.id = p_source_id::uuid), false)
    else true
  end;
$function$;

-- Cuenta de ingreso con la que el POS devengó la venta (la MISMA resolución que fn_auto_journal_sale_pos).
create or replace function public.fn_consignacion_cuenta_ingreso_pos(p_org integer, p_branch integer)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_rule record;
  v_cuenta text;
  v_fallo text;
begin
  select * into v_rule from public.fn_regla_devengo_venta(p_org);
  if v_rule.credit_account_code is null then
    return null;
  end if;
  select r.cuenta, r.fallo into v_cuenta, v_fallo
    from public.fn_cuenta_configurada_de_sede(p_org, p_branch, 'sales', 'credito', v_rule.credit_account_code) r;
  return case when v_fallo is null then v_cuenta end;
end;
$function$;

create or replace function public.fn_consignacion_asignar_venta(p_sm public.stock_movements)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_resto numeric := abs(p_sm.qty);
  v_l record;
  v_qty numeric;
  v_linea_venta jsonb;
  v_asig public.consignment_allocations%rowtype;
  v_venta numeric;
  v_pactado numeric;
  v_ingreso_pos text;
  v_entry integer;
begin
  v_linea_venta := public.fn_consignacion_linea_venta(p_sm.source, p_sm.source_id, p_sm.product_id);
  for v_l in
    select l.id, l.note_id, l.agreed_price, l.qty_delivered - l.qty_sold - l.qty_returned as disponible,
           n.memo_account_code, n.memo_contra_account_code, n.owner_account_code, n.contract_type, n.owner_obligation_at,
           n.number, n.branch_id
      from public.consignment_note_lines l
      join public.consignment_notes n on n.id = l.note_id
     where l.product_id = p_sm.product_id and n.organization_id = p_sm.organization_id and n.direction = 'recibida'
       and n.branch_id = p_sm.branch_id and l.qty_delivered - l.qty_sold - l.qty_returned > 0
     order by n.delivered_at, n.number, l.id
     for update of l
  loop
    exit when v_resto <= 0;
    v_qty := least(v_resto, v_l.disponible);
    v_pactado := round(v_qty * coalesce(v_l.agreed_price, 0), 2);
    v_venta := round(v_qty * coalesce((v_linea_venta->>'neto')::numeric, v_l.agreed_price, 0), 2);
    insert into public.consignment_allocations (organization_id, note_id, line_id, product_id, stock_movement_id, kind, qty,
                                                sale_amount, discount_amount, tax_amount, agreed_amount, source, source_id)
    values (p_sm.organization_id, v_l.note_id, v_l.id, p_sm.product_id, p_sm.id, 'venta', v_qty, v_venta,
            round(v_qty * coalesce((v_linea_venta->>'descuento')::numeric, 0), 2),
            round(v_qty * coalesce((v_linea_venta->>'iva')::numeric, 0), 2), v_pactado, p_sm.source, p_sm.source_id)
    on conflict (stock_movement_id, line_id, kind) do nothing
    returning * into v_asig;
    if v_asig.id is null then
      v_resto := v_resto - v_qty;
      continue;
    end if;
    update public.consignment_note_lines set qty_sold = qty_sold + v_qty where id = v_l.id;
    v_resto := v_resto - v_qty;

    if v_pactado > 0 then
      perform public.fn_create_journal_entry(
        p_organization_id := p_sm.organization_id, p_branch_id := v_l.branch_id, p_entry_date := coalesce(p_sm.created_at, now()),
        p_memo := 'Venta de mercancía en consignación - ' || v_l.number, p_source := 'consignment_sale',
        p_source_id := v_asig.id::text, p_debit_account := v_l.memo_account_code, p_credit_account := v_l.memo_contra_account_code,
        p_amount := v_pactado, p_created_by := p_sm.created_by, p_fact_key := 'consignment_sale_memo:' || v_asig.id::text);
    end if;
    if v_l.contract_type = 'intermediacion' and p_sm.source <> 'invoice_sale' and v_venta > 0 then
      v_ingreso_pos := coalesce(v_ingreso_pos, public.fn_consignacion_cuenta_ingreso_pos(p_sm.organization_id, p_sm.branch_id));
      v_entry := public.fn_create_journal_entry(
        p_organization_id := p_sm.organization_id, p_branch_id := v_l.branch_id, p_entry_date := coalesce(p_sm.created_at, now()),
        p_memo := 'Recaudo para el dueño de la mercancía en consignación - ' || v_l.number, p_source := 'consignment_sale',
        p_source_id := v_asig.id::text, p_debit_account := v_ingreso_pos, p_credit_account := v_l.owner_account_code,
        p_amount := v_venta, p_created_by := p_sm.created_by, p_fact_key := 'consignment_sale_owner:' || v_asig.id::text);
    end if;
    -- Obligación «al cobro» con venta a crédito: el pasivo nació con la factura; queda visible para el Contador.
    if v_l.contract_type = 'intermediacion' and v_l.owner_obligation_at = 'cobro' and p_sm.source = 'invoice_sale'
       and not public.fn_consignacion_venta_cobrada(p_sm.source, p_sm.source_id) then
      perform public.fn_consignacion_pendiente(p_sm.organization_id, p_sm.branch_id, 'consignacion_obligacion_al_cobro',
        'consignment_sale', v_asig.id::text, v_venta,
        'Venta a crédito de mercancía en consignación con obligación al cobro: el recaudo se registró al facturar');
    end if;
    update public.consignment_notes set status = public.fn_consignacion_estado(v_l.note_id), updated_at = now() where id = v_l.note_id;
  end loop;

  if v_resto > 0 then
    insert into public.consignment_allocations (organization_id, note_id, line_id, product_id, stock_movement_id, kind, qty,
                                                sale_amount, agreed_amount, source, source_id)
    values (p_sm.organization_id, null, null, p_sm.product_id, p_sm.id, 'venta', v_resto,
            round(v_resto * coalesce((v_linea_venta->>'neto')::numeric, 0), 2), 0, p_sm.source, p_sm.source_id)
    on conflict (stock_movement_id, line_id, kind) do nothing;
    perform public.fn_consignacion_pendiente(p_sm.organization_id, p_sm.branch_id, 'consignacion_sin_nota',
      'consignment_sale', p_sm.id::text, v_resto,
      'Venta de un producto de consignación sin nota recibida abierta que la cubra');
  end if;
end;
$function$;

-- Devolución de una venta (POS o nota crédito). Primero lo no liquidado (del último al primero). Si ya se
-- liquidó con el dueño: si las devoluciones las asume el dueño, el reverso queda para la próxima liquidación
-- (resta); si las asume el consignatario, no toca lo del dueño. En los dos casos, pendiente contable visible.
create or replace function public.fn_consignacion_revertir_venta(p_sm public.stock_movements)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_resto numeric := abs(p_sm.qty);
  v_a record;
  v_qty numeric;
  v_rev public.consignment_allocations%rowtype;
  v_pactado numeric;
  v_absorbe boolean;
begin
  for v_a in
    select a.*, n.memo_account_code, n.memo_contra_account_code, n.contract_type, n.number, n.branch_id as nota_sucursal,
           n.risk_terms->>'devoluciones' as asume,
           a.qty - coalesce((select sum(r.qty) from public.consignment_allocations r where r.reverses_id = a.id), 0) as vigente
      from public.consignment_allocations a
      join public.consignment_notes n on n.id = a.note_id
      left join public.consignment_settlements s on s.id = a.settlement_id
     where a.organization_id = p_sm.organization_id and a.product_id = p_sm.product_id and a.kind = 'venta'
       and n.branch_id = p_sm.branch_id and (a.settlement_id is null or s.status <> 'anulada')
     order by (a.settlement_id is null) desc, a.created_at desc
  loop
    exit when v_resto <= 0;
    continue when v_a.vigente <= 0;
    v_qty := least(v_resto, v_a.vigente);
    v_pactado := round(v_a.agreed_amount * v_qty / v_a.qty, 2);
    v_absorbe := v_a.settlement_id is not null and v_a.asume = 'consignatario';
    insert into public.consignment_allocations (organization_id, note_id, line_id, product_id, stock_movement_id, kind, qty,
                                                sale_amount, discount_amount, tax_amount, agreed_amount, source, source_id,
                                                reverses_id, settlement_id, absorbed)
    values (p_sm.organization_id, v_a.note_id, v_a.line_id, p_sm.product_id, p_sm.id, 'reverso', v_qty,
            round(v_a.sale_amount * v_qty / v_a.qty, 2), round(v_a.discount_amount * v_qty / v_a.qty, 2),
            round(v_a.tax_amount * v_qty / v_a.qty, 2), v_pactado, p_sm.source, p_sm.source_id, v_a.id,
            case when v_absorbe then v_a.settlement_id end, v_absorbe)
    on conflict (stock_movement_id, line_id, kind) do nothing
    returning * into v_rev;
    v_resto := v_resto - v_qty;
    continue when v_rev.id is null;
    update public.consignment_note_lines set qty_sold = qty_sold - v_qty where id = v_a.line_id;
    if v_pactado > 0 then
      perform public.fn_create_journal_entry(
        p_organization_id := p_sm.organization_id, p_branch_id := v_a.nota_sucursal, p_entry_date := coalesce(p_sm.created_at, now()),
        p_memo := 'Devolución de venta de mercancía en consignación - ' || v_a.number, p_source := 'consignment_sale',
        p_source_id := v_rev.id::text, p_debit_account := v_a.memo_contra_account_code, p_credit_account := v_a.memo_account_code,
        p_amount := v_pactado, p_created_by := p_sm.created_by, p_fact_key := 'consignment_sale_memo:' || v_rev.id::text);
    end if;
    if v_a.settlement_id is not null then
      perform public.fn_consignacion_pendiente(p_sm.organization_id, p_sm.branch_id, 'consignacion_devolucion_liquidada',
        'consignment_sale', v_rev.id::text, v_rev.sale_amount,
        case when v_absorbe then 'Devolución de una venta ya liquidada con el dueño; la asume el consignatario según el contrato'
             else 'Devolución de una venta ya liquidada con el dueño; se descuenta en la próxima liquidación' end);
    end if;
    -- La devolución del POS se contabiliza con su propia regla (fn_auto_journal_refund): el recaudo del dueño se
    -- corrige con el Contador, no con una cuenta supuesta.
    if v_a.contract_type = 'intermediacion' and p_sm.source = 'return' then
      perform public.fn_consignacion_pendiente(p_sm.organization_id, p_sm.branch_id, 'consignacion_devolucion_pos',
        'consignment_sale', v_rev.id::text, v_rev.sale_amount,
        'Devolución en el POS de mercancía en consignación: revisar el recaudo del dueño en el auxiliar 281510');
    end if;
    update public.consignment_notes set status = public.fn_consignacion_estado(v_a.note_id), updated_at = now() where id = v_a.note_id;
  end loop;
end;
$function$;

create or replace function public.fn_trg_consignacion_venta()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.source not in ('sale', 'web_sale', 'mesa_sale', 'invoice_sale', 'folio_item', 'room_consumption', 'web_order',
                        'return', 'credit_note', 'invoice_void', 'web_refund', 'folio_item_reversal') then
    return new;
  end if;
  if not exists (select 1 from public.consignment_products cp where cp.product_id = new.product_id) then
    return new;
  end if;
  begin
    if new.direction = 'out' and new.source in ('sale', 'web_sale', 'mesa_sale', 'invoice_sale', 'folio_item', 'room_consumption', 'web_order') then
      perform public.fn_consignacion_asignar_venta(new);
    elsif new.direction = 'in' then
      perform public.fn_consignacion_revertir_venta(new);
    end if;
  exception when others then
    perform public.fn_log_journal_failure(new.organization_id, new.branch_id, now(), 'consignment_sale', new.id::text,
      'consignment_sale_error:' || new.id::text, null, null, new.qty, 'consignacion_venta', sqlerrm);
  end;
  return new;
end;
$function$;

drop trigger if exists trg_consignacion_venta on public.stock_movements;
create trigger trg_consignacion_venta
  after insert on public.stock_movements
  for each row execute function public.fn_trg_consignacion_venta();

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RECIBIDA · liquidar al consignante (por nota = por dueño), y anular
-- ─────────────────────────────────────────────────────────────────────────────
-- Toma lo vendido y no liquidado hasta la fecha (neto de reversos; puede haber varias liquidaciones parciales).
-- Separa precio de venta, precio pactado, saldo del dueño, remuneración, descuentos e IVA. Guarda los HECHOS
-- tributarios y deja el pendiente contable de IVA y retenciones (no se eligen: se determinan por ley).

create or replace function public.fn_consignacion_recibida_liquidar(
  p_nota uuid,
  p_hasta date,
  p_clave_idempotencia text,
  p_organization_id integer
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_nota public.consignment_notes%rowtype;
  v_liq public.consignment_settlements%rowtype;
  v_tz text;
  v_hasta date;
  v_desde date;
  v_r record;
  v_venta numeric := 0;
  v_pactado numeric := 0;
  v_dueno numeric := 0;
  v_desc numeric := 0;
  v_iva numeric := 0;
  v_valor numeric;
  v_remuneracion numeric;
  v_hechos jsonb;
  v_entry integer;
  v_lineas_compra jsonb := '[]'::jsonb;
  v_doc uuid;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  select * into v_nota from public.consignment_notes where id = p_nota and organization_id = v_org and direction = 'recibida';
  if not found then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  if not public.app_branch_access(v_nota.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('consignacion_liquidar:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_liq from public.consignment_settlements where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_liq.note_id <> p_nota then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', true, 'estado', v_liq.status, 'venta', v_liq.sale_total,
      'remuneracion', v_liq.commission_amount, 'dueno', v_liq.owner_amount, 'por_pagar', v_liq.payable_amount,
      'contrato', v_nota.contract_type, 'factura_compra_id', v_liq.purchase_invoice_id);
  end if;
  perform 1 from public.consignment_notes where id = p_nota for update;
  if exists (select 1 from public.consignment_settlements s where s.note_id = p_nota and s.status = 'por_facturar') then
    raise exception 'liquidacion_pendiente' using errcode = '22023',
      hint = 'Hay una liquidación esperando su factura de compra: regístrela antes de liquidar otra vez.';
  end if;

  select coalesce(nullif(o.timezone, ''), 'America/Bogota') into v_tz from public.organizations o where o.id = v_org;
  v_hasta := coalesce(p_hasta, public.fn_today_for(v_org, v_nota.branch_id));

  insert into public.consignment_settlements (organization_id, note_id, direction, period_to, commission_pct, status, idempotency_key, created_by)
  values (v_org, p_nota, 'recibida', v_hasta, v_nota.commission_pct, 'por_facturar', p_clave_idempotencia, v_uid)
  returning * into v_liq;

  -- Lo vendido y no liquidado hasta la fecha, por línea (neto de reversos, que pueden venir de una liquidación
  -- anterior). En intermediación con obligación «al cobro», solo lo ya cobrado.
  for v_r in
    select l.id as linea_id, l.product_id, l.agreed_price, l.settlement_price,
           sum(case when a.kind = 'venta' then a.qty else -a.qty end) as qty,
           sum(case when a.kind = 'venta' then a.sale_amount else -a.sale_amount end) as venta,
           sum(case when a.kind = 'venta' then a.discount_amount else -a.discount_amount end) as descuento,
           sum(case when a.kind = 'venta' then a.tax_amount else -a.tax_amount end) as iva,
           sum(case when a.kind = 'venta' then a.agreed_amount else -a.agreed_amount end) as pactado,
           min(timezone(v_tz, a.created_at)::date) as desde,
           array_agg(a.id) as ids
      from public.consignment_allocations a
      join public.consignment_note_lines l on l.id = a.line_id
     where a.note_id = p_nota and a.settlement_id is null and not a.absorbed
       and timezone(v_tz, a.created_at)::date <= v_hasta
       and (v_nota.owner_obligation_at is distinct from 'cobro' or a.kind = 'reverso'
            or public.fn_consignacion_venta_cobrada(a.source, a.source_id))
     group by l.id, l.product_id, l.agreed_price, l.settlement_price
  loop
    update public.consignment_allocations set settlement_id = v_liq.id where id = any (v_r.ids);
    continue when v_r.qty = 0;
    v_desde := least(coalesce(v_desde, v_r.desde), v_r.desde);
    -- Lo del dueño según el contrato: precio de liquidación, o pactado/venta menos el porcentaje sobre su base.
    v_valor := case
      when v_nota.remuneration_mode = 'precio_liquidacion' then round(v_r.qty * coalesce(v_r.settlement_price, 0), 2)
      when v_nota.commission_base = 'precio_venta' then round(v_r.venta * (1 - v_nota.commission_pct / 100), 2)
      else round(v_r.pactado * (1 - v_nota.commission_pct / 100), 2)
    end;
    if v_r.qty > 0 and v_r.venta + 1 < v_valor then
      raise exception 'venta_bajo_precio_pactado' using errcode = '22023', detail = v_r.linea_id::text,
        hint = 'Se vendió por debajo del precio del dueño. Revise la venta o defina con el Contador quién asume la diferencia.';
    end if;
    insert into public.consignment_settlement_lines (organization_id, settlement_id, line_id, product_id, qty_sold, unit_price,
                                                     qty_returned, sale_amount, owner_amount, discount_amount, tax_amount)
    values (v_org, v_liq.id, v_r.linea_id, v_r.product_id, v_r.qty, round(abs(v_r.venta / v_r.qty), 2), 0, round(v_r.venta, 2),
            v_valor, round(v_r.descuento, 2), round(v_r.iva, 2));
    v_venta := v_venta + v_r.venta;
    v_pactado := v_pactado + v_r.pactado;
    v_dueno := v_dueno + v_valor;
    v_desc := v_desc + v_r.descuento;
    v_iva := v_iva + v_r.iva;
    if v_nota.contract_type = 'estimatorio' and v_r.qty > 0 then
      v_lineas_compra := v_lineas_compra || jsonb_build_object('product_id', v_r.product_id, 'qty', v_r.qty,
        'unit_price', round(v_valor / v_r.qty, 2), 'cuenta_contable', v_nota.cost_account_code);
    end if;
  end loop;

  v_venta := round(v_venta, 2);
  v_pactado := round(v_pactado, 2);
  v_dueno := round(v_dueno, 2);
  if v_dueno = 0 then
    raise exception 'sin_ventas_por_liquidar' using errcode = '22023';
  end if;
  if v_dueno < 0 then
    raise exception 'saldo_a_favor_del_consignatario' using errcode = '22023',
      hint = 'Las devoluciones posteriores superan lo vendido: el dueño debe ese saldo; regístrelo con el Contador.';
  end if;
  if v_nota.contract_type = 'estimatorio' and exists (
       select 1 from public.consignment_settlement_lines sl where sl.settlement_id = v_liq.id and sl.qty_sold < 0) then
    raise exception 'devolucion_estimatorio_pendiente' using errcode = '22023',
      hint = 'En estimatorio, una devolución de algo ya comprado al dueño se hace con nota crédito de la factura de compra.';
  end if;
  v_remuneracion := round(v_venta - v_dueno, 2);

  -- Hechos tributarios (Contador 2, punto 7): calidades de las partes, concepto, municipio y fecha.
  select jsonb_build_object(
    'concepto', 'consignacion_' || v_nota.contract_type,
    'factura', v_nota.billing_terms->>'factura', 'por_cuenta_de', v_nota.billing_terms->>'por_cuenta_de',
    'fecha', v_hasta,
    'municipio', (select b.municipality_id from public.branches b where b.id = v_nota.branch_id),
    'consignante', (select jsonb_build_object('tipo', s.supplier_type, 'regimen', s.tax_regime,
                                              'responsabilidades', to_jsonb(s.fiscal_responsibilities), 'municipio', s.municipality_code)
                      from public.suppliers s where s.id = v_nota.supplier_id),
    'consignatario', (select jsonb_build_object('responsabilidades', to_jsonb(o.fiscal_responsibilities), 'municipio', o.municipality_id)
                        from public.organizations o where o.id = v_org),
    'iva_cobrado', round(v_iva, 2),
    'pendiente', jsonb_build_array('iva', 'retenciones')
                 || case when v_nota.contract_type = 'estimatorio' then jsonb_build_array('base_iva_estimatorio') else '[]'::jsonb end)
    into v_hechos;

  if v_nota.contract_type = 'intermediacion' and v_remuneracion > 0 then
    v_entry := public.fn_create_journal_entry(
      p_organization_id := v_org, p_branch_id := v_nota.branch_id, p_entry_date := now(),
      p_memo := 'Remuneración por venta en consignación - ' || v_nota.number, p_source := 'consignment_owner_settlement',
      p_source_id := v_liq.id::text, p_debit_account := v_nota.owner_account_code, p_credit_account := v_nota.remuneration_account_code,
      p_amount := v_remuneracion, p_created_by := v_uid, p_fact_key := 'consignment_owner_settlement:rem:' || v_liq.id::text);
    if v_entry is null then
      raise exception 'asiento_no_creado' using errcode = 'P0001',
        hint = 'Revise el auxiliar 281510 del dueño, el auxiliar de 413512 y el periodo contable.';
    end if;
  end if;

  update public.consignment_settlements
     set period_from = v_desde, sale_total = v_venta, agreed_total = v_pactado, owner_cost_total = v_dueno,
         discount_total = round(v_desc, 2), tax_total = round(v_iva, 2), commission_amount = v_remuneracion,
         net_amount = v_dueno, owner_amount = v_dueno, payable_amount = v_dueno, tax_facts = v_hechos,
         status = case when v_nota.contract_type = 'intermediacion' then 'liquidada' else 'por_facturar' end,
         closed_at = case when v_nota.contract_type = 'intermediacion' then now() end,
         closed_by = case when v_nota.contract_type = 'intermediacion' then v_uid end
   where id = v_liq.id
   returning * into v_liq;

  -- IVA y retenciones: se determinan por ley; hoy no hay reglas parametrizadas para estos conceptos → pendiente
  -- contable visible (con los hechos guardados en la liquidación). En estimatorio, además, la base del IVA.
  perform public.fn_consignacion_pendiente(v_org, v_nota.branch_id, 'consignacion_impuestos_por_determinar',
    'consignment_owner_settlement', v_liq.id::text, v_dueno,
    'Liquidación ' || v_nota.number || ': IVA y retenciones por determinar con los hechos tributarios registrados');
  if v_nota.contract_type = 'estimatorio' then
    perform public.fn_consignacion_pendiente(v_org, v_nota.branch_id, 'consignacion_base_iva_estimatorio',
      'consignment_owner_settlement', v_liq.id::text, v_venta,
      'Estimatorio ' || v_nota.number || ': la base del IVA requiere revisión (no se asume solo la comisión)');
  end if;

  if v_nota.link_id is not null and v_nota.shared_document_id is not null
     and exists (select 1 from public.organization_links l where l.id = v_nota.link_id and l.status = 'activo') then
    v_doc := public.fn_documento_compartido_publicar(
      v_nota.link_id, v_org, 'consignacion_liquidacion', v_liq.id::text,
      jsonb_build_object(
        'nota_origen', (select d.source_id from public.organization_shared_documents d where d.id = v_nota.shared_document_id),
        'nota_externa', v_nota.external_number, 'nota', v_nota.number, 'desde', v_desde, 'hasta', v_hasta,
        'contrato', v_nota.contract_type, 'remuneracion_modo', v_nota.remuneration_mode,
        'base_comision', v_nota.commission_base, 'comision_pct', v_nota.commission_pct,
        'venta', v_venta, 'descuentos', round(v_desc, 2), 'iva', round(v_iva, 2), 'remuneracion', v_remuneracion,
        'dueno', v_dueno, 'por_pagar', v_liq.payable_amount,
        'lineas', (select coalesce(jsonb_agg(jsonb_build_object('ref', l.external_ref, 'vendido', sl.qty_sold,
                                                                 'precio', sl.unit_price, 'venta', sl.sale_amount, 'dueno', sl.owner_amount)), '[]'::jsonb)
                     from public.consignment_settlement_lines sl join public.consignment_note_lines l on l.id = sl.line_id
                    where sl.settlement_id = v_liq.id)));
    update public.consignment_settlements set shared_document_id = v_doc where id = v_liq.id;
  end if;

  update public.consignment_notes set status = public.fn_consignacion_estado(p_nota), updated_at = now() where id = p_nota;

  return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', false, 'estado', v_liq.status, 'contrato', v_nota.contract_type,
    'venta', v_venta, 'pactado', v_pactado, 'descuentos', round(v_desc, 2), 'iva', round(v_iva, 2),
    'remuneracion', v_remuneracion, 'dueno', v_dueno, 'por_pagar', v_liq.payable_amount,
    'proveedor_id', v_nota.supplier_id, 'sucursal_id', v_nota.branch_id, 'numero_nota', v_nota.number,
    'cuenta_recaudo', v_nota.owner_account_code, 'lineas_compra', v_lineas_compra, 'documento_compartido_id', v_doc);
end;
$function$;

-- Anular la ÚLTIMA liquidación de una nota (intermediación): contra-asiento de la remuneración y lo vendido
-- vuelve a quedar por liquidar. En estimatorio con factura de compra viva, primero se anula la factura.
create or replace function public.fn_consignacion_recibida_anular_liquidacion(
  p_liquidacion uuid,
  p_motivo text,
  p_organization_id integer
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_liq public.consignment_settlements%rowtype;
  v_nota public.consignment_notes%rowtype;
  v_entry integer;
  v_motivo text := nullif(left(btrim(coalesce(p_motivo, '')), 500), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  select * into v_liq from public.consignment_settlements
   where id = p_liquidacion and organization_id = v_org and direction = 'recibida' for update;
  if not found then
    raise exception 'liquidacion_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.void', 'finance.create']);
  select * into v_nota from public.consignment_notes where id = v_liq.note_id for update;
  if v_liq.status = 'anulada' then
    return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', true, 'estado', 'anulada');
  end if;
  if exists (select 1 from public.consignment_settlements s
              where s.note_id = v_liq.note_id and s.status <> 'anulada' and s.created_at > v_liq.created_at) then
    raise exception 'liquidacion_no_es_la_ultima' using errcode = '22023';
  end if;
  if v_liq.purchase_invoice_id is not null and exists (
       select 1 from public.invoice_purchase f where f.id = v_liq.purchase_invoice_id and f.status not in ('void', 'voided', 'cancelled')) then
    raise exception 'anular_factura_compra_primero' using errcode = '22023';
  end if;
  if v_liq.shared_document_id is not null and exists (
       select 1 from public.organization_shared_documents d where d.id = v_liq.shared_document_id and d.status = 'aceptado') then
    raise exception 'liquidacion_aceptada_por_el_dueno' using errcode = '22023',
      hint = 'El dueño ya aceptó esta liquidación en su GO Admin: se corrige con una devolución o en la próxima liquidación.';
  end if;

  if v_nota.contract_type = 'intermediacion' and v_liq.commission_amount > 0 then
    v_entry := public.fn_create_journal_entry(
      p_organization_id := v_org, p_branch_id := v_nota.branch_id, p_entry_date := now(),
      p_memo := 'Anulación de la remuneración por consignación - ' || v_nota.number, p_source := 'consignment_owner_settlement',
      p_source_id := v_liq.id::text, p_debit_account := v_nota.remuneration_account_code, p_credit_account := v_nota.owner_account_code,
      p_amount := v_liq.commission_amount, p_created_by := v_uid, p_fact_key := 'consignment_owner_settlement:anula:' || v_liq.id::text);
    if v_entry is null then
      raise exception 'asiento_no_creado' using errcode = 'P0001';
    end if;
  end if;

  update public.consignment_allocations set settlement_id = null where settlement_id = v_liq.id and not absorbed;
  update public.consignment_settlements
     set status = 'anulada', void_reason = v_motivo, closed_at = now(), closed_by = v_uid
   where id = v_liq.id;
  if v_liq.shared_document_id is not null then
    update public.organization_shared_documents
       set status = 'anulado', reply_reason = v_motivo, decided_at = now(), decided_by = v_uid
     where id = v_liq.shared_document_id and status = 'enviado';
  end if;
  update public.consignment_notes set status = public.fn_consignacion_estado(v_nota.id), updated_at = now() where id = v_nota.id;
  return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', false, 'estado', 'anulada', 'asiento_id', v_entry);
end;
$function$;

-- Estimatorio: liga la factura de compra de siempre y deja la liquidación «liquidada».
create or replace function public.fn_consignacion_recibida_cerrar_compra(
  p_liquidacion uuid,
  p_factura_compra uuid,
  p_organization_id integer
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_liq public.consignment_settlements%rowtype;
  v_nota public.consignment_notes%rowtype;
  v_fc public.invoice_purchase%rowtype;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  select * into v_liq from public.consignment_settlements
   where id = p_liquidacion and organization_id = v_org and direction = 'recibida' for update;
  if not found then
    raise exception 'liquidacion_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  select * into v_nota from public.consignment_notes where id = v_liq.note_id;
  if v_liq.status = 'liquidada' then
    return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', true, 'estado', 'liquidada', 'factura_compra_id', v_liq.purchase_invoice_id);
  end if;
  if v_liq.status = 'anulada' then
    raise exception 'liquidacion_anulada' using errcode = '22023';
  end if;
  if v_liq.purchase_invoice_id is not null and v_liq.purchase_invoice_id <> p_factura_compra then
    raise exception 'factura_distinta' using errcode = '22023';
  end if;
  select * into v_fc from public.invoice_purchase where id = p_factura_compra and organization_id = v_org;
  if not found then
    raise exception 'factura_no_encontrada' using errcode = 'P0002';
  end if;
  if v_fc.supplier_id <> v_nota.supplier_id then
    raise exception 'proveedor_distinto' using errcode = '22023';
  end if;
  if v_fc.status in ('void', 'voided', 'cancelled') then
    raise exception 'documento_anulado' using errcode = '22023';
  end if;
  update public.consignment_settlements set purchase_invoice_id = p_factura_compra where id = v_liq.id and purchase_invoice_id is null;
  if v_fc.status = 'draft' then
    return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', false, 'estado', 'por_facturar', 'factura_compra_id', p_factura_compra);
  end if;
  update public.consignment_settlements set status = 'liquidada', closed_at = now(), closed_by = v_uid where id = v_liq.id;
  update public.consignment_notes set status = public.fn_consignacion_estado(v_nota.id), updated_at = now() where id = v_nota.id;
  return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', false, 'estado', 'liquidada', 'factura_compra_id', p_factura_compra);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Entre organizaciones
-- ─────────────────────────────────────────────────────────────────────────────

-- INTERNA. Publica una nota entregada si el consignatario es un tercero vinculado (propósito consignación).
-- Copia solo lo de «Qué se comparte» (R6): número, condiciones, productos (nombre, referencia, cantidad, precio
-- del dueño). Nunca costos, clientes ni contabilidad.
create or replace function public.fn_consignacion_compartir_interna(p_nota uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_nota public.consignment_notes%rowtype;
  v_link uuid;
begin
  select * into v_nota from public.consignment_notes where id = p_nota and direction = 'entregada';
  if not found then
    return null;
  end if;
  select p.link_id into v_link
    from public.organization_link_parties p
    join public.organization_links l on l.id = p.link_id
   where p.organization_id = v_nota.organization_id and p.customer_id = v_nota.customer_id
     and l.status = 'activo' and 'consignacion' = any (l.purposes)
   order by l.created_at desc
   limit 1;
  if v_link is null then
    return null;
  end if;
  return public.fn_documento_compartido_publicar(
    v_link, v_nota.organization_id, 'consignacion_nota', v_nota.id::text,
    jsonb_build_object(
      'numero', v_nota.number, 'fecha', v_nota.delivered_at,
      'terminos', jsonb_build_object(
        'contrato', v_nota.contract_type, 'precio_modo', v_nota.price_mode, 'remuneracion_modo', v_nota.remuneration_mode,
        'base_comision', v_nota.commission_base, 'comision', v_nota.commission_pct, 'obligacion_dueno', v_nota.owner_obligation_at,
        'riesgos', v_nota.risk_terms, 'factura', v_nota.billing_terms->>'factura',
        'vence', v_nota.due_date, 'periodicidad', v_nota.settlement_frequency),
      'lineas', (select coalesce(jsonb_agg(jsonb_build_object(
                          'ref', l.id, 'producto_ref', p.uuid, 'nombre', p.name,
                          'referencia', coalesce(nullif(p.reference, ''), p.sku), 'cantidad', l.qty_delivered,
                          'precio', l.agreed_price, 'precio_liquidacion', l.settlement_price) order by p.name), '[]'::jsonb)
                   from public.consignment_note_lines l join public.products p on p.id = l.product_id
                  where l.note_id = v_nota.id),
      'total', v_nota.total_agreed));
end;
$function$;

create or replace function public.fn_consignacion_compartir(p_nota uuid, p_organization_id integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_doc uuid;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.consignment_notes n where n.id = p_nota and n.organization_id = p_organization_id and n.direction = 'entregada') then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.create']);
  v_doc := public.fn_consignacion_compartir_interna(p_nota);
  if v_doc is null then
    raise exception 'consignatario_no_vinculado' using errcode = '22023';
  end if;
  return jsonb_build_object('documento_compartido_id', v_doc);
end;
$function$;

-- El consignatario acepta una nota que le llegó (R2): enlaza cada producto del consignante con uno PROPIO de
-- consignación y elige la bodega. Las condiciones (clasificación incluida) son las de la copia. Crea SU nota
-- recibida con SUS funciones. p_mapeo: [{ producto_ref, product_id, precio? }]
create or replace function public.fn_consignacion_recibida_aceptar(
  p_documento uuid,
  p_branch integer,
  p_mapeo jsonb,
  p_cuenta_recaudo text,
  p_clave_idempotencia text,
  p_organization_id integer
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_doc public.organization_shared_documents%rowtype;
  v_parte public.organization_link_parties%rowtype;
  v_l jsonb;
  v_producto integer;
  v_lineas jsonb := '[]'::jsonb;
  v_terminos jsonb;
  v_res jsonb;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  select * into v_doc from public.organization_shared_documents where id = p_documento for update;
  if not found or v_doc.to_org_id <> v_org or v_doc.kind <> 'consignacion_nota' then
    raise exception 'documento_no_encontrado' using errcode = 'P0002';
  end if;
  if v_doc.status = 'aceptado' then
    select jsonb_build_object('nota_id', n.id, 'numero', n.number, 'repetida', true) into v_res
      from public.consignment_notes n where n.organization_id = v_org and n.shared_document_id = v_doc.id;
    return v_res;
  end if;
  if v_doc.status <> 'enviado' then
    raise exception 'documento_no_disponible' using errcode = '22023', detail = v_doc.status;
  end if;
  perform public.fn_vinculo_activo(v_doc.link_id, v_org, 'consignacion');
  select * into v_parte from public.organization_link_parties where link_id = v_doc.link_id and organization_id = v_org;
  if v_parte.supplier_id is null then
    raise exception 'vinculo_sin_proveedor' using errcode = '22023',
      hint = 'Para recibir en consignación, el vínculo debe estar amarrado a un proveedor tuyo.';
  end if;
  if p_mapeo is null or jsonb_typeof(p_mapeo) <> 'array' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;

  for v_l in select e from jsonb_array_elements(v_doc.payload->'lineas') e loop
    v_producto := null;
    select (m->>'product_id')::integer into v_producto
      from jsonb_array_elements(p_mapeo) m where m->>'producto_ref' = v_l->>'producto_ref' limit 1;
    if v_producto is null then
      select pm.product_id into v_producto from public.organization_link_product_map pm
       where pm.organization_id = v_org and pm.link_id = v_doc.link_id and pm.external_ref = v_l->>'producto_ref';
    end if;
    if v_producto is null then
      raise exception 'producto_sin_vincular' using errcode = '22023', detail = coalesce(v_l->>'nombre', '');
    end if;
    insert into public.organization_link_product_map (organization_id, link_id, external_ref, external_display, product_id, created_by)
    values (v_org, v_doc.link_id, v_l->>'producto_ref',
            jsonb_build_object('nombre', v_l->>'nombre', 'referencia', v_l->>'referencia'), v_producto, v_uid)
    on conflict (organization_id, link_id, external_ref)
    do update set product_id = excluded.product_id, external_display = excluded.external_display, updated_at = now();
    -- Si el consignante no fijó precio en su nota, el receptor lo pone al aceptar (lo pactado por fuera).
    v_lineas := v_lineas || jsonb_build_object(
      'product_id', v_producto, 'qty', (v_l->>'cantidad')::numeric,
      'precio', coalesce(nullif(v_l->>'precio', '')::numeric,
                         (select nullif(m->>'precio', '')::numeric from jsonb_array_elements(p_mapeo) m
                           where m->>'producto_ref' = v_l->>'producto_ref' limit 1)),
      'precio_liquidacion', v_l->'precio_liquidacion', 'ref', v_l->>'ref',
      'ref_display', jsonb_build_object('nombre', v_l->>'nombre', 'referencia', v_l->>'referencia'));
  end loop;

  v_terminos := (v_doc.payload->'terminos') - 'comision' || jsonb_build_object('cuenta_recaudo', p_cuenta_recaudo);
  v_res := public.fn_consignacion_recibir_interna(
    v_org, v_parte.supplier_id, p_branch, v_lineas, (v_doc.payload->'terminos'->>'comision')::numeric, v_terminos,
    p_clave_idempotencia, null, v_doc.link_id, v_doc.id, v_doc.payload->>'numero');
  perform public.fn_documento_compartido_aceptado(v_doc.id, v_org, v_res->>'nota_id');
  return v_res;
end;
$function$;

-- El consignante recibe la liquidación (o la devolución) del consignatario (R8): la valida contra SU nota y
-- devuelve las líneas para el flujo de siempre (fn_consignacion_liquidar + factura + fn_consignacion_cerrar).
create or replace function public.fn_consignacion_documento_recibido_preparar(p_documento uuid, p_organization_id integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer := p_organization_id;
  v_doc public.organization_shared_documents%rowtype;
  v_nota public.consignment_notes%rowtype;
  v_l jsonb;
  v_linea public.consignment_note_lines%rowtype;
  v_lineas jsonb := '[]'::jsonb;
  v_diferencias jsonb := '[]'::jsonb;
  v_precio numeric;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.view', 'finance.create']);
  select * into v_doc from public.organization_shared_documents where id = p_documento;
  if not found or v_doc.to_org_id <> v_org or v_doc.kind not in ('consignacion_liquidacion', 'consignacion_devolucion') then
    raise exception 'documento_no_encontrado' using errcode = 'P0002';
  end if;
  begin
    select * into v_nota from public.consignment_notes
     where id = (v_doc.payload->>'nota_origen')::uuid and organization_id = v_org and direction = 'entregada';
  exception when others then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end;
  if v_nota.id is null then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end if;
  for v_l in select e from jsonb_array_elements(coalesce(v_doc.payload->'lineas', '[]'::jsonb)) e loop
    v_linea := null;
    begin
      select * into v_linea from public.consignment_note_lines where id = (v_l->>'ref')::uuid and note_id = v_nota.id;
    exception when others then
      v_linea := null;
    end;
    if v_linea.id is null then
      v_diferencias := v_diferencias || jsonb_build_object('tipo', 'linea_desconocida', 'ref', v_l->>'ref');
      continue;
    end if;
    v_precio := case when v_nota.remuneration_mode = 'precio_liquidacion' then coalesce(v_linea.settlement_price, 0)
                     else coalesce((v_l->>'precio')::numeric, v_linea.agreed_price, 0) end;
    if v_linea.agreed_price is not null and v_nota.remuneration_mode = 'porcentaje' and v_precio + 0.005 < v_linea.agreed_price then
      v_diferencias := v_diferencias || jsonb_build_object('tipo', 'precio_bajo_pactado', 'linea_id', v_linea.id);
    end if;
    if coalesce((v_l->>'vendido')::numeric, 0) < 0 then
      v_diferencias := v_diferencias || jsonb_build_object('tipo', 'devolucion_posterior', 'linea_id', v_linea.id);
    end if;
    if coalesce((v_l->>'vendido')::numeric, 0) + coalesce((v_l->>'devuelto')::numeric, 0)
       > v_linea.qty_delivered - v_linea.qty_sold - v_linea.qty_returned then
      v_diferencias := v_diferencias || jsonb_build_object('tipo', 'excede_en_su_poder', 'linea_id', v_linea.id);
    end if;
    v_lineas := v_lineas || jsonb_build_object(
      'linea_id', v_linea.id, 'producto_id', v_linea.product_id, 'vendido', greatest(coalesce((v_l->>'vendido')::numeric, 0), 0),
      'devuelto', coalesce((v_l->>'devuelto')::numeric, 0), 'precio', v_precio,
      'entregado', v_linea.qty_delivered, 'vendido_antes', v_linea.qty_sold, 'devuelto_antes', v_linea.qty_returned);
  end loop;
  if v_doc.kind = 'consignacion_liquidacion' and coalesce((v_doc.payload->>'comision_pct')::numeric, v_nota.commission_pct) <> v_nota.commission_pct then
    v_diferencias := v_diferencias || jsonb_build_object('tipo', 'comision_distinta');
  end if;
  return jsonb_build_object('documento_id', v_doc.id, 'estado', v_doc.status, 'tipo', v_doc.kind, 'nota_id', v_nota.id,
    'numero_nota', v_nota.number, 'comision_pct', v_nota.commission_pct, 'contrato', v_nota.contract_type,
    'lineas', v_lineas, 'diferencias', v_diferencias, 'payload', v_doc.payload);
end;
$function$;

create or replace function public.fn_consignacion_documento_recibido_cerrar(
  p_documento uuid,
  p_liquidacion uuid,
  p_organization_id integer
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_doc public.organization_shared_documents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.create']);
  select * into v_doc from public.organization_shared_documents where id = p_documento for update;
  if not found or v_doc.to_org_id <> p_organization_id or v_doc.kind not in ('consignacion_liquidacion', 'consignacion_devolucion') then
    raise exception 'documento_no_encontrado' using errcode = 'P0002';
  end if;
  if v_doc.status = 'aceptado' then
    return jsonb_build_object('documento_id', v_doc.id, 'estado', 'aceptado', 'repetida', true);
  end if;
  if not exists (select 1 from public.consignment_settlements s
                  where s.id = p_liquidacion and s.organization_id = p_organization_id and s.direction = 'entregada'
                    and s.note_id::text = v_doc.payload->>'nota_origen') then
    raise exception 'liquidacion_no_encontrada' using errcode = 'P0002';
  end if;
  update public.consignment_settlements set shared_document_id = v_doc.id where id = p_liquidacion and shared_document_id is null;
  perform public.fn_documento_compartido_aceptado(v_doc.id, p_organization_id, p_liquidacion::text);
  return jsonb_build_object('documento_id', v_doc.id, 'estado', 'aceptado', 'repetida', false);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. Permisos de ejecución
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.fn_cuenta_inventario_consignacion(integer, integer) from public, anon;
revoke all on function public.fn_consignacion_cuenta_patron(integer, text) from public, anon, authenticated;
revoke all on function public.fn_consignacion_cuenta_valida(integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_consignacion_cuentas_recibida(integer, integer, text, integer, text) from public, anon;
revoke all on function public.fn_consignacion_registrar_pendiente(integer, text, text) from public, anon;
revoke all on function public.fn_consignacion_pendiente(integer, integer, text, text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.fn_consignacion_terminos(jsonb, text) from public, anon;
revoke all on function public.fn_consignacion_estado(uuid) from public, anon;
revoke all on function public.fn_consignacion_entregar(uuid, integer, jsonb, numeric, jsonb, text, integer, text, text) from public, anon;
revoke all on function public.fn_consignacion_liquidar(uuid, jsonb, text, integer, date, date) from public, anon;
revoke all on function public.fn_consignacion_cerrar(uuid, uuid, text, integer) from public, anon;
revoke all on function public.fn_consignacion_registrar_producto(integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_consignacion_recibir_interna(integer, integer, integer, jsonb, numeric, jsonb, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fn_consignacion_recibir(integer, integer, jsonb, numeric, jsonb, text, integer, text) from public, anon;
revoke all on function public.fn_consignacion_recibida_devolver(uuid, jsonb, text, integer, text) from public, anon;
revoke all on function public.fn_consignacion_linea_venta(text, text, integer) from public, anon, authenticated;
revoke all on function public.fn_consignacion_venta_cobrada(text, text) from public, anon, authenticated;
revoke all on function public.fn_consignacion_cuenta_ingreso_pos(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_consignacion_asignar_venta(public.stock_movements) from public, anon, authenticated;
revoke all on function public.fn_consignacion_revertir_venta(public.stock_movements) from public, anon, authenticated;
revoke all on function public.fn_trg_consignacion_venta() from public, anon, authenticated;
revoke all on function public.fn_consignacion_recibida_liquidar(uuid, date, text, integer) from public, anon;
revoke all on function public.fn_consignacion_recibida_anular_liquidacion(uuid, text, integer) from public, anon;
revoke all on function public.fn_consignacion_recibida_cerrar_compra(uuid, uuid, integer) from public, anon;
revoke all on function public.fn_consignacion_compartir_interna(uuid) from public, anon, authenticated;
revoke all on function public.fn_consignacion_compartir(uuid, integer) from public, anon;
revoke all on function public.fn_consignacion_recibida_aceptar(uuid, integer, jsonb, text, text, integer) from public, anon;
revoke all on function public.fn_consignacion_documento_recibido_preparar(uuid, integer) from public, anon;
revoke all on function public.fn_consignacion_documento_recibido_cerrar(uuid, uuid, integer) from public, anon;

grant execute on function public.fn_cuenta_inventario_consignacion(integer, integer) to authenticated;
grant execute on function public.fn_consignacion_cuentas_recibida(integer, integer, text, integer, text) to authenticated;
grant execute on function public.fn_consignacion_registrar_pendiente(integer, text, text) to authenticated;
grant execute on function public.fn_consignacion_terminos(jsonb, text) to authenticated;
grant execute on function public.fn_consignacion_entregar(uuid, integer, jsonb, numeric, jsonb, text, integer, text, text) to authenticated;
grant execute on function public.fn_consignacion_liquidar(uuid, jsonb, text, integer, date, date) to authenticated;
grant execute on function public.fn_consignacion_cerrar(uuid, uuid, text, integer) to authenticated;
grant execute on function public.fn_consignacion_recibir(integer, integer, jsonb, numeric, jsonb, text, integer, text) to authenticated;
grant execute on function public.fn_consignacion_recibida_devolver(uuid, jsonb, text, integer, text) to authenticated;
grant execute on function public.fn_consignacion_recibida_liquidar(uuid, date, text, integer) to authenticated;
grant execute on function public.fn_consignacion_recibida_anular_liquidacion(uuid, text, integer) to authenticated;
grant execute on function public.fn_consignacion_recibida_cerrar_compra(uuid, uuid, integer) to authenticated;
grant execute on function public.fn_consignacion_compartir(uuid, integer) to authenticated;
grant execute on function public.fn_consignacion_recibida_aceptar(uuid, integer, jsonb, text, text, integer) to authenticated;
grant execute on function public.fn_consignacion_documento_recibido_preparar(uuid, integer) to authenticated;
grant execute on function public.fn_consignacion_documento_recibido_cerrar(uuid, uuid, integer) to authenticated;
