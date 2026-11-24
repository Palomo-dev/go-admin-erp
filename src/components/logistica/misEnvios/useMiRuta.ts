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
import { addPlainDays, plainDateToInstant } from '@/lib/utils/dateCore';
import { deliveryIntegrationService, type DeliveryDriver } from '@/lib/services/deliveryIntegrationService';
import { listarMisEnvios, obtenerParada, type EnvioApp } from '@/lib/services/logistica/misEnviosService';

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
      })
      .catch(() => !cancelado && setEstado('error'));
    return () => {
      cancelado = true;
    };
  }, [estadoDriver, orgId, driver, desde, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { orgId, driver, envios, estado, recargar, hoy, timezone, zonaDe };
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
