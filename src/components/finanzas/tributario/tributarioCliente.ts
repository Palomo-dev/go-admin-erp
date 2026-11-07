/**
 * Cliente del navegador para las rutas de Tributario (`/api/finanzas/tributario/*`).
 * La organización viaja solo como cabecera de la sesión activa; el servidor la
 * vuelve a resolver y decide permisos. Un error de la ruta llega como
 * `ErrorTributarioCliente` con el `codigo` que la pantalla traduce.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { DatosEmpresa, FaltaPerfil, SolicitudPerfil, VigenciaPerfil } from '@/lib/finanzas/tributario/perfil';
import type { Obligacion, Vencimiento } from '@/lib/finanzas/tributario/obligaciones';
import type { BorradorIva } from '@/lib/finanzas/tributario/borradorIva';
import type { FilaCertificado, ResumenCertificados } from '@/lib/finanzas/tributario/certificados';

export class ErrorTributarioCliente extends Error {
  constructor(
    public readonly codigo: string,
    public readonly status: number,
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
    const c = (cuerpo ?? {}) as { codigo?: unknown; error?: unknown };
    throw new ErrorTributarioCliente(typeof c.codigo === 'string' ? c.codigo : r.status === 403 ? 'sin_permiso' : 'desconocido', r.status);
  }
  return cuerpo as T;
}

const get = <T>(ruta: string) => fetch(ruta, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() }).then((r) => leer<T>(r));

export interface PerfilCliente {
  activo: boolean;
  hoy: string;
  empresa: DatosEmpresa;
  vigencias: VigenciaPerfil[];
  vigente: VigenciaPerfil | null;
  faltan: FaltaPerfil[];
  catalogo: { codigo: string; descripcion: string }[];
  puedeEditar: boolean;
}

export type ValorObligacionCliente =
  | { estado: 'calculado'; valor: number; revisar: boolean }
  | { estado: 'pendiente_activar' }
  | { estado: 'no_calculable' }
  | { estado: 'error' };

export interface CentroCliente {
  corte: string;
  hoy: string;
  perfil: 'activo' | 'pendiente_activar' | 'sin_perfil';
  faltan: FaltaPerfil[];
  calendario: 'activo' | 'pendiente_activar';
  filas: { obligacion: Obligacion; vencimiento: Vencimiento; valor: ValorObligacionCliente }[];
}

export type BorradorCliente = { estado: 'listo'; borrador: BorradorIva } | { estado: 'pendiente_activar' };

export interface CertificadosCliente {
  desde: string;
  hasta: string;
  filas: FilaCertificado[];
  resumen: ResumenCertificados;
}

export interface MunicipioOpcion {
  id: string;
  nombre: string;
  departamento: string | null;
  codigo: string;
}

export const tributarioCliente = {
  perfil: () => get<PerfilCliente>('/api/finanzas/tributario/perfil'),
  guardarPerfil: (datos: SolicitudPerfil) =>
    fetch('/api/finanzas/tributario/perfil', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: cabeceras(true),
      body: JSON.stringify(datos),
    }).then((r) => leer<{ id: string }>(r)),
  municipios: (q: string, signal?: AbortSignal) =>
    fetch(`/api/finanzas/tributario/municipios?${new URLSearchParams({ q })}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras(), signal }).then((r) =>
      leer<{ municipios: MunicipioOpcion[] }>(r),
    ),
  centro: (corte: string | null) => get<CentroCliente>(`/api/finanzas/tributario/centro${corte ? `?${new URLSearchParams({ corte })}` : ''}`),
  borradorIva: (desde: string, hasta: string) => get<BorradorCliente>(`/api/finanzas/tributario/iva?${new URLSearchParams({ desde, hasta })}`),
  certificados: (desde: string, hasta: string) => get<CertificadosCliente>(`/api/finanzas/tributario/certificados?${new URLSearchParams({ desde, hasta })}`),
  /** Expedir: la ruta que ya existe (serie CR, una sola RPC transaccional). */
  expedirCertificado: (proveedorId: number, desde: string, hasta: string) =>
    fetch(`/api/proveedores/${proveedorId}/certificado-retenciones`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: cabeceras(true),
      body: JSON.stringify({ desde, hasta }),
    }).then((r) => leer<{ certificado: { id: string; numero: string; reexpedido: boolean } }>(r)),
};

/** Rutas de las pantallas de Tributario (y adónde lleva cada obligación). */
export const RUTAS_TRIBUTARIO = {
  centro: '/app/finanzas/tributario',
  perfil: '/app/finanzas/tributario/perfil',
  iva: (desde: string, hasta: string) => `/app/finanzas/tributario/iva?${new URLSearchParams({ desde, hasta })}`,
  certificados: '/app/finanzas/tributario/certificados',
  /** Informes: viven en Reportes (política del dueño); Finanzas solo enlaza. */
  reporteRetenciones: '/app/reportes/compras/retenciones-practicadas',
  reporteImpuestos: '/app/reportes/finanzas/impuestos',
} as const;
