'use client';

import * as React from 'react';
import { cn } from '@/utils/Utils';
import { textoANumero } from './campoNumeroLogica';

/**
 * Campo numérico del manual (Figma `NumberInput`): prefijo («$», símbolo de la
 * moneda de la organización) o sufijo («%», «días», «uds»), alineado a la
 * derecha con cifras tabulares. Admite coma o punto decimal y entrega `null`
 * cuando el campo queda vacío (no confunde «vacío» con 0).
 *
 * Con `FormField` recibe `id`, `aria-describedby` y `aria-invalid`.
 */
export interface CampoNumeroProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'prefix'> {
  valor: number | null | undefined;
  onValorChange: (valor: number | null) => void;
  prefijo?: React.ReactNode;
  sufijo?: React.ReactNode;
  /** Decimales permitidos (0 = entero). */
  decimales?: number;
  minimo?: number;
  maximo?: number;
  alinear?: 'izquierda' | 'derecha';
  tamano?: 'sm' | 'md';
}

export const CampoNumero = React.forwardRef<HTMLInputElement, CampoNumeroProps>(function CampoNumero(
  {
    valor,
    onValorChange,
    prefijo,
    sufijo,
    decimales = 2,
    minimo,
    maximo,
    alinear = 'derecha',
    tamano = 'md',
    className,
    disabled,
    onBlur,
    ...resto
  },
  ref,
) {
  const [texto, setTexto] = React.useState(valor === null || valor === undefined ? '' : String(valor));
  const enfocado = React.useRef(false);

  React.useEffect(() => {
    if (enfocado.current) return;
    setTexto(valor === null || valor === undefined ? '' : String(valor));
  }, [valor]);

  return (
    <div
      className={cn(
        'flex w-full items-center rounded-md border border-line-strong bg-surface text-sm text-fg',
        'focus-within:ring-2 focus-within:ring-brand',
        resto['aria-invalid'] && 'border-line-danger',
        disabled && 'cursor-not-allowed opacity-60',
        tamano === 'sm' ? 'h-8' : 'h-10',
        className,
      )}
    >
      {prefijo !== undefined && (
        <span aria-hidden className="shrink-0 border-r border-line px-2.5 text-fg-secondary">
          {prefijo}
        </span>
      )}
      <input
        ref={ref}
        type="text"
        inputMode={decimales > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        disabled={disabled}
        value={texto}
        onFocus={() => {
          enfocado.current = true;
        }}
        onChange={(e) => {
          const t = e.target.value;
          const patron = decimales > 0 ? /^-?\d*([.,]\d*)?$/ : /^-?\d*$/;
          if (t !== '' && !patron.test(t)) return;
          setTexto(t);
          onValorChange(textoANumero(t, { decimales, minimo, maximo }));
        }}
        onBlur={(e) => {
          enfocado.current = false;
          const n = textoANumero(texto, { decimales, minimo, maximo });
          setTexto(n === null ? '' : String(n));
          onValorChange(n);
          onBlur?.(e);
        }}
        className={cn(
          'h-full w-full min-w-0 bg-transparent px-3 tabular-nums outline-none placeholder:text-fg-muted disabled:cursor-not-allowed',
          alinear === 'derecha' ? 'text-right' : 'text-left',
        )}
        {...resto}
      />
      {sufijo !== undefined && (
        <span aria-hidden className="shrink-0 border-l border-line px-2.5 text-fg-secondary">
          {sufijo}
        </span>
      )}
    </div>
  );
});
