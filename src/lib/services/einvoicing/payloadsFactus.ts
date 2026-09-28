/**
 * Construcción de los documentos que se envían a Factus v2. Puro: recibe filas
 * ya leídas y devuelve el payload, para poder probarlo sin red ni base.
 *
 * Reglas verificadas contra el sandbox de Factus (2026-09-23):
 * - `price` es el precio SIN impuesto; Factus calcula el impuesto y exige que
 *   la suma de `payment_details` sea igual al total que él calcula. Por eso,
 *   si la línea tiene `tax_included`, se descuenta el impuesto del precio, y
 *   el valor del pago se calcula con las mismas reglas de redondeo.
 * - El descuento de línea se expresa en `discount_rate` (%), no en valor.
 * - `customer.responsibilities` es obligatorio (factura y nota crédito).
 * - Sin identificación del cliente se factura a consumidor final
 *   (222222222222), como define la DIAN.
 * - La nota crédito v2 lleva `correction_concept_code`, `customization_id`,
 *   `bill_number` (número DIAN de la factura), `customer` y `payment_details`.
 */

import {
  mapIdentificationType,
  mapDocumentType,
  mapPaymentMethod,
  mapTribute,
  mapUnitMeasure,
  mapStandardCode,
  mapTaxCode,
  mapWithholdingCode,
  CodigoTributoNoAdmitidoError,
  type FactusCustomer,
  type FactusItem,
  type FactusEstablishment,
  type FactusInvoiceRequest,
  type FactusCreditNoteRequest,
  type FactusPaymentDetail,
  type FactusSupportDocumentRequest,
} from '@/lib/services/factusService';

// ─── Utilidades numéricas ────────────────────────────────────────────────────

export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function fijo(n: number): string {
  return redondear2(n).toFixed(2);
}

/** Error por datos del documento que hay que corregir antes de enviarlo (no se reintenta solo). */
export class DatosIncompletosError extends Error {
  readonly faltantes: string[];

  constructor(faltantes: string[]) {
    super(`Faltan datos para facturar electrónicamente: ${faltantes.join('; ')}`);
    this.name = 'DatosIncompletosError';
    this.faltantes = faltantes;
  }
}

/** El documento depende de otro que la DIAN aún no ha aceptado (p. ej. la factura de una nota): esperar. */
export class DependenciaPendienteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DependenciaPendienteError';
  }
}

// ─── Líneas ──────────────────────────────────────────────────────────────────

export interface LineaDocumento {
  product_id?: number | null;
  code_reference?: string | null;
  description?: string | null;
  qty: number | string | null;
  unit_price: number | string | null;
  tax_rate?: number | string | null;
  tax_code?: string | null;
  tax_included?: boolean | null;
  discount_amount?: number | string | null;
  discount_rate?: number | string | null;
  unit_measure_id?: number | null;
  standard_code_id?: number | null;
  is_excluded?: number | null;
  withholding_taxes?: Array<{ code?: string; rate?: number | string; withholding_tax_rate?: number | string }> | null;
  note?: string | null;
}

export interface LineaFactus {
  item: FactusItem;
  /** Total de la línea tal como lo calcula Factus (base − descuento + impuesto). */
  total: number;
}

/**
 * Código de impuesto/retención de la línea para Factus. Un código que la DIAN no
 * admite es un dato a corregir (no se reintenta solo): DatosIncompletosError.
 */
function codigoTributo<T>(fn: () => T, indice: number): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof CodigoTributoNoAdmitidoError) throw new DatosIncompletosError([`línea ${indice + 1}: ${err.message}`]);
    throw err;
  }
}

export function mapearLinea(linea: LineaDocumento, indice: number): LineaFactus {
  const cantidad = Math.abs(num(linea.qty));
  const tasa = Math.max(0, num(linea.tax_rate));
  // Excluido de IVA: la marca de la línea (invoice_items.is_excluded, que pone
  // la base desde el impuesto del producto) o el código de plantilla IVA_EXCLUIDO.
  const excluido = linea.is_excluded === 1 || (linea.tax_code ?? '').trim().toUpperCase() === 'IVA_EXCLUIDO';
  const factor = linea.tax_included && tasa > 0 && !excluido ? 1 + tasa / 100 : 1;
  const precio = redondear2(Math.abs(num(linea.unit_price)) / factor);
  const bruto = redondear2(cantidad * precio);

  const descuentoValor = Math.abs(num(linea.discount_amount));
  const descuentoTasa = Math.abs(num(linea.discount_rate));
  const descuentoNeto = descuentoValor > 0 ? descuentoValor / factor : descuentoTasa > 0 ? (bruto * descuentoTasa) / 100 : 0;
  const tasaDescuento = bruto > 0 ? Math.min(100, redondear2((descuentoNeto / bruto) * 100)) : 0;
  const descuento = redondear2((bruto * tasaDescuento) / 100);
  const base = redondear2(bruto - descuento);
  const impuesto = excluido ? 0 : redondear2((base * tasa) / 100);

  const item: FactusItem = {
    code_reference: (linea.code_reference || (linea.product_id ? `PROD-${linea.product_id}` : `ITEM-${indice + 1}`)).slice(0, 100),
    name: (linea.description || 'Producto').substring(0, 250),
    quantity: fijo(cantidad),
    price: fijo(precio),
    unit_measure_code: mapUnitMeasure(linea.unit_measure_id ?? null),
    standard_code: mapStandardCode(linea.standard_code_id ?? null),
    taxes: [{ code: codigoTributo(() => mapTaxCode(linea.tax_code), indice), rate: fijo(tasa), is_excluded: excluido }],
    withholding_taxes: (linea.withholding_taxes || [])
      .filter((wt) => !!wt?.code)
      .map((wt) => ({ code: codigoTributo(() => mapWithholdingCode(String(wt.code)), indice), rate: fijo(num(wt.rate ?? wt.withholding_tax_rate)) })),
  };
  if (tasaDescuento > 0) item.discount_rate = fijo(tasaDescuento);
  if (linea.note) item.note = linea.note;

  return { item, total: redondear2(base + impuesto) };
}

export function mapearLineas(lineas: LineaDocumento[]): { items: FactusItem[]; total: number } {
  const mapeadas = lineas.map((l, i) => mapearLinea(l, i));
  return {
    items: mapeadas.map((m) => m.item),
    total: redondear2(mapeadas.reduce((acc, m) => acc + m.total, 0)),
  };
}

// ─── Cliente ─────────────────────────────────────────────────────────────────

export const CONSUMIDOR_FINAL = '222222222222';

export interface ClienteDocumento {
  identification_type?: string | null;
  identification_number?: string | null;
  dv?: number | string | null;
  company_name?: string | null;
  trade_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  customer_type?: string | null;
  legal_organization_id?: number | null;
  tribute_id?: number | null;
  fiscal_responsibilities?: string[] | null;
}

/**
 * Adquiriente del documento. `municipioCliente` es el código DANE del
 * municipio fiscal del cliente, o el del establecimiento como respaldo.
 */
export function mapearCliente(cliente: ClienteDocumento | null | undefined, municipioCliente: string): FactusCustomer {
  const identificacion = (cliente?.identification_number || '').trim();
  const responsabilidades = (cliente?.fiscal_responsibilities || []).filter((r) => typeof r === 'string' && r.trim().length > 0);

  if (!cliente || !identificacion) {
    return {
      identification_document_code: '13',
      identification: CONSUMIDOR_FINAL,
      names: 'Consumidor final',
      address: (cliente?.address || '').trim() || 'No informado',
      ...(cliente?.email ? { email: cliente.email } : {}),
      legal_organization_code: '2',
      tribute_code: 'ZZ',
      country_code: 'CO',
      municipality_code: municipioCliente,
      responsibilities: ['R-99-PN'],
    };
  }

  const esEmpresa = cliente.customer_type === 'company' || cliente.customer_type === 'empresa' || cliente.legal_organization_id === 1;
  const nombres = `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim();
  return {
    identification_document_code: mapIdentificationType(cliente.identification_type || undefined),
    identification: identificacion,
    ...(cliente.dv !== null && cliente.dv !== undefined && String(cliente.dv) !== '' ? { dv: String(cliente.dv) } : {}),
    ...(esEmpresa && cliente.company_name ? { company: cliente.company_name } : {}),
    ...(cliente.trade_name ? { trade_name: cliente.trade_name } : {}),
    names: nombres || cliente.company_name || 'Cliente',
    address: (cliente.address || '').trim() || 'No informado',
    ...(cliente.email ? { email: cliente.email } : {}),
    ...(cliente.phone ? { phone: cliente.phone } : {}),
    legal_organization_code: esEmpresa ? '1' : '2',
    tribute_code: mapTribute(cliente.tribute_id ?? null),
    country_code: 'CO',
    municipality_code: municipioCliente,
    responsibilities: responsabilidades.length > 0 ? responsabilidades : ['R-99-PN'],
  };
}

// ─── Rango de numeración ─────────────────────────────────────────────────────

export interface RangoNumeracion {
  id: number;
  branch_id: number;
  document_type: string;
  prefix: string;
  is_active: boolean;
  factus_numbering_range_id: number | null;
  valid_from: string | null;
  valid_until: string | null;
}

export interface EleccionRango {
  rango: RangoNumeracion | null;
  aviso: string | null;
}

/**
 * Rango para emitir: activo, del tipo, con id de Factus y vigente en `hoy`
 * (día calendario de la organización). Primero los de la sucursal del
 * documento. Si hay más de uno, se usa el más reciente y se avisa —no se
 * rompe el envío—.
 */
export function elegirRango(
  rangos: RangoNumeracion[],
  criterio: { branchId: number | null; documentType: string; hoy: string },
): EleccionRango {
  const candidatos = rangos.filter(
    (r) =>
      r.is_active &&
      r.document_type === criterio.documentType &&
      !!r.factus_numbering_range_id &&
      (!r.valid_from || r.valid_from <= criterio.hoy) &&
      (!r.valid_until || r.valid_until >= criterio.hoy),
  );
  if (candidatos.length === 0) return { rango: null, aviso: null };

  const enSucursal = criterio.branchId === null ? [] : candidatos.filter((r) => r.branch_id === criterio.branchId);
  const grupo = (enSucursal.length > 0 ? enSucursal : candidatos).slice().sort((a, b) => b.id - a.id);
  const rango = grupo[0];

  const avisos: string[] = [];
  if (enSucursal.length === 0 && criterio.branchId !== null) {
    avisos.push('La sucursal no tiene un rango propio; se usó uno de otra sucursal de la organización.');
  }
  if (grupo.length > 1) {
    avisos.push(
      `Hay ${grupo.length} rangos activos para este tipo de documento (${grupo.map((r) => r.prefix).join(', ')}); se usó ${rango.prefix}. Desactive los que no correspondan.`,
    );
  }
  return { rango, aviso: avisos.length > 0 ? avisos.join(' ') : null };
}

// ─── Factura ─────────────────────────────────────────────────────────────────

export interface FacturaDocumento {
  document_type?: string | null;
  notes?: string | null;
  send_email?: boolean | null;
  payment_form?: string | null;
  payment_method_code?: string | null;
  payment_method?: string | null;
}

export function construirFactura(params: {
  factura: FacturaDocumento;
  lineas: LineaDocumento[];
  cliente: FactusCustomer;
  referencia: string;
  numberingRangeId: number;
  /** Solo si está completo; sin él Factus usa los datos de la empresa de la cuenta. */
  establecimiento?: FactusEstablishment;
  vencimiento?: string;
}): { payload: FactusInvoiceRequest; total: number } {
  const { factura } = params;
  if (params.lineas.length === 0) throw new DatosIncompletosError(['la factura no tiene líneas']);
  const { items, total } = mapearLineas(params.lineas);
  const formaPago = factura.payment_form || '1';
  const pago: FactusPaymentDetail = {
    payment_form: formaPago,
    payment_method_code: factura.payment_method_code || mapPaymentMethod(factura.payment_method || undefined),
    amount: fijo(total),
  };
  if (formaPago === '2' && params.vencimiento) pago.due_date = params.vencimiento;

  return {
    total,
    payload: {
      reference_code: params.referencia,
      document: mapDocumentType(factura.document_type || 'invoice'),
      numbering_range_id: params.numberingRangeId,
      operation_type: '10',
      observation: (factura.notes || '').slice(0, 250),
      send_email: factura.send_email ?? true,
      payment_details: [pago],
      ...(params.establecimiento ? { establishment: params.establecimiento } : {}),
      customer: params.cliente,
      items,
    },
  };
}

// ─── Nota crédito ────────────────────────────────────────────────────────────

export const CONCEPTOS_NOTA_CREDITO = ['1', '2', '3', '4', '5'] as const;
export type ConceptoNotaCredito = (typeof CONCEPTOS_NOTA_CREDITO)[number];

/**
 * Concepto DIAN de la nota crédito cuando no se indica: si acredita el total
 * de la factura es anulación (2); si devuelve productos, devolución parcial
 * (1); si es por valor, rebaja o descuento (3).
 */
export function conceptoNotaCredito(params: { totalNota: number; totalFactura: number; conProductos: boolean }): ConceptoNotaCredito {
  if (params.totalFactura > 0 && redondear2(Math.abs(params.totalNota)) >= redondear2(Math.abs(params.totalFactura))) return '2';
  return params.conProductos ? '1' : '3';
}

export function construirNotaCredito(params: {
  lineas: LineaDocumento[];
  cliente: FactusCustomer;
  referencia: string;
  numberingRangeId: number | null;
  numeroFacturaDian: string;
  concepto: ConceptoNotaCredito;
  observacion: string;
  formaPago?: string | null;
  metodoPago: string;
  enviarCorreo?: boolean;
}): { payload: FactusCreditNoteRequest; total: number } {
  if (params.lineas.length === 0) throw new DatosIncompletosError(['la nota crédito no tiene líneas']);
  if (!params.numeroFacturaDian) throw new DatosIncompletosError(['la factura original no tiene número DIAN']);
  const { items, total } = mapearLineas(params.lineas);
  return {
    total,
    payload: {
      reference_code: params.referencia,
      ...(params.numberingRangeId ? { numbering_range_id: params.numberingRangeId } : {}),
      correction_concept_code: params.concepto,
      customization_id: '20',
      bill_number: params.numeroFacturaDian,
      observation: (params.observacion || '').slice(0, 250),
      send_email: params.enviarCorreo ?? true,
      payment_details: [{ payment_form: params.formaPago || '1', payment_method_code: params.metodoPago, amount: fijo(total) }],
      customer: params.cliente,
      items,
    },
  };
}

// ─── Documento soporte ───────────────────────────────────────────────────────

export interface DocumentoSoporteFila {
  reference_code: string;
  created_time?: string | null;
  observation?: string | null;
  payment_details?: FactusPaymentDetail[] | null;
  cash_rounding_amount?: number | string | null;
  establishment?: FactusEstablishment | null;
  total?: number | string | null;
  provider: Record<string, unknown> | null;
}

export function construirDocumentoSoporte(params: {
  documento: DocumentoSoporteFila;
  lineas: LineaDocumento[];
  numberingRangeId: number | null;
  establecimiento?: FactusEstablishment;
}): FactusSupportDocumentRequest {
  const sd = params.documento;
  if (params.lineas.length === 0) throw new DatosIncompletosError(['el documento soporte no tiene líneas']);
  const p = (sd.provider || {}) as Record<string, unknown>;
  const s = (k: string) => (p[k] === null || p[k] === undefined || p[k] === '' ? undefined : String(p[k]));
  if (!s('identification')) throw new DatosIncompletosError(['el proveedor no tiene identificación']);
  const { items } = mapearLineas(params.lineas);

  return {
    reference_code: sd.reference_code,
    ...(params.numberingRangeId ? { numbering_range_id: params.numberingRangeId } : {}),
    ...(sd.created_time ? { created_time: sd.created_time } : {}),
    observation: sd.observation || '',
    payment_details:
      sd.payment_details && sd.payment_details.length > 0
        ? sd.payment_details
        : [{ payment_form: '1', payment_method_code: '10', amount: fijo(num(sd.total)) }],
    cash_rounding_amount: fijo(num(sd.cash_rounding_amount)),
    ...(sd.establishment || params.establecimiento ? { establishment: (sd.establishment || params.establecimiento) as FactusEstablishment } : {}),
    provider: {
      identification_document_code: s('identification_document_code') || '31',
      identification: s('identification') as string,
      ...(s('dv') ? { dv: s('dv') } : {}),
      ...(s('trade_name') ? { trade_name: s('trade_name') } : {}),
      names: s('names') || 'Proveedor',
      address: s('address') || '',
      country_code: s('country_code') || 'CO',
      ...(s('municipality_code') ? { municipality_code: s('municipality_code') } : {}),
      ...(s('email') ? { email: s('email') } : {}),
      ...(s('phone') ? { phone: s('phone') } : {}),
      ...(s('legal_organization_code') ? { legal_organization_code: s('legal_organization_code') } : {}),
    },
    items: items.map((it) => ({
      code_reference: it.code_reference,
      name: it.name,
      quantity: it.quantity,
      price: it.price,
      unit_measure_code: it.unit_measure_code,
      standard_code: it.standard_code,
      taxes: it.taxes,
      ...(it.discount_rate ? { discount_rate: it.discount_rate } : {}),
      ...(it.withholding_taxes && it.withholding_taxes.length > 0 ? { withholding_taxes: it.withholding_taxes } : {}),
      ...(it.note ? { note: it.note } : {}),
    })),
  };
}
