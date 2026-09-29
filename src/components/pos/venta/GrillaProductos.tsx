'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Scan } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  CategoryBar,
  EmptyState,
  KbdButton,
  MarcadorSinFoto,
  ProductCard,
  SearchInput,
  ViewToggle,
  type CategoriaBarra,
  type ValorCategoria,
} from '@/components/kit';
import type { ContextoMoneda } from '@/lib/utils/moneda';
import { Skeleton } from '@/components/ui/skeleton';
import { CachedProductImage } from '@/components/pos/CachedProductImage';
import { LocalCatalogNotice } from '@/components/pos/LocalCatalogNotice';
import type { PosGridProduct } from '@/lib/pos/venta/catalogo';
import { pareceCodigoDeBarras } from '@/lib/pos/venta/escaneo';
import { aProductoTarjeta, columnasDeGrilla, moverFocoGrilla, type VistaCatalogo } from '@/lib/pos/venta/catalogoGrilla';
import type { CatalogoGrilla } from './catalogo/useCatalogoGrilla';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/utils/Utils';
import { esMedido, esPorPeso } from '@/lib/pos/peso/modoVenta';

/**
 * Buscador y grilla del POS (Figma `PosProductSearch` 155:7745 y grid v2
 * 249:80171; POS-UX-V2 §7.5 decisión final y ajustes de la tarde):
 *
 * - `SearchInput` del kit («/» lo enfoca) con el lector con cámara como
 *   accesorio, y el `ViewToggle` Tarjetas | Lista (un botón que alterna en el
 *   celular). Sin «Compacta» ni «N por página».
 * - `CategoryBar` del kit en el modo configurado.
 * - Grilla que llena su columna (columnas que se estiran, 16 px entre tarjetas)
 *   o lista; scroll infinito con un solo pedido en vuelo; foco itinerante con
 *   las flechas y Enter.
 * - Estados cargando, error con «Reintentar», vacío y sin catálogo local.
 *
 * Presentación pura: la carga, el escáner, el favorito y qué hace elegir un
 * producto los decide `ProductSearch` con la lógica del paso 1.
 */
export interface GrillaProductosProps {
  busqueda: string;
  onBusqueda: (texto: string) => void;
  /** Cantidad rápida «3*» activa (se muestra junto al buscador). */
  cantidadRapida: number | null;
  vista: VistaCatalogo;
  onVista: (vista: VistaCatalogo) => void;
  categorias: readonly CategoriaBarra[];
  categoria: number | null;
  onCategoria: (categoria: number | null) => void;
  modoCategorias: 'chips' | 'imagenes' | 'combobox';
  onFavoritaCategoria?: (id: number) => void;
  catalogo: CatalogoGrilla;
  moneda: ContextoMoneda | string;
  onElegir: (producto: PosGridProduct) => void;
  onNoDisponible: (producto: PosGridProduct, motivo: 'agotado' | 'sinPrecio') => void;
  onFavorito: (producto: PosGridProduct) => void;
  favoritosEnCurso: ReadonlySet<number>;
  onReceta: (producto: PosGridProduct) => void;
  onEscanerCamara: () => void;
  /**
   * Código de barras escrito en el buscador + Enter (solo dígitos, 6 a 14):
   * se resuelve como un escaneo y va directo al carrito. Sin la prop, Enter
   * busca como siempre.
   */
  onCodigo?: (codigo: string) => void;
  onLimpiarFiltros: () => void;
  /** Mensaje del error de carga (el de Desktop sin catálogo, o el genérico). */
  mensajeError?: string | null;
}

/** Un producto sin precio propio se elige igual si el precio lo pone la variante o el diálogo. */
function elegibleSinPrecio(p: PosGridProduct): boolean {
  return (!!p.has_variants && (p.variant_count ?? 0) > 0) || !!p.has_modifiers;
}

export function GrillaProductos({
  busqueda,
  onBusqueda,
  cantidadRapida,
  vista,
  onVista,
  categorias,
  categoria,
  onCategoria,
  modoCategorias,
  onFavoritaCategoria,
  catalogo,
  moneda,
  onElegir,
  onNoDisponible,
  onFavorito,
  favoritosEnCurso,
  onReceta,
  onEscanerCamara,
  onCodigo,
  onLimpiarFiltros,
  mensajeError,
}: GrillaProductosProps) {
  const t = useTranslations('posVenta.catalogo');
  const tPeso = useTranslations('posPeso.tarjeta');
  const escritorio = useMediaQuery('(min-width: 1024px)');
  const [foco, setFoco] = useState(0);
  const grillaRef = useRef<HTMLDivElement | null>(null);
  const tarjetasRef = useRef<(HTMLButtonElement | null)[]>([]);
  const centinelaRef = useRef<HTMLDivElement | null>(null);
  const { productos, total, cargando, recargando, cargandoMas, error, errorMas, hayMas, cargarMas, reintentar } = catalogo;
  const hayFiltros = !!busqueda || categoria !== null;

  // Una búsqueda nueva empieza con el foco en la primera tarjeta.
  useEffect(() => {
    setFoco((f) => (f >= productos.length ? 0 : f));
  }, [productos.length]);

  // Scroll infinito: al asomar el centinela se pide la siguiente página
  // (`cargarMas` no sale si ya hay un pedido en vuelo).
  useEffect(() => {
    const el = centinelaRef.current;
    if (!el || !hayMas || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) void cargarMas();
    }, { rootMargin: '400px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hayMas, cargarMas, productos.length]);

  const alMoverFoco = (indice: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const columnas =
      vista === 'lista' || !grillaRef.current || typeof window === 'undefined'
        ? 1
        : columnasDeGrilla(window.getComputedStyle(grillaRef.current).gridTemplateColumns);
    const siguiente = moverFocoGrilla(indice, e.key, productos.length, columnas);
    if (siguiente === null || siguiente === indice) return;
    e.preventDefault();
    setFoco(siguiente);
    tarjetasRef.current[siguiente]?.focus();
    if (siguiente >= productos.length - columnas && hayMas) void cargarMas();
  };

  const valorCategoria: ValorCategoria = categoria;

  let contenido;
  if (cargando) {
    contenido = (
      <div role="status" aria-label={t('cargando')} className="grid grid-cols-2 gap-4 lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-2">
            <Skeleton className="aspect-square w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  } else if (error) {
    contenido = error.sinCatalogo ? (
      <EmptyState variante="error" titulo={t('sinCatalogoTitulo')} descripcion={mensajeError ?? t('sinCatalogoDescripcion')} onReintentar={reintentar} />
    ) : (
      <EmptyState variante="error" titulo={t('errorTitulo')} descripcion={t('errorDescripcion')} onReintentar={reintentar} />
    );
  } else if (productos.length === 0) {
    contenido = hayFiltros ? (
      <EmptyState variante="search" titulo={t('vacioBusquedaTitulo')} descripcion={t('vacioBusquedaDescripcion')} onLimpiarFiltros={onLimpiarFiltros} />
    ) : (
      <EmptyState variante="empty" titulo={t('vacioTitulo')} descripcion={t('vacioDescripcion')} />
    );
  } else {
    const varianteTarjeta = vista === 'lista' ? 'movil-lista' : escritorio ? 'pos' : 'movil-tarjeta';
    contenido = (
      <>
        <div
          ref={grillaRef}
          role="list"
          aria-label={t('productos')}
          aria-busy={recargando || undefined}
          className={cn(
            'grid content-start gap-4 transition-opacity',
            vista === 'lista' ? 'grid-cols-1 lg:grid-cols-[repeat(auto-fill,minmax(320px,1fr))] lg:gap-3' : 'grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]',
            recargando && 'opacity-60',
          )}
        >
          {productos.map((p, i) => {
            const tarjeta = aProductoTarjeta(p);
            const imagen = (
              <CachedProductImage
                src={p.image}
                alt={p.name}
                mode={vista === 'lista' ? 'thumb' : 'card'}
                className="object-cover"
                sizes="(max-width: 1024px) 50vw, 25vw"
                fallback={<MarcadorSinFoto nombre={p.name} />}
              />
            );
            const comun = {
              producto: tarjeta,
              moneda,
              imagen,
              elegibleSinPrecio: elegibleSinPrecio(p),
              // Por peso: «Pesar» abre el diálogo de la pesada; por medida, «Cantidad».
              ...(esMedido(p) ? { etiquetaElegir: tPeso(esPorPeso(p) ? 'pesar' : 'cantidad') } : {}),
              onElegir: () => onElegir(p),
              onNoDisponible: (m: 'agotado' | 'sinPrecio') => onNoDisponible(p, m),
              onFavorito: () => onFavorito(p),
              favoritoCargando: favoritosEnCurso.has(Number(p.id)),
              onReceta: p.recipe_id ? () => onReceta(p) : undefined,
              enfocada: i === foco,
              tabIndex: i === foco ? 0 : -1,
              onFocus: () => setFoco(i),
              onKeyDown: alMoverFoco(i),
              ref: (el: HTMLButtonElement | null) => {
                tarjetasRef.current[i] = el;
              },
            };
            return (
              <div role="listitem" key={p.id} className="min-w-0">
                <ProductCard {...comun} variante={varianteTarjeta} tamano="md" />
              </div>
            );
          })}
        </div>
        <div ref={centinelaRef} aria-hidden="true" className="h-px" />
        {(cargandoMas || errorMas) && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-fg-secondary" role="status">
            {cargandoMas ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                {t('cargandoMas')}
              </>
            ) : (
              <KbdButton variante="secundario" tamano="sm" onClick={() => void cargarMas()}>
                {t('reintentarMas')}
              </KbdButton>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <section aria-label={t('titulo')} className="flex h-full min-h-0 flex-col gap-3">
      <LocalCatalogNotice />
      <div className="flex shrink-0 items-center gap-2">
        <SearchInput
          value={busqueda}
          onChange={onBusqueda}
          onValueChange={onBusqueda}
          debounceMs={0}
          onEnter={(texto) => {
            if (!onCodigo || !pareceCodigoDeBarras(texto)) return false;
            onCodigo(texto.trim());
            return true;
          }}
          placeholder={t('buscarPlaceholder')}
          etiqueta={t('buscarEtiqueta')}
          cargando={recargando}
          className="flex-1"
          accesorio={
            <button
              type="button"
              onClick={onEscanerCamara}
              aria-label={t('escanear')}
              title={t('escanear')}
              className="flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Scan aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          }
        />
        <ViewToggle<VistaCatalogo> valor={vista} onValorChange={onVista} etiqueta={t('vista')} corte="lg" />
      </div>
      {cantidadRapida !== null && (
        <p className="-mt-1 text-xs font-medium text-brand" role="status">
          {t('cantidadRapida', { n: cantidadRapida })}
        </p>
      )}
      <div className="flex shrink-0 items-center gap-2">
        <CategoryBar
          categorias={categorias}
          valor={valorCategoria}
          onValorChange={(v) => onCategoria(v === null || v === 'favoritas' ? null : Number(v))}
          modo={modoCategorias}
          onFavorita={onFavoritaCategoria ? (id) => onFavoritaCategoria(Number(id)) : undefined}
          className="min-w-0 flex-1"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-2">
        {contenido}
        {/* POS-UX-V2 §7.5: en escritorio el conteo va al pie del grid; en móvil no se muestra. */}
        {!cargando && !error && productos.length > 0 && (
          <p className="hidden pt-3 text-center text-xs tabular-nums text-fg-secondary md:block">{t('total', { n: total })}</p>
        )}
      </div>
    </section>
  );
}
