/**
 * Respuestas HTTP de `/api/integrations/logistica/**`: sin caché, errores con `codigo` y mensaje
 * para la UI. Nunca se devuelve un secreto ni el detalle interno del proveedor.
 */
import { NextResponse } from 'next/server';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { errorParaUI, esErrorIntegracion } from '@/lib/integrations/core/errores';
import { CredencialesError } from '@/lib/services/integrations/integrationCredentials.server';
import { ConexionLogisticaError } from './conexionesLogistica.server';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function fallo(estado: number, codigo: string, mensaje: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: mensaje, codigo, ...extra }, { status: estado, headers: SIN_CACHE });
}

/** Ejecuta la acción y convierte los errores conocidos en respuestas; OrgContextError sube a `withOrg`. */
export async function responder(etiqueta: string, accion: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json(await accion(), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    if (err instanceof ConexionLogisticaError) {
      return fallo(err.status, err.errores ? 'VALIDATION' : 'CONEXION', err.message, err.errores ? { errores: err.errores } : undefined);
    }
    if (esErrorIntegracion(err)) {
      const ui = errorParaUI(err);
      return fallo(502, ui.codigo, ui.mensaje);
    }
    if (err instanceof CredencialesError) {
      console.error(`[${etiqueta}]`, err.message);
      return fallo(500, 'VAULT', 'No se pudieron guardar o leer las credenciales. Intenta de nuevo.');
    }
    console.error(`[${etiqueta}] error no controlado:`, err instanceof Error ? err.message : err);
    return fallo(500, 'INTERNAL', 'Error interno del servidor.');
  }
}

/** Id (uuid) de la conexión en la ruta, o null. */
export async function idConexion(routeParams?: { params: Promise<Record<string, string | string[] | undefined>> }): Promise<string | null> {
  const p = routeParams ? await routeParams.params : {};
  const id = typeof p.id === 'string' ? p.id : '';
  return FORMA_UUID.test(id) ? id : null;
}
