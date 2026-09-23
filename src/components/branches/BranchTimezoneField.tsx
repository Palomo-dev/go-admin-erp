'use client';

// ============================================================
// Selector de zona horaria de UNA sucursal (fase A3).
//
// Por defecto la sucursal HEREDA la zona de la organización: esa es la
// primera opción y corresponde a `branches.timezone = NULL`. Elegir una zona
// propia solo tiene sentido cuando la sucursal está en otro país o huso.
//
// Debajo del selector se dice siempre cuál se está aplicando y de dónde
// viene («heredada de la organización» / «propia de la sucursal»), porque el
// valor NULL por sí solo no le dice nada a quien configura.
// ============================================================

import React, { useMemo } from 'react';
import { GlobeAltIcon } from '@heroicons/react/24/outline';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { TIMEZONE_OPTIONS } from '@/lib/utils/timezoneCatalog';
import {
  buildBranchTimezoneOptions,
  resolveTimezoneCascade,
  INHERIT_TIMEZONE_VALUE,
} from '@/lib/utils/branchTimezoneCascade';

interface BranchTimezoneFieldProps {
  /** Valor guardado en `branches.timezone` (null/'' = hereda). */
  value: string | null | undefined;
  /** Devuelve la zona elegida, o `null` cuando se elige «heredar». */
  onChange: (timezone: string | null) => void;
  disabled?: boolean;
  /** Distingue los ids cuando hay varias fichas en la misma pantalla. */
  idPrefix?: string;
}

const SELECT_CLASS =
  'select select-bordered w-full bg-gray-50 dark:bg-gray-700 dark:text-gray-100 ' +
  'focus:ring-2 focus:ring-blue-500 transition-all duration-200';

export function BranchTimezoneField({
  value,
  onChange,
  disabled = false,
  idPrefix = 'branch',
}: BranchTimezoneFieldProps) {
  const { timezone: orgTimezone } = useOrgTimezone();
  const selectId = `${idPrefix}-timezone`;
  const helpId = `${idPrefix}-timezone-help`;

  const options = useMemo(
    () => buildBranchTimezoneOptions(orgTimezone, TIMEZONE_OPTIONS),
    [orgTimezone],
  );

  // Una zona guardada que no esté en el catálogo (migrada a mano, país nuevo)
  // debe poder verse y conservarse: se añade como opción extra.
  const current = typeof value === 'string' ? value.trim() : '';
  const hasCurrent = current.length > 0 && !options.some((o) => o.value === current);

  const effective = resolveTimezoneCascade({
    branchTimezone: current,
    organizationTimezone: orgTimezone,
  });
  const origen =
    effective.source === 'branch'
      ? 'propia de la sucursal'
      : effective.source === 'organization'
        ? 'heredada de la organización'
        : 'por defecto del sistema';

  return (
    <div>
      <label
        htmlFor={selectId}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
      >
        <span className="inline-flex items-center gap-1.5">
          <GlobeAltIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          Zona horaria
        </span>
      </label>
      <select
        id={selectId}
        name="timezone"
        value={current}
        disabled={disabled}
        aria-describedby={helpId}
        onChange={(e) =>
          onChange(e.target.value === INHERIT_TIMEZONE_VALUE ? null : e.target.value)
        }
        className={SELECT_CLASS}
      >
        {options.map((option) => (
          <option key={option.value || 'inherit'} value={option.value}>
            {option.label}
          </option>
        ))}
        {hasCurrent && <option value={current}>{current}</option>}
      </select>
      <p id={helpId} className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Se aplica <strong>{effective.timezone}</strong> ({origen}). Las fechas de esta sucursal
        se muestran e imprimen en esa zona, aunque quien las mire esté en otra.
      </p>
    </div>
  );
}

export default BranchTimezoneField;
