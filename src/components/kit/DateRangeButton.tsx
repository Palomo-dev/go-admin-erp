'use client';

import * as React from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/Utils';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { CalendarioMes } from './CalendarioMes';
import { elegirEnRango, etiquetaDiaCorta } from './calendarioLogica';
import { normalizarRango, presetDe, presetsRango, type IdPresetRango, type RangoFechas } from './rangoFechas';
import { useEtiquetaRango, useKitT, useLocaleIntl } from './useIdiomaKit';

/**
 * Botón de rango de fechas de la barra de un listado (Figma 680:407222:
 * «📅 1 – 22 sep 2026 ▾», 40 px, junto al buscador). Abre el panel del
 * componente `DateRange` de Figma (104:3343): atajos en chips arriba,
 * calendario con el tramo en Tinte GO y los extremos en Azul acción, y el pie
 * «Desde … · Hasta …». El rango se elige con dos clics (inicio y fin).
 *
 * Trabaja con días calendario puros (`YYYY-MM-DD`). La zona horaria es de la
 * pantalla: pasa `hoy` con `useFormatDate().getToday()` y convierte a
 * instantes con `toInstant` al consultar (ver `rangoFechas.ts`).
 */
export interface DateRangeButtonProps {
  /** `null` muestra el placeholder sin aplicar un periodo implícito. */
  valor: RangoFechas | null;
  onValorChange: (rango: RangoFechas) => void;
  /** «Hoy» en la zona de la organización (YYYY-MM-DD). */
  hoy: string;
  /** Nombre accesible del botón. */
  etiqueta?: string;
  /** No se puede elegir más allá de este día (por defecto, `hoy`). */
  max?: string;
  /** No se puede elegir antes de este día. */
  min?: string;
  /** Si llega, el pie muestra «Limpiar» (la pantalla decide a qué rango vuelve). */
  onLimpiar?: () => void;
  deshabilitado?: boolean;
  className?: string;
}

/** Clave de `kit.rango.*` de cada atajo: [chip corto, nombre completo]. */
const CLAVE_PRESET: Record<IdPresetRango, [string, string]> = {
  hoy: ['hoy', 'hoy'],
  ayer: ['ayer', 'ayer'],
  '7d': ['dias7', 'ultimos7'],
  '30d': ['dias30', 'ultimos30'],
  mes: ['esteMes', 'esteMes'],
  mesPasado: ['mesPasado', 'mesPasado'],
};

export function DateRangeButton({
  valor,
  onValorChange,
  hoy,
  etiqueta: etiquetaProp,
  max,
  min,
  onLimpiar,
  deshabilitado,
  className,
}: DateRangeButtonProps) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const etiquetaRango = useEtiquetaRango();
  const etiqueta = etiquetaProp ?? t('rango.etiqueta');
  const [abierto, setAbierto] = React.useState(false);
  /** Primer día elegido mientras falta el segundo. */
  const [ancla, setAncla] = React.useState<string | null>(null);
  /** Día bajo el puntero o el foco: vista previa del rango. */
  const [activo, setActivo] = React.useState<string | null>(null);
  const tope = max ?? hoy;
  const refBoton = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!abierto) {
      setAncla(null);
      setActivo(null);
    }
  }, [abierto]);

  const rangoActual = valor ? normalizarRango(valor) : null;
  const textoRango = rangoActual ? etiquetaRango(rangoActual) : etiqueta;
  const presetActivo = rangoActual ? presetDe(rangoActual, hoy) : null;
  const rangoVisible = ancla ? normalizarRango({ desde: ancla, hasta: activo ?? ancla }) : rangoActual;

  const aplicar = (rango: RangoFechas) => {
    onValorChange(normalizarRango(rango));
    setAbierto(false);
  };

  const elegir = (dia: string) => {
    const r = elegirEnRango(ancla, dia);
    if (r.completo) {
      aplicar({ desde: r.desde, hasta: r.hasta });
    } else {
      setAncla(r.ancla);
      setActivo(dia);
    }
  };

  return (
    <PopoverPrimitive.Root open={abierto} onOpenChange={setAbierto}>
      <PopoverPrimitive.Trigger asChild>
        <button
          ref={refBoton}
          type="button"
          disabled={deshabilitado}
          aria-haspopup="dialog"
          aria-label={rangoActual ? `${etiqueta}: ${textoRango}` : etiqueta}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors hover:bg-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-brand',
            className,
          )}
        >
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
          <span className="whitespace-nowrap tabular-nums">{textoRango}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          aria-label={etiqueta}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            refBoton.current?.focus();
          }}
          className="z-[70] flex w-[320px] max-w-[calc(100vw-16px)] flex-col gap-2 rounded-xl border border-line bg-surface p-3 text-fg shadow-md outline-none"
        >
          <div role="group" aria-label={t('rango.atajos')} className="flex flex-wrap items-center gap-1.5">
            {presetsRango(hoy).map((p) => {
              const [corta, larga] = CLAVE_PRESET[p.id];
              const activoPreset = presetActivo === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={activoPreset}
                  aria-label={t(`rango.${larga}`)}
                  onClick={() => aplicar(p.rango)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    activoPreset
                      ? 'border-brand bg-brand-tint text-brand-deep'
                      : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover',
                  )}
                >
                  {activoPreset && <Check aria-hidden="true" className="size-3.5" strokeWidth={1.5} />}
                  {t(`rango.${corta}`)}
                </button>
              );
            })}
          </div>
          <CalendarioMes
            rango={rangoVisible}
            diaInicial={rangoActual?.hasta ?? hoy}
            onElegir={elegir}
            onDiaActivo={(d) => {
              if (ancla) setActivo(d);
            }}
            min={min}
            max={tope}
            hoy={hoy}
            enfocarAlMontar
          />
          <div className="flex items-center justify-between gap-2 text-xs font-medium">
            <p aria-live="polite" className="text-fg-secondary">
              {ancla
                ? t('calendario.eligeFin', { desde: etiquetaDiaCorta(ancla, locale) })
                : rangoVisible ? t('calendario.pieRango', {
                    desde: etiquetaDiaCorta(rangoVisible.desde, locale),
                    hasta: etiquetaDiaCorta(rangoVisible.hasta, locale),
                  }) : etiqueta}
            </p>
            {onLimpiar && (
              <button
                type="button"
                onClick={() => {
                  onLimpiar();
                  setAbierto(false);
                }}
                className="rounded-md px-1 py-0.5 text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {t('calendario.limpiar')}
              </button>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
