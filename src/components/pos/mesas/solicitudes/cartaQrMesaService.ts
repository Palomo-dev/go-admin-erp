/**
 * Lo que la Carta QR deja en la cuenta de una mesa, para POS › Mesas › la mesa:
 * - pagos en línea (abonos con la pasarela que descuentan el saldo),
 * - intentos de pago en curso o pagados sin aplicar (`table_online_payments`),
 * - las valoraciones de la visita (`table_visit_feedback`),
 * - quién pidió cada ronda (`web_orders.diner_label`).
 *
 * Solo lectura, con la sesión del usuario (RLS por pertenencia). Cada consulta
 * tolera que la migración de la Carta QR no esté aplicada: sin la tabla o la
 * columna devuelve vacío y la cuenta se ve como siempre.
 */
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import {
  aIntentoPagoEnLinea,
  aPagoEnLinea,
  aValoracion,
  type FilaIntentoPago,
  type FilaPagoEnLinea,
  type FilaValoracion,
  type IntentoPagoEnLinea,
  type PagoEnLinea,
  type ValoracionMesa,
} from './cartaQrMesaLogica';

function faltaEsquema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return ['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST202'].includes(error.code ?? '') || /does not exist|could not find/i.test(error.message ?? '');
}

export interface CartaQrDeLaMesa {
  pagos: PagoEnLinea[];
  intentos: IntentoPagoEnLinea[];
  valoraciones: ValoracionMesa[];
  /** order_number del pedido web → quién lo pidió. */
  comensales: Map<string, string>;
}

export const CARTA_QR_VACIA: CartaQrDeLaMesa = { pagos: [], intentos: [], valoraciones: [], comensales: new Map() };

async function pagosEnLinea(organizationId: number, saleId: string): Promise<PagoEnLinea[]> {
  const { data: facturas, error: e1 } = await supabase
    .from('invoice_sales')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('sale_id', saleId);
  if (e1) {
    if (faltaEsquema(e1)) return [];
    throw e1;
  }
  const ids = (facturas ?? []).map((f: { id: string }) => String(f.id));
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('payments')
    .select('id, amount, change_amount, method, reference, status, created_at, processor_response')
    .eq('organization_id', organizationId)
    .eq('source', 'invoice_sales')
    .in('source_id', ids)
    .eq('processor_response->>origen', 'carta_qr')
    .order('created_at', { ascending: true });
  if (error) {
    if (faltaEsquema(error)) return [];
    throw error;
  }
  return ((data ?? []) as FilaPagoEnLinea[]).map(aPagoEnLinea);
}

async function intentosDePago(organizationId: number, sesionId: string): Promise<IntentoPagoEnLinea[]> {
  const { data, error } = await supabase
    .from('table_online_payments')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('table_session_id', sesionId)
    .in('status', ['pending', 'paid_unapplied'])
    .order('created_at', { ascending: true });
  if (error) {
    if (faltaEsquema(error)) return [];
    throw error;
  }
  return ((data ?? []) as FilaIntentoPago[]).map(aIntentoPagoEnLinea);
}

/** Valoraciones de la visita (`table_visit_feedback`): una por comensal que valoró. */
async function valoraciones(organizationId: number, sesionId: string): Promise<ValoracionMesa[]> {
  const { data, error } = await supabase
    .from('table_visit_feedback')
    .select('id, rating, aspects, comment, diner_label, created_at')
    .eq('organization_id', organizationId)
    .eq('table_session_id', sesionId)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) {
    if (faltaEsquema(error)) return [];
    throw error;
  }
  return ((data ?? []) as FilaValoracion[]).map(aValoracion);
}

async function comensales(organizationId: number, sesionId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('web_orders')
    .select('order_number, diner_label')
    .eq('organization_id', organizationId)
    .eq('table_session_id', sesionId);
  if (error) {
    if (faltaEsquema(error)) return new Map();
    throw error;
  }
  const mapa = new Map<string, string>();
  for (const f of (data ?? []) as Array<{ order_number: string | null; diner_label: string | null }>) {
    const nombre = (f.diner_label ?? '').trim();
    if (f.order_number && nombre) mapa.set(String(f.order_number), nombre.slice(0, 40));
  }
  return mapa;
}

/** Todo lo de la Carta QR de una cuenta abierta. Un fallo no tumba la cuenta: deja ese dato vacío. */
export async function cargarCartaQrDeLaMesa(sesionId: string | null, saleId: string | null): Promise<CartaQrDeLaMesa> {
  if (!sesionId) return CARTA_QR_VACIA;
  const organizationId = getOrganizationId();
  const seguro = async <T>(p: Promise<T>, vacio: T): Promise<T> => {
    try {
      return await p;
    } catch (error) {
      console.error('Carta QR en la cuenta de la mesa:', error);
      return vacio;
    }
  };
  const [pagos, intentos, vals, mapa] = await Promise.all([
    saleId ? seguro(pagosEnLinea(organizationId, saleId), [] as PagoEnLinea[]) : Promise.resolve([] as PagoEnLinea[]),
    seguro(intentosDePago(organizationId, sesionId), [] as IntentoPagoEnLinea[]),
    seguro(valoraciones(organizationId, sesionId), [] as ValoracionMesa[]),
    seguro(comensales(organizationId, sesionId), new Map<string, string>()),
  ]);
  return { pagos, intentos, valoraciones: vals, comensales: mapa };
}

let canales = 0;

/**
 * Tiempo real de los pagos en línea de una cuenta (`table_online_payments`):
 * cuando uno cambia de estado, la cuenta se recarga (el saldo baja solo).
 * Sin la tabla, el canal no recibe nada.
 */
export function suscribirPagosEnLinea(sesionId: string, alCambiar: () => void): () => void {
  canales += 1;
  const canal = supabase
    .channel(`table_online_payments_${sesionId}_${canales}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'table_online_payments', filter: `table_session_id=eq.${sesionId}` }, () => alCambiar())
    .subscribe();
  return () => {
    void supabase.removeChannel(canal);
  };
}

/** Valoraciones de la visita de una cuenta de mesa (ficha del pedido web «Comer aquí»). */
export async function cargarValoracionesDeSesion(sesionId: string): Promise<ValoracionMesa[]> {
  try {
    return await valoraciones(getOrganizationId(), sesionId);
  } catch (error) {
    console.error('Valoraciones de la mesa:', error);
    return [];
  }
}
