'use client';

import type { ReactNode } from 'react';
import { Check, LayoutList, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import { useTextosComun } from './textos';
import { CLASE_TAMANO_ICONO, ICONO_TAREA_SITIO, TRAZO_ICONO } from './iconosSitio';

/**
 * Plantilla del sitio o de una página (Figma A/07i; Plantillas A/06b, asistente
 * A/03b, «Nueva página» A/04b): miniatura, nombre, descripción, chip del giro
 * («Restaurante») o «Página», «7 secciones» y la insignia «En uso» o
 * «Seleccionada». Seleccionada: borde y anillo de marca.
 *
 * Es un `radio` cuando se elige (asistente, Nueva página) y un botón normal
 * cuando abre la vista previa (galería): lo decide `rol`.
 *
 * `detalle` (galería de Plantillas): la línea corta con lo distintivo de su encabezado y su pie
 * («Encabezado centrado · Pie en 3 columnas con mapa»), con el icono de «Encabezado y pie».
 */
export interface TemplateCardProps {
  nombre: string;
  descripcion?: string;
  /** Línea corta bajo la descripción (lo distintivo del encabezado y el pie). */
  detalle?: string;
  /** Imagen (URL) o nodo (p. ej. `SitePreview` o `SectionThumbnail`) de la miniatura. */
  miniatura?: string | ReactNode;
  /** Etiqueta del giro («Restaurante»); en modo página se muestra «Página». */
  giro?: string;
  /** Icono del giro (ICONO_GIRO_PLANTILLA) dentro del chip, para reconocerlo sin leer. */
  iconoGiro?: LucideIcon;
  modo?: 'sitio' | 'pagina';
  secciones?: number;
  enUso?: boolean;
  seleccionada?: boolean;
  onSeleccionar?: () => void;
  rol?: 'radio' | 'button';
  className?: string;
}

const IconoDetalle = ICONO_TAREA_SITIO.encabezado;

export function TemplateCard({
  nombre,
  descripcion,
  detalle,
  miniatura,
  giro,
  iconoGiro: IconoGiro,
  modo = 'sitio',
  secciones,
  enUso,
  seleccionada,
  onSeleccionar,
  rol = 'button',
  className,
}: TemplateCardProps) {
  const tx = useTextosComun();
  const chip = modo === 'pagina' ? tx('plantilla.pagina') : giro;
  // A/06b: «En uso» va en la fila del chip y las secciones (la tarjeta no crece);
  // «Seleccionada» (A/07i, asistente y Nueva página) lleva su propia fila.
  const insignia = seleccionada ? tx('plantilla.seleccionada') : enUso ? tx('plantilla.enUso') : null;
  const insigniaEnFila = !seleccionada && !!insignia;
  const nodoInsignia = insignia ? (
    <Badge tono="marca" apariencia="solido" tamano="sm" className={insigniaEnFila ? undefined : 'self-start'}>
      <Check aria-hidden="true" className="size-3 shrink-0" strokeWidth={2} />
      {insignia}
    </Badge>
  ) : null;
  return (
    <button
      type="button"
      role={rol === 'radio' ? 'radio' : undefined}
      aria-checked={rol === 'radio' ? !!seleccionada : undefined}
      onClick={onSeleccionar}
      className={cn(
        'flex w-full flex-col gap-3 rounded-xl border bg-surface p-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        seleccionada ? 'border-brand ring-1 ring-brand' : 'border-line hover:bg-hover',
        className,
      )}
    >
      <span className="block aspect-[16/10] w-full overflow-hidden rounded-lg border border-line bg-subtle">
        {typeof miniatura === 'string' ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura del catálogo, tamaño fijo y sin optimizar
          <img src={miniatura} alt={tx('plantilla.vistaPrevia', { nombre })} className="size-full object-cover" loading="lazy" />
        ) : (
          miniatura
        )}
      </span>
      <span className="flex flex-col gap-1">
        <span className="truncate text-sm font-semibold leading-5 text-fg">{nombre}</span>
        {descripcion ? <span className="line-clamp-2 text-[13px] leading-[18px] text-fg-secondary">{descripcion}</span> : null}
      </span>
      {detalle ? (
        <span className="flex items-start gap-1.5 text-xs leading-4 text-fg-secondary">
          <IconoDetalle aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.meta, 'mt-px shrink-0')} strokeWidth={TRAZO_ICONO} />
          {detalle}
        </span>
      ) : null}
      <span className="flex flex-wrap items-center gap-2">
        {chip ? (
          <Badge tono="neutro" apariencia="suave" tamano="sm">
            {IconoGiro && modo !== 'pagina' ? <IconoGiro aria-hidden="true" className="size-3 shrink-0" strokeWidth={2} /> : null}
            {chip}
          </Badge>
        ) : null}
        {typeof secciones === 'number' ? (
          <span className="inline-flex items-center gap-1 text-xs tabular-nums text-fg-secondary">
            <LayoutList aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.meta, 'shrink-0')} strokeWidth={TRAZO_ICONO} />
            {secciones === 1 ? tx('plantilla.seccionesUna') : tx('plantilla.secciones', { n: secciones })}
          </span>
        ) : null}
        {insigniaEnFila ? nodoInsignia : null}
      </span>
      {insigniaEnFila ? null : nodoInsignia}
    </button>
  );
}
