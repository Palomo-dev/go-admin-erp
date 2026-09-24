/**
 * Cliente de `/api/pos/mesas/[id]/liberar` (navegador).
 *
 * La organización viaja solo como cabecera de contexto (`x-organization-id`,
 * igual que el resto de rutas del POS): el servidor la contrasta con la
 * sesión. El permiso de anular y el saldo los resuelve el servidor.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  AccionLiberacion,
  DecisionLiberacion,
  PermisosLiberacion,
  ResumenLiberacion,
} from '@/lib/pos/mesas/liberacionMesa';

export interface ResultadoLiberacion {
  accion: AccionLiberacion;
  resolucion: 'sin_saldo' | 'cartera_creada' | 'cartera_existente' | 'anulada';
  sale_id: string | null;
  saldo: number;
  invoice_id: string | null;
  invoice_number: string | null;
  sesiones_cerradas: number;
  items_cocina_entregados: number;
  items_cocina_sin_cocinar: number;
  items_cocina_cancelados: number;
  warnings: string[];
}

export interface EstadoLiberacion {
  resumen: ResumenLiberacion;
  decision: DecisionLiberacion;
  permisos: PermisosLiberacion;
}

/** Error de la ruta con su código estable (`posMesaLiberar.errores.<codigo>`). */
export class LiberacionMesaError extends Error {
  constructor(public readonly codigo: string, public readonly status: number) {
    super(codigo);
    this.name = 'LiberacionMesaError';
  }
}

function cabeceras(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  let org: number | null = null;
  try {
    org = Number(getOrganizationId()) || null;
  } catch {
    org = null;
  }
  if (org && org > 0) h['x-organization-id'] = String(org);
  return h;
}

async function leer<T>(respuesta: Response): Promise<T> {
  let cuerpo: { codigo?: string } & Record<string, unknown> = {};
  try {
    cuerpo = await respuesta.json();
  } catch {
    cuerpo = {};
  }
  if (!respuesta.ok) {
    throw new LiberacionMesaError(typeof cuerpo.codigo === 'string' ? cuerpo.codigo : 'error_interno', respuesta.status);
  }
  return cuerpo as T;
}

export async function obtenerEstadoLiberacion(tableId: string): Promise<EstadoLiberacion> {
  const respuesta = await fetch(`/api/pos/mesas/${encodeURIComponent(tableId)}/liberar`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: cabeceras(false),
  });
  return leer<EstadoLiberacion>(respuesta);
}

export async function ejecutarLiberacion(
  tableId: string,
  accion: AccionLiberacion,
  motivo?: string | null,
): Promise<ResultadoLiberacion> {
  const respuesta = await fetch(`/api/pos/mesas/${encodeURIComponent(tableId)}/liberar`, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: cabeceras(true),
    body: JSON.stringify({ accion, motivo: motivo ?? null }),
  });
  const { resultado } = await leer<{ resultado: ResultadoLiberacion }>(respuesta);
  return resultado;
}
