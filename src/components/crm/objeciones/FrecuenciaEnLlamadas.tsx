'use client';

/**
 * Línea «Frecuencia en llamadas (90 días)» de una objeción (Figma CRM 1409:17):
 * «71 llamadas · 39 % · superada en 38 %», con acceso a «Aparece en llamadas».
 */
import { useTranslations } from 'next-intl';
import { PhoneCall } from 'lucide-react';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import type { ResumenFrecuencia } from './frecuenciaObjecionesLogica';

export function FrecuenciaEnLlamadas({ resumen, onVer }: { resumen: ResumenFrecuencia | null; onVer?: () => void }) {
  const t = useTranslations('crm.objecionesFrecuencia');
  const entero = useFormatoEntero();
  if (!resumen || resumen.llamadas === 0) {
    return <p className="text-xs text-fg-muted">{t('ningunaLlamada')}</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-secondary">
      <span className="inline-flex items-center gap-1">
        <PhoneCall aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        {t('enLlamadas', { n: resumen.llamadas, valor: entero(resumen.llamadas), pct: resumen.pct })}
      </span>
      {resumen.superada !== null && <span>{t('superada', { pct: resumen.superada })}</span>}
      {onVer && (
        <button type="button" onClick={onVer} className="ml-auto font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          {t('verLlamadas')}
        </button>
      )}
    </div>
  );
}
