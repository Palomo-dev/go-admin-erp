'use client';

import { Check, ConciergeBell, Receipt } from 'lucide-react';
import { KbdButton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import type { SolicitudMesa } from './solicitudesMesaLogica';
import { useTextosCartaQr } from './textosCartaQr';

/**
 * Banda de solicitudes de la Carta QR sobre la cuadrícula de Mesas: una ficha
 * por solicitud pendiente («Mesa 7 · Llama al mesero · hace 2 min» con su
 * motivo), «Voy» y «Atendida». La más antigua va primero. Sin solicitudes no
 * se pinta nada (la pantalla queda igual que antes).
 */
export interface SolicitudesMesaBandaProps {
  solicitudes: readonly SolicitudMesa[];
  nombreMesa: (mesaId: string) => string;
  ahora: Date;
  enCurso: ReadonlySet<string>;
  onAtender: (s: SolicitudMesa, estado: 'ack' | 'done') => void;
  onVerMesa: (mesaId: string) => void;
  className?: string;
}

export function minutosEspera(desde: string, ahora: Date): number {
  const t = new Date(desde).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((ahora.getTime() - t) / 60000)) : 0;
}

export function SolicitudesMesaBanda({ solicitudes, nombreMesa, ahora, enCurso, onAtender, onVerMesa, className }: SolicitudesMesaBandaProps) {
  const t = useTextosCartaQr();
  if (solicitudes.length === 0) return null;
  return (
    <section aria-label={t('solicitudes.titulo')} className={cn('rounded-xl border border-line-warning bg-warning-subtle p-3', className)}>
      <header className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-fg">{t('solicitudes.titulo')}</h2>
        <span className="text-xs text-fg-secondary">{t('solicitudes.contador', { n: solicitudes.length })}</span>
      </header>
      <ul className="flex gap-2 overflow-x-auto pb-1" aria-live="polite">
        {solicitudes.map((s) => {
          const Icono = s.tipo === 'bill' ? Receipt : ConciergeBell;
          const min = minutosEspera(s.creadaEn, ahora);
          const ocupada = enCurso.has(s.id);
          return (
            <li key={s.id} className="flex min-w-[240px] max-w-[300px] shrink-0 flex-col gap-2 rounded-lg border border-line bg-surface p-3">
              <button
                type="button"
                onClick={() => onVerMesa(s.mesaId)}
                className="flex items-start gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label={t('solicitudes.verMesa')}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                    s.estado === 'open' ? 'bg-warning text-white' : 'bg-info-subtle text-info-text',
                  )}
                >
                  <Icono className="size-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">
                    {t('solicitudes.mesaTipo', { mesa: nombreMesa(s.mesaId), tipo: t(`solicitudes.tipo.${s.tipo}`) })}
                  </span>
                  <span className="block text-xs text-fg-secondary tabular-nums">
                    {min < 1 ? t('solicitudes.ahora') : t('solicitudes.hace', { n: min })}
                    {s.estado === 'ack' && ` · ${t('solicitudes.vista')}`}
                  </span>
                  {s.motivo && <span className="mt-0.5 line-clamp-2 block text-[13px] text-fg">«{s.motivo}»</span>}
                </span>
              </button>
              <div className="flex gap-2">
                {s.estado === 'open' && (
                  <KbdButton variante="secundario" tamano="sm" className="h-8 flex-1" disabled={ocupada} onClick={() => onAtender(s, 'ack')}>
                    {t('solicitudes.voy')}
                  </KbdButton>
                )}
                <KbdButton variante="primario" icono={Check} tamano="sm" className="h-8 flex-1" cargando={ocupada} onClick={() => onAtender(s, 'done')}>
                  {t('solicitudes.atendida')}
                </KbdButton>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
