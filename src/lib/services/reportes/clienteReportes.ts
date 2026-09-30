'use client';

/**
 * Cliente del navegador para las rutas de reportes: solo `fetch`. La
 * organización la pone el servidor desde la sesión (el header
 * `x-organization-id` solo desambigua pestañas). Los errores llegan como
 * `ErrorPeticionReportes` con el código estable de la ruta (`cierre_existente`,
 * `sin_permiso`, `BRANCH_SCOPE_REQUIRED`…), que la interfaz traduce.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { CuerpoCierre, CuerpoProgramado } from './contrato';
import type { CierreGuardado, ResumenCierre } from './cierres/cierres.server';
import type { ProgramadoVista } from './programados/programados.server';
import type { DestinatarioDisponible } from './programados/destinatarios.server';
import type { ResultadoSolicitud, SolicitudAcceso } from './solicitudAcceso.server';

export interface PermisosReportes {
  exportar: boolean;
  firmar: boolean;
  reabrir: boolean;
  admin: boolean;
}

export class ErrorPeticionReportes extends Error {
  constructor(
    public readonly codigo: string,
    public readonly estado: number,
    public readonly existente: string | null = null,
  ) {
    super(codigo);
    this.name = 'ErrorPeticionReportes';
  }
}

async function pedir<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const org = getOrganizationId();
  const r = await fetch(url, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  let cuerpo: unknown = null;
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = null;
  }
  if (!r.ok) {
    const c = (cuerpo ?? {}) as { codigo?: string; code?: string; existente?: string };
    throw new ErrorPeticionReportes(c.codigo ?? c.code ?? 'error_desconocido', r.status, c.existente ?? null);
  }
  return (cuerpo as { resultado: T }).resultado;
}

/** Cuerpo del cierre tal como lo manda el diálogo (el periodo sin etiqueta: la pone el servidor). */
export type PedidoCierre = Omit<CuerpoCierre, 'periodo'> & {
  periodo: { tipo: string; fechaInicio: string; fechaFin: string; horaInicio?: string | null; horaFin?: string | null };
};

export const clienteReportes = {
  permisos: () => pedir<PermisosReportes>('/api/reportes/permisos'),
  solicitarAcceso: (s: SolicitudAcceso) => pedir<ResultadoSolicitud>('/api/reportes/solicitar-acceso', { method: 'POST', body: s }),

  vistaPreviaCierre: (datos: PedidoCierre) =>
    pedir<{ resumen: ResumenCierre }>('/api/reportes/cierres', { method: 'POST', body: { ...datos, vistaPrevia: true } }).then((r) => r.resumen),
  generarCierre: (datos: PedidoCierre) => pedir<CierreGuardado>('/api/reportes/cierres', { method: 'POST', body: datos }),
  firmarCierre: (id: string) =>
    pedir<{ id: string; estado: string; cierra_periodo: boolean }>(`/api/reportes/cierres/${encodeURIComponent(id)}/firmar`, { method: 'POST', body: {} }),
  reabrirCierre: (id: string, motivo: string) =>
    pedir<{ id: string; estado: string }>(`/api/reportes/cierres/${encodeURIComponent(id)}/reabrir`, { method: 'POST', body: { motivo } }),

  programados: () => pedir<ProgramadoVista[]>('/api/reportes/programados'),
  crearProgramado: (datos: CuerpoProgramado) => pedir<ProgramadoVista>('/api/reportes/programados', { method: 'POST', body: datos }),
  editarProgramado: (id: string, datos: CuerpoProgramado) =>
    pedir<ProgramadoVista>(`/api/reportes/programados/${encodeURIComponent(id)}`, { method: 'PATCH', body: { accion: 'editar', datos } }),
  pausarProgramado: (id: string) => pedir<ProgramadoVista>(`/api/reportes/programados/${encodeURIComponent(id)}`, { method: 'PATCH', body: { accion: 'pausar' } }),
  reanudarProgramado: (id: string) =>
    pedir<ProgramadoVista>(`/api/reportes/programados/${encodeURIComponent(id)}`, { method: 'PATCH', body: { accion: 'reanudar' } }),
  aprobarExternos: (id: string, correos: string[]) =>
    pedir<ProgramadoVista>(`/api/reportes/programados/${encodeURIComponent(id)}`, { method: 'PATCH', body: { accion: 'aprobar', correos } }),
  eliminarProgramado: (id: string) => pedir<{ id: string }>(`/api/reportes/programados/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  probarProgramado: (id: string) => pedir<{ para: string }>(`/api/reportes/programados/${encodeURIComponent(id)}/prueba`, { method: 'POST', body: {} }),
  destinatarios: () => pedir<DestinatarioDisponible[]>('/api/reportes/destinatarios'),
};
