-- Consignaciones en los dos sentidos y entre organizaciones.
-- Figma «07 Finanzas»: entregada 2335:138595 · 2335:139248 · 2335:139356; recibida y entre organizaciones,
-- sección 2403:146159 (capturas docs/design/figma/89-consignacion-recibida-*).
-- Diseño y decisiones: docs/design/CONSIGNACION-RECIBIDA-Y-ENTRE-ORGANIZACIONES.md. Mandan las secciones
-- «Ronda 2 del Contador» (docs/contador/RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md, «Consignación: ocho decisiones») y
-- «Ronda 3 del Contador» (docs/contador/RESPUESTAS-CONTADOR-RONDA-3-2026-11-08.md: comisión y retenciones).
--
-- PROPUESTA, SIN APLICAR. Nunca se aplicó: reescrita (v4, 2026-11-08). Va DESPUÉS de
-- 20261108120500_organization_links.sql. Mientras no exista, la pantalla dice «pendiente de activar».
--
-- ═══ El contrato (por nota; nada se deduce del nombre) ═══════════════════════════════════════════════
--   modalidad jurídica   'intermediacion' (mandato) | 'estimatorio' | 'compra'. Obligatoria, sin default.
--                        'compra' no es consignación: la adquisición real va por la factura de compra (manual).
--   condición contable   'agente' | 'principal'. Obligatoria. Intermediación ⇒ agente.
--   tratamiento tributario  'mandato' | 'estimatorio_438_455', derivado de la modalidad. El estimatorio queda
--                        BLOQUEADO para operar hasta parametrizar los arts. 438 y 455 (consignment_account_settings.
--                        estimatorio_rules, aprobadas): 'estimatorio_bloqueado_438_455' + pendiente visible.
--   valoración de las cuentas de orden  'costo_acreditado' | 'valor_convenido' (identificado para custodia).
--                        Ese valor NUNCA se vuelve activo propio del intermediario.
--   remuneración         porcentaje (base pactado o venta) o precio de liquidación. Se reconoce cuando se DEVENGA
--                        según las obligaciones cumplidas, nunca por la fecha de liquidación: 'al_vender' (la unidad
--                        vendida) u 'obligacion_posterior' (el contrato documenta CUÁL obligación posterior real
--                        condiciona el devengo; se reconoce al cumplirse, con evidencia: fn_consignacion_reconocer_remuneracion).
--                        Si hay servicio independiente con obligación de facturar (fee_invoice_required), la
--                        liquidación NO sustituye esa factura: pendiente visible; su IVA se analiza aparte.
--   obligación con el dueño en ventas a crédito: 'venta' | 'cobro'.
--   riesgos              quién asume devoluciones, pérdidas y gastos.
--
-- ═══ Asientos (cuentas DEFINIDAS en consignment_account_settings o en el PUC; si falta una, se BLOQUEA y la app
--     deja el pendiente contable; nunca se inventa una cuenta) ═══════════════════════════════════════════
-- RECIBIDA en intermediación (lo único que opera hoy)
--   recibir              D cuenta DEFINIDA del grupo 94 (configurable; nunca 9905, que no es del grupo 94)
--                        C 911520 «En consignación» (o su auxiliar)                        cantidad × valor de custodia
--   vender (POS/factura) el flujo de siempre; un disparador del kardex: D 911520 / C 94 por lo vendido.
--                        El recaudo es del dueño: auxiliar de 8 dígitos bajo 281510, por propietario (factura: cuenta
--                        de ingreso y devolución del producto; POS: D ingreso de la regla del POS / C auxiliar 281510).
--                        Remuneración 'al_vender': D auxiliar 281510 / C auxiliar de 8 dígitos bajo 413512.
--   devolver al dueño, faltante o daño   D 911520 / C 94. Faltante o daño: NADA de gasto ni CxP automáticos; se
--                        registran evidencia, responsable y obligación (consignment_incidents) y un pendiente.
--   cumplir la obligación posterior (si el contrato la tiene)  D auxiliar 281510 / C auxiliar 413512, con evidencia.
--   liquidar             sin asiento de remuneración (ya se devengó o espera su obligación). Resuelve por separado las
--                        retenciones de la OPERACIÓN y las de la REMUNERACIÓN (consignment_settlement_withholdings).
--                        El saldo del dueño queda en 281510 y se paga por Tesorería › Dinero de terceros. Nunca 2205,
--                        nunca una compra ni un documento soporte fabricados para pagarle.
--   anticipo al consignante  el de anticipos a proveedores (supplier_advances); se cruza con la obligación REAL del
--                        mandato: D auxiliar 281510 / C cuenta del anticipo (fn_consignacion_cruzar_anticipo).
--   devolución después de liquidar  derecho frente al dueño (el 281510 del dueño queda deudor); se descuenta en la
--                        siguiente liquidación SOLO con acuerdo registrado; si no habrá otra, pendiente para cobrarlo.
--   anular liquidación   lo vendido vuelve a quedar por liquidar; sus retenciones y pendientes se cierran.
-- ENTREGADA (mercancía propia): sigue en el inventario propio a costo. Se IDENTIFICA en poder del consignatario con un
--   traslado del kardex a la ubicación «en poder de {consignatario}» (la nota), SIN cambio de cuenta y sin asiento.
--   Nada de 1465 (inventarios en tránsito), ni ingreso ni costo al entregar. La liquidación del dueño en mandato espera
--   al Contador ('liquidacion_mandante_pendiente'); en estimatorio, bloqueada hasta los arts. 438 y 455.
--
-- Facturación al público: la emite quien vende (el POS y la factura de siempre); en mandato, el mandatario,
-- diferenciando lo ajeno (productos de consignación, aparte) de lo propio. No se genera por defecto una factura del
-- dueño al intermediario sin una operación real.
-- Retenciones (por pago o abono; nunca 0 ni tarifa fija: tarifa y base mínima de las reglas configuradas en
-- organization_taxes, las mismas de compras; la regla de cada ámbito la elige la organización):
--   (a) OPERACIÓN: la venta por cuenta del mandante; la practica el comprador agente de retención, con la calidad
--       tributaria del MANDANTE. Por grupo de compradores: consumidor final, sin datos fiscales, no agente, agente.
--   (b) REMUNERACIÓN del intermediario: sobre la comisión; la practica el dueño (pagador) si es agente, con la calidad
--       del INTERMEDIARIO (perfil tributario de la organización).
--   Si falta la regla, la calidad del pagador o del beneficiario, la UVT o la norma municipal: pendiente visible y
--   conciliable (fn_consignacion_conciliar_retencion), con su motivo. Lo determinado también queda por conciliar con
--   el certificado. Cada una se ve por separado en la liquidación.
--
-- Escritura SOLO por las RPC (SECURITY DEFINER, guarda de organización, sucursal y permiso); lectura por RLS de
-- pertenencia; nada para anon. Kardex solo por fn_inv_int_mover; asientos solo por fn_create_journal_entry.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tablas
-- ─────────────────────────────────────────────────────────────────────────────

-- Cuentas de consignación DEFINIDAS por la organización. Tabla propia (y no claves nuevas en configuracion_contable):
-- su CHECK de claves es una lista cerrada que 20261108170000 también redefine; ampliarlo aquí chocaría.
create table if not exists public.consignment_account_settings (
  organization_id integer primary key references public.organizations(id) on delete cascade,
  memo_account_code text,          -- 911520 o su auxiliar
  memo_contra_account_code text,   -- cuenta definida del grupo 94 (obligatoria para operar)
  remuneration_account_code text,  -- auxiliar de 8 dígitos bajo 413512
  -- Reglas de los arts. 438 y 455 del Estatuto Tributario para el estimatorio. Mientras sean null, el estimatorio no
  -- opera. Se cargan con una migración aprobada por el Contador (no hay RPC para escribirlas).
  estimatorio_rules jsonb,
  estimatorio_rules_approved_at timestamptz,
  -- Regla de retención configurada (organization_taxes, kind withholding) que aplica a cada ámbito y clase:
  -- {"operacion": {"retefuente": uuid, "reteiva": uuid, "reteica": uuid}, "remuneracion": {...}}. Sin regla, pendiente.
  withholding_rules jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

comment on table public.consignment_account_settings is
  'Cuentas de consignación definidas por la organización (911520, contrapartida del grupo 94, auxiliar 413512) y reglas del estimatorio. Escritura solo por fn_consignacion_configurar_cuentas.';

create table if not exists public.consignment_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id integer not null references public.branches(id),
  direction text not null check (direction in ('entregada', 'recibida')),
  customer_id uuid references public.customers(id),
  supplier_id integer references public.suppliers(id),
  number text not null,
  location text,
  -- El contrato: modalidad jurídica, condición contable y tratamiento tributario por separado. Sin defaults.
  legal_modality text not null check (legal_modality in ('intermediacion', 'estimatorio', 'compra')),
  accounting_role text not null check (accounting_role in ('agente', 'principal')),
  tax_treatment text not null check (tax_treatment in ('mandato', 'estimatorio_438_455')),
  memo_valuation text check (memo_valuation in ('costo_acreditado', 'valor_convenido')),
  price_mode text not null check (price_mode in ('fijo', 'minimo')),
  remuneration_mode text not null check (remuneration_mode in ('porcentaje', 'precio_liquidacion')),
  commission_base text not null check (commission_base in ('precio_pactado', 'precio_venta')),
  commission_pct numeric(5,2) not null default 0 check (commission_pct >= 0 and commission_pct <= 100),
  -- Devengo de la remuneración: al vender la unidad, o al cumplirse una obligación posterior real que el contrato
  -- documenta (post_sale_obligation). Nunca por la fecha de liquidación.
  remuneration_recognition text not null check (remuneration_recognition in ('al_vender', 'obligacion_posterior')),
  post_sale_obligation text,
  fee_invoice_required boolean not null,
  owner_obligation_at text check (owner_obligation_at in ('venta', 'cobro')),
  risk_terms jsonb not null,
  billing_terms jsonb not null,
  status text not null default 'en_consignacion' check (status in ('en_consignacion', 'por_liquidar', 'liquidada')),
  memo_account_code text,
  memo_contra_account_code text,
  owner_account_code text,
  remuneration_account_code text,
  total_cost numeric(16,2) not null default 0,
  total_agreed numeric(16,2) not null default 0,
  total_memo numeric(16,2) not null default 0,
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
  constraint consignment_notes_no_compra check (legal_modality <> 'compra'),
  constraint consignment_notes_mandato_agente check (legal_modality <> 'intermediacion' or accounting_role = 'agente'),
  constraint consignment_notes_tributario check (
    (legal_modality = 'intermediacion' and tax_treatment = 'mandato') or (legal_modality = 'estimatorio' and tax_treatment = 'estimatorio_438_455')
  ),
  constraint consignment_notes_sentido check (
    (direction = 'entregada' and customer_id is not null)
    or (direction = 'recibida' and supplier_id is not null and memo_valuation is not null
        and memo_account_code is not null and memo_contra_account_code is not null)
  ),
  constraint consignment_notes_intermediacion check (
    direction = 'entregada' or legal_modality <> 'intermediacion'
    or (owner_account_code is not null and remuneration_account_code is not null and owner_obligation_at is not null)
  ),
  constraint consignment_notes_terminos check (jsonb_typeof(risk_terms) = 'object' and jsonb_typeof(billing_terms) = 'object'),
  constraint consignment_notes_obligacion_posterior check (
    (remuneration_recognition = 'obligacion_posterior') = (post_sale_obligation is not null and length(btrim(post_sale_obligation)) between 10 and 1000)
  )
);

comment on table public.consignment_notes is
  'Notas de consignación entregadas y recibidas: modalidad jurídica, condición contable y tratamiento tributario por nota. La compra real no es consignación. Escritura solo por fn_consignacion_*.';

create unique index if not exists consignment_notes_documento_compartido
  on public.consignment_notes (organization_id, shared_document_id) where shared_document_id is not null;
create index if not exists idx_consignment_notes_supplier on public.consignment_notes (organization_id, supplier_id) where supplier_id is not null;

create table if not exists public.consignment_note_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  note_id uuid not null references public.consignment_notes(id) on delete cascade,
  product_id integer not null references public.products(id),
  qty_delivered numeric(12,3) not null check (qty_delivered > 0),
  -- Entregada: costo propio identificado (promedio al trasladar). Recibida: 0.
  unit_cost numeric(16,4) not null default 0 check (unit_cost >= 0),
  -- Precio del dueño, sin IVA (fijo o mínimo).
  agreed_price numeric(16,2) check (agreed_price is null or agreed_price >= 0),
  -- Precio de liquidación por unidad, si la remuneración se pactó así.
  settlement_price numeric(16,2) check (settlement_price is null or settlement_price >= 0),
  -- Recibida con valoración «costo acreditado»: el costo que el dueño acredita para la custodia.
  credited_cost numeric(16,2) check (credited_cost is null or credited_cost >= 0),
  -- Valor unitario de custodia en cuentas de orden (costo acreditado o valor convenido), fijado al recibir.
  memo_unit_value numeric(16,2) not null default 0 check (memo_unit_value >= 0),
  external_ref text check (external_ref is null or length(external_ref) <= 120),
  external_display jsonb,
  qty_sold numeric(12,3) not null default 0 check (qty_sold >= 0),
  qty_returned numeric(12,3) not null default 0 check (qty_returned >= 0),
  -- Faltantes y daños registrados con evidencia (consignment_incidents).
  qty_incident numeric(12,3) not null default 0 check (qty_incident >= 0),
  constraint consignment_note_lines_cuadre check (qty_sold + qty_returned + qty_incident <= qty_delivered)
);

create index if not exists idx_consignment_note_lines_note on public.consignment_note_lines (note_id);
create index if not exists idx_consignment_note_lines_product on public.consignment_note_lines (product_id);

create table if not exists public.consignment_settlements (
  id uuid primary key default gen_random_uuid(),
  -- Orden de las liquidaciones de una nota («solo se anula la última»); created_at empata dentro de una transacción.
  seq bigint generated always as identity,
  organization_id integer not null references public.organizations(id) on delete cascade,
  note_id uuid not null references public.consignment_notes(id),
  direction text not null check (direction in ('entregada', 'recibida')),
  period_from date,
  period_to date,
  -- Separados: precio de venta, precio pactado, lo del dueño, remuneración, descuentos e IVA.
  sale_total numeric(16,2) not null default 0,
  agreed_total numeric(16,2) not null default 0,
  owner_amount numeric(16,2) not null default 0,
  discount_total numeric(16,2) not null default 0,
  tax_total numeric(16,2) not null default 0,
  commission_pct numeric(5,2) not null default 0,
  -- Entregada: comisión del consignatario. Recibida: remuneración (venta − lo del dueño).
  commission_amount numeric(16,2) not null default 0,
  net_amount numeric(16,2) not null default 0,
  returned_cost numeric(16,2) not null default 0,
  -- Derechos frente al dueño (devoluciones después de liquidar) descontados con acuerdo.
  rights_discounted numeric(16,2) not null default 0,
  rights_agreement text,
  payable_amount numeric(16,2) not null default 0,
  tax_facts jsonb not null default '{}'::jsonb,
  invoice_id uuid references public.invoice_sales(id),
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
  qty_sold numeric(12,3) not null default 0,
  unit_price numeric(16,2) not null default 0,
  qty_returned numeric(12,3) not null default 0 check (qty_returned >= 0),
  sale_amount numeric(16,2) not null default 0,
  owner_amount numeric(16,2) not null default 0,
  discount_amount numeric(16,2) not null default 0,
  tax_amount numeric(16,2) not null default 0
);

create index if not exists idx_consignment_settlement_lines_settlement on public.consignment_settlement_lines (settlement_id);

-- Productos de consignación: siempre aparte de los propios, de un solo consignante y una sola modalidad.
create table if not exists public.consignment_products (
  product_id integer primary key references public.products(id),
  organization_id integer not null references public.organizations(id) on delete cascade,
  supplier_id integer not null references public.suppliers(id),
  legal_modality text not null check (legal_modality in ('intermediacion', 'estimatorio')),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_consignment_products_org on public.consignment_products (organization_id, supplier_id);

-- Ventas y reversos de productos de consignación por movimiento de kardex y línea (FIFO por nota).
create table if not exists public.consignment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  note_id uuid references public.consignment_notes(id),
  line_id uuid references public.consignment_note_lines(id),
  product_id integer not null references public.products(id),
  stock_movement_id integer not null,
  kind text not null check (kind in ('venta', 'reverso')),
  qty numeric(12,3) not null check (qty > 0),
  sale_amount numeric(16,2) not null default 0,
  discount_amount numeric(16,2) not null default 0,
  tax_amount numeric(16,2) not null default 0,
  agreed_amount numeric(16,2) not null default 0,
  memo_amount numeric(16,2) not null default 0,
  -- Remuneración de la porción y si ya se reconoció (al vender, o al cumplirse la obligación posterior).
  remuneration_amount numeric(16,2) not null default 0,
  remuneration_recognized boolean not null default false,
  source text not null,
  source_id text,
  reverses_id uuid references public.consignment_allocations(id),
  settlement_id uuid references public.consignment_settlements(id),
  -- Reverso de una venta ya liquidada: derecho frente al dueño; solo se descuenta con acuerdo.
  owner_right boolean not null default false,
  -- Reverso de una venta ya liquidada cuyo riesgo asume el consignatario: no toca lo del dueño.
  absorbed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint consignment_allocations_unico unique (stock_movement_id, line_id, kind)
);

create index if not exists idx_consignment_allocations_note on public.consignment_allocations (note_id) where settlement_id is null;
create index if not exists idx_consignment_allocations_product on public.consignment_allocations (organization_id, product_id);

create table if not exists public.consignment_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  note_id uuid not null references public.consignment_notes(id),
  lines jsonb not null,
  total_agreed numeric(16,2) not null default 0,
  total_memo numeric(16,2) not null default 0,
  shared_document_id uuid references public.organization_shared_documents(id),
  notes text,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint consignment_returns_clave unique (organization_id, idempotency_key)
);

create index if not exists idx_consignment_returns_note on public.consignment_returns (note_id);

-- Faltantes y daños: evidencia, responsable y obligación. NADA de gasto ni cuenta por pagar automáticos.
create table if not exists public.consignment_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  note_id uuid not null references public.consignment_notes(id),
  line_id uuid not null references public.consignment_note_lines(id),
  kind text not null check (kind in ('faltante', 'dano')),
  qty numeric(12,3) not null check (qty > 0),
  memo_amount numeric(16,2) not null default 0,
  responsible text not null check (responsible in ('dueno', 'consignatario', 'tercero', 'por_determinar')),
  evidence text not null check (length(btrim(evidence)) between 5 and 2000),
  obligation text check (obligation is null or length(obligation) <= 2000),
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint consignment_incidents_clave unique (organization_id, idempotency_key)
);

-- Reconocimiento de la remuneración al cumplirse la obligación posterior que el contrato documenta, con su evidencia.
create table if not exists public.consignment_remuneration_recognitions (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  note_id uuid not null references public.consignment_notes(id),
  amount numeric(16,2) not null check (amount > 0),
  evidence text not null check (length(btrim(evidence)) between 10 and 2000),
  journal_entry_id integer,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint consignment_remuneration_recognitions_clave unique (organization_id, idempotency_key)
);

-- Retenciones de cada liquidación, por ámbito (operación o remuneración), clase y grupo de pagadores. «amount» queda
-- NULL mientras esté pendiente: nunca se presume 0. Se concilian con el certificado.
create table if not exists public.consignment_settlement_withholdings (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  settlement_id uuid not null references public.consignment_settlements(id) on delete cascade,
  scope text not null check (scope in ('operacion', 'remuneracion')),
  class text not null check (class in ('retefuente', 'reteiva', 'reteica')),
  payer text not null check (payer in ('comprador', 'dueno')),
  payer_group text not null check (payer_group in ('consumidor_final', 'sin_datos', 'no_agente', 'agente', 'dueno')),
  base numeric(16,2),
  organization_tax_id uuid references public.organization_taxes(id),
  rate numeric(9,4),
  amount numeric(16,2),
  status text not null check (status in ('determinada', 'pendiente', 'no_aplica')),
  reason text,
  qualities jsonb not null default '{}'::jsonb,
  reconciled_amount numeric(16,2) check (reconciled_amount is null or reconciled_amount >= 0),
  reconciled_support text,
  reconciled_at timestamptz,
  reconciled_by uuid,
  created_at timestamptz not null default now(),
  constraint consignment_settlement_withholdings_valor check (
    (status = 'determinada' and amount is not null and rate is not null and organization_tax_id is not null)
    or (status = 'pendiente' and amount is null)
    or (status = 'no_aplica' and amount is null)
  )
);

create index if not exists idx_consignment_settlement_withholdings_settlement on public.consignment_settlement_withholdings (settlement_id);

-- Anticipos al consignante (los de anticipos a proveedores) cruzados con la obligación real del mandato.
create table if not exists public.consignment_advance_crossings (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  note_id uuid not null references public.consignment_notes(id),
  advance_id uuid not null references public.supplier_advances(id),
  amount numeric(16,2) not null check (amount > 0),
  journal_entry_id integer,
  idempotency_key text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint consignment_advance_crossings_clave unique (organization_id, idempotency_key)
);

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['consignment_account_settings', 'consignment_notes', 'consignment_note_lines',
                                 'consignment_settlements', 'consignment_settlement_lines', 'consignment_products',
                                 'consignment_allocations', 'consignment_returns', 'consignment_incidents',
                                 'consignment_advance_crossings', 'consignment_remuneration_recognitions',
                                 'consignment_settlement_withholdings'] loop
    execute format('alter table public.%I enable row level security', v_tabla);
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
-- 2. Cuentas, configuración y pendientes contables
-- ─────────────────────────────────────────────────────────────────────────────

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

-- Definir las cuentas de consignación de la organización. Cada una debe existir en SU PUC y ser de movimiento.
create or replace function public.fn_consignacion_configurar_cuentas(
  p_organization_id integer,
  p_orden text,
  p_contra text,
  p_remuneracion text
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_orden text;
  v_contra text;
  v_rem text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.create']);
  if nullif(btrim(coalesce(p_orden, '')), '') is not null then
    v_orden := public.fn_consignacion_cuenta_valida(p_organization_id, p_orden, '^911520([0-9]{2})?$');
    if v_orden is null then
      raise exception 'cuenta_orden_invalida' using errcode = '22023';
    end if;
  end if;
  -- Cuenta DEFINIDA del grupo 94, de movimiento. (9905 no es del grupo 94 y queda fuera por el patrón.)
  v_contra := public.fn_consignacion_cuenta_valida(p_organization_id, p_contra, '^94[0-9]{2,6}$');
  if v_contra is null then
    raise exception 'cuenta_contra_invalida' using errcode = '22023',
      hint = 'Elija una cuenta de movimiento del grupo 94 de su plan de cuentas.';
  end if;
  if nullif(btrim(coalesce(p_remuneracion, '')), '') is not null then
    v_rem := public.fn_consignacion_cuenta_valida(p_organization_id, p_remuneracion, '^413512[0-9]{2}$');
    if v_rem is null then
      raise exception 'cuenta_remuneracion_invalida' using errcode = '22023';
    end if;
  end if;
  insert into public.consignment_account_settings (organization_id, memo_account_code, memo_contra_account_code, remuneration_account_code, updated_by)
  values (p_organization_id, v_orden, v_contra, v_rem, v_uid)
  on conflict (organization_id) do update
     set memo_account_code = excluded.memo_account_code, memo_contra_account_code = excluded.memo_contra_account_code,
         remuneration_account_code = excluded.remuneration_account_code, updated_by = v_uid, updated_at = now();
  return jsonb_build_object('orden', v_orden, 'contra', v_contra, 'remuneracion', v_rem);
end;
$function$;

-- Cuentas de la recibida en intermediación. La contrapartida del grupo 94 tiene que estar DEFINIDA: no hay respaldo.
create or replace function public.fn_consignacion_cuentas_recibida(
  p_org integer,
  p_proveedor integer,
  p_recaudo text default null
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cfg public.consignment_account_settings%rowtype;
  v_orden text;
  v_contra text;
  v_recaudo text;
  v_remuneracion text;
begin
  perform public.fn_assert_acceso_org(p_org);
  select * into v_cfg from public.consignment_account_settings where organization_id = p_org;
  v_orden := coalesce(v_cfg.memo_account_code, public.fn_consignacion_cuenta_patron(p_org, '^911520([0-9]{2})?$'));
  if v_orden is null then
    raise exception 'sin_cuenta_orden_consignacion' using errcode = 'P0002',
      hint = 'Cree en el plan de cuentas la subcuenta 911520 «En consignación» (o su auxiliar).';
  end if;
  v_contra := public.fn_consignacion_cuenta_valida(p_org, v_cfg.memo_contra_account_code, '^94[0-9]{2,6}$');
  if v_contra is null then
    raise exception 'sin_cuenta_contra_orden' using errcode = 'P0002',
      hint = 'Defina la contrapartida del grupo 94 en Consignaciones › Cuentas.';
  end if;
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
      hint = 'Cree el auxiliar de 281510 «Venta por cuenta de terceros» para este consignante y elíjalo al recibir.';
  end if;
  v_remuneracion := coalesce(public.fn_consignacion_cuenta_valida(p_org, v_cfg.remuneration_account_code, '^413512[0-9]{2}$'),
                             public.fn_consignacion_cuenta_patron(p_org, '^413512[0-9]{2}$'));
  if v_remuneracion is null then
    raise exception 'sin_cuenta_remuneracion' using errcode = 'P0002',
      hint = 'Cree el auxiliar de 8 dígitos bajo 413512 «Venta a cambio de retribución o por contrata».';
  end if;
  return jsonb_build_object('orden', v_orden, 'contra', v_contra, 'recaudo', v_recaudo, 'remuneracion', v_remuneracion);
end;
$function$;

-- El estimatorio solo opera con las reglas de los arts. 438 y 455 parametrizadas y aprobadas.
create or replace function public.fn_consignacion_estimatorio_habilitado(p_org integer)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce((select s.estimatorio_rules is not null and s.estimatorio_rules_approved_at is not null
                     from public.consignment_account_settings s where s.organization_id = p_org), false);
$function$;

-- Pendiente contable VISIBLE en la bandeja de siempre («Pendientes contables»). La llama la app cuando una RPC se
-- bloquea (el bloqueo revierte la RPC). Solo códigos conocidos; nada de texto libre del cliente.
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
                      'sin_cuenta_remuneracion', 'estimatorio_bloqueado_438_455', 'liquidacion_mandante_pendiente') then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  perform public.fn_log_journal_failure(
    p_organization_id, null, now(), 'consignment_config', left(coalesce(p_referencia, ''), 80),
    'consignacion_config:' || p_codigo, null, null, null, 'consignacion_config',
    'Consignaciones: ' || p_codigo);
end;
$function$;

-- INTERNA. Pendiente contable de un hecho que no se resuelve sin parametrizar o sin decisión del Contador.
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
-- 3. Condiciones del contrato validadas
-- ─────────────────────────────────────────────────────────────────────────────
-- p_terminos: { contrato, condicion, valoracion (recibida), precio_modo, remuneracion_modo, base_comision,
--               reconocimiento, factura_remuneracion, obligacion_dueno, riesgos: {devoluciones, perdidas, gastos},
--               vence, periodicidad }
-- IVA y retenciones NO van aquí: se determinan por ley con los hechos.

create or replace function public.fn_consignacion_terminos(p_terminos jsonb, p_direccion text)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
declare
  t jsonb := coalesce(p_terminos, '{}'::jsonb);
  v_contrato text := t->>'contrato';
  v_condicion text := t->>'condicion';
  v_riesgos jsonb := t->'riesgos';
  v_vence date;
  v_clave text;
begin
  if jsonb_typeof(t) <> 'object' then
    raise exception 'terminos_invalidos' using errcode = '22023';
  end if;
  if v_contrato is null then
    raise exception 'clasificacion_obligatoria' using errcode = '22023',
      hint = 'Elija la modalidad jurídica: intermediación (mandato), estimatorio o compra real.';
  end if;
  if v_contrato not in ('intermediacion', 'estimatorio', 'compra') then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'contrato';
  end if;
  if v_contrato = 'compra' then
    raise exception 'compra_real_usa_factura' using errcode = '22023',
      hint = 'La compra real exige una adquisición demostrada: regístrela con la factura de compra.';
  end if;
  if v_condicion is null or v_condicion not in ('agente', 'principal') then
    raise exception 'condicion_contable_obligatoria' using errcode = '22023';
  end if;
  if v_contrato = 'intermediacion' and v_condicion <> 'agente' then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'condicion';
  end if;
  if p_direccion = 'recibida' and coalesce(t->>'valoracion', '') not in ('costo_acreditado', 'valor_convenido') then
    raise exception 'valoracion_obligatoria' using errcode = '22023';
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
  if coalesce(t->>'reconocimiento', '') not in ('al_vender', 'obligacion_posterior') then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'reconocimiento';
  end if;
  -- Diferir la comisión exige documentar la obligación posterior REAL que condiciona su devengo.
  if t->>'reconocimiento' = 'obligacion_posterior' and length(btrim(coalesce(t->>'obligacion_posterior', ''))) not between 10 and 1000 then
    raise exception 'obligacion_posterior_obligatoria' using errcode = '22023',
      hint = 'Describa cuál obligación posterior al despacho condiciona que la comisión se gane.';
  end if;
  if jsonb_typeof(t->'factura_remuneracion') is distinct from 'boolean' then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'factura_remuneracion';
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
  begin
    v_vence := nullif(t->>'vence', '')::date;
  exception when others then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'vence';
  end;
  if coalesce(t->>'periodicidad', 'mensual') not in ('semanal', 'quincenal', 'mensual', 'al_vencimiento') then
    raise exception 'terminos_invalidos' using errcode = '22023', detail = 'periodicidad';
  end if;
  return jsonb_build_object(
    'contrato', v_contrato, 'condicion', v_condicion,
    'tributario', case when v_contrato = 'intermediacion' then 'mandato' else 'estimatorio_438_455' end,
    'valoracion', case when p_direccion = 'recibida' then t->>'valoracion' end,
    'precio_modo', t->>'precio_modo', 'remuneracion_modo', t->>'remuneracion_modo',
    'base_comision', coalesce(t->>'base_comision', 'precio_pactado'),
    'reconocimiento', t->>'reconocimiento',
    'obligacion_posterior', case when t->>'reconocimiento' = 'obligacion_posterior' then btrim(t->>'obligacion_posterior') end,
    'factura_remuneracion', (t->>'factura_remuneracion')::boolean,
    'obligacion_dueno', case when v_contrato = 'intermediacion' then t->>'obligacion_dueno' end,
    'riesgos', jsonb_build_object('devoluciones', v_riesgos->>'devoluciones', 'perdidas', v_riesgos->>'perdidas', 'gastos', v_riesgos->>'gastos'),
    -- En mandato factura el mandatario, por cuenta del mandante, diferenciando lo ajeno de lo propio.
    'facturacion', jsonb_build_object('factura', 'consignatario', 'por_cuenta_de', case when v_contrato = 'intermediacion' then 'consignante' else 'consignatario' end),
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
                  where a.note_id = p_nota and a.settlement_id is null and not a.absorbed and not a.owner_right)
      then 'por_liquidar'
    when coalesce((select sum(l.qty_delivered - l.qty_sold - l.qty_returned - l.qty_incident)
                     from public.consignment_note_lines l where l.note_id = p_nota), 0) <= 0
      then 'liquidada'
    else 'en_consignacion'
  end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ENTREGADA · entregar: traslado a «en poder de {consignatario}», sin cambio de cuenta ni asiento
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
  v_numero text;
  v_comision numeric := round(coalesce(p_comision, 0), 2);
  v_t jsonb;
  v_cliente text;
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
  if v_t->>'contrato' = 'estimatorio' and not public.fn_consignacion_estimatorio_habilitado(v_org) then
    raise exception 'estimatorio_bloqueado_438_455' using errcode = '22023',
      hint = 'El estimatorio no opera hasta parametrizar los arts. 438 y 455 con el Contador.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('consignacion_entregar:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_nota from public.consignment_notes
   where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_nota.customer_id is distinct from p_customer or v_nota.branch_id <> p_branch then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('nota_id', v_nota.id, 'numero', v_nota.number, 'repetida', true, 'costo', v_nota.total_cost);
  end if;

  select c.full_name into v_cliente from public.customers c where c.id = p_customer and c.organization_id = v_org;
  if not found then
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

  perform pg_advisory_xact_lock(hashtextextended('consignacion_numero:' || v_org, 0));
  select 'NCO-' || lpad((coalesce(max(nullif(regexp_replace(n.number, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 4, '0')
    into v_numero
    from public.consignment_notes n
   where n.organization_id = v_org and n.direction = 'entregada';

  insert into public.consignment_notes (
    organization_id, branch_id, direction, customer_id, number, location, legal_modality, accounting_role, tax_treatment,
    price_mode, remuneration_mode, commission_base, commission_pct, remuneration_recognition, post_sale_obligation, fee_invoice_required,
    owner_obligation_at, risk_terms, billing_terms, status, due_date, settlement_frequency, notes, idempotency_key, created_by
  ) values (
    v_org, p_branch, 'entregada', p_customer, v_numero,
    coalesce(nullif(btrim(coalesce(p_ubicacion, '')), ''), 'En poder de ' || coalesce(v_cliente, 'consignatario')),
    v_t->>'contrato', v_t->>'condicion', v_t->>'tributario', v_t->>'precio_modo', v_t->>'remuneracion_modo',
    v_t->>'base_comision', v_comision, v_t->>'reconocimiento', v_t->>'obligacion_posterior', (v_t->>'factura_remuneracion')::boolean,
    v_t->>'obligacion_dueno', v_t->'riesgos', v_t->'facturacion', 'en_consignacion', (v_t->>'vence')::date,
    v_t->>'periodicidad', nullif(btrim(coalesce(p_notas, '')), ''), p_clave_idempotencia, v_uid
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
      raise exception 'producto_ajeno' using errcode = '22023', detail = v_producto::text;
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

    -- Traslado a la ubicación «en poder de {consignatario}» (la nota): el kardex de la bodega baja, la cuenta de
    -- inventario NO cambia y no hay asiento. El costo queda identificado en la línea.
    v_mov := public.fn_inv_int_mover(v_org, p_branch, v_producto, null, 'out', v_qty, null,
                                     'transfer_out', 'consignacion:' || v_nota.id::text,
                                     v_nota.location || ' · ' || v_numero, v_uid, '{}'::jsonb);
    v_costo_linea := 0;
    for v_m in select e from jsonb_array_elements(coalesce(v_mov->'movimientos', '[]'::jsonb)) e loop
      v_costo_linea := v_costo_linea + coalesce((v_m->>'qty')::numeric, 0) * coalesce((v_m->>'unit_cost')::numeric, 0);
    end loop;

    insert into public.consignment_note_lines (organization_id, note_id, product_id, qty_delivered, unit_cost, agreed_price, settlement_price)
    values (v_org, v_nota.id, v_producto, v_qty, case when v_qty > 0 then round(v_costo_linea / v_qty, 4) else 0 end, v_precio, v_precio_liq);
    v_total := v_total + v_costo_linea;
    v_pactado := v_pactado + v_qty * coalesce(v_precio, 0);
  end loop;

  update public.consignment_notes
     set total_cost = round(v_total, 2), total_agreed = round(v_pactado, 2), updated_at = now()
   where id = v_nota.id;

  v_doc := public.fn_consignacion_compartir_interna(v_nota.id);

  return jsonb_build_object('nota_id', v_nota.id, 'numero', v_numero, 'repetida', false, 'costo', round(v_total, 2),
                            'ubicacion', v_nota.location, 'documento_compartido_id', v_doc);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ENTREGADA · liquidar y cerrar (estimatorio habilitado; el mandato del lado del dueño espera al Contador)
-- ─────────────────────────────────────────────────────────────────────────────
-- p_lineas: [{ "linea_id": uuid, "vendido": n, "precio": n, "devuelto": n }]. Lo vendido y lo devuelto vuelven de
-- la ubicación «en poder de» a la bodega (traslado, sin asiento); la factura de venta de siempre saca lo vendido
-- con su ingreso, IVA, costo y cartera. Solo hay factura al consignatario si hay una operación real (estimatorio).

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
  v_costo_dev numeric := 0;
  v_comision numeric;
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
  if v_nota.legal_modality = 'intermediacion' then
    raise exception 'liquidacion_mandante_pendiente' using errcode = '22023',
      hint = 'La liquidación del dueño en mandato espera el criterio del Contador; no se factura al intermediario sin operación real.';
  end if;
  if not public.fn_consignacion_estimatorio_habilitado(v_org) then
    raise exception 'estimatorio_bloqueado_438_455' using errcode = '22023';
  end if;
  if not public.app_branch_access(v_nota.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if exists (select 1 from public.consignment_settlements s where s.note_id = p_nota and s.status = 'por_facturar') then
    raise exception 'liquidacion_pendiente' using errcode = '22023';
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
    select * into v_linea from public.consignment_note_lines where id = v_linea_id and note_id = p_nota for update;
    if not found or v_vendido < 0 or v_devuelto < 0 or v_precio < 0 then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    continue when v_vendido = 0 and v_devuelto = 0;
    if v_vendido > 0 and v_precio <= 0 then
      raise exception 'precio_obligatorio' using errcode = '22023', detail = v_linea.id::text;
    end if;
    if v_vendido > 0 and v_linea.agreed_price is not null and v_nota.remuneration_mode = 'porcentaje'
       and v_precio + 0.005 < v_linea.agreed_price then
      raise exception 'precio_bajo_pactado' using errcode = '22023', detail = v_linea.id::text;
    end if;
    if v_linea.qty_sold + v_linea.qty_returned + v_vendido + v_devuelto > v_linea.qty_delivered then
      raise exception 'excede_en_su_poder' using errcode = '22023';
    end if;
    perform public.fn_inv_int_mover(v_org, v_nota.branch_id, v_linea.product_id, null, 'in', v_vendido + v_devuelto,
                                    v_linea.unit_cost, 'transfer_in', 'consignacion:' || p_nota::text,
                                    'Regreso de ' || coalesce(v_nota.location, 'consignación') || ' · ' || v_nota.number, v_uid, '{}'::jsonb);
    update public.consignment_note_lines
       set qty_sold = qty_sold + v_vendido, qty_returned = qty_returned + v_devuelto
     where id = v_linea.id;
    insert into public.consignment_settlement_lines (organization_id, settlement_id, line_id, product_id, qty_sold, unit_price, qty_returned, sale_amount, owner_amount)
    values (v_org, v_liq.id, v_linea.id, v_linea.product_id, v_vendido, v_precio, v_devuelto, round(v_vendido * v_precio, 2),
            round(v_vendido * v_linea.unit_cost, 2));
    v_venta := v_venta + v_vendido * v_precio;
    v_costo_dev := v_costo_dev + v_devuelto * v_linea.unit_cost;
    if v_vendido > 0 then
      v_lineas_venta := v_lineas_venta || jsonb_build_object('product_id', v_linea.product_id, 'qty', v_vendido, 'unit_price', v_precio);
    end if;
  end loop;

  v_venta := round(v_venta, 2);
  v_comision := round(v_venta * v_nota.commission_pct / 100, 2);
  update public.consignment_settlements
     set sale_total = v_venta, commission_amount = v_comision, net_amount = v_venta - v_comision,
         returned_cost = round(v_costo_dev, 2),
         status = case when v_venta = 0 then 'liquidada' else 'por_facturar' end,
         closed_at = case when v_venta = 0 then now() end,
         closed_by = case when v_venta = 0 then v_uid end
   where id = v_liq.id;
  update public.consignment_notes set status = public.fn_consignacion_estado(p_nota), updated_at = now() where id = p_nota;

  return jsonb_build_object(
    'liquidacion_id', v_liq.id, 'repetida', false,
    'estado', case when v_venta = 0 then 'liquidada' else 'por_facturar' end,
    'venta', v_venta, 'comision', v_comision, 'neto', v_venta - v_comision,
    'cliente_id', v_nota.customer_id, 'sucursal_id', v_nota.branch_id, 'numero_nota', v_nota.number,
    'lineas', v_lineas_venta);
end;
$function$;

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
      raise exception 'sin_cuenta_comisiones' using errcode = 'P0002';
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
    'comision', v_liq.commission_amount);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Productos de consignación: siempre aparte
-- ─────────────────────────────────────────────────────────────────────────────

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
    if v_cp.legal_modality <> p_contrato then
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
    insert into public.consignment_products (product_id, organization_id, supplier_id, legal_modality, created_by)
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
-- p_lineas: [{ product_id, qty, precio (del dueño, sin IVA), precio_liquidacion?, costo_acreditado?, ref?, ref_display? }]
-- p_terminos: fn_consignacion_terminos + { cuenta_recaudo } (auxiliar 281510 del propietario).

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
  v_costo_acr numeric;
  v_valor_unit numeric;
  v_total numeric := 0;
  v_custodia numeric := 0;
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
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 or jsonb_array_length(p_lineas) > 200 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;
  v_t := public.fn_consignacion_terminos(p_terminos, 'recibida');
  if v_t->>'remuneracion_modo' = 'precio_liquidacion' then
    v_comision := 0;
  end if;

  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create']);
  perform public.fn_inventario_exigir_permiso(p_org, array['recibir']);
  if v_t->>'contrato' = 'estimatorio' and not public.fn_consignacion_estimatorio_habilitado(p_org) then
    raise exception 'estimatorio_bloqueado_438_455' using errcode = '22023',
      hint = 'El estimatorio no opera hasta parametrizar los arts. 438 y 455 con el Contador.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('consignacion_recibir:' || p_org || ':' || p_clave_idempotencia, 0));
  select * into v_nota from public.consignment_notes where organization_id = p_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_nota.supplier_id is distinct from p_proveedor or v_nota.branch_id <> p_branch then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('nota_id', v_nota.id, 'numero', v_nota.number, 'repetida', true, 'custodia', v_nota.total_memo);
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

  v_cuentas := public.fn_consignacion_cuentas_recibida(p_org, p_proveedor, p_terminos->>'cuenta_recaudo');

  perform pg_advisory_xact_lock(hashtextextended('consignacion_numero_recibida:' || p_org, 0));
  select 'NCR-' || lpad((coalesce(max(nullif(regexp_replace(n.number, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 4, '0')
    into v_numero
    from public.consignment_notes n
   where n.organization_id = p_org and n.direction = 'recibida';

  insert into public.consignment_notes (
    organization_id, branch_id, direction, supplier_id, number, legal_modality, accounting_role, tax_treatment, memo_valuation,
    price_mode, remuneration_mode, commission_base, commission_pct, remuneration_recognition, post_sale_obligation, fee_invoice_required,
    owner_obligation_at, risk_terms, billing_terms, status, memo_account_code, memo_contra_account_code, owner_account_code,
    remuneration_account_code, due_date, settlement_frequency, link_id, shared_document_id, external_number, notes,
    idempotency_key, created_by
  ) values (
    p_org, p_branch, 'recibida', p_proveedor, v_numero, v_t->>'contrato', v_t->>'condicion', v_t->>'tributario', v_t->>'valoracion',
    v_t->>'precio_modo', v_t->>'remuneracion_modo', v_t->>'base_comision', v_comision, v_t->>'reconocimiento',
    v_t->>'obligacion_posterior', (v_t->>'factura_remuneracion')::boolean, v_t->>'obligacion_dueno', v_t->'riesgos', v_t->'facturacion', 'en_consignacion',
    v_cuentas->>'orden', v_cuentas->>'contra', v_cuentas->>'recaudo', v_cuentas->>'remuneracion', (v_t->>'vence')::date,
    v_t->>'periodicidad', p_link, p_documento, nullif(btrim(coalesce(p_numero_externo, '')), ''),
    nullif(btrim(coalesce(p_notas, '')), ''), p_clave_idempotencia, v_uid
  ) returning * into v_nota;

  for v_linea in select e from jsonb_array_elements(p_lineas) e loop
    begin
      v_producto := (v_linea->>'product_id')::integer;
      v_qty := round((v_linea->>'qty')::numeric, 3);
      v_precio := round((v_linea->>'precio')::numeric, 2);
      v_precio_liq := round(nullif(v_linea->>'precio_liquidacion', '')::numeric, 2);
      v_costo_acr := round(nullif(v_linea->>'costo_acreditado', '')::numeric, 2);
    exception when others then
      raise exception 'linea_invalida' using errcode = '22023';
    end;
    if v_producto is null or v_qty is null or v_qty <= 0 or v_precio is null or v_precio <= 0
       or coalesce(v_precio_liq, 0) < 0 or coalesce(v_costo_acr, 0) < 0 then
      raise exception 'linea_invalida' using errcode = '22023', detail = coalesce(v_producto::text, '');
    end if;
    if v_t->>'remuneracion_modo' = 'precio_liquidacion' and (v_precio_liq is null or v_precio_liq <= 0 or v_precio_liq > v_precio) then
      raise exception 'precio_liquidacion_obligatorio' using errcode = '22023', detail = v_producto::text;
    end if;
    if v_t->>'valoracion' = 'costo_acreditado' and (v_costo_acr is null or v_costo_acr <= 0) then
      raise exception 'costo_acreditado_obligatorio' using errcode = '22023', detail = v_producto::text;
    end if;
    -- Valor de custodia según la política del contrato; nunca se convierte en activo propio.
    v_valor_unit := case when v_t->>'valoracion' = 'costo_acreditado' then v_costo_acr else v_precio end;

    perform public.fn_consignacion_registrar_producto(p_org, v_producto, p_proveedor, v_t->>'contrato', v_cuentas->>'recaudo');
    perform public.fn_inv_int_mover(p_org, p_branch, v_producto, null, 'in', v_qty, 0,
                                    'transfer_in', 'consignacion:' || v_nota.id::text,
                                    'Consignación recibida ' || v_numero, v_uid, '{}'::jsonb);
    insert into public.consignment_note_lines (
      organization_id, note_id, product_id, qty_delivered, unit_cost, agreed_price, settlement_price, credited_cost,
      memo_unit_value, external_ref, external_display
    ) values (
      p_org, v_nota.id, v_producto, v_qty, 0, v_precio, v_precio_liq, v_costo_acr, v_valor_unit,
      nullif(left(coalesce(v_linea->>'ref', ''), 120), ''), case when jsonb_typeof(v_linea->'ref_display') = 'object' then v_linea->'ref_display' end
    );
    v_total := v_total + v_qty * v_precio;
    v_custodia := v_custodia + v_qty * v_valor_unit;
  end loop;

  update public.consignment_notes
     set total_agreed = round(v_total, 2), total_memo = round(v_custodia, 2), updated_at = now()
   where id = v_nota.id;

  v_entry := public.fn_create_journal_entry(
    p_organization_id := p_org, p_branch_id := p_branch, p_entry_date := now(),
    p_memo := 'Mercancía recibida en consignación - ' || v_numero, p_source := 'consignment_received',
    p_source_id := v_nota.id::text, p_debit_account := v_cuentas->>'contra', p_credit_account := v_cuentas->>'orden',
    p_amount := round(v_custodia, 2), p_created_by := v_uid, p_fact_key := 'consignment_received:' || v_nota.id::text);
  if v_entry is null then
    raise exception 'asiento_no_creado' using errcode = 'P0001',
      hint = 'Revise las cuentas de orden (911520 y la definida del grupo 94) y el periodo contable.';
  end if;

  return jsonb_build_object('nota_id', v_nota.id, 'numero', v_numero, 'repetida', false, 'pactado', round(v_total, 2),
                            'custodia', round(v_custodia, 2), 'asiento_id', v_entry, 'cuentas', v_cuentas);
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
-- 9. RECIBIDA · devolver al consignante y registrar faltantes o daños
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_custodia numeric := 0;
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
    continue when v_qty = 0;
    if v_linea.qty_sold + v_linea.qty_returned + v_linea.qty_incident + v_qty > v_linea.qty_delivered then
      raise exception 'excede_en_su_poder' using errcode = '22023';
    end if;
    perform public.fn_inv_int_mover(v_org, v_nota.branch_id, v_linea.product_id, null, 'out', v_qty, null,
                                    'transfer_out', 'consignacion:' || p_nota::text,
                                    'Devolución al consignante ' || v_nota.number, v_uid, '{}'::jsonb);
    update public.consignment_note_lines set qty_returned = qty_returned + v_qty where id = v_linea.id;
    v_total := v_total + v_qty * coalesce(v_linea.agreed_price, 0);
    v_custodia := v_custodia + v_qty * v_linea.memo_unit_value;
    v_detalle := v_detalle || jsonb_build_object('linea_id', v_linea.id, 'product_id', v_linea.product_id, 'qty', v_qty,
                                                 'precio', v_linea.agreed_price, 'ref', v_linea.external_ref);
  end loop;
  if jsonb_array_length(v_detalle) = 0 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;

  insert into public.consignment_returns (organization_id, note_id, lines, total_agreed, total_memo, notes, idempotency_key, created_by)
  values (v_org, p_nota, v_detalle, round(v_total, 2), round(v_custodia, 2), nullif(btrim(coalesce(p_notas, '')), ''), p_clave_idempotencia, v_uid)
  returning * into v_dev;

  if v_custodia > 0 then
    v_entry := public.fn_create_journal_entry(
      p_organization_id := v_org, p_branch_id := v_nota.branch_id, p_entry_date := now(),
      p_memo := 'Devolución de mercancía en consignación - ' || v_nota.number, p_source := 'consignment_return',
      p_source_id := v_dev.id::text, p_debit_account := v_nota.memo_account_code, p_credit_account := v_nota.memo_contra_account_code,
      p_amount := round(v_custodia, 2), p_created_by := v_uid, p_fact_key := 'consignment_return:' || v_dev.id::text);
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
  return jsonb_build_object('devolucion_id', v_dev.id, 'repetida', false, 'total', round(v_total, 2), 'asiento_id', v_entry, 'documento_compartido_id', v_doc);
end;
$function$;

-- Faltante o daño: se registran la evidencia, el responsable y la obligación. El control físico y las cuentas de orden
-- se ajustan (la mercancía ya no está en custodia); NO se genera gasto ni cuenta por pagar: queda un pendiente para que
-- el Contador acredite la pérdida y la obligación.
create or replace function public.fn_consignacion_registrar_novedad(
  p_nota uuid,
  p_linea uuid,
  p_tipo text,
  p_cantidad numeric,
  p_responsable text,
  p_evidencia text,
  p_obligacion text,
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
  v_linea public.consignment_note_lines%rowtype;
  v_nov public.consignment_incidents%rowtype;
  v_qty numeric := round(coalesce(p_cantidad, 0), 3);
  v_custodia numeric;
  v_entry integer;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if p_tipo not in ('faltante', 'dano') or p_responsable not in ('dueno', 'consignatario', 'tercero', 'por_determinar') or v_qty <= 0 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_evidencia, ''))) < 5 then
    raise exception 'evidencia_obligatoria' using errcode = '22023';
  end if;
  select * into v_nota from public.consignment_notes where id = p_nota and organization_id = v_org and direction = 'recibida';
  if not found then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  perform public.fn_inventario_exigir_permiso(v_org, array['ajustar']);
  perform pg_advisory_xact_lock(hashtextextended('consignacion_novedad:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_nov from public.consignment_incidents where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    return jsonb_build_object('novedad_id', v_nov.id, 'repetida', true);
  end if;
  select * into v_linea from public.consignment_note_lines where id = p_linea and note_id = p_nota for update;
  if not found then
    raise exception 'linea_invalida' using errcode = '22023';
  end if;
  if v_linea.qty_sold + v_linea.qty_returned + v_linea.qty_incident + v_qty > v_linea.qty_delivered then
    raise exception 'excede_en_su_poder' using errcode = '22023';
  end if;
  v_custodia := round(v_qty * v_linea.memo_unit_value, 2);
  perform public.fn_inv_int_mover(v_org, v_nota.branch_id, v_linea.product_id, null, 'out', v_qty, null,
                                  'transfer_out', 'consignacion:' || p_nota::text,
                                  'Novedad (' || p_tipo || ') de consignación ' || v_nota.number, v_uid, '{}'::jsonb);
  update public.consignment_note_lines set qty_incident = qty_incident + v_qty where id = v_linea.id;
  insert into public.consignment_incidents (organization_id, note_id, line_id, kind, qty, memo_amount, responsible, evidence, obligation, idempotency_key, created_by)
  values (v_org, p_nota, v_linea.id, p_tipo, v_qty, v_custodia, p_responsable, btrim(p_evidencia), nullif(btrim(coalesce(p_obligacion, '')), ''), p_clave_idempotencia, v_uid)
  returning * into v_nov;
  if v_custodia > 0 then
    v_entry := public.fn_create_journal_entry(
      p_organization_id := v_org, p_branch_id := v_nota.branch_id, p_entry_date := now(),
      p_memo := 'Salida de custodia por ' || p_tipo || ' - ' || v_nota.number, p_source := 'consignment_incident',
      p_source_id := v_nov.id::text, p_debit_account := v_nota.memo_account_code, p_credit_account := v_nota.memo_contra_account_code,
      p_amount := v_custodia, p_created_by := v_uid, p_fact_key := 'consignment_incident:' || v_nov.id::text);
    if v_entry is null then
      raise exception 'asiento_no_creado' using errcode = 'P0001';
    end if;
  end if;
  perform public.fn_consignacion_pendiente(v_org, v_nota.branch_id, 'consignacion_novedad', 'consignment_incident', v_nov.id::text,
    round(v_qty * coalesce(v_linea.agreed_price, 0), 2),
    'Novedad (' || p_tipo || ') en ' || v_nota.number || ': acreditar la pérdida, el responsable (' || p_responsable || ') y la obligación');
  update public.consignment_notes set status = public.fn_consignacion_estado(p_nota), updated_at = now() where id = p_nota;
  return jsonb_build_object('novedad_id', v_nov.id, 'repetida', false, 'custodia', v_custodia, 'asiento_id', v_entry);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RECIBIDA · venta por el POS o la factura de SIEMPRE (disparador sobre el kardex)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_consignacion_linea_venta(p_source text, p_source_id text, p_producto integer)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_desc numeric;
  v_neto numeric;
  v_bruto_neto numeric;
  v_qty numeric;
begin
  if p_source_id is null or p_source_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  v_id := p_source_id::uuid;
  if p_source in ('sale', 'mesa_sale') then
    select sum(coalesce(si.discount_amount, 0)),
           sum((si.unit_price * si.quantity - coalesce(si.discount_amount, 0))
               / case when coalesce(si.tax_included, false) then 1 + coalesce(si.tax_rate, 0) / 100 else 1 end),
           sum(case when coalesce(si.tax_included, false) then si.unit_price * si.quantity - coalesce(si.discount_amount, 0)
                    else (si.unit_price * si.quantity - coalesce(si.discount_amount, 0)) * (1 + coalesce(si.tax_rate, 0) / 100) end),
           sum(si.quantity)
      into v_desc, v_neto, v_bruto_neto, v_qty
      from public.sale_items si where si.sale_id = v_id and si.product_id = p_producto;
  elsif p_source = 'invoice_sale' then
    select sum(coalesce(ii.discount_amount, 0)),
           sum((ii.unit_price * ii.qty - coalesce(ii.discount_amount, 0))
               / case when coalesce(ii.tax_included, false) then 1 + coalesce(ii.tax_rate, 0) / 100 else 1 end),
           sum(case when coalesce(ii.tax_included, false) then ii.unit_price * ii.qty - coalesce(ii.discount_amount, 0)
                    else (ii.unit_price * ii.qty - coalesce(ii.discount_amount, 0)) * (1 + coalesce(ii.tax_rate, 0) / 100) end),
           sum(ii.qty)
      into v_desc, v_neto, v_bruto_neto, v_qty
      from public.invoice_items ii where ii.invoice_sales_id = v_id and ii.product_id = p_producto;
  end if;
  if coalesce(v_qty, 0) <= 0 then
    return null;
  end if;
  return jsonb_build_object('neto', round(v_neto / v_qty, 4), 'descuento', round(v_desc / v_qty, 4),
                            'iva', round(greatest(v_bruto_neto - v_neto, 0) / v_qty, 4));
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

-- Remuneración de una porción vendida según el contrato (la MISMA fórmula que la liquidación).
create or replace function public.fn_consignacion_remuneracion(
  p_modo text, p_base text, p_pct numeric, p_qty numeric, p_venta numeric, p_pactado numeric, p_precio_liq numeric
)
 returns numeric
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select round(p_venta - case
    when p_modo = 'precio_liquidacion' then p_qty * coalesce(p_precio_liq, 0)
    when p_base = 'precio_venta' then p_venta * (1 - p_pct / 100)
    else p_pactado * (1 - p_pct / 100)
  end, 2);
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
  v_custodia numeric;
  v_rem numeric;
  v_ingreso_pos text;
begin
  v_linea_venta := public.fn_consignacion_linea_venta(p_sm.source, p_sm.source_id, p_sm.product_id);
  for v_l in
    select l.id, l.note_id, l.agreed_price, l.settlement_price, l.memo_unit_value,
           l.qty_delivered - l.qty_sold - l.qty_returned - l.qty_incident as disponible,
           n.memo_account_code, n.memo_contra_account_code, n.owner_account_code, n.remuneration_account_code,
           n.legal_modality, n.owner_obligation_at, n.remuneration_mode, n.commission_base, n.commission_pct,
           n.remuneration_recognition, n.number, n.branch_id
      from public.consignment_note_lines l
      join public.consignment_notes n on n.id = l.note_id
     where l.product_id = p_sm.product_id and n.organization_id = p_sm.organization_id and n.direction = 'recibida'
       and n.branch_id = p_sm.branch_id and l.qty_delivered - l.qty_sold - l.qty_returned - l.qty_incident > 0
     order by n.delivered_at, n.number, l.id
     for update of l
  loop
    exit when v_resto <= 0;
    v_qty := least(v_resto, v_l.disponible);
    v_pactado := round(v_qty * coalesce(v_l.agreed_price, 0), 2);
    v_custodia := round(v_qty * v_l.memo_unit_value, 2);
    v_venta := round(v_qty * coalesce((v_linea_venta->>'neto')::numeric, v_l.agreed_price, 0), 2);
    -- La remuneración de la porción se calcula siempre; se RECONOCE al vender, o al cumplirse la obligación posterior.
    v_rem := public.fn_consignacion_remuneracion(v_l.remuneration_mode, v_l.commission_base, v_l.commission_pct,
                                                 v_qty, v_venta, v_pactado, v_l.settlement_price);
    insert into public.consignment_allocations (organization_id, note_id, line_id, product_id, stock_movement_id, kind, qty,
                                                sale_amount, discount_amount, tax_amount, agreed_amount, memo_amount,
                                                remuneration_amount, remuneration_recognized, source, source_id)
    values (p_sm.organization_id, v_l.note_id, v_l.id, p_sm.product_id, p_sm.id, 'venta', v_qty, v_venta,
            round(v_qty * coalesce((v_linea_venta->>'descuento')::numeric, 0), 2),
            round(v_qty * coalesce((v_linea_venta->>'iva')::numeric, 0), 2), v_pactado, v_custodia, greatest(v_rem, 0),
            v_l.remuneration_recognition = 'al_vender', p_sm.source, p_sm.source_id)
    on conflict (stock_movement_id, line_id, kind) do nothing
    returning * into v_asig;
    if v_asig.id is null then
      v_resto := v_resto - v_qty;
      continue;
    end if;
    update public.consignment_note_lines set qty_sold = qty_sold + v_qty where id = v_l.id;
    v_resto := v_resto - v_qty;

    -- Sale de custodia: D 911520 / C 94 por el valor de custodia.
    if v_custodia > 0 then
      perform public.fn_create_journal_entry(
        p_organization_id := p_sm.organization_id, p_branch_id := v_l.branch_id, p_entry_date := coalesce(p_sm.created_at, now()),
        p_memo := 'Venta de mercancía en consignación - ' || v_l.number, p_source := 'consignment_sale',
        p_source_id := v_asig.id::text, p_debit_account := v_l.memo_account_code, p_credit_account := v_l.memo_contra_account_code,
        p_amount := v_custodia, p_created_by := p_sm.created_by, p_fact_key := 'consignment_sale_memo:' || v_asig.id::text);
    end if;
    -- Recaudo del dueño en el POS: del ingreso de la regla del POS al auxiliar 281510 (la factura ya lo llevó allí).
    if v_l.legal_modality = 'intermediacion' and p_sm.source <> 'invoice_sale' and v_venta > 0 then
      v_ingreso_pos := coalesce(v_ingreso_pos, public.fn_consignacion_cuenta_ingreso_pos(p_sm.organization_id, p_sm.branch_id));
      perform public.fn_create_journal_entry(
        p_organization_id := p_sm.organization_id, p_branch_id := v_l.branch_id, p_entry_date := coalesce(p_sm.created_at, now()),
        p_memo := 'Recaudo para el dueño de la mercancía en consignación - ' || v_l.number, p_source := 'consignment_sale',
        p_source_id := v_asig.id::text, p_debit_account := v_ingreso_pos, p_credit_account := v_l.owner_account_code,
        p_amount := v_venta, p_created_by := p_sm.created_by, p_fact_key := 'consignment_sale_owner:' || v_asig.id::text);
    end if;
    -- Remuneración devengada al vender: D auxiliar 281510 / C auxiliar 413512. Con obligación posterior, espera a cumplirse.
    if v_l.remuneration_recognition = 'obligacion_posterior' and v_rem > 0 then
      perform public.fn_consignacion_pendiente(p_sm.organization_id, v_l.branch_id, 'consignacion_remuneracion_por_devengar',
        'consignment_note', v_l.note_id::text, null,
        'Nota ' || v_l.number || ': la remuneración se reconoce al cumplirse la obligación posterior del contrato, con evidencia');
    end if;
    if v_l.remuneration_recognition = 'al_vender' and v_rem > 0 then
      perform public.fn_create_journal_entry(
        p_organization_id := p_sm.organization_id, p_branch_id := v_l.branch_id, p_entry_date := coalesce(p_sm.created_at, now()),
        p_memo := 'Remuneración devengada por venta en consignación - ' || v_l.number, p_source := 'consignment_sale',
        p_source_id := v_asig.id::text, p_debit_account := v_l.owner_account_code, p_credit_account := v_l.remuneration_account_code,
        p_amount := v_rem, p_created_by := p_sm.created_by, p_fact_key := 'consignment_sale_rem:' || v_asig.id::text);
    elsif v_rem < 0 then
      perform public.fn_consignacion_pendiente(p_sm.organization_id, p_sm.branch_id, 'consignacion_venta_bajo_precio',
        'consignment_sale', v_asig.id::text, -v_rem, 'Venta de mercancía en consignación por debajo del precio del dueño');
    end if;
    if v_l.legal_modality = 'intermediacion' and v_l.owner_obligation_at = 'cobro' and p_sm.source = 'invoice_sale'
       and not public.fn_consignacion_venta_cobrada(p_sm.source, p_sm.source_id) then
      perform public.fn_consignacion_pendiente(p_sm.organization_id, p_sm.branch_id, 'consignacion_obligacion_al_cobro',
        'consignment_sale', v_asig.id::text, v_venta,
        'Venta a crédito con obligación al cobro: el recaudo se registró al facturar');
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
      'consignment_sale', p_sm.id::text, v_resto, 'Venta de un producto de consignación sin nota recibida abierta que la cubra');
  end if;
end;
$function$;

-- Devolución de una venta. Primero lo no liquidado. Si ya se liquidó: derecho frente al dueño (owner_right; solo se
-- descuenta con acuerdo), salvo que el contrato ponga las devoluciones a cargo del consignatario (absorbed). La
-- remuneración devengada de esa porción se reversa. En todos los casos ya liquidados, pendiente visible.
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
  v_custodia numeric;
  v_rem numeric;
  v_absorbe boolean;
  v_derecho boolean;
begin
  for v_a in
    select a.*, n.memo_account_code, n.memo_contra_account_code, n.owner_account_code, n.remuneration_account_code,
           n.legal_modality, n.number, n.branch_id as nota_sucursal, n.risk_terms->>'devoluciones' as asume,
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
    v_custodia := round(v_a.memo_amount * v_qty / v_a.qty, 2);
    v_rem := round(v_a.remuneration_amount * v_qty / v_a.qty, 2);
    v_absorbe := v_a.settlement_id is not null and v_a.asume = 'consignatario';
    v_derecho := v_a.settlement_id is not null and not v_absorbe;
    insert into public.consignment_allocations (organization_id, note_id, line_id, product_id, stock_movement_id, kind, qty,
                                                sale_amount, discount_amount, tax_amount, agreed_amount, memo_amount,
                                                remuneration_amount, remuneration_recognized, source, source_id, reverses_id,
                                                settlement_id, owner_right, absorbed)
    values (p_sm.organization_id, v_a.note_id, v_a.line_id, p_sm.product_id, p_sm.id, 'reverso', v_qty,
            round(v_a.sale_amount * v_qty / v_a.qty, 2), round(v_a.discount_amount * v_qty / v_a.qty, 2),
            round(v_a.tax_amount * v_qty / v_a.qty, 2), round(v_a.agreed_amount * v_qty / v_a.qty, 2), v_custodia, v_rem,
            v_a.remuneration_recognized, p_sm.source, p_sm.source_id, v_a.id, case when v_absorbe then v_a.settlement_id end,
            v_derecho, v_absorbe)
    on conflict (stock_movement_id, line_id, kind) do nothing
    returning * into v_rev;
    v_resto := v_resto - v_qty;
    continue when v_rev.id is null;
    update public.consignment_note_lines set qty_sold = qty_sold - v_qty where id = v_a.line_id;
    if v_custodia > 0 then
      perform public.fn_create_journal_entry(
        p_organization_id := p_sm.organization_id, p_branch_id := v_a.nota_sucursal, p_entry_date := coalesce(p_sm.created_at, now()),
        p_memo := 'Regreso a custodia por devolución de venta - ' || v_a.number, p_source := 'consignment_sale',
        p_source_id := v_rev.id::text, p_debit_account := v_a.memo_contra_account_code, p_credit_account := v_a.memo_account_code,
        p_amount := v_custodia, p_created_by := p_sm.created_by, p_fact_key := 'consignment_sale_memo:' || v_rev.id::text);
    end if;
    -- Solo se reversa la remuneración que ya se reconoció; la no reconocida se compensa al reconocerla.
    if v_rem > 0 and not v_absorbe and v_a.remuneration_recognized then
      perform public.fn_create_journal_entry(
        p_organization_id := p_sm.organization_id, p_branch_id := v_a.nota_sucursal, p_entry_date := coalesce(p_sm.created_at, now()),
        p_memo := 'Reverso de la remuneración por devolución - ' || v_a.number, p_source := 'consignment_sale',
        p_source_id := v_rev.id::text, p_debit_account := v_a.remuneration_account_code, p_credit_account := v_a.owner_account_code,
        p_amount := v_rem, p_created_by := p_sm.created_by, p_fact_key := 'consignment_sale_rem:' || v_rev.id::text);
    end if;
    if v_derecho then
      perform public.fn_consignacion_pendiente(p_sm.organization_id, p_sm.branch_id, 'consignacion_derecho_frente_al_dueno',
        'consignment_sale', v_rev.id::text, v_rev.sale_amount,
        'Devolución de una venta ya liquidada: derecho frente al dueño. Se descuenta en la próxima liquidación solo con acuerdo; si no habrá otra, cobrarlo');
    elsif v_absorbe then
      perform public.fn_consignacion_pendiente(p_sm.organization_id, p_sm.branch_id, 'consignacion_devolucion_asumida',
        'consignment_sale', v_rev.id::text, v_rev.sale_amount,
        'Devolución de una venta ya liquidada que asume el consignatario según el contrato');
    end if;
    if v_a.legal_modality = 'intermediacion' and p_sm.source = 'return' then
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
-- 11. RECIBIDA · liquidar al consignante, anular y cruzar anticipos
-- ─────────────────────────────────────────────────────────────────────────────
-- Toma lo vendido y no liquidado hasta la fecha (neto de reversos no liquidados). Los derechos frente al dueño
-- (devoluciones de lo ya liquidado) solo se descuentan con p_descontar_derechos y el acuerdo escrito.

create or replace function public.fn_consignacion_recibida_liquidar(
  p_nota uuid,
  p_hasta date,
  p_descontar_derechos boolean,
  p_acuerdo text,
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
  v_derechos numeric := 0;
  v_valor numeric;
  v_remuneracion numeric;
  v_hechos jsonb;
  v_entry integer;
  v_doc uuid;
  v_retenciones jsonb;
  v_por_devengar numeric;
  v_acuerdo text := nullif(left(btrim(coalesce(p_acuerdo, '')), 1000), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if coalesce(p_descontar_derechos, false) and (v_acuerdo is null or length(v_acuerdo) < 5) then
    raise exception 'acuerdo_obligatorio' using errcode = '22023',
      hint = 'Descontar un derecho frente al dueño exige registrar el acuerdo.';
  end if;
  select * into v_nota from public.consignment_notes where id = p_nota and organization_id = v_org and direction = 'recibida';
  if not found then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  if not public.app_branch_access(v_nota.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_nota.legal_modality <> 'intermediacion' and not public.fn_consignacion_estimatorio_habilitado(v_org) then
    raise exception 'estimatorio_bloqueado_438_455' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('consignacion_liquidar:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_liq from public.consignment_settlements where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_liq.note_id <> p_nota then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', true, 'estado', v_liq.status, 'venta', v_liq.sale_total,
      'remuneracion', v_liq.commission_amount, 'dueno', v_liq.owner_amount, 'por_pagar', v_liq.payable_amount);
  end if;
  perform 1 from public.consignment_notes where id = p_nota for update;

  select coalesce(nullif(o.timezone, ''), 'America/Bogota') into v_tz from public.organizations o where o.id = v_org;
  v_hasta := coalesce(p_hasta, public.fn_today_for(v_org, v_nota.branch_id));

  insert into public.consignment_settlements (organization_id, note_id, direction, period_to, commission_pct, status, idempotency_key, created_by)
  values (v_org, p_nota, 'recibida', v_hasta, v_nota.commission_pct, 'liquidada', p_clave_idempotencia, v_uid)
  returning * into v_liq;

  for v_r in
    select l.id as linea_id, l.product_id, l.settlement_price,
           sum(case when a.kind = 'venta' then a.qty else -a.qty end) as qty,
           sum(case when a.kind = 'venta' then a.sale_amount else -a.sale_amount end) as venta,
           sum(case when a.kind = 'venta' then a.discount_amount else -a.discount_amount end) as descuento,
           sum(case when a.kind = 'venta' then a.tax_amount else -a.tax_amount end) as iva,
           sum(case when a.kind = 'venta' then a.agreed_amount else -a.agreed_amount end) as pactado,
           sum(case when a.owner_right then a.sale_amount else 0 end) as derechos,
           min(timezone(v_tz, a.created_at)::date) as desde,
           array_agg(a.id) as ids
      from public.consignment_allocations a
      join public.consignment_note_lines l on l.id = a.line_id
     where a.note_id = p_nota and a.settlement_id is null and not a.absorbed
       and (not a.owner_right or coalesce(p_descontar_derechos, false))
       and timezone(v_tz, a.created_at)::date <= v_hasta
       and (v_nota.owner_obligation_at is distinct from 'cobro' or a.kind = 'reverso'
            or public.fn_consignacion_venta_cobrada(a.source, a.source_id))
     group by l.id, l.product_id, l.settlement_price
  loop
    update public.consignment_allocations set settlement_id = v_liq.id where id = any (v_r.ids);
    continue when v_r.qty = 0;
    v_desde := least(coalesce(v_desde, v_r.desde), v_r.desde);
    v_valor := round(v_r.venta - public.fn_consignacion_remuneracion(v_nota.remuneration_mode, v_nota.commission_base,
                                   v_nota.commission_pct, v_r.qty, v_r.venta, v_r.pactado, v_r.settlement_price), 2);
    if v_r.qty > 0 and v_r.venta + 1 < v_valor then
      raise exception 'venta_bajo_precio_pactado' using errcode = '22023', detail = v_r.linea_id::text;
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
    v_derechos := v_derechos + v_r.derechos;
  end loop;

  v_venta := round(v_venta, 2);
  v_pactado := round(v_pactado, 2);
  v_dueno := round(v_dueno, 2);
  if v_dueno = 0 then
    raise exception 'sin_ventas_por_liquidar' using errcode = '22023';
  end if;
  if v_dueno < 0 then
    raise exception 'saldo_a_favor_del_consignatario' using errcode = '22023',
      hint = 'Los derechos frente al dueño superan lo vendido: se cobran al dueño, no se descuentan.';
  end if;
  v_remuneracion := round(v_venta - v_dueno, 2);

  select jsonb_build_object(
    'concepto', 'consignacion_' || v_nota.legal_modality, 'condicion', v_nota.accounting_role, 'tributario', v_nota.tax_treatment,
    'factura', v_nota.billing_terms->>'factura', 'por_cuenta_de', v_nota.billing_terms->>'por_cuenta_de',
    'fecha', v_hasta, 'municipio', (select b.municipality_id from public.branches b where b.id = v_nota.branch_id),
    -- En mandato las retenciones atienden la calidad del MANDANTE.
    'mandante', (select jsonb_build_object('tipo', s.supplier_type, 'regimen', s.tax_regime,
                                           'responsabilidades', to_jsonb(s.fiscal_responsibilities), 'municipio', s.municipality_code)
                   from public.suppliers s where s.id = v_nota.supplier_id),
    'mandatario', (select jsonb_build_object('responsabilidades', to_jsonb(o.fiscal_responsibilities), 'municipio', o.municipality_id)
                     from public.organizations o where o.id = v_org),
    'iva_cobrado', round(v_iva, 2), 'factura_remuneracion', v_nota.fee_invoice_required,
    'reconocimiento', v_nota.remuneration_recognition, 'obligacion_posterior', v_nota.post_sale_obligation)
    into v_hechos;

  -- La liquidación NO reconoce la remuneración: ya se devengó al vender o espera su obligación posterior.
  select coalesce(sum(case when a.kind = 'venta' then a.remuneration_amount else -a.remuneration_amount end), 0)
    into v_por_devengar
    from public.consignment_allocations a
   where a.settlement_id = v_liq.id and not a.absorbed and not a.remuneration_recognized;

  update public.consignment_settlements
     set period_from = v_desde, sale_total = v_venta, agreed_total = v_pactado, owner_amount = v_dueno,
         discount_total = round(v_desc, 2), tax_total = round(v_iva, 2), commission_amount = v_remuneracion,
         net_amount = v_dueno, rights_discounted = round(v_derechos, 2),
         rights_agreement = case when v_derechos <> 0 then v_acuerdo end,
         payable_amount = v_dueno, tax_facts = v_hechos, closed_at = now(), closed_by = v_uid
   where id = v_liq.id
   returning * into v_liq;

  -- Retenciones: (a) de la operación y (b) de la remuneración, por separado, con las reglas configuradas.
  v_retenciones := public.fn_consignacion_retenciones_liquidacion(v_liq.id);
  update public.consignment_settlements set tax_facts = tax_facts || jsonb_build_object('retenciones', v_retenciones) where id = v_liq.id;
  if v_nota.fee_invoice_required then
    perform public.fn_consignacion_pendiente(v_org, v_nota.branch_id, 'consignacion_factura_remuneracion',
      'consignment_owner_settlement', v_liq.id::text, v_remuneracion,
      'Liquidación ' || v_nota.number || ': la remuneración es un servicio independiente con obligación de facturar; la liquidación no sustituye la factura (su IVA aparte, sin duplicarlo)');
  end if;

  if v_nota.link_id is not null and v_nota.shared_document_id is not null
     and exists (select 1 from public.organization_links l where l.id = v_nota.link_id and l.status = 'activo') then
    v_doc := public.fn_documento_compartido_publicar(
      v_nota.link_id, v_org, 'consignacion_liquidacion', v_liq.id::text,
      jsonb_build_object(
        'nota_origen', (select d.source_id from public.organization_shared_documents d where d.id = v_nota.shared_document_id),
        'nota_externa', v_nota.external_number, 'nota', v_nota.number, 'desde', v_desde, 'hasta', v_hasta,
        'contrato', v_nota.legal_modality, 'remuneracion_modo', v_nota.remuneration_mode,
        'base_comision', v_nota.commission_base, 'comision_pct', v_nota.commission_pct,
        'venta', v_venta, 'descuentos', round(v_desc, 2), 'iva', round(v_iva, 2), 'remuneracion', v_remuneracion,
        'dueno', v_dueno, 'derechos_descontados', round(v_derechos, 2), 'acuerdo', case when v_derechos <> 0 then v_acuerdo end,
        'retenciones', v_retenciones,
        'lineas', (select coalesce(jsonb_agg(jsonb_build_object('ref', l.external_ref, 'vendido', sl.qty_sold,
                                                                 'precio', sl.unit_price, 'venta', sl.sale_amount, 'dueno', sl.owner_amount)), '[]'::jsonb)
                     from public.consignment_settlement_lines sl join public.consignment_note_lines l on l.id = sl.line_id
                    where sl.settlement_id = v_liq.id)));
    update public.consignment_settlements set shared_document_id = v_doc where id = v_liq.id;
  end if;

  update public.consignment_notes set status = public.fn_consignacion_estado(p_nota), updated_at = now() where id = p_nota;

  return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', false, 'estado', 'liquidada', 'contrato', v_nota.legal_modality,
    'venta', v_venta, 'pactado', v_pactado, 'descuentos', round(v_desc, 2), 'iva', round(v_iva, 2),
    'remuneracion', v_remuneracion, 'reconocimiento', v_nota.remuneration_recognition, 'dueno', v_dueno,
    'derechos_descontados', round(v_derechos, 2), 'por_pagar', v_dueno, 'factura_remuneracion', v_nota.fee_invoice_required,
    'remuneracion_por_devengar', round(v_por_devengar, 2), 'retenciones', v_retenciones,
    'cuenta_recaudo', v_nota.owner_account_code, 'documento_compartido_id', v_doc);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11b. Retenciones de la liquidación: (a) operación y (b) remuneración, por separado (Ronda 3 del Contador)
-- ─────────────────────────────────────────────────────────────────────────────

-- ¿Tiene el tercero la responsabilidad del RUT? Acepta «O-13», «13», «O-07», «7».
create or replace function public.fn_consignacion_tiene_resp(p_resp text[], p_codigo text)
 returns boolean
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (select 1 from unnest(coalesce(p_resp, '{}'::text[])) r
                  where regexp_replace(upper(btrim(r)), '^O-?0*', '') = p_codigo);
$function$;

-- INTERNA. La regla configurada (organization_taxes, kind withholding; la misma que usa compras) sobre una base: su
-- tarifa y su base mínima en UVT. Sin regla, sin tarifa o sin UVT: pendiente. Nunca 0 ni tarifa fija.
create or replace function public.fn_consignacion_aplicar_regla(p_org integer, p_regla uuid, p_clase text, p_base numeric, p_fecha date)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_tarifa numeric;
  v_min_uvt numeric;
  v_activa boolean;
  v_clase text;
  v_uvt numeric;
begin
  if p_regla is null then
    return jsonb_build_object('status', 'pendiente', 'reason', 'sin_regla_configurada');
  end if;
  select ot.id, ot.rate, ot.min_base_uvt, coalesce(ot.is_active, false), public.fn_clase_retencion(tt.code, ot.name)
    into v_id, v_tarifa, v_min_uvt, v_activa, v_clase
    from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
   where ot.id = p_regla and ot.organization_id = p_org and ot.kind = 'withholding';
  if v_id is null or not v_activa or v_clase is distinct from p_clase or coalesce(v_tarifa, 0) <= 0 then
    return jsonb_build_object('status', 'pendiente', 'reason', 'regla_no_vigente');
  end if;
  if v_min_uvt is not null then
    select u.value into v_uvt from public.fiscal_uvt u
     where u.country_code = (select coalesce(nullif(btrim(o.country_code), ''), 'COL') from public.organizations o where o.id = p_org)
       and u.year = extract(year from p_fecha)::integer;
    if v_uvt is null then
      return jsonb_build_object('status', 'pendiente', 'reason', 'sin_uvt', 'organization_tax_id', v_id, 'rate', v_tarifa);
    end if;
    if p_base < round(v_min_uvt * v_uvt, 0) then
      return jsonb_build_object('status', 'no_aplica', 'reason', 'bajo_base_minima', 'organization_tax_id', v_id, 'rate', v_tarifa);
    end if;
  end if;
  return jsonb_build_object('status', 'determinada', 'reason', null, 'organization_tax_id', v_id, 'rate', v_tarifa,
                            'amount', round(p_base * v_tarifa / 100, 0));
end;
$function$;

-- INTERNA. Guarda una fila de retención y su pendiente: «pendiente» (falta regla, calidad, UVT o norma) o «por
-- conciliar» (determinada: se concilia con el certificado). Devuelve la fila para la liquidación.
create or replace function public.fn_consignacion_retencion_registrar(
  p_liq public.consignment_settlements, p_branch integer, p_numero text, p_scope text, p_class text, p_payer text,
  p_group text, p_base numeric, p_res jsonb, p_qualities jsonb
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fila public.consignment_settlement_withholdings%rowtype;
  v_status text := p_res->>'status';
begin
  insert into public.consignment_settlement_withholdings (organization_id, settlement_id, scope, class, payer, payer_group, base,
                                                          organization_tax_id, rate, amount, status, reason, qualities)
  values (p_liq.organization_id, p_liq.id, p_scope, p_class, p_payer, p_group, round(p_base, 2),
          nullif(p_res->>'organization_tax_id', '')::uuid, nullif(p_res->>'rate', '')::numeric,
          case when v_status = 'determinada' then (p_res->>'amount')::numeric end, v_status, p_res->>'reason', coalesce(p_qualities, '{}'::jsonb))
  returning * into v_fila;
  if v_status in ('pendiente', 'determinada') then
    perform public.fn_consignacion_pendiente(p_liq.organization_id, p_branch,
      case when v_status = 'pendiente' then 'consignacion_retencion_pendiente' else 'consignacion_retencion_por_conciliar' end,
      'consignment_owner_settlement', p_liq.id::text || ':' || v_fila.id::text, coalesce(v_fila.amount, v_fila.base),
      'Liquidación ' || p_numero || ': ' || p_class || ' de la ' || case when p_scope = 'operacion' then 'operación' else 'remuneración' end
        || ' (' || p_group || ')' || case when v_status = 'pendiente' then ' pendiente: ' || coalesce(v_fila.reason, '') else ' por conciliar con el certificado' end);
  end if;
  return jsonb_build_object('id', v_fila.id, 'ambito', v_fila.scope, 'clase', v_fila.class, 'pagador', v_fila.payer,
                            'grupo', v_fila.payer_group, 'base', v_fila.base, 'tarifa', v_fila.rate, 'valor', v_fila.amount,
                            'estado', v_fila.status, 'motivo', v_fila.reason);
end;
$function$;

-- INTERNA. Resuelve las retenciones de una liquidación recibida en mandato.
--   (a) OPERACIÓN: la practica el comprador agente (RUT 07 o 13 en renta; 09 o 13 en IVA) sobre la venta, con la
--       calidad del MANDANTE (autorretenedor 15 o SIMPLE 47: no aplica en renta; no responsable 49: no aplica en IVA).
--   (b) REMUNERACIÓN: la practica el dueño (pagador) agente sobre la comisión, con la calidad del INTERMEDIARIO
--       (perfil tributario vigente de la organización).
--   ReteICA: sin regla municipal configurada, o sin confirmar la calidad de agente municipal, queda pendiente.
create or replace function public.fn_consignacion_retenciones_liquidacion(p_liq uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_liq public.consignment_settlements%rowtype;
  v_nota public.consignment_notes%rowtype;
  v_reglas jsonb;
  v_mandante text[];
  v_perfil uuid;
  v_org_resp text[];
  v_fecha date;
  v_clase text;
  v_g record;
  v_res jsonb;
  v_regla uuid;
  v_q jsonb;
  v_filas jsonb := '[]'::jsonb;
begin
  select * into v_liq from public.consignment_settlements where id = p_liq;
  select * into v_nota from public.consignment_notes where id = v_liq.note_id;
  v_fecha := coalesce(v_liq.period_to, public.fn_today_for(v_liq.organization_id, v_nota.branch_id));
  select s.withholding_rules into v_reglas from public.consignment_account_settings s where s.organization_id = v_liq.organization_id;
  v_reglas := coalesce(v_reglas, '{}'::jsonb);
  select s.fiscal_responsibilities into v_mandante from public.suppliers s where s.id = v_nota.supplier_id;
  select p.id, p.responsabilidades into v_perfil, v_org_resp
    from public.organization_tax_profiles p
   where p.organization_id = v_liq.organization_id and p.vigente_desde <= v_fecha and (p.vigente_hasta is null or p.vigente_hasta >= v_fecha)
   order by p.vigente_desde desc limit 1;
  v_q := jsonb_build_object('mandante', to_jsonb(coalesce(v_mandante, '{}'::text[])), 'intermediario', to_jsonb(coalesce(v_org_resp, '{}'::text[])),
                            'perfil_intermediario', v_perfil is not null, 'fecha', v_fecha);

  -- (a) Operación, por clase y grupo de compradores.
  foreach v_clase in array array['retefuente', 'reteiva', 'reteica'] loop
    v_regla := nullif(v_reglas->'operacion'->>v_clase, '')::uuid;
    for v_g in
      with a as (
        select case when x.kind = 'venta' then 1 else -1 end as signo, x.sale_amount, x.tax_amount,
               case when x.source = 'invoice_sale' then (select i.customer_id from public.invoice_sales i where i.id::text = x.source_id)
                    when x.source in ('sale', 'mesa_sale') then (select sa.customer_id from public.sales sa where sa.id::text = x.source_id)
               end as cliente
          from public.consignment_allocations x
         where x.settlement_id = p_liq and not x.absorbed
      ), b as (
        select case
                 when a.cliente is null then 'consumidor_final'
                 when coalesce(cardinality(c.fiscal_responsibilities), 0) = 0 then 'sin_datos'
                 when v_clase = 'reteiva' and (public.fn_consignacion_tiene_resp(c.fiscal_responsibilities, '9')
                                                or public.fn_consignacion_tiene_resp(c.fiscal_responsibilities, '13')) then 'agente'
                 when v_clase <> 'reteiva' and (public.fn_consignacion_tiene_resp(c.fiscal_responsibilities, '7')
                                                 or public.fn_consignacion_tiene_resp(c.fiscal_responsibilities, '13')) then 'agente'
                 else 'no_agente'
               end as grupo,
               case when v_clase = 'reteiva' then a.signo * a.tax_amount else a.signo * a.sale_amount end as base
          from a left join public.customers c on c.id = a.cliente
      )
      select b.grupo, round(sum(b.base), 2) as base from b group by b.grupo order by b.grupo
    loop
      v_res := case
        when v_g.base <= 0 then jsonb_build_object('status', 'no_aplica', 'reason', case when v_clase = 'reteiva' then 'operacion_sin_iva' else 'sin_base' end)
        when v_g.grupo = 'consumidor_final' then jsonb_build_object('status', 'no_aplica', 'reason', 'venta_a_consumidor_final')
        when v_g.grupo = 'no_agente' then jsonb_build_object('status', 'no_aplica', 'reason', 'comprador_no_agente_retencion')
        when v_g.grupo = 'sin_datos' then jsonb_build_object('status', 'pendiente', 'reason', 'calidad_comprador_sin_datos')
        when coalesce(cardinality(v_mandante), 0) = 0 then jsonb_build_object('status', 'pendiente', 'reason', 'calidad_mandante_sin_datos')
        when v_clase = 'retefuente' and public.fn_consignacion_tiene_resp(v_mandante, '15') then jsonb_build_object('status', 'no_aplica', 'reason', 'mandante_autorretenedor')
        when v_clase = 'retefuente' and public.fn_consignacion_tiene_resp(v_mandante, '47') then jsonb_build_object('status', 'no_aplica', 'reason', 'mandante_simple')
        when v_clase = 'reteiva' and public.fn_consignacion_tiene_resp(v_mandante, '49') then jsonb_build_object('status', 'no_aplica', 'reason', 'mandante_no_responsable_iva')
        when v_clase = 'reteiva' and not public.fn_consignacion_tiene_resp(v_mandante, '48') then jsonb_build_object('status', 'pendiente', 'reason', 'calidad_iva_mandante_sin_datos')
        when v_clase = 'reteica' and v_regla is null then jsonb_build_object('status', 'pendiente', 'reason', 'norma_municipal_sin_confirmar')
        when v_clase = 'reteica' then jsonb_build_object('status', 'pendiente', 'reason', 'calidad_agente_reteica_por_confirmar', 'organization_tax_id', v_regla)
        else public.fn_consignacion_aplicar_regla(v_liq.organization_id, v_regla, v_clase, v_g.base, v_fecha)
      end;
      v_filas := v_filas || public.fn_consignacion_retencion_registrar(v_liq, v_nota.branch_id, v_nota.number, 'operacion', v_clase,
                                                                       'comprador', v_g.grupo, v_g.base, v_res, v_q);
    end loop;
  end loop;

  -- (b) Remuneración del intermediario, practicada por el dueño.
  foreach v_clase in array array['retefuente', 'reteiva', 'reteica'] loop
    v_regla := nullif(v_reglas->'remuneracion'->>v_clase, '')::uuid;
    v_res := case
      when coalesce(v_liq.commission_amount, 0) <= 0 then jsonb_build_object('status', 'no_aplica', 'reason', 'sin_remuneracion')
      when v_perfil is null then jsonb_build_object('status', 'pendiente', 'reason', 'sin_perfil_tributario')
      when v_clase = 'reteiva' and public.fn_consignacion_tiene_resp(v_org_resp, '49') then jsonb_build_object('status', 'no_aplica', 'reason', 'intermediario_no_responsable_iva')
      when v_clase = 'reteiva' then jsonb_build_object('status', 'pendiente', 'reason', 'iva_de_la_remuneracion_por_determinar')
      when coalesce(cardinality(v_mandante), 0) = 0 then jsonb_build_object('status', 'pendiente', 'reason', 'calidad_pagador_sin_datos')
      when v_clase = 'reteica' and v_regla is null then jsonb_build_object('status', 'pendiente', 'reason', 'norma_municipal_sin_confirmar')
      when v_clase = 'reteica' then jsonb_build_object('status', 'pendiente', 'reason', 'calidad_agente_reteica_por_confirmar', 'organization_tax_id', v_regla)
      when not (public.fn_consignacion_tiene_resp(v_mandante, '7') or public.fn_consignacion_tiene_resp(v_mandante, '13'))
        then jsonb_build_object('status', 'no_aplica', 'reason', 'pagador_no_agente_retencion')
      when public.fn_consignacion_tiene_resp(v_org_resp, '15') then jsonb_build_object('status', 'no_aplica', 'reason', 'intermediario_autorretenedor')
      when public.fn_consignacion_tiene_resp(v_org_resp, '47') then jsonb_build_object('status', 'no_aplica', 'reason', 'intermediario_simple')
      else public.fn_consignacion_aplicar_regla(v_liq.organization_id, v_regla, v_clase, v_liq.commission_amount, v_fecha)
    end;
    v_filas := v_filas || public.fn_consignacion_retencion_registrar(v_liq, v_nota.branch_id, v_nota.number, 'remuneracion', v_clase,
                                                                     'dueno', 'dueno', case when v_clase = 'reteiva' then null else v_liq.commission_amount end,
                                                                     v_res, v_q);
  end loop;
  return v_filas;
end;
$function$;

-- Conciliar una retención (pendiente o determinada) con su soporte: el certificado del agente. Se registra el valor
-- REAL que consta en el soporte (puede ser cero si el soporte lo dice; nunca se presume) y se cierra su pendiente.
create or replace function public.fn_consignacion_conciliar_retencion(
  p_retencion uuid,
  p_valor numeric,
  p_soporte text,
  p_organization_id integer
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_r public.consignment_settlement_withholdings%rowtype;
  v_soporte text := nullif(left(btrim(coalesce(p_soporte, '')), 1000), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_valor is null or p_valor < 0 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  if v_soporte is null or length(v_soporte) < 5 then
    raise exception 'soporte_obligatorio' using errcode = '22023';
  end if;
  select * into v_r from public.consignment_settlement_withholdings where id = p_retencion and organization_id = p_organization_id for update;
  if not found then
    raise exception 'retencion_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.create']);
  if exists (select 1 from public.consignment_settlements s where s.id = v_r.settlement_id and s.status = 'anulada') then
    raise exception 'liquidacion_anulada' using errcode = '22023';
  end if;
  if v_r.reconciled_at is not null then
    return jsonb_build_object('retencion_id', v_r.id, 'repetida', true, 'valor', v_r.reconciled_amount);
  end if;
  update public.consignment_settlement_withholdings
     set reconciled_amount = round(p_valor, 2), reconciled_support = v_soporte, reconciled_at = now(), reconciled_by = v_uid
   where id = v_r.id;
  update public.journal_entry_failures
     set resolved_at = now(), resolution = 'retencion_conciliada'
   where organization_id = p_organization_id and source = 'consignment_owner_settlement'
     and source_id = v_r.settlement_id::text || ':' || v_r.id::text and resolved_at is null;
  return jsonb_build_object('retencion_id', v_r.id, 'repetida', false, 'valor', round(p_valor, 2));
end;
$function$;

-- Elegir la regla de retención configurada que aplica a cada ámbito y clase. Solo reglas de la organización, de
-- retención, activas y de la clase pedida.
create or replace function public.fn_consignacion_configurar_retenciones(p_organization_id integer, p_reglas jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ambito text;
  v_clase text;
  v_id uuid;
  v_limpio jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['finance.create']);
  if p_reglas is null or jsonb_typeof(p_reglas) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  foreach v_ambito in array array['operacion', 'remuneracion'] loop
    v_limpio := v_limpio || jsonb_build_object(v_ambito, '{}'::jsonb);
    foreach v_clase in array array['retefuente', 'reteiva', 'reteica'] loop
      continue when nullif(p_reglas->v_ambito->>v_clase, '') is null;
      begin
        v_id := (p_reglas->v_ambito->>v_clase)::uuid;
      exception when others then
        raise exception 'regla_retencion_invalida' using errcode = '22023', detail = v_ambito || '.' || v_clase;
      end;
      if not exists (select 1 from public.organization_taxes ot left join public.tax_templates tt on tt.id = ot.template_id
                      where ot.id = v_id and ot.organization_id = p_organization_id and ot.kind = 'withholding'
                        and coalesce(ot.is_active, false) and public.fn_clase_retencion(tt.code, ot.name) = v_clase) then
        raise exception 'regla_retencion_invalida' using errcode = '22023', detail = v_ambito || '.' || v_clase;
      end if;
      v_limpio := jsonb_set(v_limpio, array[v_ambito, v_clase], to_jsonb(v_id::text));
    end loop;
  end loop;
  insert into public.consignment_account_settings (organization_id, withholding_rules, updated_by)
  values (p_organization_id, v_limpio, v_uid)
  on conflict (organization_id) do update set withholding_rules = excluded.withholding_rules, updated_by = v_uid, updated_at = now();
  return v_limpio;
end;
$function$;

-- Reconocer la remuneración al cumplirse la obligación posterior que el contrato documenta (Ronda 3, punto 1), con su
-- evidencia: D auxiliar 281510 del dueño / C auxiliar 413512, por lo vendido y aún no reconocido (neto de devoluciones).
create or replace function public.fn_consignacion_reconocer_remuneracion(
  p_nota uuid,
  p_evidencia text,
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
  v_rec public.consignment_remuneration_recognitions%rowtype;
  v_monto numeric;
  v_ids uuid[];
  v_entry integer;
  v_evidencia text := nullif(left(btrim(coalesce(p_evidencia, '')), 2000), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_evidencia is null or length(v_evidencia) < 10 then
    raise exception 'evidencia_obligatoria' using errcode = '22023';
  end if;
  select * into v_nota from public.consignment_notes where id = p_nota and organization_id = v_org and direction = 'recibida';
  if not found then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  if not public.app_branch_access(v_nota.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_nota.remuneration_recognition <> 'obligacion_posterior' then
    raise exception 'reconocimiento_no_aplica' using errcode = '22023',
      hint = 'Esta nota reconoce la remuneración al vender cada unidad.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('consignacion_reconocer:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_rec from public.consignment_remuneration_recognitions where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    return jsonb_build_object('reconocimiento_id', v_rec.id, 'repetida', true, 'monto', v_rec.amount);
  end if;
  perform 1 from public.consignment_notes where id = p_nota for update;
  select coalesce(sum(case when a.kind = 'venta' then a.remuneration_amount else -a.remuneration_amount end), 0), array_agg(a.id)
    into v_monto, v_ids
    from public.consignment_allocations a
   where a.note_id = p_nota and a.line_id is not null and not a.absorbed and not a.remuneration_recognized;
  v_monto := round(v_monto, 2);
  if v_monto <= 0 then
    raise exception 'sin_remuneracion_por_devengar' using errcode = '22023';
  end if;
  insert into public.consignment_remuneration_recognitions (organization_id, note_id, amount, evidence, idempotency_key, created_by)
  values (v_org, p_nota, v_monto, v_evidencia, p_clave_idempotencia, v_uid)
  returning * into v_rec;
  v_entry := public.fn_create_journal_entry(
    p_organization_id := v_org, p_branch_id := v_nota.branch_id, p_entry_date := now(),
    p_memo := 'Remuneración devengada al cumplir la obligación posterior - ' || v_nota.number, p_source := 'consignment_remuneration',
    p_source_id := v_rec.id::text, p_debit_account := v_nota.owner_account_code, p_credit_account := v_nota.remuneration_account_code,
    p_amount := v_monto, p_created_by := v_uid, p_fact_key := 'consignment_remuneration:' || v_rec.id::text);
  if v_entry is null then
    raise exception 'asiento_no_creado' using errcode = 'P0001';
  end if;
  update public.consignment_remuneration_recognitions set journal_entry_id = v_entry where id = v_rec.id;
  update public.consignment_allocations set remuneration_recognized = true where id = any (v_ids);
  update public.journal_entry_failures
     set resolved_at = now(), resolution = 'remuneracion_reconocida'
   where organization_id = v_org and reason = 'consignacion_remuneracion_por_devengar' and source_id = p_nota::text and resolved_at is null;
  return jsonb_build_object('reconocimiento_id', v_rec.id, 'repetida', false, 'monto', v_monto, 'asiento_id', v_entry);
end;
$function$;

-- Anular la ÚLTIMA liquidación de una nota: lo vendido vuelve a quedar por liquidar, los derechos descontados vuelven a
-- quedar pendientes y se cierran los pendientes de la liquidación (sus retenciones incluidas). La liquidación no registra
-- asientos de remuneración (se devenga al vender o al cumplirse la obligación posterior), así que no hay contra-asiento.
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
              where s.note_id = v_liq.note_id and s.status <> 'anulada' and s.seq > v_liq.seq) then
    raise exception 'liquidacion_no_es_la_ultima' using errcode = '22023';
  end if;
  if v_liq.shared_document_id is not null and exists (
       select 1 from public.organization_shared_documents d where d.id = v_liq.shared_document_id and d.status = 'aceptado') then
    raise exception 'liquidacion_aceptada_por_el_dueno' using errcode = '22023';
  end if;
  -- Las devoluciones posteriores de lo que esta liquidación tomó dejan de ser «derecho frente al dueño» o «asumidas»:
  -- la venta vuelve a estar por liquidar y su devolución se compensa en la siguiente, como cualquier otra.
  update public.consignment_allocations r
     set owner_right = false, absorbed = false, settlement_id = case when r.absorbed then null else r.settlement_id end
   where r.kind = 'reverso' and (r.owner_right or r.absorbed)
     and r.reverses_id in (select a.id from public.consignment_allocations a where a.settlement_id = v_liq.id and a.kind = 'venta');
  update public.consignment_allocations set settlement_id = null where settlement_id = v_liq.id and not absorbed;
  update public.consignment_settlements set status = 'anulada', void_reason = v_motivo, closed_at = now(), closed_by = v_uid where id = v_liq.id;
  -- Sus pendientes (retenciones, factura de la remuneración) ya no aplican: se cierran con la anulación.
  update public.journal_entry_failures
     set resolved_at = now(), resolution = 'liquidacion_anulada'
   where organization_id = v_org and source = 'consignment_owner_settlement'
     and (source_id = v_liq.id::text or source_id like v_liq.id::text || ':%') and resolved_at is null;
  if v_liq.shared_document_id is not null then
    update public.organization_shared_documents
       set status = 'anulado', reply_reason = v_motivo, decided_at = now(), decided_by = v_uid
     where id = v_liq.shared_document_id and status = 'enviado';
  end if;
  update public.consignment_notes set status = public.fn_consignacion_estado(v_nota.id), updated_at = now() where id = v_nota.id;
  return jsonb_build_object('liquidacion_id', v_liq.id, 'repetida', false, 'estado', 'anulada', 'asiento_id', v_entry);
end;
$function$;

-- Anticipo al consignante (el de anticipos a proveedores, supplier_advances) cruzado con la obligación REAL del mandato:
-- el saldo acreedor del auxiliar 281510 del dueño. D auxiliar 281510 / C cuenta del anticipo. Sin compra ni documento
-- soporte fabricados.
create or replace function public.fn_consignacion_cruzar_anticipo(
  p_nota uuid,
  p_anticipo uuid,
  p_monto numeric,
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
  v_ant public.supplier_advances%rowtype;
  v_cruce public.consignment_advance_crossings%rowtype;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_obligacion numeric;
  v_entry integer;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_monto <= 0 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  select * into v_nota from public.consignment_notes
   where id = p_nota and organization_id = v_org and direction = 'recibida' and legal_modality = 'intermediacion';
  if not found then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  perform pg_advisory_xact_lock(hashtextextended('consignacion_cruce:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_cruce from public.consignment_advance_crossings where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    return jsonb_build_object('cruce_id', v_cruce.id, 'repetida', true, 'monto', v_cruce.amount);
  end if;
  select * into v_ant from public.supplier_advances where id = p_anticipo and organization_id = v_org for update;
  if not found or v_ant.supplier_id <> v_nota.supplier_id then
    raise exception 'anticipo_no_encontrado' using errcode = 'P0002';
  end if;
  if v_ant.status <> 'active' or v_ant.balance < v_monto then
    raise exception 'anticipo_sin_saldo' using errcode = '22023';
  end if;
  -- La obligación real con el dueño: el saldo acreedor de su auxiliar 281510.
  select coalesce(sum(l.credit - l.debit), 0) into v_obligacion
    from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
   where e.organization_id = v_org and l.account_code = v_nota.owner_account_code;
  if v_obligacion < v_monto then
    raise exception 'excede_obligacion_con_el_dueno' using errcode = '22023', detail = v_obligacion::text;
  end if;
  insert into public.consignment_advance_crossings (organization_id, note_id, advance_id, amount, idempotency_key, created_by)
  values (v_org, p_nota, p_anticipo, v_monto, p_clave_idempotencia, v_uid)
  returning * into v_cruce;
  v_entry := public.fn_create_journal_entry(
    p_organization_id := v_org, p_branch_id := v_nota.branch_id, p_entry_date := now(),
    p_memo := 'Anticipo al consignante cruzado con la obligación del mandato - ' || v_nota.number,
    p_source := 'consignment_advance_crossing', p_source_id := v_cruce.id::text,
    p_debit_account := v_nota.owner_account_code, p_credit_account := v_ant.account_code,
    p_amount := v_monto, p_created_by := v_uid, p_fact_key := 'consignment_advance_crossing:' || v_cruce.id::text);
  if v_entry is null then
    raise exception 'asiento_no_creado' using errcode = 'P0001';
  end if;
  update public.consignment_advance_crossings set journal_entry_id = v_entry where id = v_cruce.id;
  update public.supplier_advances
     set balance = balance - v_monto,
         status = case when balance - v_monto <= 0 then 'used' else status end,
         updated_at = now()
   where id = v_ant.id;
  return jsonb_build_object('cruce_id', v_cruce.id, 'repetida', false, 'monto', v_monto, 'asiento_id', v_entry,
                            'saldo_anticipo', v_ant.balance - v_monto);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Entre organizaciones
-- ─────────────────────────────────────────────────────────────────────────────

-- INTERNA. Publica una nota entregada si el consignatario es un tercero vinculado. Copia solo lo de «Qué se comparte».
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
        'contrato', v_nota.legal_modality, 'condicion', v_nota.accounting_role, 'precio_modo', v_nota.price_mode,
        'remuneracion_modo', v_nota.remuneration_mode, 'base_comision', v_nota.commission_base, 'comision', v_nota.commission_pct,
        'reconocimiento', v_nota.remuneration_recognition, 'obligacion_posterior', v_nota.post_sale_obligation,
        'factura_remuneracion', v_nota.fee_invoice_required,
        'obligacion_dueno', v_nota.owner_obligation_at, 'riesgos', v_nota.risk_terms,
        'vence', v_nota.due_date, 'periodicidad', v_nota.settlement_frequency),
      'lineas', (select coalesce(jsonb_agg(jsonb_build_object(
                          'ref', l.id, 'producto_ref', p.uuid, 'nombre', p.name,
                          'referencia', coalesce(nullif(p.reference, ''), p.sku), 'cantidad', l.qty_delivered,
                          'precio', l.agreed_price, 'precio_liquidacion', l.settlement_price,
                          -- El costo acreditado es el costo del dueño a la fecha de la nota (para la custodia del receptor).
                          'costo_acreditado', l.unit_cost) order by p.name), '[]'::jsonb)
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

-- El consignatario acepta una nota que le llegó (R2). La modalidad y las condiciones son las de la copia; la valoración
-- de la custodia es política del receptor (p_valoracion). Crea SU nota recibida con SUS funciones.
create or replace function public.fn_consignacion_recibida_aceptar(
  p_documento uuid,
  p_branch integer,
  p_mapeo jsonb,
  p_cuenta_recaudo text,
  p_valoracion text,
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
    raise exception 'vinculo_sin_proveedor' using errcode = '22023';
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
    v_lineas := v_lineas || jsonb_build_object(
      'product_id', v_producto, 'qty', (v_l->>'cantidad')::numeric,
      'precio', coalesce(nullif(v_l->>'precio', '')::numeric,
                         (select nullif(m->>'precio', '')::numeric from jsonb_array_elements(p_mapeo) m
                           where m->>'producto_ref' = v_l->>'producto_ref' limit 1)),
      'precio_liquidacion', v_l->'precio_liquidacion', 'costo_acreditado', v_l->'costo_acreditado', 'ref', v_l->>'ref',
      'ref_display', jsonb_build_object('nombre', v_l->>'nombre', 'referencia', v_l->>'referencia'));
  end loop;
  v_terminos := (v_doc.payload->'terminos') - 'comision'
                || jsonb_build_object('cuenta_recaudo', p_cuenta_recaudo, 'valoracion', p_valoracion);
  v_res := public.fn_consignacion_recibir_interna(
    v_org, v_parte.supplier_id, p_branch, v_lineas, (v_doc.payload->'terminos'->>'comision')::numeric, v_terminos,
    p_clave_idempotencia, null, v_doc.link_id, v_doc.id, v_doc.payload->>'numero');
  perform public.fn_documento_compartido_aceptado(v_doc.id, v_org, v_res->>'nota_id');
  return v_res;
end;
$function$;

-- El consignante recibe la liquidación (o devolución) del consignatario (R8): la valida contra SU nota y devuelve las
-- líneas para su flujo de siempre. En mandato ese flujo espera al Contador; en estimatorio, a los arts. 438 y 455.
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
  if v_nota.legal_modality = 'intermediacion' then
    v_diferencias := v_diferencias || jsonb_build_object('tipo', 'mandante_pendiente');
  elsif not public.fn_consignacion_estimatorio_habilitado(v_org) then
    v_diferencias := v_diferencias || jsonb_build_object('tipo', 'estimatorio_bloqueado');
  end if;
  return jsonb_build_object('documento_id', v_doc.id, 'estado', v_doc.status, 'tipo', v_doc.kind, 'nota_id', v_nota.id,
    'numero_nota', v_nota.number, 'comision_pct', v_nota.commission_pct, 'contrato', v_nota.legal_modality,
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

revoke all on function public.fn_consignacion_cuenta_patron(integer, text) from public, anon, authenticated;
revoke all on function public.fn_consignacion_cuenta_valida(integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_consignacion_configurar_cuentas(integer, text, text, text) from public, anon;
revoke all on function public.fn_consignacion_cuentas_recibida(integer, integer, text) from public, anon;
revoke all on function public.fn_consignacion_estimatorio_habilitado(integer) from public, anon;
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
revoke all on function public.fn_consignacion_registrar_novedad(uuid, uuid, text, numeric, text, text, text, text, integer) from public, anon;
revoke all on function public.fn_consignacion_linea_venta(text, text, integer) from public, anon, authenticated;
revoke all on function public.fn_consignacion_venta_cobrada(text, text) from public, anon, authenticated;
revoke all on function public.fn_consignacion_cuenta_ingreso_pos(integer, integer) from public, anon, authenticated;
revoke all on function public.fn_consignacion_remuneracion(text, text, numeric, numeric, numeric, numeric, numeric) from public, anon;
revoke all on function public.fn_consignacion_asignar_venta(public.stock_movements) from public, anon, authenticated;
revoke all on function public.fn_consignacion_revertir_venta(public.stock_movements) from public, anon, authenticated;
revoke all on function public.fn_trg_consignacion_venta() from public, anon, authenticated;
revoke all on function public.fn_consignacion_recibida_liquidar(uuid, date, boolean, text, text, integer) from public, anon;
revoke all on function public.fn_consignacion_recibida_anular_liquidacion(uuid, text, integer) from public, anon;
revoke all on function public.fn_consignacion_cruzar_anticipo(uuid, uuid, numeric, text, integer) from public, anon;
revoke all on function public.fn_consignacion_tiene_resp(text[], text) from public, anon, authenticated;
revoke all on function public.fn_consignacion_aplicar_regla(integer, uuid, text, numeric, date) from public, anon, authenticated;
revoke all on function public.fn_consignacion_retencion_registrar(public.consignment_settlements, integer, text, text, text, text, text, numeric, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fn_consignacion_retenciones_liquidacion(uuid) from public, anon, authenticated;
revoke all on function public.fn_consignacion_conciliar_retencion(uuid, numeric, text, integer) from public, anon;
revoke all on function public.fn_consignacion_configurar_retenciones(integer, jsonb) from public, anon;
revoke all on function public.fn_consignacion_reconocer_remuneracion(uuid, text, text, integer) from public, anon;
revoke all on function public.fn_consignacion_compartir_interna(uuid) from public, anon, authenticated;
revoke all on function public.fn_consignacion_compartir(uuid, integer) from public, anon;
revoke all on function public.fn_consignacion_recibida_aceptar(uuid, integer, jsonb, text, text, text, integer) from public, anon;
revoke all on function public.fn_consignacion_documento_recibido_preparar(uuid, integer) from public, anon;
revoke all on function public.fn_consignacion_documento_recibido_cerrar(uuid, uuid, integer) from public, anon;

grant execute on function public.fn_consignacion_configurar_cuentas(integer, text, text, text) to authenticated;
grant execute on function public.fn_consignacion_cuentas_recibida(integer, integer, text) to authenticated;
grant execute on function public.fn_consignacion_estimatorio_habilitado(integer) to authenticated;
grant execute on function public.fn_consignacion_registrar_pendiente(integer, text, text) to authenticated;
grant execute on function public.fn_consignacion_terminos(jsonb, text) to authenticated;
grant execute on function public.fn_consignacion_remuneracion(text, text, numeric, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.fn_consignacion_entregar(uuid, integer, jsonb, numeric, jsonb, text, integer, text, text) to authenticated;
grant execute on function public.fn_consignacion_liquidar(uuid, jsonb, text, integer, date, date) to authenticated;
grant execute on function public.fn_consignacion_cerrar(uuid, uuid, text, integer) to authenticated;
grant execute on function public.fn_consignacion_recibir(integer, integer, jsonb, numeric, jsonb, text, integer, text) to authenticated;
grant execute on function public.fn_consignacion_recibida_devolver(uuid, jsonb, text, integer, text) to authenticated;
grant execute on function public.fn_consignacion_registrar_novedad(uuid, uuid, text, numeric, text, text, text, text, integer) to authenticated;
grant execute on function public.fn_consignacion_recibida_liquidar(uuid, date, boolean, text, text, integer) to authenticated;
grant execute on function public.fn_consignacion_recibida_anular_liquidacion(uuid, text, integer) to authenticated;
grant execute on function public.fn_consignacion_cruzar_anticipo(uuid, uuid, numeric, text, integer) to authenticated;
grant execute on function public.fn_consignacion_conciliar_retencion(uuid, numeric, text, integer) to authenticated;
grant execute on function public.fn_consignacion_configurar_retenciones(integer, jsonb) to authenticated;
grant execute on function public.fn_consignacion_reconocer_remuneracion(uuid, text, text, integer) to authenticated;
grant execute on function public.fn_consignacion_compartir(uuid, integer) to authenticated;
grant execute on function public.fn_consignacion_recibida_aceptar(uuid, integer, jsonb, text, text, text, integer) to authenticated;
grant execute on function public.fn_consignacion_documento_recibido_preparar(uuid, integer) to authenticated;
grant execute on function public.fn_consignacion_documento_recibido_cerrar(uuid, uuid, integer) to authenticated;
