'use client';

/**
 * Estado de un periodo contable (Figma `kit/contabilidad · EstadoPeriodo`
 * 978:605207): Abierto (éxito) · En cierre (advertencia) · Cerrado (neutro, con
 * candado). El tono sale de `estadoTono.ts`; aquí solo la etiqueta traducida.
 */
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { StatusBadge } from '@/components/kit';

export type ValorEstadoPeriodo = 'abierto' | 'enCierre' | 'cerrado';

export function estadoDePeriodo(status: string | null | undefined): ValorEstadoPeriodo {
  if (status === 'closed' || status === 'locked' || status === 'cerrado') return 'cerrado';
  if (status === 'closing' || status === 'en_cierre') return 'enCierre';
  return 'abierto';
}

export function EstadoPeriodo({ status, className }: { status: string | null | undefined; className?: string }) {
  const t = useTranslations('finanzasContabilidadR3.comun.periodo');
  const valor = estadoDePeriodo(status);
  if (valor === 'cerrado') {
    return <StatusBadge estado="cerrado" etiqueta={t('cerrado')} tono="neutro" apariencia="contorno" icono={Lock} className={className} />;
  }
  if (valor === 'enCierre') {
    return <StatusBadge estado="en cierre" etiqueta={t('enCierre')} tono="advertencia" className={className} />;
  }
  return <StatusBadge estado="abierto" etiqueta={t('abierto')} className={className} />;
}
