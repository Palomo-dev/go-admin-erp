'use client';

/**
 * Las páginas DISEÑADAS de las 7 plantillas de tienda nuevas, tal como se aprobaron en Figma
 * («GO Admin — Sitios» › «04 Tiendas»): Inicio en computador y en celular, la página de
 * categoría y la ficha de producto. Antes la galería y la vista previa pintaban solo un esquema
 * (encabezado, pie y una franja con el orden de las secciones) y no se entendía qué era cada
 * plantilla (pedido del dueño, 2026-11-19).
 *
 * Son imágenes fijas en `public/sitio-web/plantillas/<plantilla>/<página>.webp` (exportadas de
 * Figma: computador a 720 px de ancho, celular a 390). Llevan productos y fotos de muestra; al
 * usar la plantilla se arma con el catálogo, las fotos y los textos del negocio.
 */
import { useState } from 'react';
import { cn } from '@/utils/Utils';
import { useTextosDiseno } from './textos';

export const PAGINAS_DISENADAS = ['inicio', 'categoria', 'producto'] as const;
export type PaginaDisenada = (typeof PAGINAS_DISENADAS)[number];

/**
 * Carpeta de las imágenes de cada plantilla con páginas diseñadas: las 7 de tienda nuevas y las
 * clásicas ya renovadas (Moderna desde el 2026-11-19). `null` si no tiene.
 */
const CARPETAS: Readonly<Record<string, string>> = {
  retail_panorama: 'panorama',
  retail_atelier: 'atelier',
  retail_radiante: 'radiante',
  retail_roble: 'roble',
  retail_marea: 'marea',
  retail_contraste: 'contraste',
  retail_hogar: 'hogar',
  retail_modern: 'moderna',
};

function carpeta(plantillaId: string): string | null {
  return Object.prototype.hasOwnProperty.call(CARPETAS, plantillaId) ? CARPETAS[plantillaId] : null;
}

/**
 * Imagen de una página diseñada. En celular solo hay diseño de Inicio: la categoría y la ficha
 * se muestran en computador.
 */
export function imagenPaginaDisenada(plantillaId: string, pagina: PaginaDisenada, celular = false): string | null {
  const c = carpeta(plantillaId);
  if (!c) return null;
  const archivo = pagina === 'inicio' && celular ? 'movil' : pagina;
  return `/sitio-web/plantillas/${c}/${archivo}.webp`;
}

/** ¿Hay páginas diseñadas para esta plantilla? */
export function tienePaginasDisenadas(plantillaId: string): boolean {
  return carpeta(plantillaId) !== null;
}

/**
 * Miniatura de la galería: la parte de arriba de Inicio. Al pasar el puntero, la página baja
 * despacio hasta el pie (sin movimiento si el sistema pide reducirlo).
 */
export function MiniaturaPaginaDisenada({ plantillaId, nombre }: { plantillaId: string; nombre: string }) {
  const t = useTextosDiseno();
  const src = imagenPaginaDisenada(plantillaId, 'inicio');
  if (!src) return null;
  return (
    <span className="group/miniatura block size-full overflow-hidden" data-miniatura-disenada={plantillaId}>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen fija del catálogo de plantillas */}
      <img
        src={src}
        alt={t('dialogo.disenada.alt', { nombre, pagina: t('dialogo.disenada.pagina.inicio') })}
        className="size-full object-cover object-top transition-[object-position] duration-[6000ms] ease-linear group-hover/miniatura:object-bottom motion-reduce:transition-none"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}

/**
 * Vista previa del diálogo: pestañas Inicio / Categoría / Producto con la página entera, que se
 * recorre con la rueda o el dedo dentro del marco del dispositivo.
 */
export function VistaPaginasDisenadas({ plantillaId, nombre, celular }: { plantillaId: string; nombre: string; celular: boolean }) {
  const t = useTextosDiseno();
  const [pagina, setPagina] = useState<PaginaDisenada>('inicio');
  const src = imagenPaginaDisenada(plantillaId, pagina, celular);
  if (!src) return null;
  const soloComputador = celular && pagina !== 'inicio';
  return (
    <div className="flex flex-col gap-2" data-vista-disenada={plantillaId}>
      <div role="tablist" aria-label={t('dialogo.disenada.paginas')} className="flex flex-wrap gap-1">
        {PAGINAS_DISENADAS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pagina === p}
            onClick={() => setPagina(p)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium leading-4 transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
              pagina === p ? 'bg-brand-tint text-brand' : 'text-fg-secondary hover:bg-hover hover:text-fg',
            )}
          >
            {t(`dialogo.disenada.pagina.${p}`)}
          </button>
        ))}
      </div>
      <div className={cn('overflow-y-auto overscroll-contain rounded-md bg-subtle', celular ? 'max-h-[520px]' : 'max-h-[560px]')}>
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen fija del catálogo de plantillas */}
        <img
          key={src}
          src={src}
          alt={t('dialogo.disenada.alt', { nombre, pagina: t(`dialogo.disenada.pagina.${pagina}`) })}
          className={cn('block h-auto', soloComputador ? 'w-full' : celular ? 'mx-auto w-[390px] max-w-full' : 'w-full')}
          decoding="async"
        />
      </div>
      {soloComputador && <p className="text-xs leading-4 text-fg-secondary">{t('dialogo.disenada.soloComputador')}</p>}
    </div>
  );
}
