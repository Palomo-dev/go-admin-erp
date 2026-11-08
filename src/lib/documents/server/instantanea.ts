/**
 * Reimpresión fiel (ronda 2 del Contador, «responsabilidades históricas»): un
 * documento ya expedido se vuelve a imprimir con los datos ORIGINALES del emisor
 * y del receptor, coherentes con el XML emitido, no con la ficha ni con una
 * vigencia que alguien pudo corregir después.
 *
 * Orden de las fuentes (migración 20261108161500):
 *   1. `document_party_snapshots`: la instantánea tomada al expedir. Si el envío
 *      electrónico fue aceptado, su `receptor_xml` (el receptor tal como viajó)
 *      manda sobre el receptor de la instantánea.
 *   2. Sin instantánea (documentos anteriores a la migración): el envío aceptado
 *      guardado (`electronic_invoicing_jobs`): receptor del `request_payload` y,
 *      si la respuesta de Factus trae la empresa, el emisor.
 *   3. Si no hay nada: el emisor se arma con la vigencia de la fecha del
 *      documento (H2) y el documento se marca «reconstruido».
 * Solo servidor, con el cliente de la sesión (RLS) y la organización de la sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FilaCliente, FilaProveedor } from './base';

export type TipoInstantanea = 'factura_venta' | 'nota_credito' | 'nota_debito' | 'documento_soporte' | 'cotizacion' | 'recibo_pago';

/** De dónde salieron los datos de las partes. `emisorReconstruido` = el emisor NO es el original guardado. */
export interface PartesDocumento {
  origen: 'instantanea' | 'factus' | 'reconstruido';
  emisor: Record<string, unknown> | null;
  /** Receptor original (fila de cliente o de proveedor con las columnas de la tabla). */
  receptor: Record<string, unknown> | null;
  emisorReconstruido: boolean;
}

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const cadena = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

/** Receptor del payload de Factus (`mapearCliente` / proveedor del documento soporte) → fila de cliente o de proveedor. */
export function receptorDesdeXml(xml: unknown, rol: 'cliente' | 'proveedor'): Record<string, unknown> | null {
  const c = objeto(xml);
  if (!c || !cadena(c.identification)) return null;
  const nombre = cadena(c.company) ?? cadena(c.names);
  const responsabilidades = Array.isArray(c.responsibilities) ? c.responsibilities.filter((r): r is string => typeof r === 'string') : [];
  if (rol === 'proveedor') {
    const fila: FilaProveedor = {
      name: nombre,
      trade_name: cadena(c.trade_name),
      nit: cadena(c.identification),
      dv: cadena(c.dv),
      address: cadena(c.address),
      email: cadena(c.email),
      phone: cadena(c.phone),
      fiscal_responsibilities: responsabilidades,
    };
    return fila as Record<string, unknown>;
  }
  const fila: FilaCliente = {
    company_name: cadena(c.company),
    full_name: cadena(c.names),
    identification_number: cadena(c.identification),
    dv: c.dv === undefined || c.dv === null || c.dv === '' ? null : Number(c.dv),
    address: cadena(c.address),
    email: cadena(c.email),
    phone: cadena(c.phone),
    fiscal_responsibilities: responsabilidades,
    customer_type: cadena(c.legal_organization_code) === '1' ? 'company' : 'person',
  };
  return fila as Record<string, unknown>;
}

/** Empresa en la respuesta de Factus (si la trae): nombre, NIT y responsabilidades del emisor tal como quedaron. */
export function emisorDesdeRespuesta(respuesta: unknown): Record<string, unknown> | null {
  const r = objeto(respuesta);
  const empresa = objeto(objeto(r?.data)?.company) ?? objeto(r?.company);
  if (!empresa) return null;
  const nit = cadena(empresa.nit) ?? cadena(empresa.identification);
  const nombre = cadena(empresa.company) ?? cadena(empresa.name) ?? cadena(empresa.names);
  if (!nit || !nombre) return null;
  const responsabilidades = Array.isArray(empresa.responsibilities)
    ? empresa.responsibilities.map((x) => (typeof x === 'string' ? x : cadena(objeto(x)?.code))).filter((x): x is string => !!x)
    : null;
  return {
    legal_name: nombre,
    nit,
    dv: cadena(empresa.dv),
    address: cadena(empresa.address),
    phone: cadena(empresa.phone),
    email: cadena(empresa.email),
    ...(responsabilidades ? { fiscal_responsibilities: responsabilidades } : {}),
  };
}

const esInexistente = (e: { code?: string; message?: string } | null) =>
  !!e && (['PGRST205', 'PGRST202', '42P01', '42703'].includes(e.code ?? '') || /Could not find the table/i.test(e.message ?? ''));

const TIPO_ENVIO: Partial<Record<TipoInstantanea, 'invoice_id' | 'support_document_id'>> = {
  factura_venta: 'invoice_id',
  nota_credito: 'invoice_id',
  nota_debito: 'invoice_id',
  documento_soporte: 'support_document_id',
};

export async function leerPartesDocumento(db: SupabaseClient, organizationId: number, tipo: TipoInstantanea, id: string): Promise<PartesDocumento> {
  const rol = tipo === 'documento_soporte' ? 'proveedor' : 'cliente';
  const { data, error } = await db
    .from('document_party_snapshots')
    .select('emisor, receptor, receptor_xml')
    .eq('organization_id', organizationId)
    .eq('documento_tipo', tipo)
    .eq('documento_id', id)
    .maybeSingle();
  if (error && !esInexistente(error)) console.warn('[documentos] instantánea no disponible', { tipo, codigo: error.code ?? null });
  const fila = !error ? (data as { emisor: unknown; receptor: unknown; receptor_xml: unknown } | null) : null;
  if (fila && objeto(fila.emisor)) {
    return {
      origen: 'instantanea',
      emisor: objeto(fila.emisor),
      receptor: receptorDesdeXml(fila.receptor_xml, rol) ?? objeto(fila.receptor),
      emisorReconstruido: false,
    };
  }

  const columna = TIPO_ENVIO[tipo];
  if (columna) {
    const envio = await db
      .from('electronic_invoicing_jobs')
      .select('request_payload, response_payload')
      .eq('organization_id', organizationId)
      .eq(columna, id)
      .eq('status', 'accepted')
      .order('processed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const j = !envio.error ? (envio.data as { request_payload: unknown; response_payload: unknown } | null) : null;
    if (j) {
      const pedido = objeto(j.request_payload);
      const receptor = receptorDesdeXml(pedido?.customer ?? pedido?.provider, rol);
      const emisor = emisorDesdeRespuesta(j.response_payload);
      if (receptor || emisor) return { origen: 'factus', emisor, receptor, emisorReconstruido: !emisor };
    }
  }
  return { origen: 'reconstruido', emisor: null, receptor: null, emisorReconstruido: true };
}
