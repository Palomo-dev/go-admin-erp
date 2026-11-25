'use client';

/**
 * Datos de «Mis envíos»: el domiciliario de la sesión y su ruta.
 *
 * El domiciliario sale de `getDriverForUser(usuario, organización)` (driver_credentials.user_id,
 * o la cadena de Recursos humanos): nunca de la URL. Los envíos se leen con el cliente del
 * navegador (RLS de miembro) filtrando por SU `driver_id`. Las lecturas pasan por el cliente con
 * caché sin conexión (`offlineCache`): con la última ruta cargada, la lista se sigue viendo sin señal.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays, plainDateToInstant, startOfDayInstant } from '@/lib/utils/dateCore';
import { deliveryIntegrationService, type DeliveryDriver } from '@/lib/services/deliveryIntegrationService';
import { cuadresDesde, listarMisEnvios, obtenerParada, type CuadreJornada, type EnvioApp } from '@/lib/services/logistica/misEnviosService';

export type EstadoCarga = 'cargando' | 'sin_domiciliario' | 'error' | 'listo';

/** Quién es el domiciliario de la sesión en la organización activa. */
export function useDomiciliarioSesion() {
  const { organization } = useOrganization();
  const orgId = organization?.id ?? null;
  const [driver, setDriver] = useState<DeliveryDriver | null>(null);
  const [estado, setEstado] = useState<EstadoCarga>('cargando');

  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    setEstado('cargando');
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelado) setEstado('sin_domiciliario');
          return;
        }
        const d = await deliveryIntegrationService.getDriverForUser(user.id, orgId);
        if (cancelado) return;
        setDriver(d);
        setEstado(d ? 'listo' : 'sin_domiciliario');
      } catch {
        if (!cancelado) setEstado('error');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [orgId]);

  return { orgId, driver, estado };
}

/** Día de la organización y zona de cada envío (la de SU sede). */
export function useDiaRuta() {
  const { getToday, timezone } = useFormatDate(null);
  const { resolveFor } = useOrgTimezone();
  const hoy = getToday();
  const zonaDe = useCallback((e: { branch_id?: number | null }) => resolveFor(e.branch_id ?? null).timezone, [resolveFor]);
  return { hoy, timezone, zonaDe };
}

export function useMiRuta() {
  const { orgId, driver, estado: estadoDriver } = useDomiciliarioSesion();
  const { hoy, timezone, zonaDe } = useDiaRuta();
  const [envios, setEnvios] = useState<EnvioApp[]>([]);
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const [version, setVersion] = useState(0);
  /** Hora de la última carga buena («Sin conexión · ves la ruta de las 10:58»). */
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null);

  // Desde el inicio de AYER en la zona de la organización: cubre «hoy» en cualquier sede.
  const desde = useMemo(() => new Date(plainDateToInstant(addPlainDays(hoy, -1), timezone)).toISOString(), [hoy, timezone]);

  useEffect(() => {
    if (estadoDriver !== 'listo') {
      setEstado(estadoDriver);
      return;
    }
    if (!orgId || !driver) return;
    let cancelado = false;
    setEstado((e) => (e === 'listo' ? e : 'cargando'));
    listarMisEnvios(supabase, orgId, driver.id, desde)
      .then((r) => {
        if (cancelado) return;
        setEnvios(r);
        setEstado('listo');
        setActualizadoEn(new Date());
      })
      .catch(() => !cancelado && setEstado('error'));
    return () => {
      cancelado = true;
    };
  }, [estadoDriver, orgId, driver, desde, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { orgId, driver, envios, estado, recargar, hoy, timezone, zonaDe, desde, actualizadoEn };
}

/** Una parada del domiciliario de la sesión (null si no es suya). */
export function useParada(shipmentId: string | null) {
  const { orgId, driver, estado: estadoDriver } = useDomiciliarioSesion();
  const [envio, setEnvio] = useState<EnvioApp | null>(null);
  const [estado, setEstado] = useState<EstadoCarga | 'no_encontrado'>('cargando');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (estadoDriver !== 'listo') {
      setEstado(estadoDriver);
      return;
    }
    if (!orgId || !driver || !shipmentId) return;
    let cancelado = false;
    obtenerParada(supabase, orgId, driver.id, shipmentId)
      .then((r) => {
        if (cancelado) return;
        setEnvio(r);
        setEstado(r ? 'listo' : 'no_encontrado');
      })
      .catch(() => !cancelado && setEstado('error'));
    return () => {
      cancelado = true;
    };
  }, [estadoDriver, orgId, driver, shipmentId, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { orgId, driver, envio, estado, recargar };
}

/**
 * El último cuadre CERRADO antes de hoy del domiciliario («Cuadre de ayer: cuadrado · sin
 * diferencia» en el computador). Lee `courier_settlements` por RLS; si falla, no se muestra.
 */
export function useUltimoCuadre(orgId: number | null, driverId: string | null, hoy: string, timezone: string, activo = true) {
  const [cuadre, setCuadre] = useState<CuadreJornada | null>(null);
  useEffect(() => {
    if (!activo || !orgId || !driverId) return;
    let cancelado = false;
    const inicioHoy = startOfDayInstant(hoy, timezone).toISOString();
    const desde = startOfDayInstant(addPlainDays(hoy, -14), timezone).toISOString();
    cuadresDesde(supabase, orgId, driverId, desde)
      .then((lista) => {
        if (cancelado) return;
        setCuadre(lista.find((c) => c.status === 'closed' && c.opened_at < inicioHoy) ?? null);
      })
      .catch(() => !cancelado && setCuadre(null));
    return () => {
      cancelado = true;
    };
  }, [activo, orgId, driverId, hoy, timezone]);
  return cuadre;
}
