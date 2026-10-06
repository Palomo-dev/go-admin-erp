'use client';

/**
 * Teléfono con etiqueta (Figma `PhoneField` 1126:35450): `FormField` + el
 * `PhoneInput` canónico del kit, a 40 px como el resto de campos del
 * formulario. La misma tipografía y el mismo enlace de ayuda/error que los
 * demás campos. Úsalo en cualquier formulario que pida un teléfono o celular.
 */
import * as React from 'react';
import { FormField } from './FormField';
import { PhoneInput, type FormatoTelefono, type TamanoTelefono } from './PhoneInput';

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
  placeholder?: string;
  name?: string;
  onBlur?: () => void;
  /** `md` (40 px) por defecto, como los demás campos de `FormField`. */
  tamano?: TamanoTelefono;
  /** Formato de salida: el de la base (por defecto) o E.164. */
  formato?: FormatoTelefono;
  /**
   * Muestra el aviso de longitud del país al salir del campo cuando el
   * formulario no tiene su propio `error`. Por defecto, sí.
   */
  validarAlSalir?: boolean;
  autoComplete?: string;
  className?: string;
}

export function PhoneField({
  etiqueta,
  valor,
  onValor,
  id,
  error,
  ayuda,
  obligatorio,
  defaultIso,
  disabled,
  placeholder,
  name,
  onBlur,
  tamano = 'md',
  formato,
  validarAlSalir = true,
  autoComplete = 'tel',
  className,
}: PhoneFieldProps) {
  return (
    <FormField etiqueta={etiqueta} id={id} error={error} ayuda={ayuda} obligatorio={obligatorio} className={className}>
      {(campo) => (
        <PhoneInput
          id={campo.id}
          name={name}
          value={valor}
          onChange={onValor}
          onBlur={onBlur}
          placeholder={placeholder}
          defaultIso={defaultIso}
          disabled={disabled}
          required={obligatorio}
          error={!!error}
          showValidation={!error && validarAlSalir}
          tamano={tamano}
          formato={formato}
          autoComplete={autoComplete}
          aria-describedby={campo['aria-describedby']}
          aria-invalid={campo['aria-invalid']}
          aria-required={campo['aria-required']}
        />
      )}
    </FormField>
  );
}
