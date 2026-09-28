'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import type { SeccionFormulario } from '../logica/formularioProducto';

/**
 * Índice lateral fijo del formulario en escritorio (Figma «Nuevo producto»,
 * columna «Secciones»): scroll-spy con `IntersectionObserver`, punto rojo en
 * las secciones con error y la nota «Al guardar» (una sola operación).
 */
export interface IndiceFormularioProps {
  secciones: readonly SeccionFormulario[];
  errores: Partial<Record<SeccionFormulario, number>>;
  onIr: (seccion: SeccionFormulario) => void;
}

export function IndiceFormulario({ secciones, errores, onIr }: IndiceFormularioProps) {
  const t = useTranslations('productoForm.general');
  const ts = useTranslations('productoForm.secciones');
  const [activa, setActiva] = useState<SeccionFormulario | null>(secciones[0] ?? null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visibles = new Map<string, number>();
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visibles.set(e.target.id, e.boundingClientRect.top);
          else visibles.delete(e.target.id);
        }
        // La activa es la primera (más arriba) de las que se ven en la franja superior.
        const primera = secciones.find((s) => visibles.has(s));
        if (primera) setActiva(primera);
      },
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
    );
    for (const s of secciones) {
      const el = document.getElementById(s);
      if (el) observador.observe(el);
    }
    return () => observador.disconnect();
  }, [secciones]);

  return (
    <nav aria-label={t('indice')} className="sticky top-4 flex flex-col gap-4">
      <div>
        <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">{t('indice')}</p>
        <ul className="flex flex-col gap-0.5">
          {secciones.map((s) => {
            const n = errores[s] ?? 0;
            const esActiva = activa === s;
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => {
                    setActiva(s);
                    onIr(s);
                  }}
                  aria-current={esActiva ? 'location' : undefined}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    esActiva ? 'bg-brand-tint font-medium text-brand-deep' : 'text-fg-secondary hover:bg-hover hover:text-fg',
                  )}
                >
                  <span className="truncate">{ts(`${s}.titulo`)}</span>
                  {n > 0 && (
                    <>
                      <span aria-hidden className="size-2 shrink-0 rounded-full bg-danger" />
                      <span className="sr-only">{t('erroresEnSeccion', { count: n })}</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-line px-2 pt-3 text-xs text-fg-muted">
        <p className="font-medium text-fg-secondary">{t('alGuardarTitulo')}</p>
        <p className="mt-1">{t('alGuardar')}</p>
      </div>
    </nav>
  );
}
