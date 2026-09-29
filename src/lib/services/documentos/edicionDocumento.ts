/**
 * Lecturas y altas rápidas del FORMULARIO de documento (factura de venta,
 * factura de compra, orden de compra), compartidas por las tres pantallas:
 *
 * - `impuestosOrganizacion`: impuestos y retenciones activos de la
 *   organización (Tesorería › Impuestos), separados por su clase `kind`.
 * - `buscarProductosDocumento`: búsqueda en el servidor para «Agregar
 *   productos» con precio de venta vigente (`product_prices`) o costo
 *   (`product_suppliers` del proveedor → `product_costs` vigente), stock de la
 *   sucursal (`stock_levels.qty_on_hand`, la misma cuenta que usa
 *   `fn_invoice_stock_shortages` al emitir) e impuestos del producto.
 * - `buscarClientesDocumento` / `buscarProveedoresDocumento`: sobre las RPC
 *   de los listados (`fn_clientes_listado`, `proveedores_listado`), que ya
 *   traen el saldo por cobrar / por pagar en una sola llamada.
 * - `crearClienteRapido` / `crearProveedorRapido` / `crearProductoRapido`:
 *   el MISMO alta de la app (regla 7): `buildCustomerInsert` (la fila que
 *   arma el formulario de clientes: escribe `first_name`/`last_name` e
 *   `identification_*`, nunca las columnas GENERATED), `supplierService.
 *   createSupplier` y `productoService.guardar` (`fn_producto_guardar`).
 *
 * Todo con el cliente de la sesión (RLS por pertenencia); la organización es
 * la de la sesión (`getOrganizationId`) y las RPC la validan con
 * `fn_assert_acceso_org`. Nada de service role en el navegador.
 */
import { supabase } from '@/lib/supabase/config';
import { listarClientes, type FilaCliente } from '@/lib/services/clientesListadoService';
import type { ProveedorListadoItem, Supplier } from '@/lib/services/supplierService';
import { buildCustomerInsert, emptyCustomerValues } from '@/lib/services/customers/customerPayload';
import { esRetencion } from '@/lib/services/taxResolverCore';
import { ilikeAnyOf } from '@/lib/utils/postgrestFilters';
import { getStorageImageUrl } from '@/lib/utils/storageImageUrl';
import { textoSinHtml } from '@/lib/utils/textoPlano';
import { vigente } from './vigencia';

export { vigente };

// Tipos propios (espejo de los del kit, sin importar componentes desde lib).
export interface ImpuestoDocumento {
  id: string;
  codigo: string | null;
  nombre: string;
  tarifa: number;
  predeterminado?: boolean;
}

export interface ProductoParaDocumento {
  id: number;
  nombre: string;
  sku: string | null;
  codigoBarras: string | null;
  descripcion: string | null;
  precio: number;
  /** Precio de venta vigente (también en compra, como referencia). */
  precioVenta: number;
  stock: number | null;
  controlaStock: boolean;
  serial: boolean;
  lotes: number | null;
  tiempoEntregaDias: number | null;
  delProveedor: boolean;
  referenciaProveedor: string | null;
  minimoPedido: number | null;
  impuestos: ImpuestoDocumento[];
  imagen: string | null;
}

export interface CriteriosProductosDocumento {
  texto: string;
  variante: 'venta' | 'compra';
  sucursal: number | null;
  proveedor?: number | null;
  conStock?: boolean;
  soloProveedor?: boolean;
  limite?: number;
}

type FilaImpuesto = {
  id: string;
  name: string | null;
  rate: number | string | null;
  is_default: boolean | null;
  is_active: boolean | null;
  kind: string | null;
  tax_templates: { code: string | null } | { code: string | null }[] | null;
};

function codigoPlantilla(f: FilaImpuesto): string | null {
  const t = Array.isArray(f.tax_templates) ? f.tax_templates[0] : f.tax_templates;
  return t?.code ?? null;
}

function aImpuesto(f: FilaImpuesto): ImpuestoDocumento {
  return { id: f.id, codigo: codigoPlantilla(f), nombre: (f.name ?? codigoPlantilla(f) ?? '').trim(), tarifa: Number(f.rate) || 0, predeterminado: !!f.is_default };
}

/** Impuestos (clase `tax`) y retenciones (clase `withholding`) activos de la organización. */
export async function impuestosOrganizacion(org: number): Promise<{ impuestos: ImpuestoDocumento[]; retenciones: ImpuestoDocumento[] }> {
  const { data, error } = await supabase
    .from('organization_taxes')
    .select('id, name, rate, is_default, is_active, kind, tax_templates(code)')
    .eq('organization_id', org)
    .eq('is_active', true)
    .order('rate', { ascending: false });
  if (error) throw error;
  const filas = (data ?? []) as unknown as FilaImpuesto[];
  return {
    impuestos: filas.filter((f) => !esRetencion(f)).map(aImpuesto),
    retenciones: filas.filter((f) => esRetencion(f)).map(aImpuesto),
  };
}

type FilaProducto = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  track_stock: boolean | null;
  track_serial: boolean | null;
  product_prices: { price: number | string; effective_from: string | null; effective_to: string | null }[] | null;
  product_costs: { cost: number | string; effective_from: string | null; effective_to: string | null }[] | null;
  product_tax_relations: { organization_taxes: FilaImpuesto | FilaImpuesto[] | null }[] | null;
  product_images: { storage_path: string | null; is_primary: boolean | null; display_order: number | null }[] | null;
};

/**
 * Productos para «Agregar productos». Sin padres de variantes (se agregan
 * las variantes, que son las que tienen stock y precio).
 */
export async function buscarProductosDocumento(org: number, c: CriteriosProductosDocumento, senal?: AbortSignal): Promise<ProductoParaDocumento[]> {
  const limite = Math.min(Math.max(c.limite ?? 30, 1), 60);
  const proveedor = c.variante === 'compra' && c.proveedor ? c.proveedor : null;

  // Catálogo del proveedor (compra): costo, días de entrega, referencia y mínimo.
  const delProveedor = new Map<number, { cost: number; lead: number | null; sku: string | null; min: number | null }>();
  if (proveedor) {
    let q = supabase.from('product_suppliers').select('product_id, cost, lead_time_days, min_order_qty, supplier_sku').eq('supplier_id', proveedor);
    if (senal) q = q.abortSignal(senal);
    const { data, error } = await q;
    if (error) throw error;
    for (const r of (data ?? []) as { product_id: number; cost: number | string | null; lead_time_days: number | null; min_order_qty: number | string | null; supplier_sku: string | null }[]) {
      delProveedor.set(r.product_id, { cost: Number(r.cost) || 0, lead: r.lead_time_days, sku: r.supplier_sku, min: r.min_order_qty == null ? null : Number(r.min_order_qty) });
    }
  }

  // «Con stock»: primero los productos con existencias en la sucursal.
  let conStockIds: number[] | null = null;
  if (c.conStock && c.sucursal) {
    let q = supabase.from('stock_levels').select('product_id').eq('branch_id', c.sucursal).gt('qty_on_hand', 0).limit(2000);
    if (senal) q = q.abortSignal(senal);
    const { data, error } = await q;
    if (error) throw error;
    conStockIds = [...new Set(((data ?? []) as { product_id: number }[]).map((r) => r.product_id))];
  }

  let ids: number[] | null = conStockIds;
  if (c.soloProveedor && proveedor) {
    const propios = [...delProveedor.keys()];
    ids = ids ? ids.filter((x) => delProveedor.has(x)) : propios;
  }
  if (ids && ids.length === 0) return [];

  const productos = await consultarProductos(org, { texto: c.texto, ids, limite }, senal);
  return mapearProductos(productos, c, delProveedor, senal);
}

const SELECT_PRODUCTO_DOCUMENTO =
  'id, name, sku, barcode, description, track_stock, track_serial, product_prices(price, effective_from, effective_to), product_costs(cost, effective_from, effective_to), product_tax_relations(organization_taxes(id, name, rate, is_default, is_active, kind, tax_templates(code))), product_images(storage_path, is_primary, display_order)';

async function consultarProductos(org: number, f: { texto?: string; ids: number[] | null; limite: number; conPadres?: boolean }, senal?: AbortSignal): Promise<FilaProducto[]> {
  let q = supabase.from('products').select(SELECT_PRODUCTO_DOCUMENTO).eq('organization_id', org);
  if (!f.conPadres) q = q.eq('status', 'active').not('is_parent', 'is', true);
  q = q.order('name').limit(f.limite);
  const filtroTexto = ilikeAnyOf(['name', 'sku', 'barcode', 'reference'], f.texto ?? '');
  if (filtroTexto) q = q.or(filtroTexto);
  if (f.ids) q = q.in('id', f.ids.slice(0, 1000));
  if (senal) q = q.abortSignal(senal);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as FilaProducto[];
}

async function mapearProductos(
  productos: FilaProducto[],
  c: Pick<CriteriosProductosDocumento, 'variante' | 'sucursal'>,
  delProveedor: Map<number, { cost: number; lead: number | null; sku: string | null; min: number | null }>,
  senal?: AbortSignal,
): Promise<ProductoParaDocumento[]> {
  // Stock de la sucursal de los productos encontrados (una consulta).
  const stock = new Map<number, { qty: number; lotes: number }>();
  if (c.sucursal && productos.length > 0) {
    let qs = supabase.from('stock_levels').select('product_id, lot_id, qty_on_hand').eq('branch_id', c.sucursal).in('product_id', productos.map((p) => p.id));
    if (senal) qs = qs.abortSignal(senal);
    const { data: filas, error: e2 } = await qs;
    if (e2) throw e2;
    for (const r of (filas ?? []) as { product_id: number; lot_id: number | null; qty_on_hand: number | string | null }[]) {
      const a = stock.get(r.product_id) ?? { qty: 0, lotes: 0 };
      const qty = Number(r.qty_on_hand) || 0;
      a.qty += qty;
      if (r.lot_id && qty > 0) a.lotes += 1;
      stock.set(r.product_id, a);
    }
  }

  return productos.map((p) => {
    const precioVenta = Number(vigente(p.product_prices)?.price) || 0;
    const prov = delProveedor.get(p.id);
    const costo = prov && prov.cost > 0 ? prov.cost : Number(vigente(p.product_costs)?.cost) || 0;
    const s = stock.get(p.id);
    const impuestos = (p.product_tax_relations ?? [])
      .map((r) => (Array.isArray(r.organization_taxes) ? r.organization_taxes[0] : r.organization_taxes))
      .filter((f): f is FilaImpuesto => !!f && f.is_active !== false && !esRetencion(f))
      .map(aImpuesto);
    const imagen = [...(p.product_images ?? [])].sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary) || (a.display_order ?? 0) - (b.display_order ?? 0))[0];
    return {
      id: p.id,
      nombre: p.name,
      sku: p.sku,
      codigoBarras: p.barcode,
      descripcion: textoSinHtml(p.description, 160) || null,
      precio: c.variante === 'venta' ? precioVenta : costo,
      precioVenta,
      stock: c.sucursal ? (s?.qty ?? 0) : null,
      controlaStock: p.track_stock !== false,
      serial: p.track_serial === true,
      lotes: s?.lotes || null,
      tiempoEntregaDias: prov?.lead ?? null,
      delProveedor: !!prov,
      referenciaProveedor: prov?.sku ?? null,
      minimoPedido: prov?.min ?? null,
      impuestos,
      imagen: imagen?.storage_path ? getStorageImageUrl(imagen.storage_path) || null : null,
    };
  });
}

/**
 * Productos por id con su precio, stock e impuestos (líneas que llegan de una
 * oportunidad, de un duplicado o de un borrador): así la línea se resuelve con
 * el impuesto del producto al CARGAR (hallazgo H9), no solo al guardar.
 */
export async function productosPorId(org: number, ids: readonly number[], c: Pick<CriteriosProductosDocumento, 'variante' | 'sucursal'>): Promise<Map<number, ProductoParaDocumento>> {
  const unicos = [...new Set(ids.filter((x) => Number.isInteger(x) && x > 0))];
  if (unicos.length === 0) return new Map();
  const filas = await consultarProductos(org, { ids: unicos, limite: Math.min(unicos.length, 500), conPadres: true });
  const lista = await mapearProductos(filas, c, new Map());
  return new Map(lista.map((p) => [p.id, p]));
}

// ─── Terceros ────────────────────────────────────────────────────────────

/** Filtros de «Elegir cliente» (ids de los chips). */
export type FiltroClienteDocumento = 'persona' | 'empresa' | 'activos' | 'conSaldo';
export type FiltroProveedorDocumento = 'persona' | 'empresa' | 'activos' | 'conSaldo';

function tipoDeFiltros(filtros: readonly string[]): 'persona' | 'empresa' | null {
  const p = filtros.includes('persona');
  const e = filtros.includes('empresa');
  return p === e ? null : p ? 'persona' : 'empresa';
}

export async function buscarClientesDocumento(org: number, texto: string, filtros: readonly string[]): Promise<FilaCliente[]> {
  const tipo = tipoDeFiltros(filtros);
  const { filas } = await listarClientes({
    organizationId: org,
    branchId: null,
    criterios: {
      busqueda: texto,
      tipo,
      saldo: filtros.includes('conSaldo') ? 'con_saldo' : null,
      // «Solo activos» apagado: todos (activos e inactivos).
      estado: filtros.includes('activos') ? null : 'todos',
    },
    orden: null,
    desde: 0,
    tamano: 20,
  });
  return filas;
}

export async function buscarProveedoresDocumento(org: number, texto: string, filtros: readonly string[]): Promise<ProveedorListadoItem[]> {
  const tipo = tipoDeFiltros(filtros);
  // Import diferido: supplierService arrastra jsPDF y xlsx (exportes) y no deben ir en el paquete del formulario.
  const { supplierService } = await import('@/lib/services/supplierService');
  const { items } = await supplierService.listarProveedores(org, {
    busqueda: texto,
    estado: filtros.includes('activos') ? 'activo' : null,
    tipo: tipo === 'persona' ? 'person' : tipo === 'empresa' ? 'company' : null,
    cartera: filtros.includes('conSaldo') ? 'con_saldo' : null,
    limite: 20,
  });
  return items;
}

export interface DatosTerceroDocumento {
  tipo: 'persona' | 'empresa';
  tipoDocumento: string;
  numeroDocumento: string;
  dv: string;
  nombres: string;
  apellidos: string;
  razonSocial: string;
  contacto: string;
  correo: string;
  telefono: string;
  diasCredito: number | null;
}

/** El cliente ya existe con ese documento: la pantalla ofrece elegirlo. */
export class ClienteDuplicadoError extends Error {
  constructor(public readonly existente: { id: string; nombre: string }) {
    super('cliente_duplicado');
  }
}

/**
 * Alta rápida de cliente: la misma fila que arma el formulario de clientes
 * (`buildCustomerInsert`) y el mismo control de duplicado por documento.
 */
export async function crearClienteRapido(org: number, sucursal: number | null, d: DatosTerceroDocumento): Promise<FilaCliente> {
  const numero = d.numeroDocumento.replace(/[.\s-]/g, '');
  if (numero) {
    const { data: dup, error: e1 } = await supabase
      .from('customers')
      .select('id, full_name')
      .eq('organization_id', org)
      .eq('identification_number', numero)
      .limit(1);
    if (e1) throw e1;
    const existente = (dup ?? [])[0] as { id: string; full_name: string | null } | undefined;
    if (existente) throw new ClienteDuplicadoError({ id: existente.id, nombre: existente.full_name ?? numero });
  }
  const empresa = d.tipo === 'empresa';
  const fila = buildCustomerInsert(
    {
      ...emptyCustomerValues(),
      customerType: empresa ? 'company' : 'person',
      firstName: d.nombres,
      lastName: d.apellidos,
      companyName: empresa ? d.razonSocial : '',
      email: d.correo,
      phone: d.telefono,
      documentType: d.tipoDocumento,
      documentNumber: numero,
      dv: d.tipoDocumento === 'nit' ? d.dv : '',
    },
    { organizationId: org, branchId: sucursal },
  );
  const { data, error } = await supabase.from('customers').insert([fila]).select('id').single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  const { filas } = await listarClientes({ organizationId: org, branchId: null, criterios: { estado: 'todos' }, orden: null, desde: 0, tamano: 1, ids: [id] });
  return (
    filas[0] ??
    ({
      id,
      full_name: empresa ? d.razonSocial : `${d.nombres} ${d.apellidos}`.trim(),
      company_name: empresa ? d.razonSocial : null,
      identification_type: d.tipoDocumento,
      identification_number: numero || null,
      dv: null,
      email: d.correo || null,
      phone: d.telefono || null,
      customer_type: empresa ? 'company' : 'person',
      saldo: 0,
      plazo_dias: null,
    } as unknown as FilaCliente)
  );
}

/** Alta rápida de proveedor: `supplierService.createSupplier`, el alta de Proveedores. */
export async function crearProveedorRapido(org: number, d: DatosTerceroDocumento): Promise<Supplier> {
  const empresa = d.tipo === 'empresa';
  const numero = d.numeroDocumento.replace(/[.\s-]/g, '');
  const { supplierService } = await import('@/lib/services/supplierService');
  const { data, error } = await supplierService.createSupplier(org, {
    name: empresa ? d.razonSocial.trim() : `${d.nombres} ${d.apellidos}`.trim(),
    supplier_type: empresa ? 'company' : 'person',
    doc_type: d.tipoDocumento || null,
    nit: numero || undefined,
    dv: d.tipoDocumento === 'nit' && d.dv ? d.dv : null,
    contact: d.contacto.trim() || undefined,
    email: d.correo.trim() || undefined,
    phone: d.telefono.trim() || undefined,
    credit_days: d.diasCredito ?? undefined,
  });
  if (error || !data) throw error ?? new Error('proveedor_no_creado');
  return data;
}

export interface DatosProductoDocumento {
  nombre: string;
  sku: string;
  precio: number | null;
  impuestos: string[];
  controlaStock: boolean;
}

/**
 * Alta rápida de producto: `productoService.guardar` (`fn_producto_guardar`,
 * la transacción del formulario de producto). En venta fija el precio; en
 * compra, el costo y el vínculo con el proveedor elegido.
 */
export async function crearProductoRapido(
  org: number,
  variante: 'venta' | 'compra',
  d: DatosProductoDocumento,
  proveedor: number | null,
  impuestos: readonly ImpuestoDocumento[],
): Promise<ProductoParaDocumento> {
  const precio = Number(d.precio) || 0;
  const { productoService } = await import('@/lib/services/productoService');
  const r = await productoService.guardar(org, {
    modo: 'crear',
    producto: {
      sku: d.sku.trim(),
      name: d.nombre.trim(),
      product_type: 'product',
      status: 'active',
      track_stock: d.controlaStock,
      track_serial: false,
      auto_generate_serial: false,
    },
    ...(variante === 'venta' ? { precio: { price: precio } } : { costo: { cost: precio } }),
    impuestos: d.impuestos,
    ...(variante === 'compra' && proveedor ? { proveedores: [{ supplier_id: proveedor, cost: precio, is_preferred: true }] } : {}),
    tiene_variantes: false,
    clave_idempotencia: `doc-${org}-${d.sku.trim()}-${Date.now()}`,
  });
  return {
    id: r.id,
    nombre: r.name,
    sku: r.sku,
    codigoBarras: null,
    descripcion: null,
    precio,
    precioVenta: variante === 'venta' ? precio : Number(r.price) || 0,
    stock: 0,
    controlaStock: d.controlaStock,
    serial: false,
    lotes: null,
    tiempoEntregaDias: null,
    delProveedor: variante === 'compra' && !!proveedor,
    referenciaProveedor: null,
    minimoPedido: null,
    impuestos: impuestos.filter((i) => d.impuestos.includes(i.id)),
    imagen: null,
  };
}

// ─── Formas de pago ──────────────────────────────────────────────────────

/** Métodos de pago activos de la organización en UNA consulta (antes, una por método: H6). */
export async function metodosPagoOrganizacion(org: number): Promise<{ codigo: string; nombre: string }[]> {
  const { data, error } = await supabase
    .from('organization_payment_methods')
    .select('payment_method_code, payment_methods(name)')
    .eq('organization_id', org)
    .eq('is_active', true)
    .order('id');
  if (error) throw error;
  return ((data ?? []) as unknown as { payment_method_code: string; payment_methods: { name: string | null } | { name: string | null }[] | null }[]).map((m) => {
    const pm = Array.isArray(m.payment_methods) ? m.payment_methods[0] : m.payment_methods;
    return { codigo: m.payment_method_code, nombre: pm?.name || m.payment_method_code };
  });
}
