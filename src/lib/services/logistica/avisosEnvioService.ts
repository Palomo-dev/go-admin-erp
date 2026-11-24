/**
 * Datos del envío para los avisos al cliente «en camino», «entregado» y «novedad» (logística
 * Fase 1, Figma 2805:5220). SOLO servidor: lee el código de entrega, que solo ve el service role.
 *
 * Reglas:
 * - Domiciliario: solo el primer nombre.
 * - Código de entrega: solo en «en camino», solo si el envío es contraentrega propia
 *   (`delivery_code_required`) y aún no se verificó.
 * - «Pagas al recibir»: el `cod_amount` del envío en la moneda del pedido (nunca un valor del
 *   navegador).
 *
 * Recibe el cliente de quien llama (`getSupabaseAdmin` en la ruta, tras validar la organización).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatosAviso, MomentoAviso } from '@/lib/pos/pedidosWeb/avisosCliente';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import { crearFormateadorMoneda } from '@/lib/utils/moneda';

export interface EnvioDelPedido {
  id: string;
  driverId: string | null;
  codRequerido: boolean;
  codMonto: number;
  moneda: string | null;
  medioCobro: string | null;
  motivo: string | null;
  fechaEstimada: string | null;
}

const MEDIO_COBRO: Record<string, string> = { cash: 'efectivo', card: 'datáfono', transfer: 'transferencia', qr: 'QR' };

/** «Andrés Felipe Gómez» → «Andrés». */
export function primerNombre(nombre: string | null | undefined): string | null {
  const n = (nombre ?? '').trim().split(/\s+/)[0];
  return n ? n : null;
}

export async function envioDelPedidoWeb(db: SupabaseClient, organizationId: number, orderId: string): Promise<EnvioDelPedido | null> {
  const { data } = await db
    .from('shipments')
    .select('id, driver_id, delivery_code_required, cod_amount, currency, cod_collected_method, exception_reason, expected_delivery_date')
    .eq('organization_id', organizationId)
    .eq('source_type', 'web_order')
    .eq('source_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const s = data as Record<string, unknown>;
  return {
    id: String(s.id),
    driverId: (s.driver_id as string | null) ?? null,
    codRequerido: s.delivery_code_required === true,
    codMonto: Number(s.cod_amount ?? 0) || 0,
    moneda: (s.currency as string | null) ?? null,
    medioCobro: (s.cod_collected_method as string | null) ?? null,
    motivo: (s.exception_reason as string | null) ?? null,
    fechaEstimada: (s.expected_delivery_date as string | null) ?? null,
  };
}

/** Lo que agrega el envío al aviso de «en camino» o «entregado». Sin envío: nada. */
export async function datosEnvioParaAviso(
  db: SupabaseClient,
  organizationId: number,
  orderId: string,
  momento: MomentoAviso,
): Promise<Partial<DatosAviso>> {
  if (momento !== 'en_camino' && momento !== 'entregado') return {};
  const envio = await envioDelPedidoWeb(db, organizationId, orderId);
  if (!envio) return {};
  const extra: Partial<DatosAviso> = {};

  if (envio.driverId) {
    const { data } = await db.from('driver_credentials').select('full_name').eq('id', envio.driverId).eq('organization_id', organizationId).maybeSingle();
    const nombre = primerNombre((data as { full_name?: string | null } | null)?.full_name);
    if (nombre) extra.conductor = nombre;
  }

  if (envio.codMonto > 0) {
    const moneda = await resolverContextoMoneda(db, organizationId, envio.moneda);
    extra.pagaAlRecibir = crearFormateadorMoneda(moneda)(envio.codMonto);
  }

  if (momento === 'en_camino' && envio.codRequerido) {
    const { data } = await db.from('shipment_delivery_codes').select('code, verified_at').eq('shipment_id', envio.id).maybeSingle();
    const fila = data as { code?: string | null; verified_at?: string | null } | null;
    if (fila?.code && !fila.verified_at) extra.codigoEntrega = fila.code;
  }

  if (momento === 'entregado') {
    const { data } = await db.from('proof_of_delivery').select('recipient_name').eq('shipment_id', envio.id).order('delivered_at', { ascending: false }).limit(1).maybeSingle();
    const recibio = primerNombre((data as { recipient_name?: string | null } | null)?.recipient_name);
    if (recibio) extra.recibio = recibio;
    if (envio.medioCobro && extra.pagaAlRecibir) extra.medioCobro = MEDIO_COBRO[envio.medioCobro] ?? null;
  }
  return extra;
}
