'use client';

import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useKitT } from './useIdiomaKit';

/**
 * Campo de formulario (Figma `FormField` default · focus · error): etiqueta,
 * control, ayuda y error. Enlaza por sí solo `id`, `aria-describedby`,
 * `aria-invalid` y `aria-required` con el control.
 *
 * Acepta cualquier control:
 * - un elemento (`<Input />`, `<Textarea />`, `<PhoneInput />`): se le inyectan
 *   las props de accesibilidad;
 * - una función, para controles que las reciben con otro nombre
 *   (`SearchSelect`, `Select` de Radix, `SegmentedControl`):
 *
 * ```tsx
 * <FormField etiqueta="Tipo de documento" obligatorio error={errores.doc}>
 *   {(campo) => (
 *     <Select value={v} onValueChange={setV}>
 *       <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']} />
 *       …
 *     </Select>
 *   )}
 * </FormField>
 *
 * <FormField etiqueta="Tipo de cliente">
 *   {(campo) => (
 *     <SegmentedControl aria-labelledby={campo.idEtiqueta} opciones={…} valor={tipo} onValorChange={setTipo} />
 *   )}
 * </FormField>
 * ```
 *
 * El error se anuncia (`role="alert"`) y el campo con error se marca en rojo.
 * El asterisco de obligatorio va con texto oculto «(obligatorio)».
 */
export interface PropsCampo {
  id: string;
  /** Para controles que no son `<input>` (radiogroup, combobox): úsalo en `aria-labelledby`. */
  idEtiqueta: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

export interface FormFieldProps {
  etiqueta: string;
  children: React.ReactElement | ((campo: PropsCampo) => React.ReactNode);
  ayuda?: React.ReactNode;
  error?: string | null;
  obligatorio?: boolean;
  /** Id del control; por defecto uno generado. */
  id?: string;
  /** Oculta la etiqueta a la vista (sigue para lectores de pantalla). */
  etiquetaOculta?: boolean;
  /** Contenido a la derecha de la etiqueta (contador de caracteres, enlace). */
  extra?: React.ReactNode;
  className?: string;
}

const CLASE_ERROR =
  'border-danger focus-visible:ring-danger/30 aria-[invalid=true]:border-danger';

export function FormField({
  etiqueta,
  children,
  ayuda,
  error,
  obligatorio,
  id: idProp,
  etiquetaOculta,
  extra,
  className,
}: FormFieldProps) {
  const t = useKitT();
  const generado = React.useId();
  const idHijo =
    typeof children !== 'function' && React.isValidElement<{ id?: string }>(children) ? children.props.id : undefined;
  const id = idProp ?? idHijo ?? `campo-${generado}`;
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;
  const describedBy = [idError, idAyuda].filter(Boolean).join(' ') || undefined;

  const idEtiqueta = `${id}-etiqueta`;
  const campo: PropsCampo = {
    id,
    idEtiqueta,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': obligatorio || undefined,
  };

  let control: React.ReactNode;
  if (typeof children === 'function') {
    control = children(campo);
  } else if (React.isValidElement<{ className?: string; id?: string }>(children)) {
    control = React.cloneElement(children, {
      'aria-describedby': campo['aria-describedby'],
      'aria-invalid': campo['aria-invalid'],
      'aria-required': campo['aria-required'],
      id,
      className: cn(children.props.className, error && CLASE_ERROR),
    } as Partial<{ className?: string; id?: string }>);
  } else {
    control = children;
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className={cn('flex items-center justify-between gap-2', etiquetaOculta && 'sr-only')}>
        <label id={idEtiqueta} htmlFor={id} className="text-sm font-medium text-fg">
          {etiqueta}
          {obligatorio && (
            <>
              <span aria-hidden="true" className="ml-0.5 text-danger-text">
                *
              </span>
              <span className="sr-only"> {t('formulario.obligatorio')}</span>
            </>
          )}
        </label>
        {extra}
      </div>
      {control}
      {error && (
        <p id={idError} role="alert" className="flex items-start gap-1.5 text-xs text-danger-text">
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" strokeWidth={1.5} />
          {error}
        </p>
      )}
      {ayuda && (
        <p id={idAyuda} className="text-xs text-fg-muted">
          {ayuda}
        </p>
      )}
    </div>
  );
}
