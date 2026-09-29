'use client';

/**
 * Cliente del navegador del módulo Membresías: solo `fetch` a `/api/membresias/**`. La organización
 * la resuelve el servidor desde la sesión (la cabecera es la organización activa, que el servidor
 * valida contra la membresía del usuario). Los errores llegan con `codigo` para traducirlos en
 * `membresias.errores.<codigo>`.
 */
import { useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  DetalleMembresia,
  DetallePlan,
  FiltroEstado,
  ListadoMembresias,
  ListadoMiembros,
  ListadoPagos,
  ListadoPlanes,
  MembresiaFila,
  ClienteResumen,
  PermisosMembresias,
  ResultadoCheckin,
  ResumenMembresias,
} from './tipos';

export class ErrorPeticionMembresias extends Error {
  constructor(
    public readonly codigo: string,
    public readonly estado: number,
  ) {
    super(codigo);
  }
}

function cabeceras(json = false): HeadersInit {
  const org = getOrganizationId();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(org > 0 ? { 'x-organization-id': String(org) } : {}),
  };
}

async function leer<T>(r: Response): Promise<T> {
  let cuerpo: unknown = null;
  try {
    cuerpo = await r.json();
  } catch {
    cuerpo = null;
  }
  if (!r.ok) {
    const codigo = (cuerpo as { codigo?: string; code?: string } | null)?.codigo ?? (cuerpo as { code?: string } | null)?.code;
    throw new ErrorPeticionMembresias(codigo ?? (r.status === 403 ? 'sin_permiso' : 'error_interno'), r.status);
  }
  return cuerpo as T;
}

function consulta(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function get<T>(ruta: string, params: Record<string, string | number | null | undefined> = {}): Promise<T> {
  const r = await fetch(`/api/membresias/${ruta}${consulta(params)}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: cabeceras(),
  });
  return leer<T>(r);
}

async function post<T>(ruta: string, cuerpo: unknown = {}): Promise<T> {
  const r = await fetch(`/api/membresias/${ruta}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: cabeceras(true),
    body: JSON.stringify(cuerpo),
  });
  return leer<T>(r);
}

export const apiMembresias = {
  resumen: () => get<ResumenMembresias>('resumen'),
  permisos: () => get<PermisosMembresias>('permisos'),
  membresias: (f: { q?: string; estado?: FiltroEstado; plan?: number | null; cliente?: string | null; pagina?: number; porPagina?: number }) =>
    get<ListadoMembresias>('membresias', f),
  membresia: (id: number) => get<DetalleMembresia>(`membresias/${id}`),
  congelar: (id: number, datos: { desde: string; hasta: string; motivo?: string | null }) =>
    post<Record<string, unknown>>(`membresias/${id}/congelar`, datos),
  descongelar: (id: number) => post<Record<string, unknown>>(`membresias/${id}/descongelar`),
  cancelar: (id: number, motivo: string) => post<Record<string, unknown>>(`membresias/${id}/cancelar`, { motivo }),
  miembros: (f: { q?: string; estado?: 'todos' | 'con_vigente' | 'sin_vigente'; pagina?: number; porPagina?: number }) =>
    get<ListadoMiembros>('miembros', f),
  planes: () => get<ListadoPlanes>('planes'),
  plan: (id: number) => get<DetallePlan>(`planes/${id}`),
  pagos: (f: { desde?: string; hasta?: string; pagina?: number; porPagina?: number }) => get<ListadoPagos>('pagos', f),
  buscarEntrada: (q: string) => get<Array<{ cliente: ClienteResumen; vigente: MembresiaFila | null }>>('checkin', { q }),
  registrarEntrada: (datos: { clienteId: string; sucursalId: number; metodo?: string; membresiaId?: number | null }) =>
    post<ResultadoCheckin>('checkin', datos),
};

export const PERMISOS_VACIOS: PermisosMembresias = {
  ver: false,
  planes: false,
  congelar: false,
  cancelar: false,
  checkin: false,
  clases: false,
  dispositivos: false,
};

/** Permisos del módulo calculados en el servidor. Mientras cargan o si fallan: todo false (fail-closed). */
export function usePermisosMembresias(): PermisosMembresias & { cargando: boolean } {
  const [permisos, setPermisos] = useState<PermisosMembresias>(PERMISOS_VACIOS);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    let vivo = true;
    apiMembresias
      .permisos()
      .then((p) => {
        if (vivo) setPermisos({ ...PERMISOS_VACIOS, ...p });
      })
      .catch(() => {
        if (vivo) setPermisos(PERMISOS_VACIOS);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);
  return { ...permisos, cargando };
}
