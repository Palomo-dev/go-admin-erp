/**
 * Reporte «Pesos manuales» del POS (docs/design/PRODUCTOS-POR-PESO-BASCULA.md
 * §2.9 y §10): las líneas vendidas con el peso escrito a mano
 * (`sale_items.notes.pesaje.origen = 'manual'`), por día y cajero.
 *
 * Todo lo decide el servidor (`pos_reporte_pesos_manuales`, migración
 * 20260929225000): pertenencia a la organización, permiso (dueño,
 * «Reportes de Ventas» o «Configurar básculas»; nunca el nombre del rol) y los
 * días calendario en la zona horaria de la organización. Aquí solo se lee y
 * se resume; `aReporte`, `totalesPesosManuales` y `claseError` son puras.
 */

import { supabase } from '@/lib/supabase/config';

export interface FilaPesoManual {
  /** Día calendario (`date`) en la zona de la organización: se muestra con formatPlain. */
  dia: string;
  usuario_id: string | null;
  cajero: string | null;
  /** Código de la unidad («KG», «LB»). */
  unidad: string;
  lineas: number;
  cantidad: number;
  importe: number;
  /** Líneas con `autorizado_por` (peso a mano autorizado por un supervisor). */
  autorizadas: number;
}

export interface ReportePesosManuales {
  zona: string;
  desde: string;
  hasta: string;
  filas: FilaPesoManual[];
}

export interface TotalesPesosManuales {
  lineas: number;
  importe: number;
  cajeros: number;
  /** Cantidad total por unidad (no se suman kg con lb). */
  porUnidad: Array<{ unidad: string; cantidad: number }>;
}

export type ErrorReportePesos = 'sinPermiso' | 'rango' | 'error';

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Normaliza la respuesta de la RPC (numeric llega como número o texto). */
export function aReporte(data: unknown): ReportePesosManuales {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const filas = Array.isArray(d.filas) ? (d.filas as Record<string, unknown>[]) : [];
  return {
    zona: typeof d.zona === 'string' ? d.zona : '',
    desde: typeof d.desde === 'string' ? d.desde : '',
    hasta: typeof d.hasta === 'string' ? d.hasta : '',
    filas: filas.map((f) => ({
      dia: String(f.dia ?? ''),
      usuario_id: typeof f.usuario_id === 'string' ? f.usuario_id : null,
      cajero: typeof f.cajero === 'string' && f.cajero.trim() ? f.cajero.trim() : null,
      unidad: typeof f.unidad === 'string' && f.unidad.trim() ? f.unidad.trim().toUpperCase() : 'KG',
      lineas: num(f.lineas),
      cantidad: num(f.cantidad),
      importe: num(f.importe),
      autorizadas: num(f.autorizadas),
    })),
  };
}

/** Totales del período. La cantidad se suma por unidad y con 3 decimales. */
export function totalesPesosManuales(filas: readonly FilaPesoManual[]): TotalesPesosManuales {
  const porUnidad = new Map<string, number>();
  const cajeros = new Set<string>();
  let lineas = 0;
  let importe = 0;
  for (const f of filas) {
    lineas += f.lineas;
    importe += f.importe;
    cajeros.add(f.usuario_id ?? '—');
    porUnidad.set(f.unidad, Math.round(((porUnidad.get(f.unidad) ?? 0) + f.cantidad) * 1000) / 1000);
  }
  return {
    lineas,
    importe: Math.round(importe * 100) / 100,
    cajeros: cajeros.size,
    porUnidad: Array.from(porUnidad.entries()).map(([unidad, cantidad]) => ({ unidad, cantidad })),
  };
}

/** Qué decir ante un error de la RPC. */
export function claseError(error: unknown): ErrorReportePesos {
  const e = (error ?? {}) as { code?: string; message?: string };
  if (e.code === '42501' || /sin_permiso|acceso denegado/i.test(e.message ?? '')) return 'sinPermiso';
  if (/rango_/.test(e.message ?? '')) return 'rango';
  return 'error';
}

interface ClienteRpc {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Lee el reporte. `organizationId` es la organización activa de la sesión; el
 * servidor comprueba igual que la persona pertenece a ella y tiene el permiso.
 */
export async function obtenerPesosManuales(
  params: { organizationId: number; desde: string; hasta: string; branchId?: number | null },
  cliente: ClienteRpc = supabase as unknown as ClienteRpc,
): Promise<ReportePesosManuales> {
  const { data, error } = await cliente.rpc('pos_reporte_pesos_manuales', {
    p_org: params.organizationId,
    p_desde: params.desde,
    p_hasta: params.hasta,
    p_branch: params.branchId ?? null,
  });
  if (error) throw error;
  return aReporte(data);
}
