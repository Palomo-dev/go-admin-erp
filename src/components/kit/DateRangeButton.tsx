'use client';

import * as React from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/Utils';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { esFechaPlana, etiquetaRango, normalizarRango, presetDe, presetsRango, type RangoFechas } from './rangoFechas';

/**
 * Botón de rango de fechas de la barra de un listado (Figma 680:407222:
 * «📅 1 – 22 sep 2026 ▾», 40 px, junto al buscador). Abre un panel con
 * atajos (Hoy, Últimos 7 días, Este mes…) y dos campos de día.
 *
 * Trabaja con días calendario puros (`YYYY-MM-DD`). La zona horaria es de la
 * pantalla: pasa `hoy` con `useFormatDate().getToday()` y convierte a
 * instantes con `toInstant` al consultar (ver `rangoFechas.ts`).
 */
export interface DateRangeButtonProps {
  valor: RangoFechas;
  onValorChange: (rango: RangoFechas) => void;
  /** «Hoy» en la zona de la organización (YYYY-MM-DD). */
  hoy: string;
  /** Nombre accesible del botón. */
  etiqueta?: string;
  /** No se puede elegir más allá de este día (por defecto, `hoy`). */
  max?: string;
  deshabilitado?: boolean;
  className?: string;
}

const CAMPO =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function DateRangeButton({
  valor,
  onValorChange,
  hoy,
  etiqueta = 'Rango de fechas',
  max,
  deshabilitado,
  className,
}: DateRangeButtonProps) {
  const [abierto, setAbierto] = React.useState(false);
  const [borrador, setBorrador] = React.useState<RangoFechas>(valor);
  const idDesde = React.useId();
  const idHasta = React.useId();
  const tope = max ?? hoy;

  React.useEffect(() => {
    if (abierto) setBorrador(valor);
  }, [abierto, valor]);

  const presetActivo = presetDe(valor, hoy);
  const valido = esFechaPlana(borrador.desde) && esFechaPlana(borrador.hasta);

  const aplicar = (rango: RangoFechas) => {
    onValorChange(normalizarRango(rango));
    setAbierto(false);
  };

  return (
    <PopoverPrimitive.Root open={abierto} onOpenChange={setAbierto}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={deshabilitado}
          aria-label={`${etiqueta}: ${etiquetaRango(valor)}`}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg transition-colors hover:bg-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-hover',
            className,
          )}
        >
          <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
          <span className="whitespace-nowrap tabular-nums">{etiquetaRango(valor)}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align="start"
        sideOffset={8}
        collisionPadding={8}
        className="z-50 w-[320px] rounded-xl border border-line bg-surface p-3 text-fg shadow-lg outline-none"
      >
        <div role="group" aria-label="Atajos de fecha" className="grid grid-cols-2 gap-1">
          {presetsRango(hoy).map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={presetActivo === p.id}
              onClick={() => aplicar(p.rango)}
              className={cn(
                'h-9 rounded-md px-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                presetActivo === p.id ? 'bg-brand-tint font-medium text-brand-deep' : 'text-fg hover:bg-hover',
              )}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
        <div className="my-3 h-px bg-line" />
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valido) aplicar(borrador);
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={idDesde} className="text-xs font-medium text-fg-secondary">
                Desde
              </label>
              <input
                id={idDesde}
                type="date"
                value={borrador.desde}
                max={tope}
                onChange={(e) => setBorrador((b) => ({ ...b, desde: e.target.value }))}
                className={CAMPO}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={idHasta} className="text-xs font-medium text-fg-secondary">
                Hasta
              </label>
              <input
                id={idHasta}
                type="date"
                value={borrador.hasta}
                max={tope}
                onChange={(e) => setBorrador((b) => ({ ...b, hasta: e.target.value }))}
                className={CAMPO}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!valido}
              className="h-9 rounded-lg bg-brand-action px-3 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
        </form>
      </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
