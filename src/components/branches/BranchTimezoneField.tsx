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
//
// No está en el Figma del formulario de sucursal: va en el bloque Ubicación
// con el mismo `FormField` + `Select` del kit que País, Departamento y Ciudad.
// ============================================================

import React, { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { FormField } from '@/components/kit/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

/**
 * El `Select` de Radix no admite un ítem con valor `''`, que es lo que vale
 * «heredar» (`INHERIT_TIMEZONE_VALUE`). En el control se representa con esta
 * marca y se traduce de vuelta antes de llamar a `onChange`.
 */
const MARCA_HEREDAR = '__heredar__';
const aControl = (v: string) => (v === INHERIT_TIMEZONE_VALUE ? MARCA_HEREDAR : v);
const desdeControl = (v: string) => (v === MARCA_HEREDAR ? INHERIT_TIMEZONE_VALUE : v);

export function BranchTimezoneField({
  value,
  onChange,
  disabled = false,
  idPrefix = 'branch',
}: BranchTimezoneFieldProps) {
  const t = useTranslations('org.acceso.sucursales.formulario.zonaHoraria');
  const { timezone: orgTimezone } = useOrgTimezone();
  const selectId = `${idPrefix}-timezone`;

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
  // Claves: «propia de la sucursal» / «heredada de la organización» / «por defecto del sistema».
  const origen = t(`origen.${effective.source === 'branch' ? 'branch' : effective.source === 'organization' ? 'organization' : 'default'}`);

  return (
    <FormField
      id={selectId}
      etiqueta={t('etiqueta')}
      ayuda={t('ayuda', { zona: effective.timezone, origen })}
    >
      {(campo) => (
        <Select
          name="timezone"
          value={aControl(current)}
          disabled={disabled}
          onValueChange={(v) => {
            const elegido = desdeControl(v);
            onChange(elegido === INHERIT_TIMEZONE_VALUE ? null : elegido);
          }}
        >
          <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} className="h-10 text-left">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {options.map((option) => (
              <SelectItem key={option.value || 'inherit'} value={aControl(option.value)}>
                {option.value === INHERIT_TIMEZONE_VALUE ? t('heredar', { zona: orgTimezone }) : option.label}
              </SelectItem>
            ))}
            {hasCurrent && <SelectItem value={current}>{current}</SelectItem>}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );
}

export default BranchTimezoneField;
