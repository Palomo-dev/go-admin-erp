'use client';

/**
 * EventoHistorial (Figma 20.6, pieza propia de RR. HH. armada con el kit):
 * un cambio con fecha de efecto en la línea de tiempo de la ficha. Antes →
 * Ahora, motivo y quién lo registró y aprobó. Sin permiso de salario, el
 * evento se ve y el valor no («Valor oculto»).
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Briefcase, Clock, DollarSign, FileText, Lock, MapPin, ShieldCheck, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { fechaCorta } from '../textosPersonas';

export type EstadoEvento = 'programado' | 'vigente' | 'pendiente' | 'rechazado' | 'reemplazado' | 'anulado';

const ICONO: Record<string, LucideIcon> = {
  salario: DollarSign,
  periodo_salario: DollarSign,
  cargo: Briefcase,
  area: Briefcase,
  jefe: Briefcase,
  sede: MapPin,
  centro_costo: MapPin,
  jornada_horas_semana: Clock,
  eps: ShieldCheck,
  afp: ShieldCheck,
  arl: ShieldCheck,
  ccf: ShieldCheck,
  cesantias: ShieldCheck,
  ingreso: UserPlus,
};

const TONO: Record<EstadoEvento, 'exito' | 'informacion' | 'advertencia' | 'peligro' | 'neutro'> = {
  vigente: 'exito',
  programado: 'informacion',
  pendiente: 'advertencia',
  rechazado: 'peligro',
  reemplazado: 'neutro',
  anulado: 'neutro',
};

export interface EventoHistorialProps {
  campo: string;
  titulo: string;
  estado: EstadoEvento;
  efecto: string;
  antes?: string | null;
  ahora?: string | null;
  /** Bloque único (ingreso): «Al ingresar: …». */
  resumen?: string | null;
  oculto?: boolean;
  motivo?: string | null;
  pie?: string | null;
  destacado?: boolean;
  ultimo?: boolean;
  acciones?: ReactNode;
}

export function EventoHistorial({ campo, titulo, estado, efecto, antes, ahora, resumen, oculto, motivo, pie, destacado, ultimo, acciones }: EventoHistorialProps) {
  const t = useTranslations('hrmPersonas.historial');
  const Icono = ICONO[campo] ?? FileText;
  return (
    <li className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Icono aria-hidden className="size-4" strokeWidth={1.5} />
        </span>
        {!ultimo && <span aria-hidden className="w-px flex-1 bg-line" />}
      </div>
      <article
        className={cn(
          'mb-3 min-w-0 flex-1 rounded-xl border bg-surface p-4',
          destacado ? 'border-line-brand ring-1 ring-brand/30' : 'border-line'
        )}
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-fg">{titulo}</h3>
            <StatusBadge estado={estado} tono={TONO[estado]} etiqueta={t(`estados.${estado}`)} />
          </div>
          <span className="text-xs text-fg-secondary">
            {estado === 'rechazado' || estado === 'pendiente' ? t('efectoPedido', { fecha: fechaCorta(efecto) }) : t('efecto', { fecha: fechaCorta(efecto) })}
          </span>
        </header>
        {resumen ? (
          <div className="mt-3 inline-flex max-w-full flex-col rounded-lg bg-brand-tint px-3 py-2">
            <span className="text-xs text-brand-deep">{t('alIngresar')}</span>
            <span className="text-sm text-fg">{resumen}</span>
          </div>
        ) : oculto ? (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-xs text-fg-secondary">
            <Lock aria-hidden className="size-3.5" strokeWidth={1.5} />
            {t('valorOculto')}
          </p>
        ) : antes !== undefined || ahora !== undefined ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="rounded-lg bg-subtle px-3 py-2">
              <p className="text-xs text-fg-secondary">{t('antes')}</p>
              <p className="text-sm text-fg">{antes || '—'}</p>
            </div>
            <ArrowRight aria-hidden className="size-4 text-fg-secondary" strokeWidth={1.5} />
            <div className="rounded-lg bg-brand-tint px-3 py-2">
              <p className="text-xs text-brand-deep">{t('ahora')}</p>
              <p className="text-sm font-medium text-fg">{ahora || '—'}</p>
            </div>
          </div>
        ) : null}
        {motivo ? <p className="mt-3 text-sm text-fg">{t('motivo', { motivo })}</p> : null}
        {pie ? <p className="mt-1 text-xs text-fg-muted">{pie}</p> : null}
        {acciones ? <div className="mt-3 flex flex-wrap gap-2">{acciones}</div> : null}
      </article>
    </li>
  );
}
