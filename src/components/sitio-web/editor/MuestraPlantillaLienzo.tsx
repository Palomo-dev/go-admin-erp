'use client';

import { useId } from 'react';

/**
 * Banda del lienzo en una plantilla de detalle (ficha de producto, página de categoría, ficha de
 * espacio): con qué registro REAL de la organización se ve —el primero, o el que elija la
 * persona— y qué versión pinta el lienzo.
 *
 * Ficha de producto y página de categoría: la tienda las sirve con el BORRADOR en la vista previa
 * firmada (`/vista-previa/<token>/productos/<id>`) y con el puente en vivo de las secciones, como
 * las demás páginas: el lienzo solo se recarga al guardar un bloque que la tienda no puede pintar
 * en vivo (`recargaLienzoDetalle.ts`). La ficha de espacio sigue con la publicada.
 */
import { SearchSelect } from '@/components/ui/search-select';
import { useTextosEditor } from './textos';

/** Plantillas con registro de ejemplo (`getPreviewEntities`). */
export const TIPOS_CON_MUESTRA = ['product_detail', 'category_detail', 'space_detail'] as const;

/** Plantillas que el lienzo pinta con el borrador (la tienda las sirve en la vista previa firmada). */
export const TIPOS_EN_BORRADOR: readonly string[] = ['product_detail', 'category_detail'];

export function tieneMuestra(tipo: string | null | undefined): boolean {
  return !!tipo && (TIPOS_CON_MUESTRA as readonly string[]).includes(tipo);
}

export interface MuestraPlantilla {
  tipo: string;
  opciones: readonly { id: string; label: string }[];
  valor: string | null;
  onCambiar: (id: string) => void;
}

export function MuestraPlantillaLienzo({ muestra }: { muestra: MuestraPlantilla }) {
  const t = useTextosEditor();
  const etiqueta = t(`lienzo.muestra.etiqueta.${muestra.tipo}`);
  const idSelector = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2">
      {muestra.opciones.length > 0 ? (
        <div className="flex min-w-0 items-center gap-2 text-sm text-fg-secondary">
          <label htmlFor={idSelector} className="shrink-0">{etiqueta}</label>
          {/* Con cientos de productos, buscar (nombre, SKU o código) en vez de una lista larga. */}
          <div className="w-[320px] min-w-0">
            <SearchSelect
              id={idSelector}
              options={muestra.opciones.map((o) => ({ value: o.id, label: o.label }))}
              value={muestra.valor ?? ''}
              onValueChange={muestra.onCambiar}
              searchPlaceholder={t('lienzo.muestra.buscar')}
              emptyText={t('lienzo.muestra.sinResultados')}
              className="h-9 rounded-lg border-line-strong bg-surface text-sm text-fg"
            />
          </div>
        </div>
      ) : (
        <p className="text-sm text-fg-secondary">{t('lienzo.muestra.sinOpciones')}</p>
      )}
      <p className="min-w-0 flex-1 text-xs text-fg-muted">
        {t(TIPOS_EN_BORRADOR.includes(muestra.tipo) ? 'lienzo.muestra.borrador' : 'lienzo.muestra.publicada')}
      </p>
    </div>
  );
}
