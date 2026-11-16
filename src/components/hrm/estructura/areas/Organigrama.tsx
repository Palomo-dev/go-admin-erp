'use client';

/**
 * Organigrama navegable de escritorio (Figma 20.1, `95-hrm-01-01`): nodos
 * unidos por líneas, ramas que se pliegan, arrastrar para moverse, «−/+» y
 * Ctrl + rueda para acercar, «Ajustar» para volver al 100 %. El nodo
 * (`NodoOrganigrama`) es pieza propia de RR. HH. armada con piezas del kit
 * (`AvatarIniciales`, `Badge`).
 */
import { useCallback, useRef, useState, type PointerEvent as EventoPuntero, type WheelEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, Minus, Network, Plus } from 'lucide-react';
import { AvatarIniciales } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import type { AreaArbol } from '@/lib/hrm/estructura/logica';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const PASO = 0.1;

interface Props {
  raices: AreaArbol[];
  abiertas: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  seleccionada: string | null;
  coincidencias: ReadonlySet<string>;
  onElegir: (id: string) => void;
  /** Panel de detalle a la derecha, dentro del lienzo. */
  lateral?: React.ReactNode;
}

export function Organigrama({ raices, abiertas, onAlternar, seleccionada, coincidencias, onElegir, lateral }: Props) {
  const t = useTranslations('hrmEstructura.areas.organigrama');
  const [zoom, setZoom] = useState(1);
  const lienzo = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ x: number; y: number; izq: number; arr: number; movio: boolean } | null>(null);

  const acercar = useCallback((d: number) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + d) * 10) / 10))), []);

  const alBajar = (e: EventoPuntero<HTMLDivElement>) => {
    if (e.button !== 0 || !lienzo.current || (e.target as HTMLElement).closest('button')) return;
    arrastre.current = { x: e.clientX, y: e.clientY, izq: lienzo.current.scrollLeft, arr: lienzo.current.scrollTop, movio: false };
  };
  const alMover = (e: EventoPuntero<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a || !lienzo.current) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) a.movio = true;
    lienzo.current.scrollLeft = a.izq - dx;
    lienzo.current.scrollTop = a.arr - dy;
  };
  const alSoltar = () => {
    arrastre.current = null;
  };
  const alRodar = (e: WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    acercar(e.deltaY < 0 ? PASO : -PASO);
  };

  const rama = (n: AreaArbol) => {
    const abierta = abiertas.has(n.area.id);
    return (
      <div key={n.area.id} className="flex flex-col items-center">
        <NodoOrganigrama
          nodo={n}
          abierta={abierta}
          seleccionada={seleccionada === n.area.id}
          resaltada={coincidencias.has(n.area.id)}
          onElegir={() => onElegir(n.area.id)}
          onAlternar={() => onAlternar(n.area.id)}
        />
        {abierta && n.hijos.length > 0 && (
          <>
            <span aria-hidden className="h-5 w-px bg-line-strong" />
            <div className="flex items-start">
              {n.hijos.map((h, i) => (
                <div key={h.area.id} className="relative flex flex-col items-center px-3">
                  <span
                    aria-hidden
                    className="absolute top-0 h-px bg-line-strong"
                    style={{ left: i === 0 ? '50%' : 0, right: i === n.hijos.length - 1 ? '50%' : 0 }}
                  />
                  <span aria-hidden className="h-5 w-px bg-line-strong" />
                  {rama(h)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="relative flex min-h-[560px] overflow-hidden rounded-xl border border-line bg-subtle">
      <div
        ref={lienzo}
        role="tree"
        aria-label={t('etiqueta')}
        className="min-w-0 flex-1 cursor-grab overflow-auto active:cursor-grabbing"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerLeave={alSoltar}
        onWheel={alRodar}
      >
        <div className="inline-flex min-w-full justify-center p-8 pb-24" style={{ zoom }}>
          <div className="flex items-start gap-8">{raices.map(rama)}</div>
        </div>
      </div>
      {lateral}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 shadow-sm">
        <button
          type="button"
          onClick={() => acercar(-PASO)}
          disabled={zoom <= ZOOM_MIN}
          aria-label={t('alejar')}
          className="flex size-8 items-center justify-center rounded-md text-fg hover:bg-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Minus aria-hidden className="size-4" strokeWidth={1.5} />
        </button>
        <span className="w-12 text-center text-xs tabular-nums text-fg" aria-live="polite">
          {Math.round(zoom * 100)} %
        </span>
        <button
          type="button"
          onClick={() => acercar(PASO)}
          disabled={zoom >= ZOOM_MAX}
          aria-label={t('acercar')}
          className="flex size-8 items-center justify-center rounded-md text-fg hover:bg-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Plus aria-hidden className="size-4" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            lienzo.current?.scrollTo({ left: 0, top: 0 });
          }}
          className="ml-1 rounded-md px-3 py-1.5 text-xs font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {t('ajustar')}
        </button>
      </div>
      {!lateral && <p className="pointer-events-none absolute bottom-5 right-4 hidden text-xs text-fg-muted xl:block">{t('ayuda')}</p>}
    </div>
  );
}

function NodoOrganigrama({
  nodo,
  abierta,
  seleccionada,
  resaltada,
  onElegir,
  onAlternar,
}: {
  nodo: AreaArbol;
  abierta: boolean;
  seleccionada: boolean;
  resaltada: boolean;
  onElegir: () => void;
  onAlternar: () => void;
}) {
  const t = useTranslations('hrmEstructura.areas');
  const a = nodo.area;
  const resp = a.responsable;
  return (
    <div
      role="treeitem"
      aria-selected={seleccionada}
      aria-expanded={nodo.hijos.length ? abierta : undefined}
      className={cn(
        'w-[232px] rounded-xl border bg-surface p-4 text-left shadow-sm transition-colors',
        seleccionada ? 'border-2 border-brand' : resaltada ? 'border-brand' : 'border-line hover:border-line-strong'
      )}
    >
      <button
        type="button"
        onClick={onElegir}
        className="flex w-full flex-col gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-md"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-deep">
            <Network aria-hidden className="size-4" strokeWidth={1.5} />
          </span>
          <span className="line-clamp-2 text-sm font-medium text-fg">{a.nombre}</span>
        </span>
        {resp?.nombre ? (
          <span className="flex items-center gap-2.5">
            <AvatarIniciales nombre={resp.nombre} tamano="sm" />
            <span className="line-clamp-2 text-xs text-fg-secondary">{[resp.nombre, resp.cargo].filter(Boolean).join(' · ')}</span>
          </span>
        ) : (
          <span className="text-xs text-fg-muted">{t('sinResponsable')}</span>
        )}
        <span className="flex items-center justify-between gap-2">
          <span className="text-xs text-fg-muted">{t('personas', { n: nodo.personasTotal })}</span>
          {nodo.vacantesTotal > 0 && (
            <Badge tono="advertencia" tamano="sm">
              {t('vacantes', { n: nodo.vacantesTotal })}
            </Badge>
          )}
        </span>
      </button>
      {nodo.hijos.length > 0 && (
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={abierta}
          className="mt-3 inline-flex items-center gap-1 rounded-md bg-subtle px-2 py-1 text-xs text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {abierta ? <ChevronDown aria-hidden className="size-3.5" strokeWidth={1.5} /> : <ChevronRight aria-hidden className="size-3.5" strokeWidth={1.5} />}
          {abierta ? t('hijas', { n: nodo.hijos.length }) : t('verHijas', { n: nodo.hijos.length })}
        </button>
      )}
    </div>
  );
}
