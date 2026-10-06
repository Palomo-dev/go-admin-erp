'use client';

/**
 * Sección «Carta» (`menu_full`) en el editor (arquitectura, punto 3; Figma B/13-07 nota 3).
 *
 * En el editor solo se ELIGE qué carta muestra la sección y se salta a «Editar en Carta».
 * Destacado, oculto, orden, horario y precio o agotado por sede viven en
 * `/app/sitio-web/carta/[menuId]` (un solo lugar que los edita). La lista sale del hook
 * único `useCartas` (`/api/sitio-web/carta`), con el mismo «Visible ahora» que la página
 * Carta (calculado en el servidor con `get_public_menu`).
 *
 * Elegir una carta fija escribe `content.carta_id` en la sección (`null` = las vigentes
 * según su horario). Mientras el sitio público no lea `carta_id`, la elección queda
 * deshabilitada con una nota (`CARTA_FIJA_EN_SITIO_PUBLICO`), para que nadie elija algo
 * que en producción no cambia.
 */
import Link from 'next/link';
import { ArrowUpRight, BookOpen, Clock } from 'lucide-react';
import { EmptyState, PanelAdaptable, Skeleton, clasesBoton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { useCartas } from '@/components/sitio-web/configuracion/carta/useCarta';
import { EstadoCarta } from '@/components/sitio-web/configuracion/carta/PantallaCartas';
import { iconoCarta } from '@/components/sitio-web/configuracion/carta/formatoCarta';
import { RUTA_CARTA, rutaDetalleCarta } from '@/components/sitio-web/configuracion/carta/rutasCarta';
import { useTextosConfiguracion } from '@/components/sitio-web/configuracion/textos';
import { useTextosEditor } from './textos';

/** ¿goadmin-websites ya respeta `content.carta_id` en la sección Carta? Hoy no. */
export const CARTA_FIJA_EN_SITIO_PUBLICO = false;

export function cartaElegida(content: Record<string, unknown> | null | undefined): string | null {
  const v = content?.carta_id;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export interface HojaCartaEditorProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  content: Record<string, unknown>;
  onCambiarContenido: (content: Record<string, unknown>) => void;
  deshabilitado?: boolean;
}

export function HojaCartaEditor({ abierto, onAbiertoChange, content, onCambiarContenido, deshabilitado }: HojaCartaEditorProps) {
  const t = useTextosEditor();
  const tc = useTextosConfiguracion();
  const cartas = useCartas();
  const elegida = cartaElegida(content);
  const bloqueado = deshabilitado || !CARTA_FIJA_EN_SITIO_PUBLICO;
  const elegir = (id: string | null) => {
    if (bloqueado) return;
    const siguiente = { ...content };
    if (id) siguiente.carta_id = id;
    else delete siguiente.carta_id;
    onCambiarContenido(siguiente);
  };
  const editarHref = elegida ? rutaDetalleCarta(elegida) : RUTA_CARTA;

  const opcion = (id: string | null, contenido: React.ReactNode, extra?: React.ReactNode) => {
    const activa = elegida === id;
    return (
      <li key={id ?? 'horario'} className={cn('flex items-center gap-3 rounded-lg border px-3 py-2', activa ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface')}>
        <label className={cn('flex min-w-0 flex-1 items-center gap-3', bloqueado ? 'cursor-default' : 'cursor-pointer')}>
          <input
            type="radio"
            name="carta-seccion"
            checked={activa}
            disabled={bloqueado}
            onChange={() => elegir(id)}
            className="size-4 shrink-0 accent-brand-action"
          />
          {contenido}
        </label>
        {extra}
      </li>
    );
  };

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('carta.titulo')}
      descripcion={t('carta.descripcion')}
      icono={BookOpen}
      ancho={520}
      pie={
        <Link href={editarHref} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
          <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('carta.editarEnCarta')}
        </Link>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-fg">{t('carta.queMuestra')}</legend>
        {cartas.cargando ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : cartas.fallo ? (
          <EmptyState
            variante={cartas.fallo === 'sin_permiso' ? 'forbidden' : 'error'}
            titulo={cartas.fallo === 'sin_permiso' ? t('carta.sinPermiso') : t('carta.errorTitulo')}
            descripcion={cartas.fallo === 'sin_permiso' ? undefined : t('carta.errorDescripcion')}
            accion={cartas.fallo === 'sin_permiso' ? undefined : { etiqueta: t('acciones.reintentar'), onClick: () => void cartas.recargar() }}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {opcion(
              null,
              <span className="flex min-w-0 items-center gap-2">
                <Clock aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{t('carta.segunHorario')}</span>
                  <span className="block text-[13px] leading-[18px] text-fg-secondary">{t('carta.segunHorarioAyuda')}</span>
                </span>
              </span>,
            )}
            {(cartas.datos?.cartas ?? []).map((c) => {
              const Icono = iconoCarta(c.icono);
              return opcion(
                c.id,
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{c.nombre}</span>
                  <EstadoCarta t={tc} carta={c} />
                </span>,
                c.implicita ? null : (
                  <Link
                    href={rutaDetalleCarta(c.id)}
                    aria-label={t('carta.editarCartaNombre', { carta: c.nombre })}
                    title={t('carta.editarEnCarta')}
                    className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'w-8 shrink-0 px-0')}
                  >
                    <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  </Link>
                ),
              );
            })}
          </ul>
        )}
        {!CARTA_FIJA_EN_SITIO_PUBLICO && <p className="mt-1 text-[13px] leading-[18px] text-fg-secondary">{t('carta.fijaPendiente')}</p>}
      </fieldset>
      <p className="text-[13px] leading-[18px] text-fg-secondary">{t('carta.dondeSeEdita')}</p>
    </PanelAdaptable>
  );
}
