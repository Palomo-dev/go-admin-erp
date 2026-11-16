'use client';

/**
 * CampoPropuestoIA (Figma 20.6, pieza propia de RR. HH. armada con el kit): un
 * campo que la IA leyó de un documento. Se puede corregir y se confirma con la
 * casilla. Confianza baja o distinto de la ficha → llega SIN marcar (decisión 13).
 */
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/utils/Utils';

export interface CampoPropuestoIAProps {
  id: string;
  etiqueta: string;
  valor: string;
  onValorChange: (v: string) => void;
  confianza: 'alta' | 'media' | 'baja';
  /** Lo que dice hoy la ficha (null si no lo tenía). */
  actual: string | null;
  igual: boolean;
  confirmado: boolean;
  onConfirmadoChange: (v: boolean) => void;
}

export function CampoPropuestoIA({ id, etiqueta, valor, onValorChange, confianza, actual, igual, confirmado, onConfirmadoChange }: CampoPropuestoIAProps) {
  const t = useTranslations('hrmPersonas.ia');
  const dudoso = confianza !== 'alta' || (!igual && actual !== null);
  return (
    <div className={cn('flex flex-col gap-2 rounded-xl border p-3', dudoso ? 'border-line-warning bg-warning-subtle' : 'border-line bg-surface')}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs text-fg-secondary">
          {etiqueta}
        </label>
        <StatusBadge
          estado={confianza}
          tono={confianza === 'alta' ? 'exito' : 'advertencia'}
          etiqueta={confianza === 'alta' ? t('confianzaAlta') : t('confianzaBaja')}
        />
      </div>
      <div className="flex items-center gap-3">
        <Input id={id} value={valor} onChange={(e) => onValorChange(e.target.value)} className="h-10 flex-1 bg-surface" />
        <label className="flex shrink-0 items-center gap-2 text-sm text-fg">
          <Checkbox checked={confirmado} onCheckedChange={(v) => onConfirmadoChange(v === true)} aria-describedby={`${id}-estado`} />
          {t('confirmar')}
        </label>
      </div>
      <p id={`${id}-estado`} className={cn('flex items-center gap-1.5 text-xs', dudoso && !igual && actual !== null ? 'text-warning-text' : 'text-success-text')}>
        {!igual && actual !== null ? (
          <>
            <AlertTriangle aria-hidden className="size-3.5" strokeWidth={1.5} />
            {t('distinto', { actual })}
          </>
        ) : (
          <>
            <CheckCircle2 aria-hidden className="size-3.5" strokeWidth={1.5} />
            {igual ? t('igual') : t('nuevo')}
          </>
        )}
      </p>
    </div>
  );
}
