/**
 * Manifiesto de replicación para la lectura offline genérica del Desktop
 * (fase 4C). Describe, tabla por tabla, QUÉ se replica al IndexedDB local
 * (`offlineDb.ts`), CON QUÉ ámbito, ventana y tope, y qué relaciones (FK)
 * conoce el resolutor PostgREST local (`postgrestLocal.ts`) para resolver
 * embeds como `customers(name)` o `sale_items(*, products(name))`.
 *
 * Todas las columnas, claves primarias y nombres de FK se verificaron por
 * MCP (`information_schema`) el 2026-09-16. Recordatorio de las trampas de
 * CLAUDE.md: `products` NO tiene `price`/`cost`/`is_active`; los precios y
 * costos viven en `product_prices`/`product_costs` con vigencia;
 * `customers.full_name/doc_type/doc_number` son generadas (se leen, nunca se
 * escriben); `stock_levels.branch_id` es NOT NULL y no tiene
 * `organization_id` (se llega por `branches`). `warehouses` NO existe.
 *
 * Ámbito (`scope`):
 *  - `org`: `organization_id = <org de la sesión>`.
 *  - `self`: la propia organización (`id = <org>`), solo `organizations`.
 *  - `global`: catálogos sin organización (monedas, unidades, roles, ...).
 *  - `parent`: la tabla no tiene `organization_id`; se filtra por la
 *    organización del padre con `padre!inner(organization_id)` y
 *    `padre.organization_id=eq.<org>` en la misma consulta PostgREST. Si hay
 *    varios padres (p. ej. `invoice_items` cuelga de facturas de venta y de
 *    compra) se hace una pasada por cada uno y se unen.
 *
 * A toda fila local se le añade `organization_id` (si la tabla no lo tiene)
 * para indexar por organización; el resolutor lo retira de la salida cuando
 * la tabla real no lo tiene.
 *
 * Ventana (`window`): tablas transaccionales, últimos `months` meses por la
 * columna indicada. Tope (`maxRows`): corte duro por tabla; con ventana se
 * ordena por la columna de la ventana descendente para conservar lo más
 * reciente. Incremental (`incremental`): columna monótona (`updated_at` o
 * `created_at`) por la que se piden solo cambios desde la última pasada;
 * una pasada completa (con poda) cada `FULL_REFRESH_INTERVAL_MS`.
 *
 * Presupuesto: ≤ 150 MB. Con ~0,3 KB por fila en IndexedDB (JSON medido con
 * fixtures) la suma de topes (≈ 450 000 filas, `totalMaxRows()`) queda en
 * ≈ 135 MB solo en el caso improbable de que TODAS las tablas toquen su tope;
 * la organización más grande del sistema hoy suma ≈ 100 000 filas (≈ 30 MB).
 */

export type ScopeSpec =
  | { kind: 'org' }
  | { kind: 'self' }
  | { kind: 'global' }
  | { kind: 'parent'; parents: Array<{ embed: string; column?: string }> };

export interface ForeignKeySpec {
  /** Columna de ESTA tabla. */
  column: string;
  /** Tabla referenciada (debe estar en el manifiesto para poder embeber). */
  table: string;
  /** Columna referenciada (por defecto `id`). */
  refColumn?: string;
  /** Nombre real de la constraint (para hints `tabla!nombre_fk`). */
  name: string;
}

export interface TableManifest {
  /** Nombre de la tabla en PostgREST (también el nombre del store local). */
  table: string;
  /** Clave primaria (una o varias columnas). */
  pk: string | string[];
  /** Columnas replicadas (verificadas por MCP). `*` del cliente se expande a esta lista. */
  columns: string[];
  /** true si la tabla real tiene `organization_id` (si no, se añade solo localmente). */
  hasOrganizationId: boolean;
  scope: ScopeSpec;
  /** Filtros PostgREST adicionales al replicar (`col: 'op.valor'`). */
  extraFilters?: Record<string, string>;
  /** Ventana temporal (solo transaccionales). */
  window?: { column: string; months: number };
  /** Tope de filas por organización. */
  maxRows: number;
  /** Columna monótona para pedir solo cambios (`updated_at > cursor`). */
  incremental?: string;
  /** Columnas con índice local (además de `organization_id` y la PK). */
  indexes: string[];
  /** FKs directas (muchos-a-uno). Las inversas se derivan de ellas. */
  fks: ForeignKeySpec[];
  /** Grupo funcional para la pantalla «Datos sin conexión». */
  group: 'inventario' | 'ventas' | 'compras' | 'finanzas' | 'clientes' | 'organizacion' | 'catalogos';
  /** Etiqueta para la UI. */
  label: string;
}

/** Meses de ventana para las tablas transaccionales. */
export const WINDOW_MONTHS = 12;
/**
 * Pasada completa (con poda) como máximo cada 2 h; entre medias, incremental.
 * `updated_at` lo mantiene la aplicación, no un trigger (verificado por MCP:
 * ninguna de estas tablas tiene trigger `set_updated_at`), así que una
 * escritura que no lo toque se recoge en la siguiente pasada completa.
 */
export const FULL_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;

const W = { column: 'created_at', months: WINDOW_MONTHS } as const;

const PRODUCT_COLUMNS = [
  'id', 'organization_id', 'sku', 'name', 'category_id', 'unit_code', 'created_at', 'updated_at', 'description', 'barcode', 'status', 'tag_id',
  'parent_product_id', 'tax_id', 'is_parent', 'variant_data', 'uuid', 'station', 'track_stock', 'is_composite', 'production_type', 'product_type',
  'brand', 'reference', 'track_serial', 'serial_pattern', 'auto_generate_serial', 'warranty_months', 'rating_avg', 'reviews_count', 'weight_kg',
  'length_cm', 'width_cm', 'height_cm',
];

const CUSTOMER_COLUMNS = [
  'id', 'organization_id', 'branch_id', 'email', 'phone', 'first_name', 'last_name', 'identification_type', 'identification_number', 'address', 'city',
  'notes', 'is_registered', 'user_id', 'metadata', 'created_at', 'updated_at', 'doc_type', 'doc_number', 'roles', 'tags', 'preferences', 'avatar_url',
  'is_online', 'last_seen_at', 'dv', 'company_name', 'trade_name', 'legal_organization_id', 'tribute_id', 'fiscal_municipality_id',
  'fiscal_responsibilities', 'customer_type', 'parent_customer_id', 'full_name', 'health_score', 'health_score_updated_at', 'company_size',
  'branches_count', 'current_software', 'lifecycle_stage', 'vertical_id', 'timezone', 'do_not_call',
];

const SUPPLIER_COLUMNS = [
  'id', 'organization_id', 'name', 'nit', 'contact', 'phone', 'email', 'notes', 'created_at', 'updated_at', 'uuid', 'icon', 'color', 'logo_url',
  'description', 'address', 'city', 'state', 'country', 'postal_code', 'tax_id', 'tax_regime', 'fiscal_responsibilities', 'payment_terms',
  'credit_days', 'website', 'is_active', 'rating', 'bank_name', 'bank_account', 'account_type', 'supplier_type', 'parent_supplier_id', 'doc_type',
  'dv', 'municipality_code', 'identification_document_code', 'country_code', 'legal_organization_code', 'trade_name',
];

const SALES_COLUMNS = [
  'id', 'organization_id', 'branch_id', 'customer_id', 'user_id', 'total', 'balance', 'status', 'sale_date', 'notes', 'created_at', 'updated_at',
  'payment_status', 'tax_total', 'subtotal', 'discount_total', 'reservation_id', 'tax_included', 'tax_breakdown', 'salesperson_id',
  'commission_rate', 'commission_type', 'tip_amount', 'tip_server_id', 'driver_id', 'table_session_id', 'delivery_fee', 'opportunity_id', 'source',
  'include_in_cash_register',
];

/** Sin `qr_image` (base64 grande, solo lo usa la representación gráfica de la factura electrónica). */
const INVOICE_SALES_COLUMNS = [
  'id', 'organization_id', 'branch_id', 'customer_id', 'sale_id', 'number', 'issue_date', 'due_date', 'currency', 'subtotal', 'tax_total', 'total',
  'balance', 'status', 'xml_uuid', 'created_by', 'created_at', 'updated_at', 'notes', 'payment_method', 'tax_included', 'payment_terms',
  'description', 'related_invoice_id', 'document_type', 'reference_code', 'operation_type', 'payment_form', 'payment_method_code', 'send_email',
  'validated_at', 'allowance_charges', 'billing_period', 'salesperson_id', 'commission_rate', 'commission_type', 'payment_terms_id',
  'commission_method', 'commission_amount', 'opportunity_id',
];

const INVOICE_ITEMS_COLUMNS = [
  'id', 'invoice_id', 'invoice_type', 'product_id', 'description', 'qty', 'unit_price', 'tax_code', 'tax_rate', 'total_line', 'created_at',
  'updated_at', 'discount_amount', 'invoice_sales_id', 'invoice_purchase_id', 'tax_included', 'code_reference', 'discount_rate', 'unit_measure_id',
  'standard_code_id', 'is_excluded', 'tribute_id', 'withholding_taxes', 'note', 'serial_numbers', 'serial_ids', 'support_document_id',
];

const INVOICE_PURCHASE_COLUMNS = [
  'id', 'organization_id', 'branch_id', 'supplier_id', 'po_id', 'number_ext', 'issue_date', 'due_date', 'currency', 'subtotal', 'tax_total', 'total',
  'balance', 'status', 'created_by', 'created_at', 'updated_at', 'notes', 'payment_terms', 'payment_method', 'tax_included', 'salesperson_id',
  'commission_rate', 'commission_type', 'payment_terms_id', 'commission_method', 'commission_amount',
];

const BRANCH_COLUMNS = [
  'id', 'organization_id', 'name', 'address', 'city', 'state', 'country', 'postal_code', 'latitude', 'longitude', 'phone', 'email', 'manager_id',
  'created_at', 'updated_at', 'is_main', 'tax_identification', 'opening_hours', 'features', 'capacity', 'branch_type', 'zone', 'branch_code',
  'is_active', 'uuid', 'municipality_id', 'country_code', 'state_code', 'is_web_stock_source', 'slug', 'subdomain', 'custom_domain',
  'website_logo_url', 'website_cover_url', 'is_web_published',
];

/** Sin `owner_user_id`, `created_by`, `description` ni nada que no pinte una cabecera o un ticket. */
const ORGANIZATION_COLUMNS = [
  'id', 'name', 'legal_name', 'logo_url', 'website', 'email', 'phone', 'tax_id', 'nit', 'dv', 'status', 'created_at', 'updated_at', 'type_id',
  'address', 'city', 'state', 'country', 'postal_code', 'primary_color', 'secondary_color', 'subdomain', 'custom_domain', 'plan_id', 'uuid',
  'country_code', 'registration_code', 'economic_activity', 'municipality_id', 'graphic_representation_name', 'fiscal_responsibilities', 'timezone',
];

export const REPLICATION_MANIFEST: TableManifest[] = [
  // ── Organización y catálogos ──
  {
    table: 'organizations', pk: 'id', columns: ORGANIZATION_COLUMNS, hasOrganizationId: false, scope: { kind: 'self' }, maxRows: 1,
    indexes: [], fks: [], group: 'organizacion', label: 'Organización',
  },
  {
    table: 'branches', pk: 'id', columns: BRANCH_COLUMNS, hasOrganizationId: true, scope: { kind: 'org' }, maxRows: 500, incremental: 'updated_at',
    indexes: [], fks: [], group: 'organizacion', label: 'Sucursales',
  },
  {
    table: 'organization_members', pk: 'id',
    columns: ['id', 'organization_id', 'user_id', 'created_at', 'is_super_admin', 'is_active', 'role_id', 'job_position_id', 'is_temporary'],
    hasOrganizationId: true, scope: { kind: 'org' }, maxRows: 2000, indexes: ['user_id', 'role_id'],
    fks: [
      { column: 'role_id', table: 'roles', name: 'organization_members_role_id_fkey' },
      { column: 'user_id', table: 'profiles', name: 'organization_members_user_id_fkey1' },
    ],
    group: 'organizacion', label: 'Miembros',
  },
  {
    table: 'profiles', pk: 'id', columns: ['id', 'email', 'first_name', 'last_name', 'avatar_url', 'status', 'created_at', 'updated_at'],
    hasOrganizationId: false, scope: { kind: 'parent', parents: [{ embed: 'organization_members' }] }, maxRows: 2000, indexes: [], fks: [],
    group: 'organizacion', label: 'Perfiles de usuario',
  },
  {
    table: 'roles', pk: 'id', columns: ['id', 'name', 'description', 'is_system', 'created_at'], hasOrganizationId: false,
    scope: { kind: 'global' }, maxRows: 500, indexes: [], fks: [], group: 'organizacion', label: 'Roles',
  },
  {
    table: 'currencies', pk: 'code', columns: ['code', 'name', 'symbol', 'decimals', 'created_at', 'updated_at', 'auto_update', 'is_active'],
    hasOrganizationId: false, scope: { kind: 'global' }, maxRows: 500, indexes: [], fks: [], group: 'catalogos', label: 'Monedas',
  },
  {
    table: 'organization_currencies', pk: ['organization_id', 'currency_code'],
    columns: ['organization_id', 'currency_code', 'is_base', 'auto_update', 'created_at', 'updated_at'], hasOrganizationId: true,
    scope: { kind: 'org' }, maxRows: 100, indexes: ['currency_code'],
    // Sin FK real hacia `currencies` (verificado por MCP): PostgREST tampoco la embebe.
    fks: [],
    group: 'catalogos', label: 'Monedas de la organización',
  },
  {
    table: 'units', pk: 'code', columns: ['code', 'name', 'conversion_factor', 'created_at', 'updated_at', 'unit_type'], hasOrganizationId: false,
    scope: { kind: 'global' }, maxRows: 500, indexes: [], fks: [], group: 'catalogos', label: 'Unidades',
  },
  {
    table: 'payment_methods', pk: 'code', columns: ['code', 'name', 'requires_reference', 'is_active', 'created_at', 'updated_at', 'is_system'],
    hasOrganizationId: false, scope: { kind: 'global' }, maxRows: 200, indexes: [], fks: [], group: 'catalogos', label: 'Métodos de pago',
  },
  {
    table: 'organization_payment_methods', pk: 'id',
    columns: ['id', 'organization_id', 'payment_method_code', 'is_active', 'settings', 'created_at', 'updated_at', 'show_on_website',
      'website_display_order', 'website_display_name', 'website_description', 'website_icon', 'integration_connection_id'],
    hasOrganizationId: true, scope: { kind: 'org' }, maxRows: 200, indexes: ['payment_method_code'],
    fks: [{ column: 'payment_method_code', table: 'payment_methods', refColumn: 'code', name: 'organization_payment_methods_payment_method_code_fkey' }],
    group: 'catalogos', label: 'Métodos de pago de la organización',
  },
  {
    table: 'municipalities', pk: 'id', columns: ['id', 'code', 'name', 'state_id', 'state_code', 'state_name', 'created_at', 'country_code'],
    hasOrganizationId: false, scope: { kind: 'global' }, maxRows: 2000, indexes: ['code'], fks: [], group: 'catalogos', label: 'Municipios',
  },
  {
    table: 'tax_templates', pk: 'id', columns: ['id', 'country', 'code', 'name', 'rate', 'description', 'valid_from', 'valid_to', 'created_at', 'updated_at'],
    hasOrganizationId: false, scope: { kind: 'global' }, maxRows: 1000, indexes: ['code'], fks: [], group: 'catalogos', label: 'Plantillas de impuestos',
  },
  {
    table: 'organization_taxes', pk: 'id',
    columns: ['id', 'organization_id', 'template_id', 'name', 'rate', 'description', 'is_default', 'is_active', 'created_at', 'updated_at', 'tax_included'],
    hasOrganizationId: true, scope: { kind: 'org' }, maxRows: 500, incremental: 'updated_at', indexes: [],
    fks: [{ column: 'template_id', table: 'tax_templates', name: 'organization_taxes_template_id_fkey' }],
    group: 'catalogos', label: 'Impuestos',
  },

  // ── Inventario ──
  {
    table: 'categories', pk: 'id',
    columns: ['id', 'organization_id', 'parent_id', 'name', 'slug', 'rank', 'created_at', 'updated_at', 'icon', 'color', 'image_url', 'description',
      'is_active', 'display_order', 'meta_title', 'meta_description', 'uuid', 'metadata', 'requires_preparation', 'station', 'branch_id'],
    hasOrganizationId: true, scope: { kind: 'org' }, maxRows: 5000, incremental: 'updated_at', indexes: ['parent_id'],
    fks: [
      { column: 'parent_id', table: 'categories', name: 'categories_parent_id_fkey' },
      { column: 'branch_id', table: 'branches', name: 'categories_branch_id_fkey' },
    ],
    group: 'inventario', label: 'Categorías',
  },
  {
    table: 'products', pk: 'id', columns: PRODUCT_COLUMNS, hasOrganizationId: true, scope: { kind: 'org' }, maxRows: 25000,
    incremental: 'updated_at', indexes: ['category_id', 'parent_product_id', 'barcode', 'sku', 'uuid'],
    fks: [
      { column: 'category_id', table: 'categories', name: 'products_category_id_fkey' },
      { column: 'parent_product_id', table: 'products', name: 'products_parent_product_id_fkey' },
      { column: 'unit_code', table: 'units', refColumn: 'code', name: 'products_unit_code_fkey' },
      { column: 'tax_id', table: 'tax_templates', name: 'products_tax_id_fkey' },
    ],
    group: 'inventario', label: 'Productos',
  },
  {
    table: 'product_prices', pk: 'id', columns: ['id', 'product_id', 'price', 'effective_from', 'effective_to', 'created_at', 'compare_price'],
    hasOrganizationId: false, scope: { kind: 'parent', parents: [{ embed: 'products' }] }, extraFilters: { effective_to: 'is.null' },
    // Un cambio de precio crea una fila nueva (y cierra la anterior): incremental por created_at.
    maxRows: 25000, incremental: 'created_at', indexes: ['product_id'],
    fks: [{ column: 'product_id', table: 'products', name: 'product_prices_product_id_fkey' }],
    group: 'inventario', label: 'Precios vigentes',
  },
  {
    table: 'product_costs', pk: 'id', columns: ['id', 'product_id', 'cost', 'effective_from', 'effective_to', 'created_at', 'supplier_id'],
    hasOrganizationId: false, scope: { kind: 'parent', parents: [{ embed: 'products' }] }, extraFilters: { effective_to: 'is.null' },
    maxRows: 15000, incremental: 'created_at', indexes: ['product_id', 'supplier_id'],
    fks: [
      { column: 'product_id', table: 'products', name: 'product_costs_product_id_fkey' },
      { column: 'supplier_id', table: 'suppliers', name: 'product_costs_supplier_id_fkey' },
    ],
    group: 'inventario', label: 'Costos vigentes',
  },
  {
    table: 'product_images', pk: 'id',
    columns: ['id', 'product_id', 'storage_path', 'display_order', 'is_primary', 'alt_text', 'created_at', 'updated_at', 'shared_image_id'],
    hasOrganizationId: false, scope: { kind: 'parent', parents: [{ embed: 'products' }] }, maxRows: 15000, incremental: 'updated_at',
    indexes: ['product_id'], fks: [{ column: 'product_id', table: 'products', name: 'product_images_product_id_fkey' }],
    group: 'inventario', label: 'Imágenes de producto',
  },
  {
    table: 'product_tax_relations', pk: ['product_id', 'tax_id'], columns: ['product_id', 'tax_id'], hasOrganizationId: false,
    scope: { kind: 'parent', parents: [{ embed: 'products' }] }, maxRows: 10000, indexes: ['product_id', 'tax_id'],
    fks: [
      { column: 'product_id', table: 'products', name: 'product_tax_relations_product_id_fkey' },
      { column: 'tax_id', table: 'organization_taxes', name: 'product_tax_relations_tax_id_fkey' },
    ],
    group: 'inventario', label: 'Impuestos por producto',
  },
  {
    table: 'product_modifier_groups', pk: 'id',
    columns: ['id', 'organization_id', 'product_id', 'name', 'selection_mode', 'min_selections', 'max_selections', 'required', 'display_order',
      'created_at', 'updated_at'],
    hasOrganizationId: true, scope: { kind: 'org' }, maxRows: 10000, incremental: 'updated_at', indexes: ['product_id'],
    fks: [{ column: 'product_id', table: 'products', name: 'product_modifier_groups_product_id_fkey' }],
    group: 'inventario', label: 'Grupos de modificadores',
  },
  {
    table: 'product_modifiers', pk: 'id',
    columns: ['id', 'group_id', 'name', 'extra_price', 'is_active', 'display_order', 'created_at', 'updated_at'], hasOrganizationId: false,
    scope: { kind: 'parent', parents: [{ embed: 'product_modifier_groups' }] }, maxRows: 10000, incremental: 'updated_at', indexes: ['group_id'],
    fks: [{ column: 'group_id', table: 'product_modifier_groups', name: 'product_modifiers_group_id_fkey' }],
    group: 'inventario', label: 'Modificadores',
  },
  {
    table: 'product_suppliers', pk: 'id',
    columns: ['id', 'product_id', 'supplier_id', 'cost', 'lead_time_days', 'min_order_qty', 'is_preferred', 'supplier_sku', 'notes', 'created_at', 'updated_at'],
    hasOrganizationId: false, scope: { kind: 'parent', parents: [{ embed: 'products' }] }, maxRows: 10000, incremental: 'updated_at',
    indexes: ['product_id', 'supplier_id'],
    fks: [
      { column: 'product_id', table: 'products', name: 'product_suppliers_product_id_fkey' },
      { column: 'supplier_id', table: 'suppliers', name: 'product_suppliers_supplier_id_fkey' },
    ],
    group: 'inventario', label: 'Proveedores por producto',
  },
  {
    table: 'lots', pk: 'id', columns: ['id', 'product_id', 'lot_code', 'expiry_date', 'supplier_id', 'created_at', 'updated_at'], hasOrganizationId: false,
    scope: { kind: 'parent', parents: [{ embed: 'products' }] }, maxRows: 10000, incremental: 'updated_at', indexes: ['product_id'],
    fks: [
      { column: 'product_id', table: 'products', name: 'lots_product_id_fkey' },
      { column: 'supplier_id', table: 'suppliers', name: 'lots_supplier_id_fkey' },
    ],
    group: 'inventario', label: 'Lotes',
  },
  {
    table: 'stock_levels', pk: 'id',
    columns: ['id', 'product_id', 'branch_id', 'lot_id', 'qty_on_hand', 'qty_reserved', 'avg_cost', 'created_at', 'updated_at', 'min_level'],
    hasOrganizationId: false, scope: { kind: 'parent', parents: [{ embed: 'branches' }] }, maxRows: 25000, incremental: 'updated_at',
    indexes: ['product_id', 'branch_id', 'lot_id'],
    fks: [
      { column: 'product_id', table: 'products', name: 'stock_levels_product_id_fkey' },
      { column: 'branch_id', table: 'branches', name: 'stock_levels_branch_id_fkey' },
      { column: 'lot_id', table: 'lots', name: 'stock_levels_lot_id_fkey' },
    ],
    group: 'inventario', label: 'Stock',
  },
  {
    table: 'stock_movements', pk: 'id',
    columns: ['id', 'organization_id', 'branch_id', 'product_id', 'lot_id', 'direction', 'qty', 'unit_cost', 'source', 'source_id', 'note', 'created_at', 'updated_by'],
    hasOrganizationId: true, scope: { kind: 'org' }, window: W, maxRows: 20000, incremental: 'created_at',
    indexes: ['product_id', 'branch_id', 'created_at', 'source_id'],
    fks: [
      { column: 'product_id', table: 'products', name: 'stock_movements_product_id_fkey' },
      { column: 'branch_id', table: 'branches', name: 'stock_movements_branch_id_fkey' },
      { column: 'lot_id', table: 'lots', name: 'stock_movements_lot_id_fkey' },
    ],
    group: 'inventario', label: 'Movimientos de inventario',
  },
  {
    table: 'inventory_adjustments', pk: 'id',
    columns: ['id', 'organization_id', 'branch_id', 'type', 'reason', 'status', 'created_by', 'created_at', 'updated_at', 'notes'],
    hasOrganizationId: true, scope: { kind: 'org' }, window: W, maxRows: 10000, incremental: 'updated_at', indexes: ['branch_id', 'created_at'],
    fks: [
      { column: 'branch_id', table: 'branches', name: 'inventory_adjustments_branch_id_fkey' },
      { column: 'created_by', table: 'profiles', name: 'inventory_adjustments_created_by_profiles_fkey' },
    ],
    group: 'inventario', label: 'Ajustes de inventario',
  },
  {
    table: 'inventory_transfers', pk: 'id',
    columns: ['id', 'organization_id', 'origin_branch_id', 'dest_branch_id', 'status', 'created_by', 'created_at', 'updated_at', 'notes'],
    hasOrganizationId: true, scope: { kind: 'org' }, window: W, maxRows: 10000, incremental: 'updated_at', indexes: ['origin_branch_id', 'dest_branch_id'],
    fks: [
      { column: 'origin_branch_id', table: 'branches', name: 'inventory_transfers_origin_branch_id_fkey' },
      { column: 'dest_branch_id', table: 'branches', name: 'inventory_transfers_dest_branch_id_fkey' },
    ],
    group: 'inventario', label: 'Transferencias',
  },
  {
    table: 'suppliers', pk: 'id', columns: SUPPLIER_COLUMNS, hasOrganizationId: true, scope: { kind: 'org' }, maxRows: 10000,
    incremental: 'updated_at', indexes: ['parent_supplier_id'],
    fks: [{ column: 'parent_supplier_id', table: 'suppliers', name: 'suppliers_parent_supplier_id_fkey' }],
    group: 'compras', label: 'Proveedores',
  },

  // ── Clientes ──
  {
    table: 'customers', pk: 'id', columns: CUSTOMER_COLUMNS, hasOrganizationId: true, scope: { kind: 'org' }, maxRows: 25000,
    incremental: 'updated_at', indexes: ['branch_id', 'identification_number', 'email', 'phone', 'parent_customer_id'],
    fks: [
      { column: 'branch_id', table: 'branches', name: 'customers_branch_id_fkey' },
      { column: 'parent_customer_id', table: 'customers', name: 'customers_parent_customer_id_fkey' },
    ],
    group: 'clientes', label: 'Clientes',
  },
  {
    table: 'customer_company_links', pk: 'id',
    columns: ['id', 'organization_id', 'person_id', 'company_id', 'position', 'is_primary', 'created_at', 'updated_at'], hasOrganizationId: true,
    scope: { kind: 'org' }, maxRows: 5000, incremental: 'updated_at', indexes: ['person_id', 'company_id'],
    fks: [
      { column: 'person_id', table: 'customers', name: 'customer_company_links_person_id_fkey' },
      { column: 'company_id', table: 'customers', name: 'customer_company_links_company_id_fkey' },
    ],
    group: 'clientes', label: 'Contactos de empresas',
  },

  // ── Ventas ──
  {
    table: 'sales', pk: 'id', columns: SALES_COLUMNS, hasOrganizationId: true, scope: { kind: 'org' }, window: W, maxRows: 20000,
    incremental: 'updated_at', indexes: ['customer_id', 'branch_id', 'created_at', 'user_id'],
    fks: [
      { column: 'customer_id', table: 'customers', name: 'sales_customer_id_fkey' },
      { column: 'branch_id', table: 'branches', name: 'sales_branch_id_fkey' },
    ],
    group: 'ventas', label: 'Ventas',
  },
  {
    table: 'sale_items', pk: 'id',
    columns: ['id', 'sale_id', 'product_id', 'quantity', 'unit_price', 'total', 'notes', 'created_at', 'updated_at', 'tax_amount', 'tax_rate',
      'discount_amount', 'paid_at', 'paid_by_split_id', 'serial_ids'],
    hasOrganizationId: false, scope: { kind: 'parent', parents: [{ embed: 'sales' }] }, window: W, maxRows: 20000, incremental: 'updated_at',
    indexes: ['sale_id', 'product_id'],
    fks: [
      { column: 'sale_id', table: 'sales', name: 'sale_items_sale_id_fkey' },
      { column: 'product_id', table: 'products', name: 'sale_items_product_id_fkey' },
    ],
    group: 'ventas', label: 'Líneas de venta',
  },
  {
    table: 'web_orders', pk: 'id',
    columns: ['id', 'organization_id', 'branch_id', 'customer_id', 'order_number', 'status', 'source', 'subtotal', 'tax_total', 'discount_total', 'delivery_fee',
      'tip_amount', 'total', 'delivery_type', 'delivery_partner', 'delivery_address', 'is_scheduled', 'scheduled_at', 'estimated_ready_at',
      'estimated_delivery_at', 'payment_status', 'payment_method', 'payment_reference', 'customer_name', 'customer_email', 'customer_phone',
      'customer_notes', 'internal_notes', 'sale_id', 'confirmed_at', 'confirmed_by', 'ready_at', 'delivered_at', 'cancelled_at', 'cancelled_by',
      'cancellation_reason', 'created_at', 'updated_at', 'coupon_code', 'payment_method_detail', 'stock_released_at'],
    hasOrganizationId: true, scope: { kind: 'org' }, window: W, maxRows: 5000, incremental: 'updated_at', indexes: ['customer_id', 'branch_id', 'sale_id', 'created_at'],
    fks: [
      { column: 'customer_id', table: 'customers', name: 'web_orders_customer_id_fkey' },
      { column: 'branch_id', table: 'branches', name: 'web_orders_branch_id_fkey' },
      { column: 'sale_id', table: 'sales', name: 'web_orders_sale_id_fkey' },
    ],
    group: 'ventas', label: 'Pedidos web',
  },
  {
    table: 'web_order_items', pk: 'id',
    columns: ['id', 'web_order_id', 'product_id', 'product_name', 'product_sku', 'quantity', 'unit_price', 'tax_amount', 'discount_amount', 'total', 'modifiers',
      'notes', 'status', 'created_at', 'serial_ids'],
    hasOrganizationId: false, scope: { kind: 'parent', parents: [{ embed: 'web_orders' }] }, window: W, maxRows: 10000, incremental: 'created_at',
    indexes: ['web_order_id', 'product_id'],
    fks: [
      { column: 'web_order_id', table: 'web_orders', name: 'web_order_items_web_order_id_fkey' },
      { column: 'product_id', table: 'products', name: 'web_order_items_product_id_fkey' },
    ],
    group: 'ventas', label: 'Líneas de pedido web',
  },
  {
    table: 'invoice_sales', pk: 'id', columns: INVOICE_SALES_COLUMNS, hasOrganizationId: true, scope: { kind: 'org' }, window: W, maxRows: 20000,
    incremental: 'updated_at', indexes: ['customer_id', 'sale_id', 'branch_id', 'related_invoice_id', 'number', 'issue_date'],
    fks: [
      { column: 'customer_id', table: 'customers', name: 'fk_invoice_sales_customer' },
      { column: 'sale_id', table: 'sales', name: 'fk_invoice_sales_sale' },
      { column: 'branch_id', table: 'branches', name: 'invoice_sales_branch_id_fkey' },
      { column: 'related_invoice_id', table: 'invoice_sales', name: 'invoice_sales_related_invoice_id_fkey' },
      { column: 'currency', table: 'currencies', refColumn: 'code', name: 'fk_invoice_sales_currency' },
      { column: 'payment_method', table: 'payment_methods', refColumn: 'code', name: 'fk_invoice_sales_payment_method' },
    ],
    group: 'finanzas', label: 'Facturas de venta',
  },
  {
    table: 'invoice_items', pk: 'id', columns: INVOICE_ITEMS_COLUMNS, hasOrganizationId: false,
    scope: { kind: 'parent', parents: [{ embed: 'invoice_sales' }, { embed: 'invoice_purchase' }] }, window: W, maxRows: 20000,
    incremental: 'updated_at', indexes: ['invoice_id', 'invoice_sales_id', 'invoice_purchase_id', 'product_id'],
    fks: [
      { column: 'invoice_sales_id', table: 'invoice_sales', name: 'invoice_items_invoice_sales_id_fkey' },
      { column: 'invoice_purchase_id', table: 'invoice_purchase', name: 'invoice_items_invoice_purchase_id_fkey' },
      { column: 'product_id', table: 'products', name: 'invoice_items_product_id_fkey' },
      { column: 'tax_code', table: 'tax_templates', refColumn: 'code', name: 'fk_invoice_items_tax_code' },
    ],
    group: 'finanzas', label: 'Líneas de factura',
  },

  // ── Compras ──
  {
    table: 'invoice_purchase', pk: 'id', columns: INVOICE_PURCHASE_COLUMNS, hasOrganizationId: true, scope: { kind: 'org' }, window: W,
    maxRows: 10000, incremental: 'updated_at', indexes: ['supplier_id', 'branch_id', 'po_id', 'issue_date'],
    fks: [
      { column: 'supplier_id', table: 'suppliers', name: 'invoice_purchase_supplier_id_fkey' },
      { column: 'branch_id', table: 'branches', name: 'invoice_purchase_branch_id_fkey' },
      { column: 'po_id', table: 'purchase_orders', name: 'invoice_purchase_po_id_fkey' },
      { column: 'currency', table: 'currencies', refColumn: 'code', name: 'fk_invoice_purchase_currency' },
      { column: 'payment_method', table: 'payment_methods', refColumn: 'code', name: 'fk_invoice_purchase_payment_method' },
    ],
    group: 'compras', label: 'Facturas de compra',
  },
  {
    table: 'purchase_orders', pk: 'id',
    columns: ['id', 'organization_id', 'branch_id', 'supplier_id', 'status', 'expected_date', 'total', 'created_by', 'notes', 'created_at', 'updated_at', 'uuid'],
    hasOrganizationId: true, scope: { kind: 'org' }, window: W, maxRows: 10000, incremental: 'updated_at', indexes: ['supplier_id', 'branch_id'],
    fks: [
      { column: 'supplier_id', table: 'suppliers', name: 'purchase_orders_supplier_id_fkey' },
      { column: 'branch_id', table: 'branches', name: 'purchase_orders_branch_id_fkey' },
    ],
    group: 'compras', label: 'Órdenes de compra',
  },
  {
    table: 'purchase_order_items', pk: 'id',
    columns: ['id', 'purchase_order_id', 'product_id', 'quantity', 'unit_cost', 'subtotal', 'received_quantity', 'notes', 'created_at', 'updated_at',
      'requires_serial', 'serials_received'],
    hasOrganizationId: false, scope: { kind: 'parent', parents: [{ embed: 'purchase_orders' }] }, window: W, maxRows: 10000,
    incremental: 'updated_at', indexes: ['purchase_order_id', 'product_id'],
    fks: [
      { column: 'purchase_order_id', table: 'purchase_orders', name: 'purchase_order_items_purchase_order_id_fkey' },
      { column: 'product_id', table: 'products', name: 'purchase_order_items_product_id_fkey' },
    ],
    group: 'compras', label: 'Líneas de orden de compra',
  },

  // ── Finanzas ──
  {
    table: 'payments', pk: 'id',
    columns: ['id', 'organization_id', 'branch_id', 'source', 'source_id', 'method', 'amount', 'currency', 'reference', 'processor_response', 'status',
      'created_by', 'created_at', 'updated_at', 'payment_date', 'discount_amount', 'change_amount'],
    hasOrganizationId: true, scope: { kind: 'org' }, window: W, maxRows: 20000, incremental: 'updated_at', indexes: ['source_id', 'branch_id', 'method', 'created_at'],
    fks: [
      { column: 'branch_id', table: 'branches', name: 'payments_branch_id_fkey' },
      { column: 'method', table: 'payment_methods', refColumn: 'code', name: 'payments_new_method_fkey' },
      { column: 'currency', table: 'currencies', refColumn: 'code', name: 'payments_currency_fkey' },
    ],
    group: 'finanzas', label: 'Pagos',
  },
  {
    table: 'accounts_receivable', pk: 'id',
    columns: ['id', 'organization_id', 'customer_id', 'invoice_id', 'amount', 'balance', 'due_date', 'status', 'days_overdue', 'created_at',
      'updated_at', 'last_reminder_date', 'sale_id', 'branch_id', 'discount_amount'],
    hasOrganizationId: true, scope: { kind: 'org' }, maxRows: 10000, incremental: 'updated_at', indexes: ['customer_id', 'invoice_id', 'sale_id', 'branch_id'],
    fks: [
      { column: 'customer_id', table: 'customers', name: 'fk_accounts_receivable_customer' },
      { column: 'invoice_id', table: 'invoice_sales', name: 'fk_accounts_receivable_invoice' },
      { column: 'sale_id', table: 'sales', name: 'fk_accounts_receivable_sale' },
    ],
    group: 'finanzas', label: 'Cuentas por cobrar',
  },
  {
    table: 'accounts_payable', pk: 'id',
    columns: ['id', 'organization_id', 'supplier_id', 'invoice_id', 'amount', 'balance', 'due_date', 'status', 'days_overdue', 'created_at',
      'updated_at', 'branch_id', 'discount_amount'],
    hasOrganizationId: true, scope: { kind: 'org' }, maxRows: 10000, incremental: 'updated_at', indexes: ['supplier_id', 'invoice_id', 'branch_id'],
    fks: [
      { column: 'supplier_id', table: 'suppliers', name: 'accounts_payable_supplier_id_fkey' },
      { column: 'invoice_id', table: 'invoice_purchase', name: 'accounts_payable_invoice_id_fkey' },
    ],
    group: 'finanzas', label: 'Cuentas por pagar',
  },
  {
    table: 'cash_sessions', pk: 'id',
    columns: ['id', 'organization_id', 'branch_id', 'opened_by', 'opened_at', 'initial_amount', 'closed_at', 'closed_by', 'final_amount', 'difference',
      'status', 'notes', 'created_at', 'updated_at', 'uuid'],
    hasOrganizationId: true, scope: { kind: 'org' }, window: W, maxRows: 10000, incremental: 'updated_at', indexes: ['branch_id', 'opened_by', 'status'],
    fks: [{ column: 'branch_id', table: 'branches', name: 'cash_sessions_branch_id_fkey' }],
    group: 'finanzas', label: 'Sesiones de caja',
  },
  {
    table: 'cash_movements', pk: 'id',
    columns: ['id', 'organization_id', 'cash_session_id', 'type', 'concept', 'amount', 'user_id', 'created_at', 'updated_at', 'notes', 'uuid', 'branch_id'],
    hasOrganizationId: true, scope: { kind: 'org' }, window: W, maxRows: 10000, incremental: 'updated_at', indexes: ['cash_session_id', 'branch_id'],
    fks: [{ column: 'cash_session_id', table: 'cash_sessions', name: 'cash_movements_cash_session_id_fkey' }],
    group: 'finanzas', label: 'Movimientos de caja',
  },
  {
    table: 'cash_counts', pk: 'id',
    columns: ['id', 'organization_id', 'cash_session_id', 'count_type', 'counted_amount', 'expected_amount', 'difference', 'denominations',
      'counted_by', 'verified_by', 'notes', 'created_at', 'branch_id'],
    hasOrganizationId: true, scope: { kind: 'org' }, window: W, maxRows: 10000, incremental: 'created_at', indexes: ['cash_session_id'],
    fks: [{ column: 'cash_session_id', table: 'cash_sessions', name: 'cash_counts_cash_session_id_fkey' }],
    group: 'finanzas', label: 'Arqueos de caja',
  },
];

const BY_TABLE = new Map(REPLICATION_MANIFEST.map((m) => [m.table, m]));

export function getTableManifest(table: string): TableManifest | undefined {
  return BY_TABLE.get(table);
}

export function isReplicatedTable(table: string): boolean {
  return BY_TABLE.has(table);
}

export const REPLICATED_TABLES: readonly string[] = REPLICATION_MANIFEST.map((m) => m.table);

/** Columnas de la PK como array. */
export function pkColumns(m: TableManifest): string[] {
  return Array.isArray(m.pk) ? m.pk : [m.pk];
}

/**
 * Relaciones inversas (uno-a-muchos) que llegan a `table`: qué tablas del
 * manifiesto tienen una FK hacia ella. Se derivan de las FKs directas.
 */
export function inverseRelations(table: string): Array<{ fromTable: string; fk: ForeignKeySpec }> {
  const out: Array<{ fromTable: string; fk: ForeignKeySpec }> = [];
  for (const m of REPLICATION_MANIFEST) {
    for (const fk of m.fks) if (fk.table === table) out.push({ fromTable: m.table, fk });
  }
  return out;
}

/** Suma de topes: referencia para el presupuesto documentado. */
export function totalMaxRows(): number {
  return REPLICATION_MANIFEST.reduce((sum, m) => sum + m.maxRows, 0);
}
