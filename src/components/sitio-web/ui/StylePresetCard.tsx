'use client';

import { CircleCheck } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useTextosComun } from './textos';

/**
 * Preset de estilo del sitio (Figma A/07h: Noir Omakase, Velvet Lounge,
 * Editorial Marfil, Pop Callejero…). Muestra con los colores, la fuente de
 * títulos y el botón del preset: «Aa», «Cocina de autor», «Reservar» y tres
 * puntos de color. Debajo, nombre y par tipográfico. Seleccionado: borde de
 * marca, tinte y check.
 *
 * Los colores y fuentes son DATOS del preset (catálogo de estilos del sitio):
 * se pintan solo dentro de la muestra. Se usa en Diseño, el diálogo de
 * plantilla, el asistente y el estilo global del editor (A/05f).
 */
export interface MuestraEstilo {
  fondo: string;
  texto: string;
  /** Color del botón principal. */
  acento: string;
  /** Texto sobre el acento. */
  textoAcento: string;
  /** `font-family` CSS de los títulos. */
  fuenteTitulos: string;
  /** `font-family` CSS del texto. */
  fuenteTexto?: string;
  /** Radio del botón en px; `9999` = píldora. */
  radioBoton: number;
  /** Tres colores representativos (fondo, texto, acento si no se pasan). */
  puntos?: readonly [string, string, string];
}

export interface StylePresetCardProps {
  nombre: string;
  /** «Cormorant · Inter». */
  fuentes: string;
  muestra: MuestraEstilo;
  seleccionado: boolean;
  onSeleccionar: () => void;
  /** Texto de la muestra; por defecto «Cocina de autor» (el giro lo cambia). */
  textoMuestra?: string;
  /** Texto del botón de la muestra; por defecto «Reservar». */
  textoBoton?: string;
  deshabilitado?: boolean;
  className?: string;
}

export function StylePresetCard({
  nombre,
  fuentes,
  muestra,
  seleccionado,
  onSeleccionar,
  textoMuestra,
  textoBoton,
  deshabilitado,
  className,
}: StylePresetCardProps) {
  const tx = useTextosComun();
  const puntos = muestra.puntos ?? [muestra.texto, muestra.acento, muestra.fondo];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={seleccionado}
      disabled={deshabilitado}
      onClick={onSeleccionar}
      className={cn(
        'flex w-full flex-col gap-2 rounded-xl border p-2 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50',
        seleccionado ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-surface hover:bg-hover',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex aspect-[16/10] w-full flex-col justify-between rounded-lg border border-line p-3"
        style={{ backgroundColor: muestra.fondo, color: muestra.texto }}
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-2xl leading-7" style={{ fontFamily: muestra.fuenteTitulos }}>
            Aa
          </span>
          <span className="text-[11px] leading-4 opacity-80" style={{ fontFamily: muestra.fuenteTexto ?? muestra.fuenteTitulos }}>
            {textoMuestra ?? tx('preset.ejemplo')}
          </span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span
            className="px-2 py-1 text-[11px] font-medium leading-4"
            style={{
              backgroundColor: muestra.acento,
              color: muestra.textoAcento,
              borderRadius: muestra.radioBoton,
              fontFamily: muestra.fuenteTexto ?? muestra.fuenteTitulos,
            }}
          >
            {textoBoton ?? tx('preset.boton')}
          </span>
          <span className="flex gap-1">
            {puntos.map((c, i) => (
              <span key={`${c}-${i}`} className="size-2.5 rounded-full border border-line" style={{ backgroundColor: c }} />
            ))}
          </span>
        </span>
      </span>
      <span className="flex items-start gap-2 px-1 pb-1">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium leading-5 text-fg">{nombre}</span>
          <span className="text-xs leading-4 text-fg-secondary">{fuentes}</span>
        </span>
        {seleccionado && (
          <>
            <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={1.5} />
            <span className="sr-only">{tx('preset.seleccionado')}</span>
          </>
        )}
      </span>
    </button>
  );
}
