'use client';

import { useTranslations } from 'next-intl';
import { Box, Plus, Users } from 'lucide-react';
import { EmptyState } from '@/components/kit/EmptyState';
import { clasesBoton } from '@/components/kit/botonClases';
import { CaptureBanner } from '@/components/crm/kit/CaptureBanner';

/**
 * Estados del Pipeline que no son el tablero (Figma 770:463421 vacío,
 * 770:464381 sin resultados, 770:464677 error, 770:464982 sin permiso,
 * 770:465308 y 816:57906 sin embudo de ventas; móvil 771:*).
 */
export function SinEmbudoVentas({ sinColocar, puedeCrear, onCrear }: { sinColocar: number; puedeCrear: boolean; onCrear: () => void }) {
  const t = useTranslations('crm.oportunidad.pipeline.sinEmbudo');
  return (
    <div className="flex flex-col gap-4">
      <CaptureBanner cantidad={sinColocar} puedeCrearEmbudo={puedeCrear} onVerLeads={() => window.location.assign('/app/crm/leads')} onCrearEmbudo={onCrear} />
      <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand-tint text-brand"><Box aria-hidden="true" className="size-6" strokeWidth={1.5} /></span>
        <h2 className="text-base font-semibold text-fg">{t('titulo')}</h2>
        <p className="max-w-md text-sm text-fg-secondary">{t('descripcion')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {puedeCrear ? (
            <button type="button" onClick={onCrear} className={clasesBoton()}>
              <Plus aria-hidden="true" className="size-4" />
              {t('crear')}
            </button>
          ) : (
            <p className="text-xs text-fg-muted">{t('sinPermiso')}</p>
          )}
          {sinColocar > 0 && (
            <a href="/app/crm/leads" className={clasesBoton({ variante: 'secundario' })}>
              <Users aria-hidden="true" className="size-4" />
              {t('verLeads', { n: sinColocar })}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function EstadoTablero({ estado, onCrear, onLimpiar, onReintentar, puedeCrear }: { estado: 'vacio' | 'sinResultados' | 'error' | 'sinPermiso'; onCrear: () => void; onLimpiar: () => void; onReintentar: () => void; puedeCrear: boolean }) {
  const t = useTranslations('crm.oportunidad.pipeline.estados');
  const caja = (hijo: React.ReactNode) => <div className="rounded-xl border border-line bg-surface">{hijo}</div>;
  switch (estado) {
    case 'sinPermiso':
      return caja(<EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('sinPermiso.volver'), href: '/app/crm' }} />);
    case 'error':
      return caja(<EmptyState variante="error" titulo={t('error.titulo')} descripcion={t('error.descripcion')} onReintentar={onReintentar} />);
    case 'sinResultados':
      return caja(<EmptyState variante="search" titulo={t('sinResultados.titulo')} descripcion={t('sinResultados.descripcion')} onLimpiarFiltros={onLimpiar} />);
    default:
      return caja(<EmptyState variante="empty" titulo={t('vacio.titulo')} descripcion={t('vacio.descripcion')} accion={puedeCrear ? { etiqueta: t('vacio.crear'), onClick: onCrear, icono: Plus } : undefined} accionSecundaria={{ etiqueta: t('vacio.leads'), href: '/app/crm/leads' }} />);
  }
}
