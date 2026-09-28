'use client';

// ============================================================
// Selector de zona horaria de la ORGANIZACIÓN (fase A, punto 4).
//
// Hasta ahora `organizations.timezone` solo se podía cambiar desde
// Configuración → Calendario, que está detrás del módulo `calendar`
// (`configModulesRegistry`). Una organización sin ese módulo —una tienda de
// calzado con POS e inventario, por ejemplo— no tenía NINGUNA pantalla para
// fijar su zona: se quedaba con el default y todas sus fechas salían en hora
// de Bogotá. Por eso vive en General, que es `isCore: true`.
//
// Guardar pasa por `guardarZonaOrganizacion`, es decir por
// `PUT /api/organization/timezone`, donde el permiso se comprueba en el
// servidor por id de rol (reglas duras 5 y 6). El botón deshabilitado es
// comodidad, no seguridad.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import { GlobeAltIcon } from '@heroicons/react/24/outline';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { TIMEZONE_OPTIONS } from '@/lib/utils/timezoneCatalog';
import { guardarZonaOrganizacion } from '@/lib/services/timezoneSettingsService';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';

const SELECT_CLASS =
  'w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm ' +
  'text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 ' +
  'dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100';

export default function OrganizationTimezoneCard() {
  const { timezone, isLoading } = useOrgTimezone();
  const [seleccion, setSeleccion] = useState<string>(timezone);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  // La zona real llega de forma asíncrona: hasta entonces el contexto sirve
  // el default y el selector debe seguirla, no quedarse clavado en Bogotá.
  useEffect(() => {
    if (!isLoading) setSeleccion(timezone);
  }, [timezone, isLoading]);

  // Una zona guardada fuera del catálogo (un país nuevo, una fila migrada a
  // mano) tiene que poder verse y conservarse.
  const opciones = useMemo(() => {
    const fuera = timezone && !TIMEZONE_OPTIONS.some((o) => o.value === timezone);
    return fuera ? [...TIMEZONE_OPTIONS, { value: timezone, label: timezone }] : TIMEZONE_OPTIONS;
  }, [timezone]);

  const ahora = useMemo(() => formatDateTimeInTz(new Date(), seleccion), [seleccion]);
  const cambiada = seleccion !== timezone;

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setExito(null);
    try {
      await guardarZonaOrganizacion(seleccion);
      setExito('Zona horaria actualizada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la zona horaria');
      setSeleccion(timezone);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section
      aria-labelledby="org-timezone-title"
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6
        dark:border-gray-700 dark:bg-gray-800"
    >
      <h2
        id="org-timezone-title"
        className="flex items-center gap-2 text-base font-semibold text-gray-900
          dark:text-gray-100"
      >
        <GlobeAltIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        Zona horaria
      </h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Es la zona con la que se calculan e imprimen las fechas de toda la organización. Cada
        sucursal puede tener la suya propia desde su ficha; las que no, heredan esta.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label
            htmlFor="org-timezone"
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Zona de la organización
          </label>
          <select
            id="org-timezone"
            value={seleccion}
            disabled={isLoading || guardando}
            aria-describedby="org-timezone-help"
            onChange={(e) => setSeleccion(e.target.value)}
            className={SELECT_CLASS}
          >
            {opciones.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={guardar}
          disabled={!cambiada || guardando || isLoading}
          className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white
            transition-colors hover:bg-blue-700 disabled:cursor-not-allowed
            disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      <p id="org-timezone-help" className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Con <strong>{seleccion}</strong> ahora mismo son las {ahora}.
      </p>

      <div aria-live="polite" className="mt-2 min-h-[1.25rem]">
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {exito && <p className="text-xs text-green-700 dark:text-green-400">{exito}</p>}
      </div>
    </section>
  );
}
