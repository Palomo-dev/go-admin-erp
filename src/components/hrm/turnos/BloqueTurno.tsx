'use client';

/**
 * «Bloque turno» (Figma 20.8, componente `96-hrm-f2-componentes-01-bloque-turno`):
 * la celda de un día en la programación. Seis variantes:
 * publicado (borde de marca), borrador (punteado, «sin publicar»), cruce (rojo,
 * «Cruza con Apertura»), tope (ámbar, «Pasa el tope: 44 h»), descanso (gris,
 * «Día libre») y ausencia (azul, «Vacaciones · Aprobadas»).
 *
 * Una ausencia de salud nunca dice el tipo: «Ausencia justificada» al jefe y
 * «Ausente · incapacidad» a RR. HH. sin el permiso de salud (decisión 2).
 */
import { useTranslations } from 'next-intl';
import { AlertTriangle, Coffee, TreePalm, HeartPulse } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { Celda } from '@/lib/hrm/turnos/programacion';
import { partesHoras } from '@/lib/hrm/turnos/programacion';
import { useFormatoHora } from './formatoHora';

export interface BloqueTurnoProps {
  celda: Celda;
  zona: string;
  /** Quien mira ve ausencias de toda la organización (RR. HH.) o es el jefe. */
  vistaJefe?: boolean;
  /** Horas de la semana, para el texto del tope. */
  minutosSemana?: number;
  className?: string;
}

const BASE = 'flex min-h-11 w-full min-w-0 flex-col justify-center rounded-md px-2.5 py-1.5 text-left text-xs leading-4';

export function BloqueTurno({ celda, zona, vistaJefe = false, minutosSemana, className }: BloqueTurnoProps) {
  const t = useTranslations('hrmTurnos.bloque');
  const f = useFormatoHora();
  const a = celda.asignacion;
  const horario = a && !a.dia_descanso ? `${f.hora(a.inicio, zona)} – ${f.hora(a.fin, zona)}` : '';
  const sufijo = celda.festivo ? t('festivo') : a?.minutos ? t('horas', { h: partesHoras(a.minutos).h }) : '';
  const nombre = a?.plantilla ?? t('personalizado');

  if (celda.tipo === 'vacio') return <span className={cn(BASE, 'min-h-11 border border-dashed border-transparent', className)} aria-hidden />;

  if (celda.tipo === 'ausencia' && celda.ausencia) {
    const salud = celda.ausencia.clase === 'incapacidad' && !celda.ausencia.etiqueta;
    const Icono = salud ? HeartPulse : TreePalm;
    const titulo = salud ? (vistaJefe ? t('ausenciaJustificada') : t('ausenteIncapacidad')) : (celda.ausencia.etiqueta ?? t('ausencia'));
    const estado = celda.ausencia.estado === 'requested' ? t('solicitada') : salud ? (vistaJefe ? t('justificada') : t('incapacidad')) : t('aprobada');
    return (
      <span className={cn(BASE, 'border-l-2 border-info bg-info-subtle text-info-text', className)}>
        <span className="flex min-w-0 items-center gap-1 font-medium">
          <Icono aria-hidden className="size-3 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{titulo}</span>
        </span>
        <span className="truncate">{estado}</span>
      </span>
    );
  }

  if (celda.tipo === 'descanso') {
    return (
      <span className={cn(BASE, 'bg-subtle text-fg-secondary', className)}>
        <span className="flex items-center gap-1 font-medium">
          <Coffee aria-hidden className="size-3 shrink-0" strokeWidth={1.5} />
          {t('descanso')}
        </span>
        <span className="truncate text-fg-muted">{t('diaLibre')}</span>
      </span>
    );
  }

  if (celda.tipo === 'cruce') {
    return (
      <span className={cn(BASE, 'border border-danger bg-danger-subtle text-danger-text', className)}>
        <span className="flex min-w-0 items-center gap-1 font-medium">
          <AlertTriangle aria-hidden className="size-3 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{horario}</span>
        </span>
        <span className="truncate">{t('cruzaCon', { plantilla: celda.cruzaCon ?? '—' })}</span>
      </span>
    );
  }

  if (celda.tipo === 'tope') {
    return (
      <span className={cn(BASE, 'border border-warning bg-warning-subtle text-warning-text', className)}>
        <span className="flex min-w-0 items-center gap-1 font-medium">
          <AlertTriangle aria-hidden className="size-3 shrink-0" strokeWidth={1.5} />
          <span className="truncate">{horario}</span>
        </span>
        <span className="truncate">
          {minutosSemana ? t('pasaTope', { h: partesHoras(minutosSemana).h }) : t('pasaTopeDia')}
        </span>
      </span>
    );
  }

  const borrador = celda.tipo === 'borrador';
  return (
    <span
      className={cn(
        BASE,
        borrador ? 'border border-dashed border-brand bg-surface text-fg' : 'border-l-2 border-brand bg-brand-tint text-fg',
        className
      )}
    >
      <span className="truncate font-medium">{horario}</span>
      <span className="truncate text-fg-secondary">{[nombre, sufijo].filter(Boolean).join(' · ')}</span>
    </span>
  );
}
