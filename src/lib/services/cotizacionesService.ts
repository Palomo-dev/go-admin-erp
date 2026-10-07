/**
 * Cotizaciones — cliente del navegador. Ya no escribe en la base: cada acción
 * es un `fetch` a `/api/cotizaciones/**`, que resuelve la organización de la
 * sesión, exige el permiso en el servidor y escribe por RPC transaccional
 * (número, totales, transiciones y conversión en la base). Ver
 * `contratoCotizaciones.ts` y la migración 20260928172526.
 *
 * Lo único que sigue en el navegador es lo mismo que hace el formulario de
 * facturas antes de guardar: evaluar las promociones del canal Finanzas.
 */
import { promotionEngine } from '@/lib/services/promotionEngine';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  CotizacionDetalle,
  CotizacionResumen,
  DatosCotizacion,
  EstadoCotizacion,
  ResultadoConversion,
  ResultadoGuardarCotizacion,
} from '@/lib/finanzas/ventas/contratoCotizaciones';

export type QuotationStatus = EstadoCotizacion;

export interface QuotationItem {
  id?: string;
  quotation_id?: string;
  product_id?: number | null;
  description: string;
  qty: number;
  unit_price: number;
  discount_amount?: number;
  tax_code?: string | null;
  tax_rate?: number;
  tax_included: boolean;
  total_line: number;
}

/** Cotización como la entrega el servidor: `status` es el estado VIVO ('expired' derivado al leer). */
export type Quotation = Omit<CotizacionDetalle, 'quotation_items' | 'notes' | 'terms_conditions' | 'tax_included' | 'converted_invoice_number'> & {
  notes?: string | null;
  terms_conditions?: string | null;
  tax_included?: boolean;
  converted_invoice_number?: string | null;
  quotation_items?: QuotationItem[];
};

export interface QuotationFilters {
  busqueda?: string;
  status?: QuotationStatus | 'todos';
  fechaInicio?: string;
  fechaFin?: string;
  customer_id?: string;
}

/**
 * Impuestos marcados en el documento (ImpuestosFactura). Viajan al servidor
 * para que una línea sin tarifa propia tome la del documento, igual que en la
 * factura.
 */
export interface QuotationTaxContext {
  appliedTaxes?: { [key: string]: boolean };
  appliedTaxTotals?: { [key: string]: { rate: number; base: number; amount: number; name: string; included: boolean } };
}

/** Cabecera que envía el formulario (sin organización, número ni totales). */
export type QuotationInput = Omit<DatosCotizacion, 'items' | 'applied_taxes'>;

/** Error de una ruta: `codigo` estable y `message` ya en el idioma del usuario. */
export class ErrorPeticionCotizacion extends Error {
  constructor(
    public readonly codigo: string,
    public readonly estado: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

function cabeceras(json = false): HeadersInit {
  const org = getOrganizationId();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
  };
}

async function pedir<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init, headers: cabeceras(init.body !== undefined) });
  const cuerpo = (await r.json().catch(() => null)) as ({ error?: string; codigo?: string } & Record<string, unknown>) | null;
  if (!r.ok) {
    const codigo = cuerpo?.codigo ?? 'error_desconocido';
    throw new ErrorPeticionCotizacion(codigo, r.status, cuerpo?.error ?? codigo);
  }
  return cuerpo as T;
}

const url = (id: string, accion = '') => `/api/cotizaciones/${encodeURIComponent(id)}${accion ? `/${accion}` : ''}`;

function aplicados(ctx: QuotationTaxContext): DatosCotizacion['applied_taxes'] {
  const marcados = ctx.appliedTaxes ?? {};
  return Object.keys(marcados)
    .filter((k) => marcados[k])
    .map((k) => ({ tax_code: k, tax_rate: Number(ctx.appliedTaxTotals?.[k]?.rate) || 0 }));
}

function lineas(items: QuotationItem[]): DatosCotizacion['items'] {
  return items.map((it) => ({
    product_id: it.product_id ?? null,
    description: it.description,
    qty: Number(it.qty) || 0,
    unit_price: Number(it.unit_price) || 0,
    discount_amount: Number(it.discount_amount) || 0,
    tax_code: it.tax_code ?? null,
    tax_rate: Number(it.tax_rate) || 0,
    tax_included: it.tax_included,
  }));
}

function aQuotation(c: CotizacionResumen | CotizacionDetalle): Quotation {
  return c as Quotation;
}

export class CotizacionesService {
  static async listQuotations(_organizationId: number, filters?: QuotationFilters, branchId?: number | null): Promise<Quotation[]> {
    const q = new URLSearchParams();
    if (filters?.status && filters.status !== 'todos') q.set('estado', filters.status);
    if (filters?.busqueda?.trim()) q.set('busqueda', filters.busqueda.trim());
    if (filters?.fechaInicio) q.set('desde', filters.fechaInicio);
    if (filters?.fechaFin) q.set('hasta', filters.fechaFin);
    if (filters?.customer_id) q.set('customer_id', filters.customer_id);
    if (branchId != null) q.set('branch_id', String(branchId));
    const r = await pedir<{ cotizaciones: CotizacionResumen[] }>(`/api/cotizaciones${q.size ? `?${q}` : ''}`);
    return r.cotizaciones.map(aQuotation);
  }

  /** null si no existe o es de otra organización (404). */
  static async getQuotationById(id: string): Promise<Quotation | null> {
    try {
      return aQuotation((await pedir<{ cotizacion: CotizacionDetalle }>(url(id))).cotizacion);
    } catch (err) {
      if (err instanceof ErrorPeticionCotizacion && err.estado === 404) return null;
      throw err;
    }
  }

  /** Crea en el servidor; antes aplica las promociones del canal Finanzas, como el formulario de facturas. */
  static async createQuotation(datos: QuotationInput, items: QuotationItem[], taxContext: QuotationTaxContext = {}): Promise<ResultadoGuardarCotizacion> {
    let evaluados = items;
    try {
      // Categoría y producto padre los completa el motor desde `products`
      // (la línea de la cotización no los guarda): así aplican las promociones
      // por categoría y por variante.
      const promo = await promotionEngine.evaluate({
        channel: 'finances',
        items: items.map((it) => ({ product_id: it.product_id || 0, quantity: Number(it.qty) || 0, unit_price: Number(it.unit_price) || 0 })),
        organization_id: getOrganizationId(),
        branch_id: datos.branch_id ?? undefined,
      });
      if (promo.discountTotal > 0) {
        // El descuento de ESA línea (`lineDiscounts`): `itemDiscounts` suma por
        // producto y con el mismo producto en dos líneas descontaba doble.
        evaluados = items.map((it, idx) => {
          if (it.discount_amount) return it;
          const descuento = promo.lineDiscounts[idx] || 0;
          return descuento > 0 ? { ...it, discount_amount: descuento } : it;
        });
      }
    } catch (promoErr) {
      console.warn('[cotizacionesService] No se pudieron evaluar promociones:', promoErr);
    }
    const r = await pedir<{ resultado: ResultadoGuardarCotizacion }>('/api/cotizaciones', {
      method: 'POST',
      body: JSON.stringify({ ...datos, applied_taxes: aplicados(taxContext), items: lineas(evaluados) }),
    });
    return r.resultado;
  }

  /** Edita (solo borrador o enviada): cabecera completa y líneas; totales en la base. */
  static async updateQuotation(id: string, datos: QuotationInput, items: QuotationItem[], taxContext: QuotationTaxContext = {}): Promise<ResultadoGuardarCotizacion> {
    const r = await pedir<{ resultado: ResultadoGuardarCotizacion }>(url(id), {
      method: 'PUT',
      body: JSON.stringify({ ...datos, applied_taxes: aplicados(taxContext), items: lineas(items) }),
    });
    return r.resultado;
  }

  static async changeStatus(id: string, status: 'sent' | 'accepted' | 'rejected'): Promise<{ status: string; sinCambio: boolean }> {
    const r = await pedir<{ resultado: { status: string; sinCambio: boolean } }>(url(id, 'estado'), {
      method: 'POST',
      body: JSON.stringify({ estado: status }),
    });
    return r.resultado;
  }

  static async duplicateQuotation(id: string): Promise<{ id: string; number: string }> {
    const r = await pedir<{ resultado: { id: string; numero: string } }>(url(id, 'duplicar'), { method: 'POST', body: '{}' });
    return { id: r.resultado.id, number: r.resultado.numero };
  }

  /**
   * Convierte en factura BORRADOR en el servidor (venta ligada, impuestos,
   * comisión; se emite después). Sin sucursal, la de la cotización.
   */
  static async convertToInvoice(
    quotationId: string,
    opciones: { branchId?: number | null; opportunityId?: string | null } = {},
  ): Promise<ResultadoConversion> {
    const r = await pedir<{ resultado: ResultadoConversion }>(url(quotationId, 'convertir'), {
      method: 'POST',
      body: JSON.stringify({ branch_id: opciones.branchId ?? null, opportunity_id: opciones.opportunityId ?? null }),
    });
    return r.resultado;
  }

  /** Envía por correo con el PDF del motor de documentos; un borrador queda enviado. */
  static async sendByEmail(id: string, opciones: { para?: string; mensaje?: string } = {}): Promise<{ destino: string; adjunto: boolean; status: string }> {
    const r = await pedir<{ resultado: { destino: string; adjunto: boolean; status: string } }>(url(id, 'enviar'), {
      method: 'POST',
      body: JSON.stringify(opciones),
    });
    return r.resultado;
  }

  static async deleteQuotation(id: string): Promise<void> {
    await pedir(url(id), { method: 'DELETE' });
  }
}
