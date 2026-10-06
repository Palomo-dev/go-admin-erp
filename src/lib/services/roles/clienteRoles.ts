'use client';

/**
 * Cliente del navegador de Roles y permisos: solo `fetch` a
 * `/api/organizacion/roles/**`. La organización la resuelve el servidor desde
 * la sesión (la cabecera solo desambigua pestañas y el servidor la valida). Los
 * permisos de quien usa la pantalla llegan en `capacidades`: el cliente no
 * decide nada. Los errores traen `codigo` para `roles.errores.<codigo>`.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  CodigoErrorRoles,
  DetalleCargo,
  DetalleRol,
  MiembroRoles,
  CapacidadesRoles,
  QuePuedeHacer,
  RespuestaCargos,
  RespuestaRoles,
} from '@/lib/roles/tipos';

const BASE = '/api/organizacion/roles';
const TIEMPO_MAXIMO_MS = 20_000;

export class ErrorPeticionRoles extends Error {
  constructor(
    readonly codigo: CodigoErrorRoles | string,
    readonly estado: number,
    readonly cuerpo: Record<string, unknown> = {},
  ) {
    super(codigo);
    this.name = 'ErrorPeticionRoles';
  }
}

function cabeceras(json: boolean): HeadersInit {
  const org = getOrganizationId();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
  };
}

async function pedir<T>(ruta: string, metodo: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', cuerpo?: unknown): Promise<T> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIEMPO_MAXIMO_MS);
  let r: Response;
  try {
    r = await fetch(`${BASE}${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: cabeceras(cuerpo !== undefined),
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: control.signal,
    });
  } catch {
    throw new ErrorPeticionRoles('error_red', 0);
  } finally {
    clearTimeout(reloj);
  }
  let datos: unknown = null;
  try {
    datos = await r.json();
  } catch {
    datos = null;
  }
  if (!r.ok) {
    const obj = (datos && typeof datos === 'object' ? datos : {}) as Record<string, unknown>;
    const codigo = typeof obj.codigo === 'string' ? obj.codigo : r.status === 403 ? 'sin_permiso' : 'error_interno';
    throw new ErrorPeticionRoles(codigo, r.status, obj);
  }
  return datos as T;
}

export const clienteRoles = {
  listar: () => pedir<RespuestaRoles>(''),
  detalle: (id: number) => pedir<DetalleRol>(`/${id}`),
  crear: (e: { nombre: string; descripcion?: string | null; plantillaId?: number | null; permisoIds?: number[] | null }) =>
    pedir<{ id: number; version: number }>('', 'POST', e),
  guardar: (id: number, e: { version: number; nombre: string; descripcion: string | null; permisoIds: number[] }) =>
    pedir<{ id: number; version: number }>(`/${id}`, 'PUT', e),
  eliminar: (id: number, rolDestinoId: number | null) => pedir<{ reasignados: number }>(`/${id}`, 'DELETE', { rolDestinoId }),
  asignar: (id: number, miembroIds: number[]) => pedir<{ asignados: number }>(`/${id}/miembros`, 'POST', { miembroIds }),
  miembros: () => pedir<{ miembros: MiembroRoles[]; capacidades: CapacidadesRoles }>('/miembros'),
  quePuedeHacer: (memberId: number) => pedir<QuePuedeHacer>(`/miembros/${memberId}`),
  guardarAlcance: (memberId: number, sucursales: number[] | null) =>
    pedir<{ sucursales: number[] }>(
      `/miembros/${memberId}/sucursales`,
      'PUT',
      sucursales === null ? { modo: 'todas' } : { modo: 'algunas', sucursales },
    ),
  cargos: () => pedir<RespuestaCargos>('/cargos'),
  cargo: (id: string) => pedir<DetalleCargo>(`/cargos/${id}`),
  guardarCargo: (id: string, e: { actualizado: string | null; permisoIds: number[] }) =>
    pedir<{ actualizado: string | null }>(`/cargos/${id}`, 'PUT', e),
};
