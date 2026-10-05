'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { reservasMesasService } from '@/components/pos/reservas-mesas/reservasMesasService';
import {
  diasAConsultar,
  reservasActivasPorMesa,
  type ReservaActivaMesa,
  type ReservaParaMesa,
} from './reservasProximas';
import type { TableWithSession } from './types';

/** Cada cuánto se reevalúa «ahora» (la ventana de 60 min avanza sola). */
const TIC_MS = 60_000;

/**
 * Reservas confirmadas que hoy apartan una mesa de la pantalla de Mesas.
 *
 * Una sola consulta a `restaurant_reservations` (confirmadas, de la sucursal
 * activa o de todas, en el rango de días que puede tocar la ventana); el
 * cálculo de la ventana es puro (`reservasActivasPorMesa`) y usa la zona de
 * la sucursal de cada reserva (`resolveFor`, gemela de `fn_timezone_for`).
 * El reloj avanza cada minuto: una reserva entra y sale de «reservada» sin
 * recargar la página.
 */
export function useReservasMesas(mesas: readonly TableWithSession[], branchFilter: number | null) {
  const { resolveFor, isLoading: zonaCargando } = useOrgTimezone();
  const [ahora, setAhora] = useState(() => new Date());
  const [reservas, setReservas] = useState<ReservaParaMesa[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), TIC_MS);
    return () => window.clearInterval(id);
  }, []);

  const zonaDe = useCallback((branchId: number) => resolveFor(branchId).timezone, [resolveFor]);

  // Zonas implicadas: la de la sucursal activa, o la de cada sucursal con mesas.
  const zonas = useMemo(() => {
    const sucursales = branchFilter != null
      ? [branchFilter]
      : Array.from(new Set(mesas.map((m) => m.branch_id)));
    const lista = sucursales.map(zonaDe);
    if (lista.length === 0) lista.push(resolveFor(null).timezone);
    return Array.from(new Set(lista));
  }, [branchFilter, mesas, zonaDe, resolveFor]);

  const { desde, hasta } = diasAConsultar(ahora, zonas);

  useEffect(() => {
    if (zonaCargando) return;
    let cancelado = false;
    reservasMesasService
      .getReservations({ status: ['confirmed'], date_from: desde, date_to: hasta, branch_id: branchFilter })
      .then((filas) => {
        if (!cancelado) setReservas(filas);
      })
      .catch((error) => {
        // Sin reservas la pantalla sigue siendo útil: las mesas se ven libres.
        console.error('Error cargando reservas de mesas:', error);
        if (!cancelado) setReservas([]);
      });
    return () => {
      cancelado = true;
    };
  }, [desde, hasta, branchFilter, version, zonaCargando]);

  const activas: Map<string, ReservaActivaMesa> = useMemo(
    () => reservasActivasPorMesa(reservas, ahora, zonaDe),
    [reservas, ahora, zonaDe],
  );

  const recargar = useCallback(() => {
    setAhora(new Date());
    setVersion((v) => v + 1);
  }, []);

  return { activas, ahora, recargar };
}
