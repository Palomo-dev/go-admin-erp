'use client';

/**
 * Teléfono con etiqueta (Figma `PhoneField` 1126:35450): `FormField` + el
 * `PhoneInput` de siempre (indicativo por país). La misma tipografía y el
 * mismo enlace de ayuda/error que el resto de campos.
 */
import * as React from 'react';
import { FormField } from '@/components/kit/FormField';
import { PhoneInput } from '@/components/ui/phone-input';

export interface PhoneFieldProps {
  etiqueta: string;
  valor: string;
  onValor: (v: string) => void;
  id?: string;
  error?: string | null;
  ayuda?: React.ReactNode;
  obligatorio?: boolean;
  /** ISO de 2 letras del país a preseleccionar (el del navegador en el registro). */
  defaultIso?: string;
  disabled?: boolean;
}

export function PhoneField({ etiqueta, valor, onValor, id, error, ayuda, obligatorio, defaultIso, disabled }: PhoneFieldProps) {
  return (
    <FormField etiqueta={etiqueta} id={id} error={error} ayuda={ayuda} obligatorio={obligatorio}>
      {(campo) => (
        <PhoneInput
          id={campo.id}
          value={valor}
          onChange={onValor}
          defaultIso={defaultIso}
          disabled={disabled}
          required={obligatorio}
          error={!!error}
          showValidation={false}
          autoComplete="tel"
          aria-describedby={campo['aria-describedby']}
          aria-invalid={campo['aria-invalid']}
        />
      )}
    </FormField>
  );
}
