'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { clasesBoton } from '@/components/kit';

/**
 * Selector a la vista de la barra de filtros con conteo y valor por opción (Figma «05 POS y
 * ventas» 3306-209013 «Medio de pago» y 3306-209101 «Estado del pago»): casillas agrupadas,
 * buscador opcional, nota al pie y «Limpiar» / «Aplicar». Lo marcado se aplica al pulsar
 * «Aplicar» (no a cada clic), como en el Figma.
 */
export interface OpcionConteo {
  valor: string;
  etiqueta: string;
  /** Id del grupo (`grupos`); sin grupo va arriba. */
  grupo?: string;
  /** «16 · $ 567.600», «5», «No conectada»… (ya formateado). */
  detalle?: string;
  deshabilitada?: boolean;
}

export interface FiltroConteoProps {
  /** «Medio de pago». */
  titulo: string;
  /** Texto del disparador: «Medio de pago: Bold». */
  resumen: string;
  opciones: readonly OpcionConteo[];
  grupos?: readonly { id: string; titulo: string }[];
  valores: readonly string[];
  onAplicar: (valores: string[]) => void;
  buscador?: boolean;
  nota?: string;
  className?: string;
}

export function FiltroConteo({ titulo, resumen, opciones, grupos = [], valores, onAplicar, buscador, nota, className }: FiltroConteoProps) {
  const t = useTranslations('recaudoMedio.filtro');
  const [abierto, setAbierto] = React.useState(false);
  const [borrador, setBorrador] = React.useState<string[]>([...valores]);
  const [busqueda, setBusqueda] = React.useState('');
  const idTitulo = React.useId();

  React.useEffect(() => {
    if (abierto) {
      setBorrador([...valores]);
      setBusqueda('');
    }
  }, [abierto, valores]);

  const q = busqueda.trim().toLowerCase();
  const visibles = q ? opciones.filter((o) => o.etiqueta.toLowerCase().includes(q)) : opciones;
  const secciones: { id: string; titulo: string | null; opciones: OpcionConteo[] }[] = [
    { id: '', titulo: null, opciones: visibles.filter((o) => !o.grupo || !grupos.some((g) => g.id === o.grupo)) },
    ...grupos.map((g) => ({ id: g.id, titulo: g.titulo, opciones: visibles.filter((o) => o.grupo === g.id) })),
  ].filter((s) => s.opciones.length > 0);

  const alternar = (v: string) => setBorrador((b) => (b.includes(v) ? b.filter((x) => x !== v) : [...b, v]));
  const activo = valores.length > 0;

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          className={cn(
            'inline-flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-lg border bg-surface px-3 text-sm font-medium text-fg transition-colors hover:bg-hover',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:border-brand',
            activo ? 'border-brand' : 'border-line-strong',
            className,
          )}
        >
          <span className="truncate">{resumen}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-labelledby={idTitulo}
        className="z-[70] flex w-[380px] max-w-[calc(100vw-16px)] flex-col gap-2 rounded-xl border border-line bg-surface p-3 text-fg shadow-md"
      >
        <p id={idTitulo} className="text-sm font-semibold text-fg">
          {titulo}
        </p>
        {buscador && (
          <label className="flex h-10 items-center gap-2 rounded-lg border border-line-strong px-3 focus-within:ring-2 focus-within:ring-brand">
            <Search aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t('buscar')}
              aria-label={t('buscar')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-muted"
            />
          </label>
        )}
        <div className="max-h-[320px] overflow-y-auto">
          {secciones.length === 0 && <p className="px-1 py-2 text-sm text-fg-muted">{t('sinOpciones')}</p>}
          {secciones.map((s) => (
            <div key={s.id || 'sin-grupo'} role="group" aria-label={s.titulo ?? titulo} className="py-1">
              {s.titulo && <p className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{s.titulo}</p>}
              {s.opciones.map((o) => {
                const marcado = borrador.includes(o.valor);
                return (
                  <label
                    key={o.valor}
                    className={cn(
                      'flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm',
                      marcado ? 'bg-brand-tint' : 'hover:bg-hover',
                      o.deshabilitada && 'cursor-not-allowed text-fg-muted hover:bg-transparent',
                    )}
                  >
                    <Checkbox checked={marcado} disabled={o.deshabilitada} onCheckedChange={() => alternar(o.valor)} />
                    <span className="min-w-0 flex-1 truncate">{o.etiqueta}</span>
                    {o.detalle && <span className="shrink-0 text-xs tabular-nums text-fg-secondary">{o.detalle}</span>}
                  </label>
                );
              })}
            </div>
          ))}
        </div>
        {nota && <p className="text-xs text-fg-muted">{nota}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => setBorrador([])} className={clasesBoton({ variante: 'tinte', tamano: 'sm' })}>
            {t('limpiar')}
          </button>
          <button
            type="button"
            onClick={() => {
              onAplicar(borrador);
              setAbierto(false);
            }}
            className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
          >
            {t('aplicar')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
