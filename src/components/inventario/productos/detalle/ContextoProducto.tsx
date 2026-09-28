'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import {
  ErrorProducto,
  aErrorProducto,
  productoService,
  type PermisosProducto,
  type ResumenProducto,
} from '@/lib/services/productoService';
import type { PestanaDetalle, ProductoDetalle } from './tipos';

/**
 * Estado compartido del detalle: el producto, el resumen del servidor
 * (KPIs, stock por sucursal, conteos y permisos en una sola RPC), la moneda y
 * las fechas de la organización y la navegación entre pestañas.
 *
 * Cada pestaña carga sus propios datos y llama a `recargar()` (o
 * `recargarResumen()`) después de escribir, para que cabecera, KPIs y
 * contadores queden al día.
 */
export interface MonedaProducto {
  codigo: string;
  simbolo: string;
  decimales: number;
  formatear: (valor: number | string | null | undefined) => string;
}

export interface ContextoProductoValor {
  producto: ProductoDetalle;
  organizacionId: number;
  resumen: ResumenProducto | null;
  cargandoResumen: boolean;
  errorResumen: string | null;
  permisos: PermisosProducto;
  /** Recarga el producto (página) y el resumen. */
  recargar: () => Promise<void>;
  recargarResumen: () => Promise<void>;
  moneda: MonedaProducto;
  fechas: ReturnType<typeof useFormatDate>;
  /** Sucursal activa del selector global (null = todas). */
  sucursalActiva: number | null;
  /** Cambia de pestaña (y sub-pestaña) actualizando la URL. */
  irA: (tab: PestanaDetalle, sub?: string) => void;
  /** Mensaje traducido para cualquier error (RPC o red). */
  mensajeError: (error: unknown) => string;
}

const Contexto = createContext<ContextoProductoValor | null>(null);

const SIN_PERMISOS: PermisosProducto = { crear: false, editar: false, eliminar: false, ajustar: false };

export function simboloMoneda(codigo: string, locale: string): string {
  try {
    const parte = new Intl.NumberFormat(locale, { style: 'currency', currency: codigo, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return parte?.value ?? codigo;
  } catch {
    return codigo;
  }
}

/** Traduce un error del servicio de productos con `productoForm.errores`. */
export function useMensajeErrorProducto(): (error: unknown) => string {
  const t = useTranslations('productoForm.errores');
  return useCallback(
    (error: unknown) => {
      const e = error instanceof ErrorProducto ? error : aErrorProducto(error as { message?: string });
      if (e.codigo === 'desconocido') return t('desconocido');
      return t(e.codigo, { detalle: e.detalle ?? '' });
    },
    [t],
  );
}

export function ProveedorContextoProducto({
  producto,
  organizacionId,
  recargarProducto,
  irA,
  children,
}: {
  producto: ProductoDetalle;
  organizacionId: number;
  recargarProducto: () => Promise<void>;
  irA: (tab: PestanaDetalle, sub?: string) => void;
  children: ReactNode;
}) {
  const [resumen, setResumen] = useState<ResumenProducto | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(true);
  const [errorResumen, setErrorResumen] = useState<string | null>(null);
  const { branchFilter } = useBranch();
  const fechas = useFormatDate();
  const monedaOrg = useMonedaOrganizacion();
  const mensajeError = useMensajeErrorProducto();
  const vigente = useRef(0);

  const recargarResumen = useCallback(async () => {
    const turno = ++vigente.current;
    setCargandoResumen(true);
    try {
      const r = await productoService.resumen(organizacionId, producto.id);
      if (turno === vigente.current) {
        setResumen(r);
        setErrorResumen(null);
      }
    } catch (e) {
      if (turno === vigente.current) setErrorResumen(mensajeError(e));
    } finally {
      if (turno === vigente.current) setCargandoResumen(false);
    }
  }, [organizacionId, producto.id, mensajeError]);

  useEffect(() => {
    void recargarResumen();
  }, [recargarResumen]);

  const recargar = useCallback(async () => {
    await Promise.all([recargarProducto(), recargarResumen()]);
  }, [recargarProducto, recargarResumen]);

  const moneda = useMemo<MonedaProducto>(
    () => ({
      codigo: monedaOrg.code,
      simbolo: simboloMoneda(monedaOrg.code, monedaOrg.locale),
      decimales: monedaOrg.decimals,
      formatear: monedaOrg.formatear,
    }),
    [monedaOrg],
  );

  const valor = useMemo<ContextoProductoValor>(
    () => ({
      producto,
      organizacionId,
      resumen,
      cargandoResumen,
      errorResumen,
      permisos: resumen?.permisos ?? SIN_PERMISOS,
      recargar,
      recargarResumen,
      moneda,
      fechas,
      sucursalActiva: branchFilter,
      irA,
      mensajeError,
    }),
    [producto, organizacionId, resumen, cargandoResumen, errorResumen, recargar, recargarResumen, moneda, fechas, branchFilter, irA, mensajeError],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useProductoDetalle(): ContextoProductoValor {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useProductoDetalle fuera de ProveedorContextoProducto');
  return ctx;
}
