// Tipos para el sistema POS
import type { MembresiaVendida } from '@/lib/pos/venta/membresias';
import type { Pesaje } from '@/lib/pos/peso/pesada';

export interface Category {
  id: number;
  organization_id: number;
  name: string;
  slug: string;
  rank: number;
  parent_id?: number;
  icon?: string | null;
  color?: string | null;
  image_url?: string | null;
  display_order?: number;
  /** Favorita de la organización (category_favorites). Lo rellena el POS. */
  is_favorite?: boolean;
  /** Unidades vendidas en 90 días (pos_category_ranking). Lo rellena el POS. */
  sales_count_90d?: number;
  requires_preparation?: boolean;
  station?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  organization_id: number;
  sku: string;
  name: string;
  description?: string;
  category_id?: number;
  category?: Category;
  unit_code: string;
  barcode?: string;
  status: 'active' | 'inactive' | 'deleted';
  image?: string;
  // tax_id legacy removido: los impuestos se gestionan via product_tax_relations
  price?: number; // Added for POS pricing
  cost?: number;
  stock_quantity?: number;
  min_stock_level?: number;
  track_stock?: boolean;
  is_out_of_stock?: boolean;
  qty_reserved?: number;
  created_at: string;
  updated_at: string;
  tag_id?: number;
  parent_product_id?: number;
  track_serial?: boolean;
  // Campos extendidos para POS (favoritos, ranking de ventas y receta vinculada)
  is_favorite?: boolean;
  sales_count_90d?: number;
  has_recipe?: boolean;
  recipe_id?: number | null;
  recipe_name?: string | null;
  /**
   * `products.service_type` (solo con `product_type = 'service'`): 'membership'
   * marca una membresía, que exige cliente titular en el cobro (P1).
   */
  service_type?: string | null;
  /**
   * Cómo se vende (docs/design/PRODUCTOS-POR-PESO-BASCULA.md): 'unit' (hoy),
   * 'weight' (kg/lb, se pesa) o 'measure' (m/L con decimales). El precio
   * (`price`) es siempre por `unit_code`.
   */
  sale_mode?: 'unit' | 'weight' | 'measure' | null;
  qty_decimals?: number | null;
  price_ref_qty?: number | string | null;
  price_ref_unit_code?: string | null;
  min_sale_qty?: number | string | null;
  default_tare_qty?: number | string | null;
  tare_required?: boolean | null;
  require_scale?: boolean | null;
}

export interface Customer {
  id: string;
  organization_id: number;
  full_name: string;
  email?: string;
  phone?: string;
  doc_type?: string;
  doc_number?: string;
  address?: string;
  fiscal_municipality_id?: string;
  country?: string;
  avatar_url?: string | null;
  roles: string[];
  tags: string[];
  preferences: any;
  created_at: string;
  updated_at: string;
  customer_type?: string;
  first_name?: string;
  last_name?: string;
  /** Fase 4D (Desktop): creado sin red y aún no sincronizado con Supabase. */
  pending_sync?: boolean;
}

export interface CartItemModifier {
  groupId: number;
  groupName: string;
  modifierId: number;
  name: string;
  extraPrice: number;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: number;
  product: Product;
  quantity: number;
  unit_price: number;
  total: number;
  /** Descuento final de la línea (manual si lo hay; si no, el de promoción). Es el que se cobra. */
  discount_amount?: number;
  /**
   * Descuento puesto a mano por el cajero. Una promoción nunca lo pisa.
   * `null` = la línea no tiene descuento manual.
   */
  manual_discount_amount?: number | null;
  /** Descuento de promoción de la última evaluación del carrito (se recalcula en cada cambio). */
  promo_discount_amount?: number;
  tax_amount?: number;
  tax_rate?: number;
  tax_excluded?: boolean;
  tax_included?: boolean;
  /**
   * La tasa de esta línea ya se cobró en la cuenta (mesa), aunque sea 0.
   * El cobro no vuelve a buscar el impuesto de la organización.
   */
  tasaDecidida?: boolean;
  /** Nota para COCINA (comanda, KDS, ticket de cocina). Nunca sale al cliente. */
  notes?: string;
  /** Nota para el CLIENTE: ticket, recibo y factura electrónica. */
  customer_note?: string;
  /** La nota de cocina es una alergia: la comanda no se empieza sin confirmarla. */
  is_allergy?: boolean;
  /** Unidades que la cocina ya tiene de esta línea (según la última ronda enviada). */
  kitchen_sent_qty?: number;
  /** Nota de cocina tal como se envió la última vez. */
  kitchen_sent_note?: string | null;
  /** Si lo último enviado de esta línea era alergia. */
  kitchen_sent_allergy?: boolean;
  modifiers?: CartItemModifier[];
  /**
   * Pesada de una línea por peso (`notes.pesaje` en `pos_checkout_v1`). Cada
   * pesada es una línea propia: no se funde con otra del mismo producto.
   */
  pesaje?: Pesaje;
  created_at: string;
  updated_at: string;
}

export interface Cart {
  id: string;
  organization_id: number;
  branch_id: number;
  customer_id?: string;
  customer?: Customer;
  status: 'active' | 'hold' | 'hold_with_debt' | 'completed' | 'cancelled';
  items: CartItem[];
  subtotal: number;
  tax_amount: number; // Alias for compatibility
  tax_total: number;
  discount_amount: number; // Alias for compatibility
  discount_total: number;
  total: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  hold_reason?: string;
  tax_included?: boolean;
  applied_tax_ids?: string[];
  kitchen_ticket_id?: number | null;
  /** Llave de la ronda «Enviar a cocina» en curso: reintentarla no duplica la comanda. */
  kitchen_round_key?: string | null;
  sale_id?: string;
  invoice_id?: string;
  /**
   * Id de la venta a crédito en curso («Deuda»): se guarda ANTES de llamar a
   * pos_checkout_v1 para que un reintento tras un corte devuelva la misma
   * deuda en vez de crear otra. Se limpia al quedar registrada.
   */
  debt_attempt_id?: string | null;
}

export interface Sale {
  id: string;
  organization_id: number;
  branch_id: number;
  customer_id?: string;
  user_id: string;
  total: number;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  balance: number;
  /**
   * Estados REALES de `sales` según `sales_status_check`:
   * `draft | paid | partial | pending | void`. «completed» y «cancelled» no
   * existen en la base de datos y se conservan solo porque los pedidos web y
   * código antiguo los usan; el tipo los admite para no romper esas rutas,
   * pero una venta del POS nunca los tendrá (auditoría de ventas, 2026-09-22).
   *
   * `pending_sync`: venta provisional guardada en el outbox del Desktop
   * (fase 4B), aún no está en Supabase.
   */
  status:
    | 'draft'
    | 'paid'
    | 'partial'
    | 'pending'
    | 'void'
    | 'completed'
    | 'cancelled'
    | 'expired'
    | 'pending_sync';
  payment_status: 'pending' | 'paid' | 'partial' | 'refunded';
  sale_date: string;
  invoice_number?: string;
  sale_number?: string;
  /** true si la venta salió del outbox offline y todavía no se reprodujo en Supabase. */
  pending_sync?: boolean;
  /** Número local `OFF-<sucursal>-<n>` impreso en el ticket mientras la venta está pendiente. */
  receipt_number_local?: string;
  /** true si `pos_checkout_v1` encontró la venta ya creada (reproducción repetida de un sobre). Solo lo rellena la RPC (fase 4E). */
  replayed?: boolean;
  payment_method?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  delivery_fee?: number;
  tip_amount?: number;
  tax_included?: boolean;
  tax_breakdown?: { name: string; amount: number }[];
  salesperson_id?: string;
  commission_rate?: number;
  commission_type?: 'salesperson' | 'intermediation_sale' | 'none';
  commission_method?: 'percentage' | 'fixed_amount';
  commission_amount?: number;
  /**
   * Membresías que creó, activó o renovó el cobro (`pos_checkout_v1` →
   * `membresias`, ya leídas con `leerMembresiasVendidas`). Las pinta el
   * post-venta (frame D2). Ausente fuera de la RPC (sin red, pedidos web).
   */
  membresias?: MembresiaVendida[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id?: number;
  quantity: number;
  unit_price: number;
  total: number;
  tax_amount?: number;
  tax_rate?: number;
  discount_amount?: number;
  notes?: any;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  organization_id: number;
  reference_type: 'sale' | 'invoice' | 'account_receivable';
  reference_id: string;
  customer_id?: string;
  amount: number;
  method: 'cash' | 'card' | 'transfer' | 'check' | 'other';
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  payment_date: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  type: 'cash' | 'card' | 'transfer' | 'check' | 'digital' | 'other';
  is_active: boolean;
  settings?: any;
  icon?: string;
  color?: string;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_active: boolean;
  is_base?: boolean;
}

// Estados y filtros
export interface ProductFilter {
  search?: string;
  category_id?: number;
  status: 'active' | 'inactive' | 'all';
  limit?: number;
}

export interface CustomerFilter {
  search?: string;
  status: 'active' | 'inactive' | 'all';
}

// Respuesta paginada genérica
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Para la interface POS
export interface POSState {
  activeCartId: string;
  carts: Cart[];
  selectedCustomer?: Customer;
  paymentMethods: PaymentMethod[];
  currency: Currency;
}

export interface CheckoutData {
  cart: Cart;
  payments: {
    method: string;
    amount: number;
  }[];
  change: number;
  total_paid: number;
  tax_included?: boolean;
  tip_amount?: number;
  tip_server_id?: string;
  tax_breakdown?: { name: string; amount: number }[];
  salesperson_id?: string;
  commission_rate?: number;
  commission_type?: 'salesperson' | 'intermediation_sale' | 'none';
  commission_method?: 'percentage' | 'fixed_amount';
  commission_amount?: number;
  delivery_type?: 'pickup' | 'delivery_own' | 'delivery_third_party';
  delivery_info?: {
    address?: string;
    city?: string;
    contact_name?: string;
    contact_phone?: string;
    instructions?: string;
  };
  driver_id?: string;
  shipping_fee?: number;
  serial_selections?: Record<number, number[]>;
  /**
   * Id de la venta generado en el cliente (`crypto.randomUUID()`), Desktop
   * fase 4B. Si ya existe una venta con ese id en la organización, `checkout`
   * devuelve la existente y completa solo lo que falte (idempotencia).
   */
  saleId?: string;
  /**
   * Hora del EQUIPO al cobrar (ISO). No es la hora oficial: la pone el servidor
   * (`pos_checkout_v1`). Al reproducir un sobre offline, el servidor la acepta
   * solo si `clockOffsetMs` era ≤ 10 min (docs/reglas-fechas-timezone.md §«Hora oficial»).
   */
  createdAt?: string;
  /** Desfase del reloj del equipo (ms, equipo − servidor) medido antes de vender sin red. */
  clockOffsetMs?: number | null;
  /** Usuario que hizo la venta. Al reproducir un sobre offline evita atribuirla a quien sincroniza. */
  userId?: string;
  /** true cuando `salesSync` reproduce un sobre: nunca vuelve a encolarse en el outbox. */
  replayFromOutbox?: boolean;
  /**
   * Id del intento de cobro del diálogo (uno por apertura, igual en todos sus
   * reintentos). En una venta nueva coincide con `saleId`; en el cobro de una
   * venta que ya existe (mesa, deuda) es la llave de idempotencia de los pagos.
   */
  attemptId?: string;
  /**
   * Cobro de una venta que YA existe (la cuenta de una mesa): `pos_checkout_v1`
   * en modo 'settle'. La deuda de mostrador se reconoce por `cart.sale_id` +
   * `cart.invoice_id` y no necesita este campo.
   */
  settle?: CobroVentaExistente;
}

/** Datos del cobro de una venta que ya existe (mesa). */
export interface CobroVentaExistente {
  sale_id: string;
  /**
   * Sesión de la mesa: el servidor la valida, toma la tasa de impuesto de
   * cada línea del cobro, recalcula la cuenta y liga la sesión a la venta.
   */
  table_session_id?: string;
  /** Cuenta dividida por platos: las líneas que paga este cobro. */
  paid_sale_item_ids?: string[];
  /** Cuenta dividida: id de la parte que se paga (queda en `paid_by_split_id`). */
  split_id?: string;
  /**
   * Cuenta dividida: el resto de líneas sin pagar. No se cobran en este
   * intento; el servidor solo toma su tasa de impuesto para recalcular y
   * validar la cuenta entera.
   */
  lineas_sin_cobrar?: CartItem[];
  /**
   * Promociones que quedaron en las líneas de la cuenta (`notes.promociones`).
   * `pos_checkout_v1` suma su uso una sola vez, en el cobro que salda la cuenta,
   * y solo de las que de verdad están en las líneas.
   */
  promotion_ids?: string[];
}

// Para impuestos
export interface OrganizationTax {
  id: string;
  organization_id: number;
  template_id: number;
  name: string;
  rate: string;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  tax_included?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductTaxRelation {
  product_id: number;
  tax_id: string;
  organization_taxes: OrganizationTax;
}

export interface PrintTicket {
  sale: Sale;
  sale_items: SaleItem[];
  customer?: Customer;
  payments: Payment[];
  organization_name: string;
  branch_address?: string;
  print_date: string;
}

// Interfaces para Hold with Debt
export interface HoldWithDebtData {
  cartId: string;
  reason: string;
  paymentTerms?: number; // días para vencimiento
  notes?: string;
}

export interface HoldWithDebtResult {
  cart: Cart;
  invoice: {
    id: string;
    number: string;
    total: number;
    due_date: string;
    status: string;
  };
  accountReceivable: {
    id: string;
    amount: number;
    balance: number;
    due_date: string;
    status: string;
  };
}
