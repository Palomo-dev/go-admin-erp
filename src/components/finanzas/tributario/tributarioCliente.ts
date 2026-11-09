/**
 * Cliente del navegador para las rutas de Tributario (`/api/finanzas/tributario/*`).
 * La organización viaja solo como cabecera de la sesión activa; el servidor la
 * vuelve a resolver y decide permisos. Un error de la ruta llega como
 * `ErrorTributarioCliente` con el `codigo` que la pantalla traduce.
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { DatosEmpresa, FaltaPerfil, SolicitudPerfil, VigenciaPerfil } from '@/lib/finanzas/tributario/perfil';
import type { AnalisisPeriodo, SolicitudDecision } from '@/lib/finanzas/tributario/vigenciasPeriodo';
import type { DecisionPeriodo } from '@/lib/services/tributario/tributario.server';
import type { Obligacion, Vencimiento } from '@/lib/finanzas/tributario/obligaciones';
import type { BorradorIva } from '@/lib/finanzas/tributario/borradorIva';
import type { FilaCertificado, ResumenCertificados } from '@/lib/finanzas/tributario/certificados';

export class ErrorTributarioCliente extends Error {
  constructor(
    public readonly codigo: string,
    public readonly status: number,
    /** Lo que la ruta devuelve además del código (p. ej. `bloqueos` y `advertencias` al guardar el perfil). */
    public readonly detalle: Record<string, unknown> = {},
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
    throw new ErrorTributarioCliente(
      typeof c.codigo === 'string' ? c.codigo : r.status === 403 ? 'sin_permiso' : 'desconocido',
      r.status,
      cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : {},
    );
  }
  return cuerpo as T;
}

const get = <T>(ruta: string) => fetch(ruta, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() }).then((r) => leer<T>(r));

export interface CodigoCatalogoCliente {
  codigo: string;
  descripcion: string;
  estado: 'pendiente_validacion' | 'cotejado_fuente_oficial' | 'validado' | 'no_pertenece_tabla_fe' | 'historico' | 'sin_dato';
  nota: string | null;
  fuente: string | null;
  vigente: boolean;
}

export interface PerfilCliente {
  activo: boolean;
  /** false = falta la migración que separa renta e IVA: se ve, pero no se guarda. */
  separacionActiva: boolean;
  hoy: string;
  empresa: DatosEmpresa;
  vigencias: VigenciaPerfil[];
  vigente: VigenciaPerfil | null;
  faltan: FaltaPerfil[];
  /** Códigos del documento electrónico. */
  catalogo: CodigoCatalogoCliente[];
  /** Casilla 53 del RUT. */
  catalogoRut: CodigoCatalogoCliente[];
  puedeEditar: boolean;
}

export type ValorObligacionCliente =
  | { estado: 'calculado'; valor: number; revisar: boolean }
  | { estado: 'revisar_procedencia' }
  | { estado: 'pendiente_activar' }
  | { estado: 'no_calculable' }
  | { estado: 'error' };

export interface CentroCliente {
  corte: string;
  hoy: string;
  perfil: 'activo' | 'pendiente_activar' | 'sin_perfil';
  faltan: FaltaPerfil[];
  calendario: 'activo' | 'pendiente_activar';
  calendarioIncompleto: number[];
  /** Puede registrar decisiones de período (finance.approve). */
  puedeDecidir: boolean;
  filas: {
    obligacion: Obligacion;
    vencimiento: Vencimiento;
    valor: ValorObligacionCliente;
    decisiones?: DecisionPeriodo[];
    vigenciasPeriodo?: AnalisisPeriodo['vigencias'];
  }[];
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
    }).then((r) => leer<{ id: string; advertencias: string[] }>(r)),
  vigenciasPeriodo: (desde: string, hasta: string) =>
    get<{ activo: boolean; analisis: AnalisisPeriodo | null }>(`/api/finanzas/tributario/perfil/periodo?${new URLSearchParams({ desde, hasta })}`),
  municipios: (q: string, signal?: AbortSignal) =>
    fetch(`/api/finanzas/tributario/municipios?${new URLSearchParams({ q })}`, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras(), signal }).then((r) =>
      leer<{ municipios: MunicipioOpcion[] }>(r),
    ),
  registrarDecision: (s: SolicitudDecision) =>
    fetch('/api/finanzas/tributario/centro/decision', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: cabeceras(true),
      body: JSON.stringify(s),
    }).then((r) => leer<{ id: string }>(r)),
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
