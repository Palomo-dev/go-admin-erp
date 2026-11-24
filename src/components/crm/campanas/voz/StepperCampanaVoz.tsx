'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { PASOS_ASISTENTE, type PasoAsistente } from './asistenteVozLogica';

/**
 * Avance del asistente (Figma 1680:859620): «Paso n de 6 · X», seis barras y,
 * debajo, el nombre de cada paso (✓ en los hechos, azul en el actual). Los
 * pasos ya hechos son botones para volver; los pendientes no se saltan.
 * En celular solo el texto y las barras.
 */
export function StepperCampanaVoz({ actual, onIr }: { actual: PasoAsistente; onIr: (p: PasoAsistente) => void }) {
  const t = useTranslations('crm.campanaVozAsistente');
  const indice = PASOS_ASISTENTE.indexOf(actual);
  const total = PASOS_ASISTENTE.length;
  return (
    <nav aria-label={t('stepperAria')} className="flex flex-col gap-1.5">
      <p className="text-xs font-medium leading-4 text-fg-secondary" aria-live="polite">
        {t('subtitulo', { n: indice + 1, total, paso: t(`pasos.${actual}`) })}
      </p>
      <ol className="grid grid-cols-6 gap-1">
        {PASOS_ASISTENTE.map((p, i) => {
          const estado = i < indice ? 'hecho' : i === indice ? 'actual' : 'pendiente';
          const contenido = (
            <>
              <span aria-hidden="true" className={cn('block h-1 rounded-full', i <= indice ? 'bg-brand-action' : 'bg-line-strong')} />
              <span
                className={cn(
                  'mt-2 hidden items-center gap-1 truncate text-[13px] leading-[18px] lg:flex',
                  estado === 'actual' ? 'font-medium text-brand' : estado === 'hecho' ? 'text-fg-secondary' : 'text-fg-muted',
                )}
              >
                {estado === 'hecho' && <Check aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2} />}
                <span className="truncate">{t(`pasos.${p}`)}</span>
              </span>
              <span className="sr-only lg:hidden">{estado === 'hecho' ? t('pasoHecho', { paso: t(`pasos.${p}`) }) : t(`pasos.${p}`)}</span>
            </>
          );
          return (
            <li key={p} aria-current={estado === 'actual' ? 'step' : undefined} className="min-w-0">
              {estado === 'hecho' ? (
                <button
                  type="button"
                  onClick={() => onIr(p)}
                  className="block w-full min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {contenido}
                </button>
              ) : (
                <div className="min-w-0">{contenido}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
