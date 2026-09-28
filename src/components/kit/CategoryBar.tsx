'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { SearchSelect } from '@/components/ui/search-select';
import { useDragScroll } from '@/hooks/useDragScroll';
import {
  chevronesVisibles,
  claveValor,
  esTopCategoria,
  indiceElegido,
  moverIndice,
  opcionesBarra,
  pasoDesplazamiento,
  type CategoriaBarra,
  type OpcionBarra,
  type ValorCategoria,
} from './categoryBarLogica';
import { useKitT } from './useIdiomaKit';

/**
 * Barra de categorías del POS (Figma `CategoryBar`, sección «Productos y POS»;
 * POS-UX-V2 D3c) con los tres modos de `pos_categories_display`:
 *
 * - `chips`: «Todas», «Favoritas» (si `mostrarFavoritas`) y un chip por
 *   categoría con su punto de color, el conteo, «Top» (tooltip con las unidades
 *   de 90 días) y la estrella de favorita (ámbar rellena si lo es). Recorta en
 *   el borde y ofrece chevrones de desplazamiento; se arrastra con el ratón o
 *   el dedo (`useDragScroll`).
 * - `imagenes`: mosaicos de 80 px con la imagen de la categoría o su color.
 * - `combobox`: el `SearchSelect` de siempre (favoritas y «Top» como subtítulo).
 *
 * Accesible como `radiogroup`: una sola parada de tabulador, ← → Inicio Fin
 * mueven y eligen. La estrella es un botón aparte (no cambia el filtro). No
 * reordena: las categorías llegan en el orden que decida la pantalla. Sin
 * color configurado, punto neutro (la paleta de respaldo de `CategoryFilterBar`
 * la puede pasar la pantalla en `color`).
 */
export interface CategoryBarProps {
  categorias: readonly CategoriaBarra[];
  valor: ValorCategoria;
  onValorChange: (valor: ValorCategoria) => void;
  modo?: 'chips' | 'imagenes' | 'combobox';
  /** Marca o desmarca una categoría como favorita. Sin él, no hay estrellas. */
  onFavorita?: (id: CategoriaBarra['id']) => void;
  /** Muestra la opción «Favoritas» tras «Todas». */
  mostrarFavoritas?: boolean;
  /** Conteo de «Todas» (suma de productos). */
  conteoTotal?: number | null;
  /** Nombre del grupo (por defecto «Categorías»). */
  etiqueta?: string;
  className?: string;
}

export function CategoryBar({
  categorias,
  valor,
  onValorChange,
  modo = 'chips',
  onFavorita,
  mostrarFavoritas,
  conteoTotal,
  etiqueta,
  className,
}: CategoryBarProps) {
  const t = useKitT();
  const nombreGrupo = etiqueta ?? t('categorias.etiqueta');
  const opciones = React.useMemo(() => opcionesBarra(categorias, { mostrarFavoritas }), [categorias, mostrarFavoritas]);
  const elegido = indiceElegido(opciones, valor);
  const arrastre = useDragScroll<HTMLDivElement>();
  const radios = React.useRef<(HTMLButtonElement | null)[]>([]);
  const [chevrones, setChevrones] = React.useState({ anterior: false, siguiente: false });

  const medir = React.useCallback(() => {
    const el = arrastre.ref.current;
    if (!el) return;
    setChevrones(chevronesVisibles(el.scrollLeft, el.clientWidth, el.scrollWidth));
  }, [arrastre.ref]);

  React.useEffect(() => {
    if (modo === 'combobox') return;
    const el = arrastre.ref.current;
    if (!el) return;
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    observador?.observe(el);
    return () => {
      el.removeEventListener('scroll', medir);
      observador?.disconnect();
    };
  }, [modo, medir, arrastre.ref, opciones.length]);

  if (modo === 'combobox') {
    const NINGUNA = '__todas';
    const FAVORITAS = '__favoritas';
    const aValor = (v: string): ValorCategoria => {
      if (v === NINGUNA || !v) return null;
      if (v === FAVORITAS) return 'favoritas';
      return categorias.find((c) => String(c.id) === v)?.id ?? null;
    };
    const actual = valor === null || valor === undefined ? NINGUNA : valor === 'favoritas' ? FAVORITAS : String(valor);
    return (
      <SearchSelect
        options={[
          ...(mostrarFavoritas ? [{ value: FAVORITAS, label: t('categorias.favoritas') }] : []),
          ...categorias.map((c) => ({
            value: String(c.id),
            label: c.nombre,
            sublabel:
              [c.favorita ? t('categorias.favorita') : null, esTopCategoria(c) ? t('producto.top') : null].filter(Boolean).join(' · ') ||
              undefined,
          })),
        ]}
        value={actual}
        onValueChange={(v) => onValorChange(aValor(v))}
        placeholder={nombreGrupo}
        searchPlaceholder={t('categorias.buscar')}
        emptyText={t('categorias.sinResultados')}
        noneLabel={t('categorias.todasLasCategorias')}
        noneValue={NINGUNA}
        className={className}
      />
    );
  }

  const elegir = (i: number) => {
    const o = opciones[i];
    if (o && claveValor(o.valor) !== claveValor(valor)) onValorChange(o.valor);
  };

  const alTeclado = (i: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const siguiente = moverIndice(i, e.key, opciones.length);
    if (siguiente === null) return;
    e.preventDefault();
    const boton = radios.current[siguiente];
    boton?.focus();
    boton?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    elegir(siguiente);
  };

  const desplazar = (sentido: 1 | -1) => {
    const el = arrastre.ref.current;
    if (!el) return;
    const paso = pasoDesplazamiento(el.clientWidth) * sentido;
    if (typeof el.scrollBy === 'function') el.scrollBy({ left: paso, behavior: 'smooth' });
    else el.scrollLeft += paso;
  };

  const estrella = (c: CategoriaBarra, sobreMarca: boolean, clase: string, enTabulador: boolean) =>
    onFavorita && (
      <button
        type="button"
        // Solo la estrella de la categoría elegida entra en el tabulador (una parada, no una por chip).
        tabIndex={enTabulador ? 0 : -1}
        onClick={(e) => {
          e.stopPropagation();
          onFavorita(c.id);
        }}
        aria-label={t(c.favorita ? 'producto.quitarFavoritaDe' : 'producto.marcarFavoritaDe', { nombre: c.nombre })}
        title={t(c.favorita ? 'producto.quitarFavorita' : 'producto.marcarFavorita')}
        className={cn(
          'absolute z-10 inline-flex size-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
          clase,
        )}
      >
        <Star
          aria-hidden="true"
          className={cn('size-3.5', c.favorita ? 'fill-current text-warning' : sobreMarca ? 'text-fg-on-brand/70' : 'text-fg-muted')}
          strokeWidth={1.5}
        />
      </button>
    );

  const propsRadio = (o: OpcionBarra, i: number) => ({
    ref: (el: HTMLButtonElement | null) => {
      radios.current[i] = el;
    },
    type: 'button' as const,
    role: 'radio',
    'aria-checked': i === elegido,
    tabIndex: i === elegido ? 0 : -1,
    onClick: () => elegir(i),
    onKeyDown: alTeclado(i),
    'data-clave': o.clave,
  });

  const chevron = (sentido: 1 | -1) => {
    const visible = sentido === 1 ? chevrones.siguiente : chevrones.anterior;
    if (!visible) return null;
    const Icono = sentido === 1 ? ChevronRight : ChevronLeft;
    return (
      <button
        type="button"
        tabIndex={-1}
        onClick={() => desplazar(sentido)}
        aria-label={t(sentido === 1 ? 'categorias.siguientes' : 'categorias.anteriores')}
        title={t(sentido === 1 ? 'categorias.siguientes' : 'categorias.anteriores')}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg"
      >
        <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
    );
  };

  const imagenes = modo === 'imagenes';
  const topTitulo = (c: CategoriaBarra) => t('producto.topTitulo', { n: Math.round(Number(c.top ?? 0)) });

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      {chevron(-1)}
      <div
        ref={arrastre.ref}
        role="radiogroup"
        aria-label={nombreGrupo}
        onPointerDown={arrastre.onPointerDown}
        onPointerMove={arrastre.onPointerMove}
        onPointerUp={arrastre.onPointerUp}
        onPointerLeave={arrastre.onPointerLeave}
        onClickCapture={arrastre.onClickCapture}
        className="scrollbar-hide flex min-w-0 flex-1 select-none gap-2 overflow-x-auto p-0.5"
      >
        {opciones.map((o, i) => {
          const activo = i === elegido;
          if (imagenes) {
            const c = o.tipo === 'categoria' ? o.categoria : null;
            const estilo: React.CSSProperties | undefined =
              c && !c.imagen && c.color ? { backgroundColor: `color-mix(in srgb, ${c.color} 18%, transparent)` } : undefined;
            return (
              <div key={o.clave} className="relative shrink-0">
                <button
                  {...propsRadio(o, i)}
                  style={estilo}
                  className={cn(
                    'relative flex size-20 items-end overflow-hidden rounded-xl border-2 bg-subtle p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
                    activo ? 'border-brand' : 'border-line hover:border-line-strong',
                    o.tipo !== 'categoria' && 'items-center justify-center text-center',
                  )}
                >
                  {c?.imagen && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- imagen de la categoría servida tal cual, como en CategoryFilterBar */}
                      <img src={c.imagen} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full object-cover" />
                      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    </>
                  )}
                  {o.tipo === 'favoritas' && <Star aria-hidden="true" className="absolute left-1/2 top-3 size-4 -translate-x-1/2 text-warning" strokeWidth={1.5} />}
                  <span
                    className={cn(
                      'relative line-clamp-2 break-words text-[11px] font-semibold leading-tight',
                      c?.imagen ? 'text-white' : 'text-fg',
                      o.tipo === 'favoritas' && 'mt-4',
                    )}
                  >
                    {o.tipo === 'todas' ? t('categorias.todas') : o.tipo === 'favoritas' ? t('categorias.favoritas') : o.categoria.nombre}
                  </span>
                  {c && esTopCategoria(c) && (
                    <span title={topTitulo(c)} className="absolute left-1 top-1 inline-flex h-4 items-center rounded-full bg-brand-tint px-1 text-[10px] font-semibold text-brand-deep">
                      {t('producto.top')}
                      <span className="sr-only">{`: ${topTitulo(c)}`}</span>
                    </span>
                  )}
                </button>
                {c && estrella(c, false, 'right-1 top-1 bg-surface/80', activo)}
              </div>
            );
          }

          const claseChip = cn(
            'flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
            activo ? 'border-brand-action bg-brand-action text-fg-on-brand' : 'border-line bg-surface text-fg hover:bg-hover',
          );
          const conteo = (n: number | null | undefined) =>
            n !== null && n !== undefined && (
              <span className={cn('text-xs tabular-nums', activo ? 'text-fg-on-brand/80' : 'text-fg-muted')}>{n}</span>
            );

          if (o.tipo === 'todas') {
            return (
              <button key={o.clave} {...propsRadio(o, i)} className={claseChip}>
                {t('categorias.todas')}
                {conteo(conteoTotal)}
              </button>
            );
          }
          if (o.tipo === 'favoritas') {
            return (
              <button key={o.clave} {...propsRadio(o, i)} className={claseChip}>
                <Star aria-hidden="true" className={cn('size-3.5', activo ? 'fill-current text-fg-on-brand' : 'text-warning')} strokeWidth={1.5} />
                {t('categorias.favoritas')}
              </button>
            );
          }
          const c = o.categoria;
          return (
            <div key={o.clave} className="relative shrink-0">
              <button {...propsRadio(o, i)} className={cn(claseChip, onFavorita && 'pr-8')}>
                <span
                  aria-hidden="true"
                  className={cn('size-2 shrink-0 rounded-full', !c.color && (activo ? 'bg-fg-on-brand' : 'bg-fg-muted'))}
                  style={c.color ? { backgroundColor: c.color } : undefined}
                />
                {c.nombre}
                {conteo(c.conteo)}
                {esTopCategoria(c) && (
                  <span
                    title={topTitulo(c)}
                    className={cn(
                      'inline-flex h-5 items-center rounded-full px-1.5 text-[11px] font-semibold',
                      activo ? 'bg-fg-on-brand/20 text-fg-on-brand' : 'bg-brand-tint text-brand-deep',
                    )}
                  >
                    {t('producto.top')}
                    <span className="sr-only">{`: ${topTitulo(c)}`}</span>
                  </span>
                )}
              </button>
              {estrella(c, activo, 'right-1 top-1/2 -translate-y-1/2 hover:bg-hover', activo)}
            </div>
          );
        })}
      </div>
      {chevron(1)}
    </div>
  );
}
