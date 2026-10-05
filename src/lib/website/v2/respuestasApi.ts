/**
 * Respuestas homogéneas de `/api/website/v2/**` (FASE-03: `error.code/message/details`).
 * Solo servidor.
 */
import { NextResponse } from 'next/server';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { ErrorSitio } from '@/lib/services/website/siteDocumentService';
import { ESTADO_HTTP_ERROR, type CodigoErrorSitio, type CuerpoErrorSitio } from './tipos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function respuestaError(code: CodigoErrorSitio, message: string, details?: unknown): NextResponse<CuerpoErrorSitio> {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status: ESTADO_HTTP_ERROR[code] },
  );
}

/**
 * Convierte un error del servicio en respuesta. `OrgContextError` (401/403 de sesión u
 * organización ajena en el body) se relanza para que `withOrg` responda y deje su registro.
 */
export function manejarError(error: unknown, ruta: string): NextResponse<CuerpoErrorSitio> {
  if (error instanceof OrgContextError) throw error;
  if (error instanceof ErrorSitio) return respuestaError(error.code, error.message, error.details);
  console.error(`[api/website/v2] ${ruta}`, error instanceof Error ? error.message : error);
  return respuestaError('error_interno', 'No se pudo completar la operación del sitio web.');
}

/** `siteId` del segmento dinámico; `null` si no es un uuid (se responde 404 sin consultar). */
export async function sitioDeRuta(
  routeParams: { params: Promise<Record<string, string | string[] | undefined>> } | undefined,
): Promise<string | null> {
  const params = routeParams ? await routeParams.params : {};
  const valor = params.siteId;
  return typeof valor === 'string' && UUID.test(valor) ? valor : null;
}

export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

/** Versión esperada del borrador desde el body: entero ≥ 1 o `null`. */
export function versionDe(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 ? valor : null;
}
