'use client';

/**
 * Banda del lienzo en una plantilla de detalle (ficha de producto, página de categoría, ficha de
 * espacio): con qué registro REAL de la organización se ve —el primero, o el que elija la
 * persona— y qué versión pinta el lienzo.
 *
 * Ficha de producto y página de categoría: la tienda las sirve con el BORRADOR en la vista previa
 * firmada (`/vista-previa/<token>/productos/<id>`), pero sin el puente en vivo de las secciones:
 * el lienzo se recarga después de cada guardado. La ficha de espacio sigue con la publicada.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2">
      {muestra.opciones.length > 0 ? (
        <div className="flex min-w-0 items-center gap-2 text-sm text-fg-secondary">
          <span aria-hidden="true" className="shrink-0">{etiqueta}</span>
          <Select value={muestra.valor ?? undefined} onValueChange={muestra.onCambiar}>
            <SelectTrigger aria-label={etiqueta} className="h-9 w-[260px] min-w-0 rounded-lg border-line-strong bg-surface text-sm text-fg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {muestra.opciones.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
