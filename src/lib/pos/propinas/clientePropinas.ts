'use client';

/**
 * Cliente del navegador para Propinas: solo `fetch` a `/api/pos/propinas/**`,
 * que resuelven la organización de la sesión. El header `x-organization-id`
 * evita la ambigüedad con varias pestañas (igual que Ventas).
 */
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { PropinaError, esCodigoErrorPropina } from './errores';
import type {
  CajaAbiertaPropinas,
  CifrasPropinas,
  DatosLiquidacion,
  DatosPagoLiquidacion,
  DetalleLiquidacion,
  PaginaLiquidaciones,
  PaginaPropinas,
  PermisosPropinasServidor,
  ResultadoLiquidacion,
} from './tiposPropinas';

function cabeceras(json = false): HeadersInit {
  const org = getOrganizationId();
  const h: Record<string, string> = org > 0 ? { 'x-organization-id': String(org) } : {};
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function leer<T>(r: Response): Promise<T> {
  const cuerpo = (await r.json().catch(() => null)) as (T & { codigo?: string }) | null;
  if (!r.ok || !cuerpo) {
    const codigo = cuerpo?.codigo;
    throw new PropinaError(esCodigoErrorPropina(codigo) ? codigo : r.status === 403 ? 'SIN_PERMISO' : 'DESCONOCIDO');
  }
  return cuerpo;
}

const pedir = async <T>(ruta: string): Promise<T> =>
  leer<T>(await fetch(ruta, { credentials: 'same-origin', cache: 'no-store', headers: cabeceras() }));

const enviar = async <T>(ruta: string, cuerpo: unknown): Promise<T> =>
  leer<T>(await fetch(ruta, { method: 'POST', credentials: 'same-origin', headers: cabeceras(true), body: JSON.stringify(cuerpo) }));

export const pedirPropinas = (consulta: URLSearchParams) => pedir<PaginaPropinas>(`/api/pos/propinas?${consulta.toString()}`);
export const pedirCifrasPropinas = (consulta: URLSearchParams) => pedir<CifrasPropinas>(`/api/pos/propinas/cifras?${consulta.toString()}`);
export const pedirPermisosPropinas = () => pedir<PermisosPropinasServidor>('/api/pos/propinas/permisos');
export const pedirLiquidaciones = (consulta: URLSearchParams) => pedir<PaginaLiquidaciones>(`/api/pos/propinas/liquidaciones?${consulta.toString()}`);
export const pedirDetalleLiquidacion = (id: string) => pedir<DetalleLiquidacion>(`/api/pos/propinas/liquidaciones/${encodeURIComponent(id)}`);

export async function pedirCajaAbierta(sucursal: number | null): Promise<CajaAbiertaPropinas | null> {
  if (!sucursal) return null;
  const r = await pedir<{ caja: CajaAbiertaPropinas | null }>(`/api/pos/propinas/caja?sucursal=${sucursal}`);
  return r.caja;
}

export const liquidarPropinas = (datos: DatosLiquidacion) => enviar<ResultadoLiquidacion>('/api/pos/propinas/liquidaciones', datos);

export const anularLiquidacionPropinas = (id: string, motivo: string) =>
  enviar<{ id: string; codigo: string; ya_anulada: boolean }>(`/api/pos/propinas/liquidaciones/${encodeURIComponent(id)}/anular`, { motivo });

/** Paga una liquidación «por pagar» (28150502 contra caja o bancos). */
export const pagarLiquidacionPropinas = (id: string, datos: DatosPagoLiquidacion) =>
  enviar<{ id: string; codigo: string; ya_pagada: boolean; estado?: string }>(
    `/api/pos/propinas/liquidaciones/${encodeURIComponent(id)}/pagar`,
    datos,
  );

export const anularPropinaConMotivo = (id: string, motivo: string) =>
  enviar<{ asientosRevertidos: number; yaAnulada: boolean }>(`/api/pos/propinas/${encodeURIComponent(id)}/anular`, { motivo });
