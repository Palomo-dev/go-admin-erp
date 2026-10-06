'use client';

import { useEffect, useId, useState, type FocusEvent } from 'react';
import { CircleCheck } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { AvisoTonal } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import {
  ajustarHastaContraste,
  contraste,
  CONTRASTE_AA,
  formatearRazon,
  nivelContraste,
  normalizarHex,
} from '@/lib/utils/contrasteColor';
import { useTextosComun } from './textos';

/**
 * Campo de color del sitio (Figma A/07e; Diseño › Estilo y el estilo global
 * del editor A/05f). Tres estados:
 *
 * - normal: muestra 40×40 + hex.
 * - aviso: si el color no llega al mínimo contra `fondo`, aviso ámbar
 *   «Contraste 2,9:1 con el fondo. Mínimo 4,5:1 (AA). Sugerido: #8C6A3F.» y
 *   «Corregir automáticamente».
 * - foco: panel «Colores de tu logo» y chip «Contraste 7,1:1 con el fondo · AA».
 *
 * El color es un DATO del sitio del cliente (borrador V2): se pinta solo en la
 * muestra, nunca tiñe el cromo del ERP. Sustituye a `editor/fields/ColorField`.
 */
export interface ColorFieldProps {
  etiqueta: string;
  /** `#RRGGBB`. */
  valor: string;
  onCambiar: (hex: string) => void;
  /** Fondo contra el que se mide el contraste; sin él no hay aviso. */
  fondo?: string;
  /** Mínimo exigido; 4,5 (AA texto normal) por defecto, 3 para títulos grandes. */
  minimo?: number;
  /** Paleta extraída del logo (se ofrece al enfocar). */
  coloresLogo?: readonly string[];
  descripcion?: string;
  deshabilitado?: boolean;
  id?: string;
  className?: string;
}

export function ColorField({
  etiqueta,
  valor,
  onCambiar,
  fondo,
  minimo = CONTRASTE_AA,
  coloresLogo,
  descripcion,
  deshabilitado,
  id: idProp,
  className,
}: ColorFieldProps) {
  const tx = useTextosComun();
  const locale = useLocaleIntl();
  const idAuto = useId();
  const id = idProp ?? idAuto;
  const idAyuda = `${id}-ayuda`;
  const [texto, setTexto] = useState(valor);
  const [enfocado, setEnfocado] = useState(false);
  useEffect(() => setTexto(valor), [valor]);

  const hex = normalizarHex(texto);
  const invalido = texto.trim() !== '' && !hex;
  const razon = hex && fondo ? contraste(hex, fondo) : null;
  const insuficiente = razon !== null && razon < minimo;
  const sugerido = insuficiente && hex && fondo ? ajustarHastaContraste(hex, fondo, minimo) : null;
  const paleta = (coloresLogo ?? []).map(normalizarHex).filter((c): c is string => !!c);

  const escribir = (v: string) => {
    setTexto(v);
    const n = normalizarHex(v);
    if (n && /^#?[0-9a-f]{6}$/i.test(v.trim())) onCambiar(n);
  };
  const alSalir = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setEnfocado(false);
    // Al salir se confirma un #rgb corto o se vuelve al último válido.
    if (hex) {
      if (hex !== normalizarHex(valor)) onCambiar(hex);
      setTexto(hex);
    } else {
      setTexto(valor);
    }
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)} onFocus={() => setEnfocado(true)} onBlur={alSalir}>
      <label htmlFor={id} className="text-[13px] font-medium leading-[18px] text-fg">
        {etiqueta}
      </label>
      <div className="flex items-center gap-2">
        <label
          className={cn(
            'relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line-strong',
            'focus-within:ring-2 focus-within:ring-brand',
            deshabilitado && 'cursor-not-allowed opacity-50',
          )}
          style={{ backgroundColor: hex ?? valor }}
        >
          <span className="sr-only">{tx('color.selector', { nombre: etiqueta })}</span>
          <input
            type="color"
            value={(hex ?? normalizarHex(valor) ?? '#000000').toLowerCase()}
            onChange={(e) => escribir(e.target.value.toUpperCase())}
            disabled={deshabilitado}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <input
          id={id}
          value={texto}
          onChange={(e) => escribir(e.target.value)}
          disabled={deshabilitado}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalido || insuficiente || undefined}
          aria-describedby={idAyuda}
          className={cn(
            'h-10 min-w-0 flex-1 rounded-lg border bg-surface px-3 font-mono text-sm uppercase tabular-nums text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
            invalido ? 'border-line-danger' : enfocado ? 'border-brand' : 'border-line-strong',
          )}
        />
      </div>

      <div id={idAyuda} className="flex flex-col gap-1.5">
        {descripcion && <p className="text-[13px] leading-[18px] text-fg-secondary">{descripcion}</p>}
        {invalido && <p className="text-[13px] leading-[18px] text-danger-text">{tx('color.hexInvalido')}</p>}
        {insuficiente && razon !== null && (
          <>
            <AvisoTonal
              tono="advertencia"
              compacto
              titulo={
                sugerido
                  ? tx('color.aviso', {
                      razon: formatearRazon(razon, locale),
                      minimo: formatearRazon(minimo, locale),
                      sugerido,
                    })
                  : tx('color.avisoSinSugerido', { razon: formatearRazon(razon, locale), minimo: formatearRazon(minimo, locale) })
              }
            />
            {sugerido && (
              <button
                type="button"
                onClick={() => {
                  setTexto(sugerido);
                  onCambiar(sugerido);
                }}
                className="self-start rounded-md text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {tx('color.corregir')}
              </button>
            )}
          </>
        )}
        {enfocado && (paleta.length > 0 || (razon !== null && !insuficiente)) && (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3">
            {paleta.length > 0 && (
              <>
                <p className="text-xs font-medium text-fg-secondary">{tx('color.coloresLogo')}</p>
                <div className="flex flex-wrap gap-2">
                  {paleta.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setTexto(c);
                        onCambiar(c);
                      }}
                      aria-label={tx('color.elegir', { color: c })}
                      aria-pressed={hex === c}
                      className={cn(
                        'size-7 rounded-full border border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                        hex === c && 'ring-2 ring-brand ring-offset-2',
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </>
            )}
            {razon !== null && !insuficiente && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-success-text">
                <CircleCheck aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {tx('color.contrasteBien', { razon: formatearRazon(razon, locale), nivel: nivelContraste(razon) === 'AAA' ? 'AAA' : 'AA' })}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
