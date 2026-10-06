'use client';

/**
 * «Cambios recientes» (Figma A/02a): qué se editó y qué se publicó, con fecha
 * en la zona de la organización («Hoy, 10:12 a. m. · Ana Gómez») y la píldora
 * «Guardado en borrador» o «Publicado». «Ver historial» abre el editor de la
 * página de inicio con el panel de historial.
 */
import Link from 'next/link';
import { StatusBadge } from '@/components/kit';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { CambioReciente } from '@/lib/website/resumenSitio';
import { CajaIcono } from '../ui/CajaIcono';
import { ICONO_ESTADO_PUBLICACION } from '../ui/iconosSitio';
import { cuandoRelativo } from './formatoResumen';
import { useTextosResumen } from './textos';

export function useCuandoTexto(): (valor: string) => string {
  const t = useTextosResumen();
  const locale = useLocaleIntl();
  // `null`: el sitio es de toda la organización, no de la sucursal del header.
  const { timezone } = useFormatDate(null);
  return (valor: string) => {
    const c = cuandoRelativo(valor, timezone, locale);
    if (c.tipo === 'fecha') return c.texto;
    return t(c.tipo === 'hoy' ? 'resumen.cambios.hoy' : 'resumen.cambios.ayer', { hora: c.hora });
  };
}

export interface CambiosRecientesProps {
  cambios: readonly CambioReciente[];
  rutaHistorial: string | null;
}

export function CambiosRecientes({ cambios, rutaHistorial }: CambiosRecientesProps) {
  const t = useTextosResumen();
  const cuando = useCuandoTexto();
  return (
    <section aria-labelledby="cambios-recientes-titulo" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 lg:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="cambios-recientes-titulo" className="text-base font-semibold leading-6 text-fg">
          {t('resumen.cambios.titulo')}
        </h2>
        {rutaHistorial && (
          <Link href={rutaHistorial} className="rounded text-[13px] font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {t('resumen.cambios.verHistorial')}
          </Link>
        )}
      </div>
      {cambios.length === 0 ? (
        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('resumen.cambios.vacio')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {cambios.map((c) => (
            <li key={c.id} className="flex items-start gap-3">
              {/* Lápiz = guardado en borrador; check = publicado (los mismos de PublishStatusBadge).
                  La caja lleva el tono de su píldora: verde si está publicado, gris si es borrador. */}
              <CajaIcono
                icono={c.tipo === 'publicado' ? ICONO_ESTADO_PUBLICACION.publicado : ICONO_ESTADO_PUBLICACION.borrador}
                tamano="sm"
                tono={c.tipo === 'publicado' ? 'exito' : 'apagado'}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium leading-5 text-fg">{t(`resumen.${c.texto.clave}`, c.texto.valores)}</span>
                <span className="text-xs leading-4 text-fg-secondary">{[cuando(c.en), c.autor].filter(Boolean).join(' · ')}</span>
              </div>
              <StatusBadge
                estado={c.tipo === 'publicado' ? 'publicado' : 'guardado en borrador'}
                etiqueta={c.tipo === 'publicado' ? t('resumen.cambios.publicado') : t('resumen.cambios.guardadoBorrador')}
                className="shrink-0"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
