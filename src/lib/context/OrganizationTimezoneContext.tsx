'use client';

// ============================================================
// Provider y hooks para acceder al timezone de la organizacion
// desde cualquier componente cliente sin hacer await en cada render.
//
// OrganizationTimezoneProvider se monta en el layout de /app y
// obtiene el timezone una sola vez (con cache en memoria del
// organizationTimezoneService). Los componentes de presentacion
// consumen el timezone via useOrgTimezone() o useFormatDate().
//
// Ver docs/PROMPT-fix-fechas-timezone.md seccion 4.
// ============================================================

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { DEFAULT_TIMEZONE, type OperatingHoursOptions } from '@/lib/utils/timezone';
import {
  resolveTimezoneForBranch,
  type TimezoneSource,
} from '@/lib/utils/branchTimezoneCascade';
import { avisarResolucionZonaHoraria } from '@/lib/utils/timezoneFallback';
import { sucursalActivaDelHeader, sucursalParaZona } from '@/lib/utils/sucursalParaZona';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import {
  TIMEZONES_UPDATED_EVENT,
  invalidateBranchTimezoneCache,
  type BranchTimezoneMap,
} from '@/lib/services/branchTimezoneService';
import { invalidateTimezoneCache } from '@/lib/services/organizationTimezoneService';

export { TIMEZONES_UPDATED_EVENT };
import {
  formatDateInTz,
  formatDateTimeInTz,
  formatTimeInTz,
  formatPlainDate,
  todayInTz,
  toPlainDate,
  plainDateToInstant,
} from '@/lib/utils/dateDisplay';

interface OrganizationTimezoneContextValue {
  /** Zona horaria IANA de la organizacion (ej: 'America/Bogota'). */
  timezone: string;
  /** Horas de operacion opcionales (para dias operativos que cruzan medianoche). */
  operatingHours: OperatingHoursOptions | null;
  /** True mientras se carga el timezone la primera vez. */
  isLoading: boolean;
  /**
   * Overrides por sucursal (`branches.timezone`): branchId -> zona o null.
   * Se lee una sola vez por organizacion (branchTimezoneService) y se
   * invalida al cambiar de organizacion o al guardar la configuracion.
   */
  branchTimezones: BranchTimezoneMap;
  /**
   * Cascada sucursal -> organizacion -> 'America/Bogota'. Gemela de
   * `fn_timezone_for(org, branch)` en la base: si discrepan, es el bug.
   */
  resolveFor: (branchId?: number | null) => { timezone: string; source: TimezoneSource };
}

const OrganizationTimezoneContext = createContext<OrganizationTimezoneContextValue>({
  timezone: DEFAULT_TIMEZONE,
  operatingHours: null,
  isLoading: true,
  branchTimezones: {},
  resolveFor: () => ({ timezone: DEFAULT_TIMEZONE, source: 'fallback' }),
});

/**
 * Provider que obtiene el timezone de la organizacion activa y lo
 * expone a todos los componentes hijos via contexto.
 *
 * Se monta en src/app/app/layout.tsx, dentro de AuthGuard (donde ya
 * se sabe que hay una organizacion seleccionada).
 */
export function OrganizationTimezoneProvider({ children }: { children: React.ReactNode }) {
  const [timezone, setTimezone] = useState<string>(DEFAULT_TIMEZONE);
  const [operatingHours, setOperatingHours] = useState<OperatingHoursOptions | null>(null);
  const [branchTimezones, setBranchTimezones] = useState<BranchTimezoneMap>({});
  const [isLoading, setIsLoading] = useState(true);
  // Estado que fuerza re-carga cuando cambia la organizacion activa
  const [orgVersion, setOrgVersion] = useState(0);

  // Escuchar el evento de cambio de organizacion para invalidar y recargar
  useEffect(() => {
    // Las invalidaciones son SINCRONAS a proposito. Con un `import()` aqui,
    // `setOrgVersion` dispara el efecto de recarga y `getOrganizationTimezone`
    // podria leer la cache vieja antes de que llegara el modulo: la pantalla
    // se quedaria con la zona anterior, que es justo lo que este evento
    // existe para evitar. (Antes era `require()`, que ESLint prohibe.)
    const handleOrgChange = () => {
      invalidateTimezoneCache();
      invalidateBranchTimezoneCache();
      setIsLoading(true);
      setOrgVersion((v) => v + 1);
    };
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, handleOrgChange);
    // Guardar la zona (organizacion o sucursal) invalida y recarga: sin esto
    // la pantalla sigue formateando con la zona anterior hasta un F5.
    window.addEventListener(TIMEZONES_UPDATED_EVENT, handleOrgChange);
    return () => {
      window.removeEventListener(ORGANIZATION_CHANGED_EVENT, handleOrgChange);
      window.removeEventListener(TIMEZONES_UPDATED_EVENT, handleOrgChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const orgId = getOrganizationId();

    if (!orgId || orgId <= 0) {
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const { getOrganizationTimezone } = await import(
          '@/lib/services/organizationTimezoneService'
        );
        const { getOperatingHours } = await import(
          '@/lib/services/organizationOperatingHoursService'
        );
        const { getBranchTimezones } = await import(
          '@/lib/services/branchTimezoneService'
        );

        const [tz, hours, branchTz] = await Promise.all([
          getOrganizationTimezone(orgId),
          getOperatingHours(orgId),
          getBranchTimezones(orgId),
        ]);

        if (!cancelled) {
          setTimezone(tz);
          setOperatingHours(hours);
          setBranchTimezones(branchTz);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('OrganizationTimezoneProvider: error obteniendo timezone:', err);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgVersion]);

  const resolveFor = useCallback(
    (branchId?: number | null) => {
      const resolution = resolveTimezoneForBranch(branchId, branchTimezones, timezone);
      // Politica de avisos UNICA (timezoneFallback): una vez por clave y con
      // miga de Sentry. Antes este archivo tenia la suya, con otro Set y otro
      // texto; era el enganche que ADR-002 dejo abierto.
      avisarResolucionZonaHoraria(resolution, {
        donde: 'OrganizationTimezoneContext.resolveFor',
        branchId: branchId ?? null,
      });
      return { timezone: resolution.timezone, source: resolution.source };
    },
    [branchTimezones, timezone],
  );

  const value = useMemo(
    () => ({ timezone, operatingHours, isLoading, branchTimezones, resolveFor }),
    [timezone, operatingHours, isLoading, branchTimezones, resolveFor],
  );

  return (
    <OrganizationTimezoneContext.Provider value={value}>
      {children}
    </OrganizationTimezoneContext.Provider>
  );
}

/**
 * Hook que devuelve el timezone y horas de operacion de la
 * organizacion activa. Usar en componentes de presentacion para
 * formatear fechas correctamente.
 */
export function useOrgTimezone(): OrganizationTimezoneContextValue {
  return useContext(OrganizationTimezoneContext);
}

/**
 * Zona horaria efectiva — REGLA UNICA (decision del dueno, 2026-09-30):
 * la de la sucursal si la tiene; si no, la de la organizacion; el fallback
 * del sistema solo como ultimo recurso. No hay zona por persona.
 *
 * Que sucursal cuenta (`sucursalParaZona`):
 *  - `branchId` numero: la del DATO (`sale.branch_id`...). Una venta de
 *    Madrid se muestra en hora de Madrid aunque el header diga otra (fase A3).
 *  - `branchId` null: el dato no tiene sucursal -> organizacion.
 *  - sin argumento (`undefined`): la sucursal ACTIVA del header; con «Todas»
 *    -> organizacion.
 *
 * La cascada es `resolveFor` (gemela de `fn_timezone_for`). Con las 94
 * sucursales sin zona propia (2026-09-30) el resultado es identico al de
 * antes: todas heredan la de la organizacion.
 */
export function useTimezoneFor(
  branchId?: number | null,
): { timezone: string; source: TimezoneSource; branchId: number | null } {
  const { resolveFor } = useOrgTimezone();
  const activa = sucursalActivaDelHeader(useBranchOpcional());
  const sucursal = sucursalParaZona(branchId, activa);
  return useMemo(() => ({ ...resolveFor(sucursal), branchId: sucursal }), [resolveFor, sucursal]);
}

/**
 * Hook que devuelve las funciones de formateo de dateDisplay.ts ya
 * "curried" con el timezone de la organizacion. Asi el call-site
 * queda limpio: const { formatDate } = useFormatDate(); formatDate(sale.sale_date)
 *
 * Las funciones devueltas son estables (useCallback) y solo cambian
 * cuando cambia el timezone de la organizacion.
 *
 * Firma ADITIVA (fase A3): con `branchId` formatea en la zona de ESA
 * sucursal (cascada sucursal -> organizacion -> fallback). El parametro es
 * el `branch_id` DEL DATO. Sin parametro (2026-09-30) usa la sucursal ACTIVA
 * del header si tiene zona propia, y si no la de la organizacion (regla unica
 * de `useTimezoneFor`). Las funciones de calculo (`getToday`, `toDate`,
 * `toInstant`) usan la MISMA zona: el dia de negocio de una operacion es el de
 * su sucursal. Con todas las sucursales sin zona propia, nada cambia.
 */
export function useFormatDate(branchId?: number | null) {
  const { timezone } = useTimezoneFor(branchId);

  const formatDate = useCallback(
    (value: string | Date | null | undefined) => formatDateInTz(value, timezone),
    [timezone],
  );

  const formatDateTime = useCallback(
    (value: string | Date | null | undefined) => formatDateTimeInTz(value, timezone),
    [timezone],
  );

  const formatTime = useCallback(
    (value: string | Date | null | undefined) => formatTimeInTz(value, timezone),
    [timezone],
  );

  const getToday = useCallback(
    () => todayInTz(timezone),
    [timezone],
  );

  const toDate = useCallback(
    (date: Date) => toPlainDate(date, timezone),
    [timezone],
  );

  const toInstant = useCallback(
    (plain: string, time?: string) => plainDateToInstant(plain, timezone, time),
    [timezone],
  );

  // formatPlainDate no depende del timezone (es para columnas date puras).
  const formatPlain = useCallback(
    (value: string | null | undefined) => formatPlainDate(value),
    [],
  );

  return {
    timezone,
    formatDate,
    formatDateTime,
    formatTime,
    formatPlain,
    getToday,
    toDate,
    toInstant,
  };
}

/**
 * Azucar para leerlo en el call-site como lo que es: «formatea esta fila con
 * la zona de SU sucursal». Equivale a `useFormatDate(row.branch_id)`.
 */
export function useFormatDateFor(branchId?: number | null) {
  return useFormatDate(branchId);
}
