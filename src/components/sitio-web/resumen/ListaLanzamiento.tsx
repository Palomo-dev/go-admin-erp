'use client';

/**
 * «Lista de lanzamiento» (Figma A/02a, A/02b y A/02f): progreso «5 de 7», barra
 * y un `ChecklistItem` por paso. Los pasos los calcula el servidor
 * (`calcularLanzamiento`); cada «Configurar» abre la subpágina que lo resuelve
 * (o el asistente en «primera vez») y «Publicar» abre la confirmación.
 * En móvil (A/02f) solo se listan los pasos pendientes.
 */
import { BarraProgreso } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { ChecklistItem } from '../ui/ChecklistItem';
import { ICONO_TAREA_SITIO, type TareaSitio } from '../ui/iconosSitio';
import type { IdPaso, PasoLanzamiento } from '@/lib/website/resumenSitio';
import { useTextosResumen } from './textos';

/**
 * Cada paso lleva el icono de su tarea: el MISMO de su entrada del menú
 * (Plantillas, Diseño, Carta, Tienda, Dominios…), para reconocerlo sin leer.
 */
export const TAREA_DE_PASO: Record<IdPaso, TareaSitio> = {
  plantilla: 'plantilla',
  estilo: 'estilo',
  datos: 'logo',
  carta: 'carta',
  catalogo: 'catalogo',
  pagos: 'pagos',
  dominio: 'dominio',
  publicar: 'publicar',
};

export interface ListaLanzamientoProps {
  pasos: readonly PasoLanzamiento[];
  /** Sin `website.sites.edit` no se ofrece «Configurar». */
  puedeEditar: boolean;
  onPublicar: () => void;
  soloPendientes?: boolean;
  /** Oculta la barra y el subtítulo (primera vez, A/02b). */
  sinBarra?: boolean;
  className?: string;
}

export function ListaLanzamiento({ pasos, puedeEditar, onPublicar, soloPendientes, sinBarra, className }: ListaLanzamientoProps) {
  const t = useTextosResumen();
  const total = pasos.length;
  const hechos = pasos.filter((p) => p.estado === 'listo').length;
  const visibles = soloPendientes ? pasos.filter((p) => p.estado !== 'listo') : pasos;
  const subtitulo = hechos === total ? t('resumen.lanzamiento.todoListo') : hechos === 0 ? t('resumen.lanzamiento.empezando') : t('resumen.lanzamiento.casiListo');

  return (
    <section aria-labelledby="lista-lanzamiento-titulo" className={cn('flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 lg:p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="lista-lanzamiento-titulo" className="text-base font-semibold leading-6 text-fg">
          {t('resumen.lanzamiento.titulo')}
        </h2>
        <span className="text-[13px] font-medium tabular-nums text-brand-deep">{t('resumen.lanzamiento.progreso', { n: hechos, total })}</span>
      </div>
      {!sinBarra && (
        <div className="flex flex-col gap-1.5">
          <div className="hidden items-center justify-between gap-2 text-xs lg:flex">
            <span className="text-fg-secondary">{subtitulo}</span>
            <span className="font-medium tabular-nums text-fg">{t('resumen.lanzamiento.progresoPasos', { n: hechos, total })}</span>
          </div>
          <BarraProgreso valor={hechos} max={total} etiqueta={t('resumen.lanzamiento.etiquetaBarra')} textoValor={t('resumen.lanzamiento.progreso', { n: hechos, total })} />
        </div>
      )}
      <ol className="flex flex-col gap-1">
        {visibles.map((p) => (
          <ChecklistItem
            key={p.id}
            titulo={t(`resumen.lanzamiento.pasos.${p.id}`)}
            detalle={t(`resumen.${p.detalle.clave}`, p.detalle.valores)}
            estado={p.estado}
            icono={ICONO_TAREA_SITIO[TAREA_DE_PASO[p.id]]}
            accion={
              !puedeEditar
                ? undefined
                : p.id === 'publicar' && !p.href
                  ? { onClick: onPublicar }
                  : p.href
                    ? { href: p.href }
                    : undefined
            }
          />
        ))}
      </ol>
    </section>
  );
}
