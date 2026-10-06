'use client';

import { Check, ConciergeBell, Receipt } from 'lucide-react';
import { KbdButton } from '@/components/kit';
import { clasesBadgeTono } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import type { SolicitudMesa } from './solicitudesMesaLogica';
import { useTextosCartaQr } from './textosCartaQr';

/**
 * Solicitudes de la Carta QR en POS › Mesas (Figma «21 · POS › Mesas con Carta QR», sección
 * 2032:75742; componentes `SolicitudMesaCard` e `InsigniaSolicitudMesa`): banda neutra con
 * «Solicitudes de las mesas · N sin atender» y una tarjeta por solicitud — icono de marca (sólido
 * sin ver, tinte en camino), «Mesa 21 · Llama al mesero», «hace 3 min», el motivo, «Voy» (solo
 * abierta) y «Atendida». La más antigua va primero. Sin solicitudes no se pinta nada.
 */
export function minutosEspera(desde: string, ahora: Date): number {
  const t = new Date(desde).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((ahora.getTime() - t) / 60000)) : 0;
}

export interface SolicitudMesaCardProps {
  solicitud: SolicitudMesa;
  /** «Mesa 21». */
  mesa: string;
  ahora: Date;
  ocupada: boolean;
  onAtender: (s: SolicitudMesa, estado: 'ack' | 'done') => void;
  /** Ver la mesa al tocar el texto (banda de Mesas); en la cuenta no hace falta. */
  onVerMesa?: () => void;
  className?: string;
}

/** Tarjeta de una solicitud (`SolicitudMesaCard`): la usan la banda de Mesas y la cuenta de la mesa. */
export function SolicitudMesaCard({ solicitud: s, mesa, ahora, ocupada, onAtender, onVerMesa, className }: SolicitudMesaCardProps) {
  const t = useTextosCartaQr();
  const Icono = s.tipo === 'bill' ? Receipt : ConciergeBell;
  const min = minutosEspera(s.creadaEn, ahora);
  const abierta = s.estado === 'open';
  const contenido = (
    <>
      <span
        aria-hidden="true"
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', abierta ? 'bg-brand text-white' : 'bg-brand-tint text-brand')}
      >
        <Icono className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">{t('solicitudes.mesaTipo', { mesa, tipo: t(`solicitudes.tipo.${s.tipo}`) })}</span>
        <span className="block text-xs text-fg-secondary tabular-nums">
          {min < 1 ? t('solicitudes.ahora') : t('solicitudes.hace', { n: min })}
          {!abierta && ` · ${t('solicitudes.vista')}`}
        </span>
        {s.motivo && <span className="mt-0.5 line-clamp-2 block text-[13px] text-fg">«{s.motivo}»</span>}
      </span>
    </>
  );
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border border-line bg-surface p-3', className)}>
      {onVerMesa ? (
        <button
          type="button"
          onClick={onVerMesa}
          aria-label={t('solicitudes.verMesa')}
          className="flex items-start gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {contenido}
        </button>
      ) : (
        <div className="flex items-start gap-2">{contenido}</div>
      )}
      <div className="flex gap-2">
        {abierta && (
          <KbdButton variante="secundario" tamano="sm" className="h-8 flex-1" disabled={ocupada} onClick={() => onAtender(s, 'ack')}>
            {t('solicitudes.voy')}
          </KbdButton>
        )}
        <KbdButton variante="primario" icono={Check} tamano="sm" className="h-8 flex-1" cargando={ocupada} onClick={() => onAtender(s, 'done')}>
          {t('solicitudes.atendida')}
        </KbdButton>
      </div>
    </div>
  );
}

export interface SolicitudesMesaBandaProps {
  solicitudes: readonly SolicitudMesa[];
  nombreMesa: (mesaId: string) => string;
  ahora: Date;
  enCurso: ReadonlySet<string>;
  onAtender: (s: SolicitudMesa, estado: 'ack' | 'done') => void;
  onVerMesa: (mesaId: string) => void;
  className?: string;
}

export function SolicitudesMesaBanda({ solicitudes, nombreMesa, ahora, enCurso, onAtender, onVerMesa, className }: SolicitudesMesaBandaProps) {
  const t = useTextosCartaQr();
  if (solicitudes.length === 0) return null;
  // Figma 21: «2 sin atender» cuenta abiertas y en camino (aún no atendidas).
  const sinAtender = solicitudes.length;
  return (
    <section aria-label={t('solicitudes.titulo')} className={cn('flex flex-col gap-2 rounded-xl border border-line bg-subtle p-3', className)}>
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-fg">{t('solicitudes.titulo')}</h2>
        {sinAtender > 0 && <span className={clasesBadgeTono('marca', 'suave', 'sm')}>{t('solicitudes.contador', { n: sinAtender })}</span>}
        <span className="text-xs text-fg-secondary">{t('solicitudes.descripcion')}</span>
      </header>
      <ul className="flex gap-2 overflow-x-auto pb-1" aria-live="polite">
        {solicitudes.map((s) => (
          <li key={s.id} className="w-[260px] shrink-0">
            <SolicitudMesaCard
              solicitud={s}
              mesa={nombreMesa(s.mesaId)}
              ahora={ahora}
              ocupada={enCurso.has(s.id)}
              onAtender={onAtender}
              onVerMesa={() => onVerMesa(s.mesaId)}
              className="h-full"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
