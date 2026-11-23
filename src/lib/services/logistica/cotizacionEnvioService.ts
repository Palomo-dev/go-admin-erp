/**
 * Cotizar envío (logística Fase 1): el ÚNICO cálculo del valor del domicilio.
 *
 * Envuelve `logistica_cotizar_envio` (migración 20261123145549). Lo usan:
 * - el POS y el pedido manual, con el cliente de la sesión (la RPC exige miembro activo);
 * - el checkout de la tienda (goadmin-websites), con service role y la organización resuelta por
 *   el host, nunca la del body.
 * El servidor recalcula siempre: el precio que muestre el navegador es informativo y la venta o el
 * pedido se guardan con lo que devuelva esta función en el servidor.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  direccionParaCotizar,
  leerCotizacion,
  type CanalCotizacion,
  type CotizacionEnvio,
  type DireccionCotizacion,
  type OpcionesCotizacion,
} from '@/lib/logistica/cotizacion';

export interface SolicitudCotizacion {
  organizationId: number;
  branchId: number | null;
  direccion: DireccionCotizacion;
  canal: CanalCotizacion;
  /** Subtotal de productos (sin domicilio), para mínimo y envío gratis. */
  subtotal: number;
  opciones?: OpcionesCotizacion;
}

export class CotizacionEnvioError extends Error {
  constructor(public readonly codigo: string, mensaje?: string) {
    super(mensaje ?? codigo);
    this.name = 'CotizacionEnvioError';
  }
}

const CODIGOS = ['CANAL_INVALIDO', 'SEDE_INVALIDA', 'ORGANIZACION_REQUERIDA'] as const;

export async function cotizarEnvio(client: SupabaseClient, s: SolicitudCotizacion): Promise<CotizacionEnvio> {
  const opciones: Record<string, string | number> = {};
  if (s.opciones?.metodo_pago) opciones.metodo_pago = s.opciones.metodo_pago;
  if (typeof s.opciones?.peso_kg === 'number' && Number.isFinite(s.opciones.peso_kg)) opciones.peso_kg = s.opciones.peso_kg;

  const { data, error } = await client.rpc('logistica_cotizar_envio', {
    p_organization_id: s.organizationId,
    p_branch_id: s.branchId,
    p_direccion: direccionParaCotizar(s.direccion),
    p_canal: s.canal,
    p_subtotal: Math.max(Number(s.subtotal) || 0, 0),
    p_opciones: opciones,
  });
  if (error) {
    const codigo = CODIGOS.find((c) => error.message?.includes(c)) ?? (error.code === '42501' ? 'SIN_ACCESO' : 'ERROR');
    throw new CotizacionEnvioError(codigo, error.message);
  }
  return leerCotizacion(data);
}
