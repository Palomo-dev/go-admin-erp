'use client';

/**
 * Índice lateral de la Configuración (Figma B/12-01, lg+): una entrada por
 * sección, la activa con tinte de marca (scroll-spy). Al pulsar, se desplaza a
 * la sección; el foco va a su título para quien navega con teclado.
 *
 * Cada entrada lleva el icono de su sección (16 px, el mismo de la tarjeta y
 * de la fila móvil: `ICONOS_SECCION_CONFIGURACION`). Ítems de 32 px de alto,
 * texto 13/18, ancho 192.
 */
import { useEffect, useState } from 'react';
import { cn } from '@/utils/Utils';
import { SECCIONES_CONFIGURACION, type SeccionConfiguracion } from '@/lib/website/configuracionSitio';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { ICONOS_SECCION_CONFIGURACION, claseColorIconoSeccion } from './iconosSecciones';
import type { TraductorConfiguracion } from './textos';

export function IndiceConfiguracion({ t }: { t: TraductorConfiguracion }) {
  const [activa, setActiva] = useState<SeccionConfiguracion>('datos');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visibles = new Map<string, number>();
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) visibles.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity);
        const primera = [...visibles.entries()].filter(([, top]) => top !== Infinity).sort((a, b) => a[1] - b[1])[0];
        if (primera) setActiva(primera[0] as SeccionConfiguracion);
      },
      { rootMargin: '-80px 0px -55% 0px' },
    );
    for (const s of SECCIONES_CONFIGURACION) {
      const el = document.getElementById(s);
      if (el) observador.observe(el);
    }
    return () => observador.disconnect();
  }, []);

  const ir = (s: SeccionConfiguracion) => {
    setActiva(s);
    const el = document.getElementById(s);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    (document.getElementById(`${s}-titulo`) as HTMLElement | null)?.focus?.({ preventScroll: true });
  };

  return (
    <nav aria-label={t('pagina.indice')} className="sticky top-4 hidden self-start lg:block">
      <ul className="flex w-48 flex-col gap-0.5">
        {SECCIONES_CONFIGURACION.map((s) => {
          const Icono = ICONOS_SECCION_CONFIGURACION[s];
          const actual = activa === s;
          return (
          <li key={s}>
            <a
              href={`#${s}`}
              aria-current={activa === s ? 'location' : undefined}
              onClick={(e) => {
                e.preventDefault();
                ir(s);
              }}
              data-seccion={s}
              className={cn(
                'flex h-8 items-center gap-2 rounded-md px-3 text-[13px] leading-[18px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                actual ? 'bg-brand-tint font-medium text-link' : 'text-fg-secondary hover:bg-surface hover:text-fg',
                s === 'peligro' && !actual && 'text-danger-text',
              )}
            >
              <Icono
                aria-hidden="true"
                className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0', actual && s !== 'peligro' ? 'text-link' : claseColorIconoSeccion(s))}
                strokeWidth={TRAZO_ICONO}
              />
              <span className="truncate">{t(`secciones.${s}`)}</span>
            </a>
          </li>
          );
        })}
      </ul>
    </nav>
  );
}
