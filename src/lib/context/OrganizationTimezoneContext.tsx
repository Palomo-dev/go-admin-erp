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

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getOrganizationId, ORGANIZATION_CHANGED_EVENT } from '@/lib/hooks/useOrganization';
import { DEFAULT_TIMEZONE, type OperatingHoursOptions } from '@/lib/utils/timezone';
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
}

const OrganizationTimezoneContext = createContext<OrganizationTimezoneContextValue>({
  timezone: DEFAULT_TIMEZONE,
  operatingHours: null,
  isLoading: true,
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
  const [isLoading, setIsLoading] = useState(true);
  // Estado que fuerza re-carga cuando cambia la organizacion activa
  const [orgVersion, setOrgVersion] = useState(0);

  // Escuchar el evento de cambio de organizacion para invalidar y recargar
  useEffect(() => {
    const handleOrgChange = () => {
      const { invalidateTimezoneCache } = require('@/lib/services/organizationTimezoneService');
      invalidateTimezoneCache();
      setIsLoading(true);
      setOrgVersion(v => v + 1);
    };
    window.addEventListener(ORGANIZATION_CHANGED_EVENT, handleOrgChange);
    return () => window.removeEventListener(ORGANIZATION_CHANGED_EVENT, handleOrgChange);
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
        const { getOrganizationTimezone } = await import('@/lib/services/organizationTimezoneService');
        const { getOperatingHours } = await import('@/lib/services/organizationOperatingHoursService');

        const [tz, hours] = await Promise.all([
          getOrganizationTimezone(orgId),
          getOperatingHours(orgId),
        ]);

        if (!cancelled) {
          setTimezone(tz);
          setOperatingHours(hours);
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

  return (
    <OrganizationTimezoneContext.Provider value={{ timezone, operatingHours, isLoading }}>
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
 * Hook que devuelve las funciones de formateo de dateDisplay.ts ya
 * "curried" con el timezone de la organizacion. Asi el call-site
 * queda limpio: const { formatDate } = useFormatDate(); formatDate(sale.sale_date)
 *
 * Las funciones devueltas son estables (useCallback) y solo cambian
 * cuando cambia el timezone de la organizacion.
 */
export function useFormatDate() {
  const { timezone } = useOrgTimezone();

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
