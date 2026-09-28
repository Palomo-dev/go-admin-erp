'use client';

import * as React from 'react';
import { ChefHat, Flame, ImageIcon, Plus, Star } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { clasesBoton } from './botonClases';
import {
  clasesStock,
  eleccion,
  inicialProducto,
  insigniasTarjeta,
  nivelStock,
  parteStock,
  partesMeta,
  porcentajeDescuento,
  type ParteMeta,
  type ParteStock,
  type ProductoTarjeta,
  type TamanoTarjeta,
  type VarianteTarjeta,
} from './productCardLogica';
import { useKitT } from './useIdiomaKit';

/**
 * Tarjeta de producto del POS (Figma `ProductCard` variante `pos` Size md/sm y
 * `ProductCardMovil` tarjeta/lista; POS-UX-V2 D3c, «Ajuste del dueño» y §7.5):
 *
 * - `pos` (grilla de escritorio, 3 columnas que se estiran) y `movil-tarjeta`
 *   (2 columnas, imagen 1:1): imagen con «-17 %» arriba-izquierda, estrella de
 *   favorito 28×28 arriba-derecha (24 en `sm`), «Top» con llama abajo-izquierda
 *   (no en `sm`) y «Agotado» centrado sobre la imagen atenuada; debajo, nombre a
 *   2 líneas, precio con la comparación tachada, meta con el punto de color del
 *   stock y «Elegir» a todo el ancho.
 * - `movil-lista`: fila de 74 px con miniatura 56, nombre + precio + meta,
 *   estrella y botón «+».
 *
 * **Un solo control principal** (el botón «Elegir» / «+», con `ref` y
 * `tabIndex` para el foco itinerante que maneja la grilla); el clic en
 * cualquier parte de la tarjeta hace lo mismo. La estrella y la receta son
 * botones aparte y no agregan. Agotado y «Sin precio» (B-14) no se eligen: el
 * botón queda `aria-disabled` (sigue enfocable para moverse por la grilla).
 *
 * El precio llega como número y se formatea con la `moneda` que pasa la
 * pantalla, igual que `ResumenTotales`. La imagen es una ranura (`imagen`: el
 * POS pasa `CachedProductImage`); sin ella, `MarcadorSinFoto` (icono e
 * inicial, nunca un recuadro vacío).
 */
export interface ProductCardProps {
  producto: ProductoTarjeta;
  moneda: ContextoMoneda | string;
  variante?: VarianteTarjeta;
  /** Solo `pos`: `sm` es la tarjeta compacta (sin «Top»). */
  tamano?: TamanoTarjeta;
  /** Imagen ya resuelta (`CachedProductImage`). Usa `MarcadorSinFoto` como respaldo. */
  imagen?: React.ReactNode;
  onElegir: () => void;
  /**
   * Se toca una tarjeta que no se puede elegir (agotado, sin precio): la
   * pantalla avisa por qué (el POS muestra su toast «Producto agotado»). Sin
   * él, el toque no hace nada.
   */
  onNoDisponible?: (motivo: 'agotado' | 'sinPrecio') => void;
  /**
   * Sin precio también se elige y no se pinta «Sin precio»: el precio lo pone
   * la variante o el diálogo (padre con variantes o modificadores en el POS).
   */
  elegibleSinPrecio?: boolean;
  /** Marca o desmarca favorito. Sin él, la estrella solo se ve si ya es favorito. */
  onFavorito?: () => void;
  /** Mientras se guarda el favorito: estrella deshabilitada. */
  favoritoCargando?: boolean;
  /** Ver la receta de producción (si `producto.receta`). */
  onReceta?: () => void;
  /** Foco itinerante de la grilla: anillo de marca en la tarjeta. */
  enfocada?: boolean;
  /** `tabIndex` del control principal (0 en la tarjeta con foco, -1 en las demás). */
  tabIndex?: number;
  /** Se llama al enfocar el control principal (la grilla actualiza su índice). */
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  /** Texto del botón (por defecto «Elegir»). */
  etiquetaElegir?: string;
  className?: string;
}

/** Marcador sin foto: icono de imagen y, si hay nombre, su inicial. */
export function MarcadorSinFoto({ nombre, conInicial = true, className }: { nombre?: string; conInicial?: boolean; className?: string }) {
  const t = useKitT();
  return (
    <span role="img" aria-label={t('producto.sinFoto')} className={cn('flex flex-col items-center justify-center gap-1 text-fg-muted', className)}>
      <ImageIcon aria-hidden="true" className="size-6" strokeWidth={1.5} />
      {conInicial && nombre && <span aria-hidden="true" className="text-lg font-semibold leading-none">{inicialProducto(nombre)}</span>}
    </span>
  );
}

function useTextosMeta() {
  const t = useKitT();
  const meta = (p: ParteMeta): string => {
    switch (p.clave) {
      case 'variantes':
        return t('producto.variantes', { n: p.n });
      case 'modificadores':
        return t('producto.modificadores', { n: p.n });
      case 'personalizable':
        return t('producto.personalizable');
      default:
        return p.texto;
    }
  };
  const stock = (p: ParteStock): string => {
    switch (p.clave) {
      case 'unidades':
        return t('producto.unidades', { n: p.n });
      case 'sinSeguimiento':
        return t('producto.sinSeguimiento');
      case 'sinStock':
        return t('producto.sinStock');
      default:
        return p.n !== undefined ? `${t('producto.unidades', { n: p.n })} · ${t('producto.agotado')}` : t('producto.agotado');
    }
  };
  return { meta, stock };
}

export const ProductCard = React.forwardRef<HTMLButtonElement, ProductCardProps>(function ProductCard(
  {
    producto,
    moneda,
    variante = 'pos',
    tamano = 'md',
    imagen,
    onElegir,
    onNoDisponible,
    elegibleSinPrecio,
    onFavorito,
    favoritoCargando,
    onReceta,
    enfocada,
    tabIndex,
    onFocus,
    onKeyDown,
    etiquetaElegir,
    className,
  },
  ref,
) {
  const t = useKitT();
  const textos = useTextosMeta();
  const formatear = React.useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const base = React.useId();
  const idNombre = `${base}-nombre`;
  const idAccion = `${base}-accion`;
  const idPrecio = `${base}-precio`;
  const idMeta = `${base}-meta`;

  const eleccionBase = eleccion(producto);
  const precioLibre = !!elegibleSinPrecio && eleccionBase.motivo === 'sinPrecio';
  const { elegible, motivo } = precioLibre ? { elegible: true, motivo: null } : eleccionBase;
  const insignias = insigniasTarjeta(producto, { variante, tamano, conFavorito: !!onFavorito });
  const tiene = (id: string) => insignias.some((i) => i.id === id);
  const pct = porcentajeDescuento(producto.precio, producto.precioComparacion);
  const meta = partesMeta(producto).map(textos.meta);
  const stock = parteStock(producto, variante);
  const nivel = nivelStock(producto.stock, producto.agotado);
  const colorStock = nivel ? clasesStock(nivel) : null;
  const lista = variante === 'movil-lista';
  const sm = variante === 'pos' && tamano === 'sm';
  const textoAccion = elegible ? etiquetaElegir ?? t('producto.elegir') : motivo === 'agotado' ? t('producto.agotado') : t('producto.sinPrecio');
  const topTitulo = t('producto.topTitulo', { n: Math.round(Number(producto.top ?? 0)) });

  const elegir = () => {
    if (elegible) onElegir();
    else if (motivo) onNoDisponible?.(motivo);
  };
  const alternarFavorito = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFavorito?.();
  };

  const precio = precioLibre ? (
    // Sin precio propio pero elegible: como hoy en el POS, no se pinta el precio.
    <span id={idPrecio} className="sr-only" />
  ) : producto.precio === null || !Number.isFinite(Number(producto.precio)) ? (
      <span id={idPrecio} className="text-sm font-medium text-fg-muted">
        {t('producto.sinPrecio')}
      </span>
    ) : (
      <span id={idPrecio} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <span className={cn('font-semibold tabular-nums text-fg', lista || sm ? 'text-sm' : 'text-base')}>{formatear(producto.precio)}</span>
        {pct !== null && (
          <span className="text-xs tabular-nums text-fg-muted line-through">{formatear(producto.precioComparacion)}</span>
        )}
      </span>
    );

  const estrella = tiene('favorito') && (
    onFavorito ? (
      <button
        type="button"
        onClick={alternarFavorito}
        disabled={favoritoCargando}
        aria-label={t(producto.favorito ? 'producto.quitarFavoritaDe' : 'producto.marcarFavoritaDe', { nombre: producto.nombre })}
        title={t(producto.favorito ? 'producto.quitarFavorita' : 'producto.marcarFavorita')}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
          lista ? 'size-8' : sm ? 'size-6' : 'size-7',
          producto.favorito ? 'bg-warning-subtle text-warning' : 'bg-surface/90 text-fg-muted hover:text-warning',
          !lista && 'shadow-sm',
        )}
      >
        <Star aria-hidden="true" className={cn(sm ? 'size-3.5' : 'size-4', producto.favorito && 'fill-current')} strokeWidth={1.5} />
      </button>
    ) : (
      <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-warning-subtle text-warning', lista ? 'size-8' : sm ? 'size-6' : 'size-7')}>
        <Star aria-hidden="true" className="size-4 fill-current" strokeWidth={1.5} />
        <span className="sr-only">{t('producto.favorita')}</span>
      </span>
    )
  );

  const accionComun = {
    ref,
    type: 'button' as const,
    tabIndex,
    onFocus,
    onKeyDown,
    'aria-labelledby': `${idAccion} ${idNombre}`,
    'aria-describedby': `${idPrecio}${meta.length || stock ? ` ${idMeta}` : ''}`,
    'aria-disabled': elegible ? undefined : true,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      elegir();
    },
  };

  const receta = producto.receta && onReceta && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onReceta();
      }}
      aria-label={t('producto.recetaDe', { nombre: producto.nombre })}
      title={t('producto.receta')}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <ChefHat aria-hidden="true" className="size-4" strokeWidth={1.5} />
    </button>
  );

  const puntoStock = colorStock && <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', colorStock.punto)} />;

  if (lista) {
    const lineaMeta = [...meta, ...(stock ? [textos.stock(stock)] : [])].join(' · ');
    return (
      <div
        onClick={elegir}
        data-elegible={elegible || undefined}
        className={cn(
          'relative flex h-[74px] items-center gap-3 rounded-xl border border-line bg-surface px-2',
          elegible ? 'cursor-pointer hover:border-line-strong' : 'cursor-not-allowed',
          enfocada && 'ring-2 ring-brand',
          className,
        )}
      >
        <span className={cn('relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle', !elegible && 'opacity-50')}>
          {imagen ?? <MarcadorSinFoto conInicial={false} />}
          {tiene('top') && (
            <span
              title={topTitulo}
              className="absolute bottom-0.5 right-0.5 inline-flex size-5 items-center justify-center rounded-full bg-surface text-warning-text shadow-sm"
            >
              <Flame aria-hidden="true" className="size-3" strokeWidth={2} />
              <span className="sr-only">{`${t('producto.top')}: ${topTitulo}`}</span>
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={idNombre} className="truncate text-sm font-semibold text-fg">
            {producto.nombre}
          </span>
          {precio}
          {lineaMeta && (
            <span id={idMeta} className="flex min-w-0 items-center gap-1 text-[11px] text-fg-secondary">
              {puntoStock}
              <span className="truncate">{lineaMeta}</span>
            </span>
          )}
        </span>
        {estrella}
        <button
          {...accionComun}
          className={clasesBoton({
            variante: elegible ? 'primario' : 'secundario',
            tamano: 'md',
            className: 'size-10 shrink-0 px-0',
          })}
        >
          <Plus aria-hidden="true" className="size-5" strokeWidth={1.5} />
          <span id={idAccion} className="sr-only">
            {textoAccion}
          </span>
        </button>
      </div>
    );
  }

  const movil = variante === 'movil-tarjeta';
  const inset = sm || movil ? 'top-2 left-2' : 'top-3 left-3';
  return (
    <div
      onClick={elegir}
      data-elegible={elegible || undefined}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-shadow',
        elegible ? 'cursor-pointer hover:border-line-strong hover:shadow-md' : 'cursor-not-allowed',
        enfocada && 'ring-2 ring-brand',
        className,
      )}
    >
      <div className={cn('relative w-full overflow-hidden bg-subtle', movil ? 'aspect-square' : sm ? 'aspect-[2/1]' : 'aspect-[16/9]')}>
        <div className={cn('absolute inset-0 flex items-center justify-center', !elegible && motivo === 'agotado' && 'opacity-50')}>
          {imagen ?? <MarcadorSinFoto nombre={producto.nombre} conInicial={!sm} />}
        </div>
        {tiene('descuento') && pct !== null && (
          <span
            className={cn(
              'absolute z-10 inline-flex h-[22px] items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
              inset,
              movil ? 'bg-solid-danger text-on-solid' : 'border border-line-brand bg-brand-tint text-brand-deep',
            )}
          >
            {t('producto.descuento', { pct })}
          </span>
        )}
        {estrella && <span className={cn('absolute z-10', sm || movil ? 'right-2 top-2' : 'right-3 top-3')}>{estrella}</span>}
        {tiene('top') && (
          <span
            title={topTitulo}
            className="absolute bottom-2 left-2 z-10 inline-flex h-5 items-center gap-0.5 rounded-full bg-solid-warning px-1.5 text-[11px] font-semibold text-on-solid-warning"
          >
            <Flame aria-hidden="true" className="size-3" strokeWidth={2} />
            {t('producto.top')}
            <span className="sr-only">{`: ${topTitulo}`}</span>
          </span>
        )}
        {tiene('agotado') && (
          <span className="absolute inset-0 z-10 m-auto inline-flex h-[22px] w-fit items-center rounded-full bg-solid-danger px-2 text-[11px] font-semibold text-on-solid">
            {t('producto.agotado')}
          </span>
        )}
      </div>
      <div className={cn('flex flex-1 flex-col gap-1', sm ? 'p-2' : 'p-3')}>
        <span id={idNombre} className={cn('line-clamp-2 font-medium leading-5 text-fg', sm ? 'text-[13px]' : 'text-sm', !elegible && 'text-fg-secondary')}>
          {producto.nombre}
        </span>
        {precio}
        <span id={idMeta} className="flex min-w-0 flex-col gap-0.5 text-[11px] leading-4">
          {movil ? (
            (meta.length > 0 || stock) && (
              <span className="flex min-w-0 items-center gap-1 text-fg-secondary">
                {puntoStock}
                <span className="truncate">{[...meta, ...(stock ? [textos.stock(stock)] : [])].join(' · ')}</span>
              </span>
            )
          ) : (
            <>
              {(meta.length > 0 || receta) && (
                <span className="flex min-w-0 items-center justify-between gap-1 text-fg-secondary">
                  <span className="truncate">{meta.join(' · ')}</span>
                  {receta}
                </span>
              )}
              {stock && colorStock && (
                <span className={cn('flex items-center gap-1 font-medium', colorStock.texto)}>
                  {puntoStock}
                  {textos.stock(stock)}
                </span>
              )}
            </>
          )}
        </span>
        {movil && receta && <span className="flex justify-end">{receta}</span>}
        <span className="mt-auto pt-1">
          <button
            {...accionComun}
            className={clasesBoton({
              variante: elegible ? 'primario' : 'secundario',
              tamano: 'sm',
              anchoCompleto: true,
            })}
          >
            {elegible && <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />}
            <span id={idAccion}>{textoAccion}</span>
          </button>
        </span>
      </div>
    </div>
  );
});
