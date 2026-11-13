'use client';

/**
 * Qué pestañas de Roles y permisos ve la persona en Organización › Equipo y sus
 * contadores (`GET /api/organizacion/roles/resumen`). Lo decide el servidor con
 * las mismas reglas que las pantallas de Roles; aquí no se deduce nada.
 *
 * Fail-closed: mientras carga o si falla, `null` (las pestañas de Roles y
 * Cargos no se ofrecen). La última respuesta se recuerda por organización para
 * que pasar de Miembros a Invitaciones no haga parpadear las pestañas, y las
 * pestañas y el menú de fila de Miembros comparten una sola petición en vuelo.
 */
import { useEffect, useState } from 'react';
import { clienteRoles } from '@/lib/services/roles/clienteRoles';
import type { ResumenEquipo } from '@/lib/roles/tipos';

let ultima: { organizationId: number; datos: ResumenEquipo } | null = null;
let enVuelo: { organizationId: number; promesa: Promise<ResumenEquipo> } | null = null;

/** Solo pruebas: la caché vive en el módulo. */
export function olvidarResumenEquipo(): void {
  ultima = null;
  enVuelo = null;
}

function pedir(organizationId: number): Promise<ResumenEquipo> {
  if (enVuelo?.organizationId !== organizationId) {
    const promesa = clienteRoles.resumen().finally(() => {
      if (enVuelo?.promesa === promesa) enVuelo = null;
    });
    enVuelo = { organizationId, promesa };
  }
  return enVuelo.promesa;
}

export function useResumenEquipo(organizationId: number | null): ResumenEquipo | null {
  const deCache = organizationId !== null && ultima?.organizationId === organizationId ? ultima.datos : null;
  const [datos, setDatos] = useState<ResumenEquipo | null>(deCache);

  useEffect(() => {
    if (organizationId === null) return;
    let vigente = true;
    setDatos(ultima?.organizationId === organizationId ? ultima.datos : null);
    pedir(organizationId)
      .then((r) => {
        ultima = { organizationId, datos: r };
        if (vigente) setDatos(r);
      })
      .catch(() => {
        if (vigente) setDatos(null);
      });
    return () => {
      vigente = false;
    };
  }, [organizationId]);

  return organizationId === null ? null : datos;
}
