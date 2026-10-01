'use client';

import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';

/**
 * Select del kit (Radix, `@/components/ui/select`) con el aspecto de los campos
 * del CRM: 40 px, borde fuerte, radio 8. Sustituye al `<select>` nativo sin
 * cambiar qué se guarda: trabaja con el mismo `string` y `''` sigue siendo «sin
 * valor».
 *
 * Radix no admite `value=""` en un ítem: la opción vacía (`opcionVacia`, p. ej.
 * «Elegir», «Todos», «Sin responsable») usa el centinela `SIN_VALOR` y se
 * devuelve como `''` en `onValorChange`.
 *
 * Recibe `id` y `aria-*` en el disparador, así que `FormField` lo enlaza igual
 * que a un `<select>` (la etiqueta apunta al disparador).
 */
export const SIN_VALOR = '__ninguno__';

export interface OpcionSelectCrm {
  valor: string;
  etiqueta: React.ReactNode;
  /** Estilo del ítem (p. ej. muestra de color). */
  estilo?: React.CSSProperties;
}

export interface SelectCrmProps {
  valor: string;
  onValorChange: (valor: string) => void;
  opciones: readonly OpcionSelectCrm[];
  /** Texto de la opción vacía (`''`). Sin él, `''` muestra `placeholder`. */
  opcionVacia?: React.ReactNode;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  'aria-busy'?: boolean;
  className?: string;
  /** Contenido del disparador en lugar del texto de la opción (p. ej. solo un color). */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export const CLASE_DISPARADOR_SELECT =
  'h-10 w-full min-w-0 rounded-lg border-line-strong bg-surface px-3 text-sm text-fg ring-offset-0 focus:ring-2 focus:ring-brand focus:ring-offset-0 ' +
  'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-secondary disabled:opacity-100 aria-[invalid=true]:border-danger ' +
  'dark:border-line-strong dark:bg-surface dark:text-fg';

export const SelectCrm = React.forwardRef<HTMLButtonElement, SelectCrmProps>(function SelectCrm(
  { valor, onValorChange, opciones, opcionVacia, placeholder, disabled, className, children, style, ...aria },
  ref,
) {
  const conVacia = opcionVacia !== undefined;
  const valorRadix = valor === '' ? (conVacia ? SIN_VALOR : '') : valor;
  return (
    <Select value={valorRadix} onValueChange={(v) => onValorChange(v === SIN_VALOR ? '' : v)} disabled={disabled}>
      <SelectTrigger ref={ref} {...aria} style={style} className={cn(CLASE_DISPARADOR_SELECT, className)}>
        {children ?? <SelectValue placeholder={placeholder} />}
      </SelectTrigger>
      <SelectContent className="z-[70] rounded-lg border-line bg-surface text-fg dark:border-line dark:bg-surface dark:text-fg">
        {conVacia && <SelectItem value={SIN_VALOR}>{opcionVacia}</SelectItem>}
        {opciones.map((o) => (
          <SelectItem key={o.valor} value={o.valor} style={o.estilo}>
            {o.etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
