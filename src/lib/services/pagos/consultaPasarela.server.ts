/**
 * Consulta de cobros en las pasarelas de pago. SOLO SERVIDOR y SOLO LECTURA.
 *
 * Nunca escribe en la pasarela (ni crea, ni anula, ni reembolsa) ni toca credenciales: las lee con
 * los servicios que ya existen (`wompiService.getCredentials`, `boldService.getTransactionStatus`).
 * Quien llama ya validó que la conexión es de la organización de la sesión.
 *
 * - Wompi (`wompi_co`): `GET /transactions/{id}` (getTransaction) o `GET /transactions?reference=`
 *   con la llave privada.
 * - Bold (`bold_link`, `bold_pos`): `getTransactionStatus` (comprobante por id).
 * - PayU, Mercado Pago, PayPal y Stripe: sin consulta todavía (`no_soportada`). Para agregar una,
 *   se implementa su `consultar` aquí.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { wompiService } from '@/lib/services/integrations/wompi/wompiService';
import { getWompiBaseUrl } from '@/lib/services/integrations/wompi/wompiConfig';
import type { WompiCredentials } from '@/lib/services/integrations/wompi/wompiTypes';
import { boldService } from '@/lib/services/integrations/bold';

/** Conectores de cobro que se listan como pasarelas de la organización. */
export const CONECTORES_PAGO = ['wompi_co', 'bold_link', 'bold_pos', 'payu_co', 'mp_checkout', 'paypal_checkout', 'stripe_payments'] as const;
export type ConectorPago = (typeof CONECTORES_PAGO)[number];

/** Los que hoy se pueden consultar; los demás quedan como stubs. */
export const CONECTORES_CONSULTABLES: readonly ConectorPago[] = ['wompi_co', 'bold_link', 'bold_pos'];

export const NOMBRE_PASARELA: Record<ConectorPago, string> = {
  wompi_co: 'Wompi',
  bold_link: 'Bold (link)',
  bold_pos: 'Bold (datáfono)',
  payu_co: 'PayU',
  mp_checkout: 'Mercado Pago',
  paypal_checkout: 'PayPal',
  stripe_payments: 'Stripe',
};

export interface ConexionPago {
  id: string;
  connectorCode: ConectorPago;
  nombre: string;
  environment: string;
  consultable: boolean;
}

export type EstadoCobro = 'aprobada' | 'rechazada' | 'pendiente' | 'no_encontrada' | 'no_soportada' | 'sin_credenciales' | 'error';

export interface CobroPasarela {
  estado: EstadoCobro;
  proveedor: ConectorPago;
  transaccionId: string | null;
  referencia: string | null;
  montoCentavos: number | null;
  moneda: string | null;
  /** ISO: cuándo se aprobó (o se creó, si la pasarela no lo dice). */
  fecha: string | null;
  /** Wompi: id del link de pago que originó el cobro. */
  paymentLinkId: string | null;
  /** Método de la pasarela en minúsculas (card, nequi, pse, bancolombia_transfer…). */
  metodo: string | null;
  estadoPasarela: string | null;
}

export interface CriterioCobro {
  transaccionId?: string | null;
  referencia?: string | null;
}

/** Dependencias (para las pruebas: nunca se llama a una API real). */
export interface DepsConsulta {
  wompiCredenciales: (connectionId: string, db: SupabaseClient) => Promise<WompiCredentials | null>;
  wompiTransaccion: (creds: WompiCredentials, id: string) => Promise<unknown>;
  wompiPorReferencia: (creds: WompiCredentials, referencia: string) => Promise<unknown>;
  boldTransaccion: (connectionId: string, id: string) => Promise<unknown>;
}

async function wompiPorReferenciaHttp(creds: WompiCredentials, referencia: string): Promise<unknown> {
  const res = await fetch(`${getWompiBaseUrl(creds.environment)}/transactions?reference=${encodeURIComponent(referencia)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${creds.privateKey}` },
    cache: 'no-store',
  });
  if (res.status === 404) return { data: [] };
  if (!res.ok) throw new Error(`Wompi respondió ${res.status}`);
  return res.json();
}

export const DEPS_REALES: DepsConsulta = {
  wompiCredenciales: (id, db) => wompiService.getCredentials(id, db),
  wompiTransaccion: (creds, id) => wompiService.getTransaction(creds, id),
  wompiPorReferencia: wompiPorReferenciaHttp,
  boldTransaccion: (id, tx) => boldService.getTransactionStatus(id, tx),
};

type Fila = Record<string, unknown>;

const vacio = (proveedor: ConectorPago, estado: EstadoCobro, extra: Partial<CobroPasarela> = {}): CobroPasarela => ({
  estado,
  proveedor,
  transaccionId: null,
  referencia: null,
  montoCentavos: null,
  moneda: null,
  fecha: null,
  paymentLinkId: null,
  metodo: null,
  estadoPasarela: null,
  ...extra,
});

function estadoWompi(s: string): EstadoCobro {
  if (s === 'APPROVED') return 'aprobada';
  if (s === 'PENDING') return 'pendiente';
  return 'rechazada';
}

/** Transacción de Wompi (objeto `data` de la API o `data.transaction` del evento) → cobro. */
export function cobroDeWompi(tx: Fila): CobroPasarela {
  const st = String(tx.status ?? '');
  return {
    estado: estadoWompi(st),
    proveedor: 'wompi_co',
    transaccionId: tx.id ? String(tx.id) : null,
    referencia: tx.reference ? String(tx.reference) : null,
    montoCentavos: Number.isFinite(Number(tx.amount_in_cents)) ? Number(tx.amount_in_cents) : null,
    moneda: tx.currency ? String(tx.currency).toUpperCase() : null,
    fecha: (tx.finalized_at as string | undefined) ?? (tx.created_at as string | undefined) ?? null,
    paymentLinkId: tx.payment_link_id ? String(tx.payment_link_id) : null,
    metodo: tx.payment_method_type ? String(tx.payment_method_type).toLowerCase() : null,
    estadoPasarela: st || null,
  };
}

/** Comprobante de Bold → cobro. `amount.total` viene en pesos. */
export function cobroDeBold(tx: Fila, proveedor: ConectorPago = 'bold_link'): CobroPasarela {
  const st = String(tx.status ?? '');
  const monto = tx.amount as Fila | number | undefined;
  const total = typeof monto === 'number' ? monto : Number((monto as Fila | undefined)?.total);
  const moneda = typeof monto === 'object' && monto ? (monto.currency as string | undefined) : (tx.currency as string | undefined);
  return {
    estado: st === 'APPROVED' ? 'aprobada' : st === 'PENDING' || st === 'PROCESSING' ? 'pendiente' : 'rechazada',
    proveedor,
    transaccionId: tx.id ? String(tx.id) : null,
    referencia: tx.reference ? String(tx.reference) : null,
    montoCentavos: Number.isFinite(total) ? Math.round(total * 100) : null,
    moneda: moneda ? String(moneda).toUpperCase() : null,
    fecha: (tx.paid_at as string | undefined) ?? (tx.created_at as string | undefined) ?? null,
    paymentLinkId: null,
    metodo: tx.payment_method ? String(tx.payment_method).toLowerCase() : null,
    estadoPasarela: st || null,
  };
}

/** Elige la transacción de una búsqueda por referencia: la aprobada; si no, la más reciente. */
function elegirDeLista(lista: Fila[]): Fila | null {
  if (lista.length === 0) return null;
  const aprobada = lista.find((t) => t.status === 'APPROVED');
  if (aprobada) return aprobada;
  return [...lista].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
}

/**
 * Busca un cobro por id de transacción o por referencia. Nunca lanza: los fallos vuelven como
 * `estado` ('error', 'sin_credenciales', 'no_encontrada', 'no_soportada').
 */
export async function consultarCobro(
  db: SupabaseClient,
  conexion: Pick<ConexionPago, 'id' | 'connectorCode'>,
  criterio: CriterioCobro,
  deps: DepsConsulta = DEPS_REALES,
): Promise<CobroPasarela> {
  const proveedor = conexion.connectorCode;
  const id = String(criterio.transaccionId ?? '').trim();
  const ref = String(criterio.referencia ?? '').trim();
  if (!id && !ref) return vacio(proveedor, 'no_encontrada');
  try {
    if (proveedor === 'wompi_co') {
      const creds = await deps.wompiCredenciales(conexion.id, db);
      if (!creds?.privateKey) return vacio(proveedor, 'sin_credenciales');
      if (id) {
        const r = (await deps.wompiTransaccion(creds, id)) as { data?: Fila } | null;
        if (r?.data) return cobroDeWompi(r.data);
        if (!ref) return vacio(proveedor, 'no_encontrada', { transaccionId: id });
      }
      const lista = (await deps.wompiPorReferencia(creds, ref)) as { data?: Fila[] } | null;
      const tx = elegirDeLista(Array.isArray(lista?.data) ? lista!.data : []);
      return tx ? cobroDeWompi(tx) : vacio(proveedor, 'no_encontrada', { referencia: ref });
    }
    if (proveedor === 'bold_link' || proveedor === 'bold_pos') {
      // Bold consulta por id del comprobante; sin id no hay búsqueda por referencia.
      if (!id) return vacio(proveedor, 'no_soportada', { referencia: ref });
      const r = (await deps.boldTransaccion(conexion.id, id)) as Fila | null;
      return r && r.id ? cobroDeBold(r, proveedor) : vacio(proveedor, 'no_encontrada', { transaccionId: id });
    }
    return vacio(proveedor, 'no_soportada', { transaccionId: id || null, referencia: ref || null });
  } catch (e) {
    console.error('[consultaPasarela] error consultando', proveedor, e instanceof Error ? e.message : e);
    return vacio(proveedor, 'error');
  }
}

/** Conexiones de pago `connected` de la organización (la del contexto, nunca del body). */
export async function pasarelasConectadas(db: SupabaseClient, organizationId: number): Promise<ConexionPago[]> {
  const { data: conectores, error: e1 } = await db.from('integration_connectors').select('id, code').in('code', CONECTORES_PAGO as unknown as string[]);
  if (e1) throw new Error(`integration_connectors: ${e1.message}`);
  const codigo = new Map(((conectores as Fila[] | null) ?? []).map((c) => [String(c.id), String(c.code) as ConectorPago]));
  if (codigo.size === 0) return [];
  const { data, error } = await db
    .from('integration_connections')
    .select('id, connector_id, name, environment, status')
    .eq('organization_id', organizationId)
    .eq('status', 'connected')
    .in('connector_id', Array.from(codigo.keys()));
  if (error) throw new Error(`integration_connections: ${error.message}`);
  return ((data as Fila[] | null) ?? []).map((c) => {
    const connectorCode = codigo.get(String(c.connector_id))!;
    return {
      id: String(c.id),
      connectorCode,
      nombre: String(c.name ?? NOMBRE_PASARELA[connectorCode]),
      environment: String(c.environment ?? 'production'),
      consultable: CONECTORES_CONSULTABLES.includes(connectorCode),
    };
  });
}

/**
 * Cobro registrado por un webhook en `integration_events` (payload tal como llegó) → cobro.
 * Wompi: `data.transaction`. Bold (CloudEvents): `data` con `payment_id`, `amount.total`,
 * `metadata.reference`. Lo que no se reconoce: null.
 */
export function cobroDeEvento(proveedor: ConectorPago, payload: Fila): CobroPasarela | null {
  const data = (payload?.data ?? null) as Fila | null;
  if (!data) return null;
  if (proveedor === 'wompi_co') {
    const tx = data.transaction as Fila | undefined;
    return tx ? cobroDeWompi(tx) : null;
  }
  if (proveedor === 'bold_link' || proveedor === 'bold_pos') {
    const tipo = String(payload.type ?? '');
    const meta = (data.metadata ?? {}) as Fila;
    const c = cobroDeBold(
      {
        id: data.payment_id ?? data.id,
        status: tipo === 'SALE_APPROVED' ? 'APPROVED' : tipo === 'SALE_REJECTED' ? 'REJECTED' : String(data.status ?? ''),
        amount: data.amount,
        reference: meta.reference ?? data.reference,
        created_at: data.created_at ?? payload.time,
        payment_method: data.payment_method,
      },
      proveedor,
    );
    return c.transaccionId ? c : null;
  }
  return null;
}
