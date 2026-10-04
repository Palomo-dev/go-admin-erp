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
import { COLUMNAS_CANTIDAD_PRODUCTO, cantidadLineaDeProducto } from './cantidadLinea';

export { vigente };

// Tipos propios (espejo de los del kit, sin importar componentes desde lib).
export interface ImpuestoDocumento {
  id: string;
  codigo: string | null;
  nombre: string;
  tarifa: number;
  predeterminado?: boolean;
  /** Solo retenciones: base mínima en UVT (`organization_taxes.min_base_uvt`); null sin base mínima. */
  baseMinimaUvt?: number | null;
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
  /** Producto por peso o medida: símbolo de la unidad («kg») y decimales de la cantidad; `null` por unidad. */
  unidadVenta: string | null;
  decimalesCantidad: number | null;
}

export interface CriteriosProductosDocumento {
  texto: string;
  variante: 'venta' | 'compra';
  sucursal: number | null;
  proveedor?: number | null;
  conStock?: boolean;
  soloProveedor?: boolean;
  /** Orden de compra: sin servicios (solo lo que entra al inventario). */
  sinServicios?: boolean;
  limite?: number;
}

type FilaImpuesto = {
  id: string;
  name: string | null;
  rate: number | string | null;
  is_default: boolean | null;
  is_active: boolean | null;
  kind: string | null;
  min_base_uvt?: number | string | null;
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
    .select('id, name, rate, is_default, is_active, kind, min_base_uvt, tax_templates(code)')
    .eq('organization_id', org)
    .eq('is_active', true)
    .order('rate', { ascending: false });
  if (error) throw error;
  const filas = (data ?? []) as unknown as FilaImpuesto[];
  return {
    impuestos: filas.filter((f) => !esRetencion(f)).map(aImpuesto),
    retenciones: filas
      .filter((f) => esRetencion(f))
      .map((f) => ({ ...aImpuesto(f), baseMinimaUvt: f.min_base_uvt == null || f.min_base_uvt === '' ? null : Number(f.min_base_uvt) })),
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
  product_type?: string | null;
  sale_mode?: string | null;
  qty_decimals?: number | null;
  unit_code?: string | null;
  product_prices: { price: number | string; effective_from: string | null; effective_to: string | null }[] | null;
  product_costs: { cost: number | string; effective_from: string | null; effective_to: string | null }[] | null;
  product_tax_relations: { organization_taxes: FilaImpuesto | FilaImpuesto[] | null }[] | null;
  product_images: { storage_path: string | null; is_primary: boolean | null; display_order: number | null }[] | null;
};

/**
 * Productos para «Agregar productos». Un padre con variantes activas no entra
 * (se agregan las variantes, que son las que tienen stock y precio). Un padre
 * sin variantes sí entra: el catálogo lo muestra y su precio y stock están en él.
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

  const filas = await consultarProductos(org, { texto: c.texto, ids, limite }, senal);
  const productos = c.sinServicios ? filas.filter((p) => p.product_type !== 'service') : filas;
  return mapearProductos(productos, c, delProveedor, senal);
}

const SELECT_PRODUCTO_DOCUMENTO =
  `id, name, sku, barcode, description, product_type, track_stock, track_serial, ${COLUMNAS_CANTIDAD_PRODUCTO}, product_prices(price, effective_from, effective_to), product_costs(cost, effective_from, effective_to), product_tax_relations(organization_taxes(id, name, rate, is_default, is_active, kind, tax_templates(code))), product_images(storage_path, is_primary, display_order)`;

type FilaIdNombre = { id: number; name: string };

/**
 * Ids que se pueden agregar, en orden de nombre: variantes, simples y padres
 * sin variantes activas. El padre que sí tiene variantes queda fuera.
 */
export function idsVendibles(
  noPadres: readonly FilaIdNombre[],
  padres: readonly FilaIdNombre[],
  padresConVariantes: ReadonlySet<number>,
  limite: number,
): number[] {
  const vistos = new Set<number>();
  const filas: FilaIdNombre[] = [];
  for (const p of [...noPadres, ...padres]) {
    if (vistos.has(p.id) || padresConVariantes.has(p.id)) continue;
    vistos.add(p.id);
    filas.push(p);
  }
  filas.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id));
  return filas.slice(0, Math.max(0, limite)).map((p) => p.id);
}

type ConsultaIds = { filtroTexto: string; ids: number[] | null; limite: number; senal?: AbortSignal };

function consultaIds(org: number, f: ConsultaIds) {
  let q = supabase.from('products').select('id, name').eq('organization_id', org).eq('status', 'active');
  if (f.filtroTexto) q = q.or(f.filtroTexto);
  if (f.ids) q = q.in('id', f.ids.slice(0, 1000));
  if (f.senal) q = q.abortSignal(f.senal);
  return q;
}

/** Padres del lote que tienen al menos una variante activa. */
async function padresConVariantesActivas(org: number, ids: readonly number[], senal?: AbortSignal): Promise<Set<number>> {
  const hallados = new Set<number>();
  let pendientes = [...new Set(ids)];
  for (let i = 0; i < 8 && pendientes.length > 0; i++) {
    let q = supabase.from('products').select('parent_product_id').eq('organization_id', org).eq('status', 'active').in('parent_product_id', pendientes).limit(1000);
    if (senal) q = q.abortSignal(senal);
    const { data, error } = await q;
    if (error) throw error;
    const filas = (data ?? []) as { parent_product_id: number | null }[];
    const nuevos = new Set<number>();
    for (const r of filas) {
      if (r.parent_product_id != null) nuevos.add(r.parent_product_id);
    }
    for (const id of nuevos) hallados.add(id);
    if (filas.length < 1000 || nuevos.size === 0) break;
    pendientes = pendientes.filter((id) => !hallados.has(id));
  }
  return hallados;
}

async function idsSinPadreConVariantes(org: number, f: ConsultaIds): Promise<number[]> {
  // El padre con variantes ocupa cupo del límite y luego se descarta: se piden
  // más padres para que los que no tienen variantes alcancen a salir.
  const topePadres = Math.min(Math.max(f.limite, 1) * 5, 200);
  const [noPadresRes, padresRes] = await Promise.all([
    consultaIds(org, f).or('is_parent.is.null,is_parent.eq.false').order('name').order('id').limit(f.limite),
    consultaIds(org, f).eq('is_parent', true).is('parent_product_id', null).order('name').order('id').limit(topePadres),
  ]);
  if (noPadresRes.error) throw noPadresRes.error;
  if (padresRes.error) throw padresRes.error;
  const noPadres = (noPadresRes.data ?? []) as FilaIdNombre[];
  const padres = (padresRes.data ?? []) as FilaIdNombre[];
  const conVariantes = padres.length === 0 ? new Set<number>() : await padresConVariantesActivas(org, padres.map((p) => p.id), f.senal);
  return idsVendibles(noPadres, padres, conVariantes, f.limite);
}

async function idsConPadres(org: number, f: ConsultaIds): Promise<number[]> {
  let q = supabase.from('products').select('id').eq('organization_id', org).order('name').order('id').limit(f.limite);
  if (f.filtroTexto) q = q.or(f.filtroTexto);
  if (f.ids) q = q.in('id', f.ids.slice(0, 1000));
  if (f.senal) q = q.abortSignal(f.senal);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as { id: number }[]).map((r) => r.id);
}

/**
 * Dos pasos: primero los ids (filtro, orden y límite sobre `products` solo),
 * después las relaciones de ESOS ids. En una sola consulta, PostgREST resolvía
 * precios, costos, impuestos e imágenes (con su RLS) de TODOS los productos de
 * la organización antes de ordenar por nombre y cortar: con ~24.000 productos
 * se pasaba del statement_timeout y el diálogo decía «No pudimos buscar los
 * productos» (2026-09-30).
 *
 * El corte no puede ser `is_parent = true`: hay productos marcados como padre
 * que no tienen variantes y el catálogo los vende con su propio stock.
 */
async function consultarProductos(org: number, f: { texto?: string; ids: number[] | null; limite: number; conPadres?: boolean }, senal?: AbortSignal): Promise<FilaProducto[]> {
  const filtroTexto = ilikeAnyOf(['name', 'sku', 'barcode', 'reference'], f.texto ?? '');
  const orden = f.conPadres
    ? await idsConPadres(org, { filtroTexto, ids: f.ids, limite: f.limite, senal })
    : await idsSinPadreConVariantes(org, { filtroTexto, ids: f.ids, limite: f.limite, senal });
  if (orden.length === 0) return [];

  let qd = supabase.from('products').select(SELECT_PRODUCTO_DOCUMENTO).eq('organization_id', org).in('id', orden);
  if (senal) qd = qd.abortSignal(senal);
  const { data, error } = await qd;
  if (error) throw error;
  const porId = new Map(((data ?? []) as unknown as FilaProducto[]).map((p) => [p.id, p]));
  return orden.map((id) => porId.get(id)).filter((p): p is FilaProducto => !!p);
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
    const cantidad = cantidadLineaDeProducto(p);
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
      unidadVenta: cantidad.unidad,
      decimalesCantidad: cantidad.decimalesCantidad,
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

/** «Elegir cliente»: una página (20) de la búsqueda única de clientes, con el total para «Ver más». */
export async function buscarClientesDocumento(
  org: number,
  texto: string,
  filtros: readonly string[],
  desde = 0,
): Promise<{ filas: FilaCliente[]; total: number }> {
  const tipo = tipoDeFiltros(filtros);
  return listarClientes({
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
    desde,
    tamano: 20,
  });
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
    // El alta rápida crea productos por unidad (el modo por peso se elige en el formulario completo).
    unidadVenta: null,
    decimalesCantidad: null,
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
