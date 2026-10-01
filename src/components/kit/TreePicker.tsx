'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronDown, Home, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { SearchInput } from './SearchInput';
import { TreeCell } from './TreeCell';
import { useKitT } from './useIdiomaKit';
import {
  ancestrosDe,
  aplanarArbol,
  construirArbol,
  filtrarArbol,
  normalizarBusqueda,
  type NodoPlano,
} from './arbol';
import { PROPS_SCROLL_EN_CAPA } from './scrollEnCapa';

/**
 * Selección de un nodo sobre el árbol real (Figma: diálogo «Mover a…» y campo
 * «Categoría padre»). Sustituye a los `Select` planos con el prefijo «└ »
 * (AUDITORIA-CONTROLES-PROVEEDORES-CATEGORIAS.md §D.3.3).
 *
 * - `TreeList`: buscador que entra en ramas cerradas + lista con sangría real.
 *   Las opciones que crearían un ciclo van **deshabilitadas con su motivo**,
 *   no ocultas. Flechas ↑/↓ recorren las opciones; Enter o Espacio eligen.
 * - `TreeSelect`: el campo de formulario (40 px) que abre `TreeList` en un
 *   popover y muestra la ruta de la opción elegida.
 */
export interface OpcionArbol extends NodoPlano {
  etiqueta: string;
  detalle?: string;
  icono?: LucideIcon;
  color?: string | null;
}

export interface TreeListProps {
  opciones: readonly OpcionArbol[];
  /** `null` = la opción raíz (si existe). */
  valor: number | null | undefined;
  onValorChange: (valor: number | null) => void;
  /** Primera opción, sin padre («Sin categoría padre (raíz)»). */
  opcionRaiz?: { etiqueta: string; detalle?: string };
  /** id → motivo por el que no se puede elegir. */
  deshabilitadas?: ReadonlyMap<number, string>;
  /** Marca «Actual» en esta opción (el padre de hoy). */
  actual?: number | null;
  buscador?: boolean;
  placeholderBusqueda?: string;
  etiqueta: string;
  altoMaximo?: number;
  autoFocus?: boolean;
  className?: string;
}

const RAIZ = 'raiz';

export function TreeList({
  opciones,
  valor,
  onValorChange,
  opcionRaiz,
  deshabilitadas,
  actual,
  buscador = true,
  placeholderBusqueda,
  etiqueta,
  altoMaximo = 280,
  autoFocus,
  className,
}: TreeListProps) {
  const t = useKitT();
  const [busqueda, setBusqueda] = React.useState('');
  const listaRef = React.useRef<HTMLUListElement>(null);

  const filas = React.useMemo(() => {
    const arbol = construirArbol(opciones);
    const termino = normalizarBusqueda(busqueda);
    const filtro = filtrarArbol(
      arbol,
      termino ? (o) => normalizarBusqueda(`${o.etiqueta} ${o.detalle ?? ''}`).includes(termino) : null,
    );
    // Todo abierto: en un selector se ve el árbol entero.
    const abiertos = new Set(opciones.map((o) => o.id));
    return aplanarArbol(filtro.raices, {
      abiertos,
      coincidencias: termino ? filtro.coincidencias : undefined,
    });
  }, [opciones, busqueda]);

  const mostrarRaiz = !!opcionRaiz && !busqueda.trim();

  const mover = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const botones = Array.from(listaRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    if (!botones.length) return;
    const i = botones.findIndex((b) => b === document.activeElement);
    const siguiente =
      e.key === 'Home' ? 0 : e.key === 'End' ? botones.length - 1 : e.key === 'ArrowDown' ? Math.min(i + 1, botones.length - 1) : Math.max(i - 1, 0);
    botones[siguiente]?.focus();
  };

  const elegir = (id: number | null, motivo?: string) => {
    if (motivo) return;
    onValorChange(id);
  };

  const claseOpcion = (seleccionada: boolean, deshabilitada: boolean) =>
    cn(
      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none',
      'focus-visible:ring-2 focus-visible:ring-brand',
      seleccionada && 'bg-brand-tint',
      deshabilitada ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-hover',
    );

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {buscador && (
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          onValueChange={setBusqueda}
          debounceMs={150}
          placeholder={placeholderBusqueda}
          atajo={false}
          autoFocus={autoFocus}
        />
      )}
      <ul
        ref={listaRef}
        role="listbox"
        aria-label={etiqueta}
        onKeyDown={mover}
        className="flex flex-col gap-0.5 overflow-y-auto rounded-lg border border-line p-1"
        style={{ maxHeight: altoMaximo }}
      >
        {mostrarRaiz && (
          <li>
            <div
              role="option"
              tabIndex={0}
              aria-selected={valor === null}
              onClick={() => elegir(null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  elegir(null);
                }
              }}
              data-valor={RAIZ}
              className={claseOpcion(valor === null, false)}
            >
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
                <Home className="size-4" strokeWidth={1.5} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-fg">{opcionRaiz?.etiqueta}</span>
                {opcionRaiz?.detalle && <span className="truncate text-xs text-fg-muted">{opcionRaiz.detalle}</span>}
              </span>
              {actual === null && <MarcaActual />}
              {valor === null && <Check aria-hidden="true" className="size-4 shrink-0 text-brand" strokeWidth={2} />}
            </div>
          </li>
        )}
        {filas.map((f) => {
          const motivo = deshabilitadas?.get(f.dato.id);
          const seleccionada = valor === f.dato.id;
          return (
            <li key={f.dato.id}>
              <div
                role="option"
                tabIndex={0}
                aria-selected={seleccionada}
                aria-disabled={!!motivo || undefined}
                title={motivo}
                onClick={() => elegir(f.dato.id, motivo)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    elegir(f.dato.id, motivo);
                  }
                }}
                className={claseOpcion(seleccionada, !!motivo)}
              >
                <TreeCell
                  className="min-w-0 flex-1"
                  titulo={f.dato.etiqueta}
                  subtitulo={motivo ?? f.dato.detalle}
                  nivel={f.nivel}
                  tieneHijos={false}
                  icono={f.dato.icono}
                  color={f.dato.color}
                  contexto={f.contexto}
                  sangria={16}
                />
                {actual === f.dato.id && <MarcaActual />}
                {seleccionada && <Check aria-hidden="true" className="size-4 shrink-0 text-brand" strokeWidth={2} />}
              </div>
            </li>
          );
        })}
        {!mostrarRaiz && filas.length === 0 && (
          <li className="px-3 py-6 text-center text-[13px] text-fg-secondary">{t('arbol.sinResultados', { termino: busqueda.trim() })}</li>
        )}
      </ul>
    </div>
  );
}

function MarcaActual() {
  const t = useKitT();
  return (
    <span className="shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium leading-4 text-fg-secondary">{t('arbol.actual')}</span>
  );
}

/** Ruta legible «Bebidas › Bebidas calientes» de una opción. */
export function rutaOpcion(opciones: readonly OpcionArbol[], id: number): string {
  const nodo = opciones.find((o) => o.id === id);
  if (!nodo) return '';
  return [...ancestrosDe(opciones, id).map((a) => a.etiqueta), nodo.etiqueta].join(' › ');
}

export interface TreeSelectProps extends Omit<TreeListProps, 'etiqueta' | 'autoFocus' | 'className'> {
  /** Texto cuando no hay valor. */
  placeholder?: string;
  /** Nombre accesible de la lista. */
  etiquetaLista?: string;
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  deshabilitado?: boolean;
  className?: string;
}

export function TreeSelect({
  placeholder: placeholderProp,
  etiquetaLista: etiquetaListaProp,
  id,
  deshabilitado,
  className,
  onValorChange,
  valor,
  opciones,
  opcionRaiz,
  ...resto
}: TreeSelectProps) {
  const t = useKitT();
  const placeholder = placeholderProp ?? t('arbol.seleccionar');
  const etiquetaLista = etiquetaListaProp ?? t('arbol.opciones');
  const [abierto, setAbierto] = React.useState(false);
  const texto =
    valor === null || valor === undefined
      ? valor === null && opcionRaiz
        ? opcionRaiz.etiqueta
        : placeholder
      : rutaOpcion(opciones, valor) || placeholder;

  return (
    <PopoverPrimitive.Root open={abierto} onOpenChange={setAbierto}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={deshabilitado}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-labelledby={resto['aria-labelledby']}
          aria-describedby={resto['aria-describedby']}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left text-sm text-fg',
            'hover:border-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60',
            resto['aria-invalid'] && 'border-line-danger',
            valor === undefined && 'text-fg-muted',
            className,
          )}
        >
          <span className="truncate">{texto}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          {...PROPS_SCROLL_EN_CAPA}
          align="start"
          sideOffset={4}
          collisionPadding={16}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[300px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-surface p-3 text-fg shadow-lg outline-none"
        >
          <TreeList
            {...resto}
            opciones={opciones}
            opcionRaiz={opcionRaiz}
            valor={valor}
            etiqueta={etiquetaLista}
            autoFocus
            onValorChange={(v) => {
              onValorChange(v);
              setAbierto(false);
            }}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
