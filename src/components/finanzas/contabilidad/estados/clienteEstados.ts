'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { primerDiaDelAnioDe } from '@/lib/services/fiscalCalendar';
import type { ConfiguracionEstados } from '@/lib/finanzas/estados/tipos';
import { useVisorInforme } from '@/components/reportes/especiales/contextoVisor';

export type EstadoCarga = 'cargando' | 'listo' | 'error' | 'sinPermiso' | 'alcance';

export class ErrorServidor extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(url, { cache: 'no-store', ...init });
  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as { codigo?: string } | null;
    throw new ErrorServidor(cuerpo?.codigo ?? 'error_consulta');
  }
  return (await respuesta.json()) as T;
}

function enviar<T>(url: string, cuerpo: unknown): Promise<T> {
  return pedir<T>(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
}

export const leerConfiguracionEstados = () => pedir<ConfiguracionEstados>('/api/finanzas/estados/configuracion');
export const guardarConfiguracionEstados = (cambios: Record<string, unknown>) =>
  enviar<{ version: number }>('/api/finanzas/estados/configuracion', cambios);
export const guardarCuentasFlujo = (cuentas: unknown[]) =>
  enviar<{ cuentas: number }>('/api/finanzas/estados/cuentas-flujo', { cuentas });
export const leerLibro = <T,>(libro: string, desde: string, hasta: string, largo = 4) =>
  pedir<T>(`/api/finanzas/estados/libros?${new URLSearchParams({ libro, desde, hasta, largo: String(largo) })}`);

export function pedirInforme<T>(informe: string, desde: string, hasta: string, comparar: boolean) {
  const params = new URLSearchParams({ informe, desde, hasta, comparar: comparar ? '1' : '0' });
  return pedir<{ actual: T; anterior: T | null }>(`/api/finanzas/estados?${params}`);
}

function estadoDeError(error: unknown): EstadoCarga {
  if (error instanceof ErrorServidor && error.codigo === 'sin_permiso') return 'sinPermiso';
  if (error instanceof ErrorServidor && error.codigo === 'alcance_sucursal') return 'alcance';
  return 'error';
}

/**
 * Periodo por defecto, en la zona de la organización: del 1 de enero a hoy.
 * Dentro del visor de Reportes manda el periodo de su barra de filtros.
 */
export function usePeriodo() {
  const { getToday } = useFormatDate();
  const { isLoading } = useOrgTimezone();
  const visor = useVisorInforme();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  useEffect(() => {
    if (visor || isLoading || desde) return;
    const hoy = getToday();
    setDesde(primerDiaDelAnioDe(hoy));
    setHasta(hoy);
  }, [visor, isLoading, getToday, desde]);
  const hoy = isLoading ? '' : getToday();
  if (visor) return { desde: visor.desde, hasta: visor.hasta, setDesde, setHasta, hoy };
  return { desde, hasta, setDesde, setHasta, hoy };
}

/**
 * Pide un informe y conserva sus estados. Solo se muestra la respuesta de la
 * última consulta. Un error nunca se pinta como cero.
 */
export function useInforme<T>(informe: string, desde: string, hasta: string, comparar: boolean) {
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const [datos, setDatos] = useState<{ actual: T; anterior: T | null } | null>(null);
  const turno = useRef(0);

  const consultar = useCallback(async () => {
    if (!desde || !hasta) return;
    const propio = ++turno.current;
    setEstado('cargando');
    try {
      const respuesta = await pedirInforme<T>(informe, desde, hasta, comparar);
      if (propio !== turno.current) return;
      setDatos(respuesta);
      setEstado('listo');
    } catch (error) {
      if (propio !== turno.current) return;
      console.error('No se pudo leer el informe:', error);
      setDatos(null);
      setEstado(estadoDeError(error));
    }
  }, [informe, desde, hasta, comparar]);

  return { estado, datos, consultar };
}

/**
 * Consulta sola al abrir, cuando el periodo ya está en la zona de la
 * organización. En el visor de Reportes vuelve a consultar cada vez que
 * cambia el periodo de la barra de filtros (o la consulta misma).
 */
export function useConsultaInicial(listo: boolean, consultar: () => Promise<void>) {
  const visor = useVisorInforme();
  const hecho = useRef(false);
  useEffect(() => {
    if (!listo) return;
    if (!visor && hecho.current) return;
    hecho.current = true;
    void consultar();
  }, [listo, consultar, visor]);
}

export function useConfiguracionEstados() {
  const [config, setConfig] = useState<ConfiguracionEstados | null>(null);
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const recargar = useCallback(async () => {
    try {
      setConfig(await leerConfiguracionEstados());
      setEstado('listo');
    } catch (error) {
      console.error('No se pudo leer la configuración de estados:', error);
      setEstado(estadoDeError(error));
    }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);
  return { config, estado, recargar };
}
