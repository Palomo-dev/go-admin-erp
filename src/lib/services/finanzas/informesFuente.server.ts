import type { SupabaseClient } from '@supabase/supabase-js';
import { cargarConfiguracionInformes } from './configuracionInformes.server';
import { cargarStockInformes } from './informesStock.server';
import { OrgContextError } from '@/lib/utils/orgContextError';
import type { ConfiguracionInformes } from '@/lib/finanzas/informes/configuracion';
import type { CuentaInforme } from '@/lib/finanzas/informes/estados';
import { fechaAnoAnterior, movimientosContabilizados } from '@/lib/finanzas/informes/estados';
import type { MovimientoLibro, MovimientoStockInforme } from '@/lib/finanzas/informes/libros';
import type { MovimientoActividad, FacturaActividad, LineaCompraActividad } from '@/lib/finanzas/informes/basesActividad';
import type { FacturaContribucion, LineaContribucion, ProductoActividad } from '@/lib/finanzas/informes/contribucionProductos';
import { ancestrosDe, codigoNormalizado, presentacionDeCodigo } from '@/lib/finanzas/pucPrefijo';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { getDayRange } from '@/lib/utils/timezone';
import { textoComprobante } from '@/lib/finanzas/contabilidad/comprobante';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dateCore';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';

export interface FiltrosFuenteInformes {
  desde: string;
  hasta: string;
  branchId?: number | null;
  costCenterId?: string | null;
}
export type MovimientoFuenteInforme = MovimientoLibro & MovimientoActividad & { description: string | null; concepto_exogena: string | null };
export interface FuenteInformes {
  cuentas: CuentaInforme[];
  movimientos: MovimientoFuenteInforme[];
  configuracion: ConfiguracionInformes;
  organizacion: { nombre: string; nit: string };
  centros: Array<{ id: string; code: string; name: string; branch_id: number | null }>;
  productos: ProductoActividad[];
  advertencias: string[];
  monedaBase: string | null;
  timezone: string;
  stock: MovimientoStockInforme[];
  stockCompleto: boolean;
  motivoStockIncompleto: 'centro_costo' | 'datos_no_verificables' | null;
  advertenciasStock: string[];
  actividad: {
    ventas: FacturaContribucion[];
    originalesVentas: FacturaActividad[];
    compras: FacturaActividad[];
    lineasVenta: LineaContribucion[];
    lineasCompra: LineaCompraActividad[];
  };
}
interface RespuestaPagina { data: unknown[] | null; error: { message: string; code?: string } | null }
interface AsientoFuente {
  id: number; organization_id: number; branch_id: number | null; entry_date: string;
  memo: string | null; posted: boolean; source: string | null; source_id: string | null;
  currency_code: string | null; base_currency_code: string | null;
}
interface LineaFuente {
  id: number; organization_id: number; journal_entry_id: number; account_code: string;
  description: string | null; debit: number | string; credit: number | string;
  debit_base: number | string | null; credit_base: number | string | null;
  currency_code: string | null; cost_center_id: string | null;
  tercero_nit: string | null; tercero_nombre: string | null;
  journal_entries: AsientoFuente | AsientoFuente[] | null;
}
interface AnulacionFuente { original_entry_id: number; reversal_entry_id: number; anulado_en: string; restaurado_en?: string | null }
interface ProductoFuente { id: number; organization_id: number; name: string; category_id: number | null }

/** No se corta en 1000: cada consulta lleva un orden único y pagina hasta agotarse. */
async function paginar<T>(crear: (desde: number, hasta: number) => PromiseLike<RespuestaPagina>, contexto: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await crear(desde, desde + 999);
    if (error) throw new Error(`No se pudo cargar ${contexto}: ${error.message}`);
    const pagina = (data ?? []) as T[];
    filas.push(...pagina);
    if (pagina.length < 1000) return filas;
  }
}

function numero(valor: number | string | null, contexto: string): number {
  if (valor === null || valor === '') throw new Error(`Falta un importe verificable en ${contexto}.`);
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new Error(`El importe de ${contexto} no es finito.`);
  return n;
}
function lotes<T>(valores: T[], tamano = 200): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < valores.length; i += tamano) salida.push(valores.slice(i, i + tamano));
  return salida;
}

/** Fuente única para estados e indicadores; solo sesión/RLS, nunca service role. */
export async function cargarFuenteInformes(cliente: SupabaseClient, organizationId: number, filtros: FiltrosFuenteInformes): Promise<FuenteInformes> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new Error('La organización del informe no es válida.');
  const [{ data: entidad, error: errorEntidad }, configuracion, moneda] = await Promise.all([
    cliente.from('organizations').select('id,name,legal_name,nit,tax_id,timezone').eq('id', organizationId).single(),
    cargarConfiguracionInformes(cliente, organizationId),
    resolveOrgCurrency(cliente, organizationId),
  ]);
  if (errorEntidad || !entidad) throw new Error('No se pudo cargar la entidad del informe.');
  const validarSucursal = async (branchId: number) => {
    const { data, error } = await cliente.from('branches').select('id').eq('organization_id', organizationId).eq('id', branchId).maybeSingle();
    if (error || !data) throw new OrgContextError('Sucursal no encontrada o sin acceso.', 404, 'BRANCH_NOT_FOUND');
    const permiso = await cliente.rpc('app_branch_access', { p_branch_id: branchId });
    if (permiso.error || permiso.data !== true) throw new OrgContextError('No tiene acceso a la sucursal solicitada.', 403, 'BRANCH_FORBIDDEN');
  };
  if (filtros.branchId) await validarSucursal(filtros.branchId);
  if (filtros.costCenterId) {
    const { data, error } = await cliente.from('cost_centers').select('id,branch_id').eq('organization_id', organizationId).eq('id', filtros.costCenterId).maybeSingle();
    if (error || !data) throw new OrgContextError('Centro de costo no encontrado o sin acceso.', 404, 'COST_CENTER_NOT_FOUND');
    if (filtros.branchId && data.branch_id != null && data.branch_id !== filtros.branchId) throw new OrgContextError('El centro de costo no pertenece a la sucursal solicitada.', 403, 'COST_CENTER_FORBIDDEN');
    if (!filtros.branchId && data.branch_id != null) await validarSucursal(data.branch_id);
  }
  const timezone = entidad.timezone || DEFAULT_TIMEZONE;
  const { end: hastaInstante } = getDayRange(filtros.hasta, timezone);
  const advertencias = new Set<string>();
  if (moneda.source === 'fallback') advertencias.add('La moneda base no tiene configuración verificable; revise su configuración antes de presentar el informe.');
  const metadataPorCodigo = new Map(configuracion.cuentas.map((c) => [codigoNormalizado(c.account_code), c]));
  const codigos = new Set(metadataPorCodigo.keys());
  const cuentas: CuentaInforme[] = configuracion.cuentas.map((c) => {
    let explicita = c.clasificacion_corriente;
    if (!explicita) {
      for (const padre of ancestrosDe(c.account_code, codigos)) {
        const marca = metadataPorCodigo.get(padre)?.clasificacion_corriente;
        if (marca) { explicita = marca; break; }
      }
    }
    const presentacion = presentacionDeCodigo(c.account_code, explicita);
    return { account_code: codigoNormalizado(c.account_code), account_code_original: c.account_code, name: c.name, es_ori: c.es_ori,
      es_equivalente_efectivo: c.equivalente_efectivo, plazo_meses: c.plazo_meses,
      costo_comportamiento: c.costo_comportamiento,
      clasificacion_corriente: presentacion === 'corriente' || presentacion === 'no_corriente' ? presentacion : null,
      presentacion_niif: presentacion };
  });

  const leerLineas = (desde: number, hasta: number) => {
    let consulta = cliente.from('journal_lines').select('id,organization_id,journal_entry_id,account_code,description,debit,credit,debit_base,credit_base,currency_code,cost_center_id,tercero_nit,tercero_nombre,journal_entries!inner(id,organization_id,branch_id,entry_date,memo,posted,source,source_id,currency_code,base_currency_code)')
      .eq('organization_id', organizationId).eq('journal_entries.organization_id', organizationId)
      .eq('journal_entries.posted', true).lte('journal_entries.entry_date', hastaInstante);
    if (filtros.branchId) consulta = consulta.eq('journal_entries.branch_id', filtros.branchId);
    if (filtros.costCenterId) consulta = consulta.eq('cost_center_id', filtros.costCenterId);
    return consulta.order('id').range(desde, hasta);
  };
  const [lineas, centros, respuestaAnulaciones, productosDb, categorias, stockFuente, metadatosCuentas] = await Promise.all([
    paginar<LineaFuente>(leerLineas, 'el libro contabilizado'),
    paginar<{ id: string; code: string; name: string; branch_id: number | null }>((desde, hasta) => {
      let q = cliente.from('cost_centers').select('id,code,name,branch_id').eq('organization_id', organizationId);
      if (filtros.branchId) q = q.or(`branch_id.is.null,branch_id.eq.${filtros.branchId}`);
      return q.order('id').range(desde, hasta);
    }, 'los centros de costo'),
    cliente.rpc('fn_informes_anulaciones', { p_organization_id: organizationId, p_hasta: hastaInstante }),
    paginar<ProductoFuente>((desde, hasta) => cliente.from('products').select('id,organization_id,name,category_id').eq('organization_id', organizationId).order('id').range(desde, hasta), 'los productos'),
    paginar<{ id: number; name: string }>((desde, hasta) => cliente.from('categories').select('id,name').eq('organization_id', organizationId).order('id').range(desde, hasta), 'las líneas de producto'),
    cargarStockInformes(cliente, organizationId, { hasta: filtros.hasta, branchId: filtros.branchId ?? undefined, costCenterId: filtros.costCenterId ?? undefined }, timezone),
    paginar<{ account_code: string; description: string | null; concepto_exogena: string | null; type: string }>((desde, hasta) => cliente.from('chart_of_accounts').select('account_code,description,concepto_exogena,type').eq('organization_id', organizationId).order('account_code').range(desde, hasta), 'los conceptos de las cuentas'),
  ]);
  const conceptosCuentas = new Map(metadatosCuentas.map((c) => [codigoNormalizado(c.account_code), c]));
  for (const cuenta of cuentas) {
    const meta = conceptosCuentas.get(cuenta.account_code);
    cuenta.description = meta?.description ?? null;
    cuenta.concepto_exogena = meta?.concepto_exogena ?? null;
    cuenta.type = meta?.type;
  }
  for (const aviso of stockFuente.advertencias) advertencias.add(aviso);
  if (respuestaAnulaciones.error) throw new Error('No se pudo verificar la anulación de los asientos; el informe no se generó para evitar incluir anulados.');
  const anulaciones = new Map<number, { desde: string; hasta?: string | null }>();
  for (const a of (respuestaAnulaciones.data ?? []) as AnulacionFuente[]) {
    const desde = toPlainDate(new Date(a.anulado_en), timezone);
    const hasta = a.restaurado_en ? toPlainDate(new Date(a.restaurado_en), timezone) : null;
    for (const id of [a.original_entry_id, a.reversal_entry_id]) anulaciones.set(id, { desde, hasta });
  }
  const centroPorId = new Map(centros.map((c) => [c.id, c.name]));
  const movimientos: MovimientoFuenteInforme[] = movimientosContabilizados(lineas.map((linea) => {
    const asiento = Array.isArray(linea.journal_entries) ? linea.journal_entries[0] : linea.journal_entries;
    // Defensa adicional a RLS y a ambos filtros: nunca aceptar una relación cruzada.
    if (!asiento || linea.organization_id !== organizationId || asiento.organization_id !== organizationId) throw new Error('Se recibió una línea ajena a la organización del informe.');
    if (!asiento.posted || (filtros.branchId && asiento.branch_id !== filtros.branchId) || (filtros.costCenterId && linea.cost_center_id !== filtros.costCenterId)) throw new Error('El libro devolvió una línea fuera del alcance solicitado.');
    const tieneBase = linea.debit_base != null && linea.credit_base != null;
    const monedaImportesBase = asiento.base_currency_code?.trim().toUpperCase();
    if (tieneBase && monedaImportesBase && monedaImportesBase !== moneda.code) throw new Error('El asiento contiene importes base de una moneda distinta a la del informe.');
    const codigoMoneda = (linea.currency_code || asiento.currency_code || '').trim().toUpperCase();
    if (!tieneBase && codigoMoneda && codigoMoneda !== moneda.code) throw new Error('Hay un asiento en otra moneda sin importes base verificables; no se mezclaron monedas.');
    if (!tieneBase) advertencias.add('Hay líneas históricas sin importes base; se conservaron sus débitos y créditos originales. Revise su moneda antes de presentar el informe.');
    const anulacion = anulaciones.get(asiento.id);
    return { id: linea.id, entry_id: asiento.id, entry_date: toPlainDate(new Date(asiento.entry_date), timezone),
      account_code: linea.account_code, description: linea.description,
      concepto_exogena: conceptosCuentas.get(codigoNormalizado(linea.account_code))?.concepto_exogena ?? null,
      debit: numero(tieneBase ? linea.debit_base : linea.debit, 'el débito del asiento'),
      credit: numero(tieneBase ? linea.credit_base : linea.credit, 'el crédito del asiento'),
      posted: true, source: asiento.source, source_id: asiento.source_id, memo: asiento.memo || linea.description,
      currency_code: codigoMoneda || null,
      branch_id: asiento.branch_id, cost_center_id: linea.cost_center_id,
      cost_center_name: linea.cost_center_id ? centroPorId.get(linea.cost_center_id) ?? null : null,
      tercero_nit: linea.tercero_nit, tercero_nombre: linea.tercero_nombre,
      ...configuracion.anotaciones_asientos[String(asiento.id)],
      ...(anulacion ? { anulado_desde: anulacion.desde, anulado_hasta: anulacion.hasta } : {}),
    };
  }));
  const categoriaPorId = new Map(categorias.map((c) => [c.id, c.name]));
  const productos: ProductoActividad[] = productosDb.map((p) => ({ id: p.id, name: p.name, linea: p.category_id ? categoriaPorId.get(p.category_id) ?? null : null }));

  // Las facturas se piden solo por identificadores procedentes de asientos de la
  // organización, para ambos periodos. El movimiento conserva toda la historia.
  const inicioComparativo = fechaAnoAnterior(filtros.desde);
  const relevantes = movimientos.filter((m) => m.entry_date >= inicioComparativo);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const idsFactura = (tipo: string) => [...new Set(relevantes.filter((m) => {
    if (m.source !== tipo || !m.source_id) return false;
    if (uuid.test(m.source_id)) return true;
    advertencias.add('Hay asientos con un identificador de factura no verificable; se conservaron sus saldos y no se inventaron bases de actividad.');
    return false;
  }).map((m) => m.source_id!))];
  const idsVentas = idsFactura('invoice_sales');
  const idsCompras = idsFactura('invoice_purchase');
  const facturas = async <T>(tabla: 'invoice_sales' | 'invoice_purchase', ids: string[], campos: string, filtrarSucursal = true): Promise<T[]> => {
    const salida: T[] = [];
    for (const grupo of lotes(ids)) salida.push(...await paginar<T>((desde, hasta) => {
      let q = cliente.from(tabla).select(campos).eq('organization_id', organizationId).in('id', grupo);
      if (filtrarSucursal && filtros.branchId) q = q.eq('branch_id', filtros.branchId);
      return q.order('id').range(desde, hasta);
    }, 'las facturas vinculadas al libro'));
    return salida;
  };
  const [ventas, compras] = await Promise.all([
    facturas<FacturaContribucion>('invoice_sales', idsVentas, 'id,organization_id,status,subtotal,currency,document_type,related_invoice_id,payment_method,payment_form,payment_terms,sale_id'),
    facturas<FacturaActividad>('invoice_purchase', idsCompras, 'id,organization_id,status,subtotal,currency,cost_center_id,payment_method,payment_terms'),
  ]);
  const idsOriginales = [...new Set(ventas.map((v) => v.related_invoice_id).filter((id): id is string => !!id && !idsVentas.includes(id)))];
  const originalesVentas = await facturas<FacturaActividad>('invoice_sales', idsOriginales, 'id,organization_id,status,subtotal,currency,document_type,related_invoice_id,payment_method,payment_form,payment_terms', false);
  const lineasFactura = async <T>(tipo: 'sales' | 'purchase', ids: string[], campos: string): Promise<T[]> => {
    const salida: T[] = [];
    for (const grupo of lotes(ids)) {
      // invoice_items no tiene organization_id: el join interno protege cada
      // fila con la organización de la factura, además de los ids ya validados.
      const padre = tipo === 'sales' ? 'invoice_sales' : 'invoice_purchase';
      salida.push(...await paginar<T>((desde, hasta) => {
        let q = cliente.from('invoice_items').select(`${campos},${padre}!inner(organization_id)`)
          .eq(`${padre}.organization_id`, organizationId).in(`${padre}_id`, grupo);
        if (filtros.branchId) q = q.eq(`${padre}.branch_id`, filtros.branchId);
        return q.order('id').range(desde, hasta);
      }, 'las líneas de factura'));
    }
    return salida;
  };
  const [lineasVenta, lineasCompra] = await Promise.all([
    lineasFactura<LineaContribucion>('sales', ventas.map((v) => v.id), 'invoice_sales_id,product_id,qty,total_line,tax_rate,cost_center_id'),
    lineasFactura<LineaCompraActividad>('purchase', compras.map((v) => v.id), 'invoice_purchase_id,total_line,tax_rate,cost_center_id'),
  ]);
  return { cuentas, movimientos, configuracion, organizacion: { nombre: entidad.legal_name || entidad.name, nit: entidad.nit || entidad.tax_id || '' },
    centros, productos, advertencias: [...advertencias], monedaBase: moneda.source === 'fallback' ? null : moneda.code, timezone, stock: stockFuente.movimientos, stockCompleto: stockFuente.stockCompleto, motivoStockIncompleto: stockFuente.motivoStockIncompleto, advertenciasStock: stockFuente.advertencias,
    actividad: { ventas, originalesVentas, compras, lineasVenta, lineasCompra } };
}

export interface AsientoSeleccionableInforme { id: number; fecha: string; comprobante: string; memo: string }

/** Solo metadatos para el selector de clasificaciones; jamás devuelve importes. */
export async function cargarAsientosSeleccionablesInformes(
  cliente: SupabaseClient,
  organizationId: number,
  filtros: { desde: string; hasta: string },
  timezone: string,
): Promise<AsientoSeleccionableInforme[]> {
  const { start } = getDayRange(filtros.desde, timezone);
  const { end } = getDayRange(filtros.hasta, timezone);
  const [filas, reversas] = await Promise.all([
    paginar<{ id: number; organization_id: number; posted: boolean; entry_date: string; memo: string | null; comprobante_prefijo: string | null; comprobante_numero: number | null }>((desde, hasta) => cliente.from('journal_entries')
      .select('id,organization_id,posted,entry_date,memo,comprobante_prefijo,comprobante_numero')
      .eq('organization_id', organizationId).eq('posted', true)
      .gte('entry_date', start).lte('entry_date', end).order('entry_date').order('id').range(desde, hasta), 'los metadatos de los asientos'),
    cliente.rpc('fn_informes_anulaciones', { p_organization_id: organizationId, p_hasta: end }),
  ]);
  if (reversas.error) throw new Error('No se pudo verificar la anulación de los asientos del selector.');
  const porId = new Map<number, AnulacionFuente>();
  for (const a of (reversas.data ?? []) as AnulacionFuente[]) {
    porId.set(a.original_entry_id, a);
    porId.set(a.reversal_entry_id, a);
  }
  const metadatos = filas.map((fila) => {
    if (fila.organization_id !== organizationId || fila.posted !== true) throw new Error('El selector devolvió un asiento fuera de la organización o sin contabilizar.');
    const anulacion = porId.get(fila.id);
    const fecha = toPlainDate(new Date(fila.entry_date), timezone);
    if (!fecha || fecha < filtros.desde || fecha > filtros.hasta) throw new Error('El selector devolvió un asiento fuera del periodo solicitado.');
    return { ...fila, entry_id: fila.id, account_code: '0', debit: 0, credit: 0, entry_date: fecha,
      anulado_desde: anulacion ? toPlainDate(new Date(anulacion.anulado_en), timezone) : null,
      anulado_hasta: anulacion?.restaurado_en ? toPlainDate(new Date(anulacion.restaurado_en), timezone) : null };
  });
  return movimientosContabilizados(metadatos, filtros.hasta).map((fila) => ({ id: fila.id, fecha: fila.entry_date,
    comprobante: textoComprobante(fila.comprobante_prefijo, fila.comprobante_numero) ?? `Asiento ${fila.id}`, memo: fila.memo ?? '' }));
}
