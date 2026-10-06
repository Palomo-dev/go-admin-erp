'use client';

import { Check, ConciergeBell, CreditCard, Hourglass, Receipt, Star, TriangleAlert } from 'lucide-react';
import { KbdButton } from '@/components/kit';
import { HoraZona } from '@/components/pos/mesas/cuenta/LineaCuentaMesa';
import { cn } from '@/utils/Utils';
import { totalPagadoEnLinea, type IntentoPagoEnLinea, type PagoEnLinea, type ValoracionMesa } from './cartaQrMesaLogica';
import type { SolicitudMesa } from './solicitudesMesaLogica';
import { minutosEspera } from './SolicitudesMesaBanda';
import { useTextosCartaQr } from './textosCartaQr';

/**
 * Lo que la Carta QR dejó en la cuenta de esta mesa, dentro del panel de la
 * cuenta (POS › Mesas › la mesa): solicitudes sin atender con «Atendida»,
 * pagos en línea (ya descontados del saldo), pagos en curso o sin aplicar y la
 * valoración de la visita. Sin nada de eso no pinta nada.
 */
export interface CartaQrEnLaCuentaProps {
  solicitudes: readonly SolicitudMesa[];
  pagos: readonly PagoEnLinea[];
  intentos: readonly IntentoPagoEnLinea[];
  valoraciones: readonly ValoracionMesa[];
  formatear: (n: number) => string;
  ahora: Date;
  enCurso: ReadonlySet<string>;
  onAtender: (s: SolicitudMesa, estado: 'ack' | 'done') => void;
  className?: string;
}

export function CartaQrEnLaCuenta(p: CartaQrEnLaCuentaProps) {
  const t = useTextosCartaQr();
  const nada = p.solicitudes.length === 0 && p.pagos.length === 0 && p.intentos.length === 0 && p.valoraciones.length === 0;
  if (nada) return null;
  const pagado = totalPagadoEnLinea(p.pagos);
  return (
    <div className={cn('flex flex-col gap-2', p.className)}>
      {p.solicitudes.map((s) => {
        const Icono = s.tipo === 'bill' ? Receipt : ConciergeBell;
        const min = minutosEspera(s.creadaEn, p.ahora);
        return (
          <div key={s.id} role="status" className="flex items-center gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2">
            <Icono aria-hidden="true" className="size-4 shrink-0 text-warning-text" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 text-[13px] text-fg">
              <span className="font-semibold">{t(`solicitudes.tipo.${s.tipo}`)}</span>
              <span className="text-fg-secondary"> · {min < 1 ? t('solicitudes.ahora') : t('solicitudes.hace', { n: min })}</span>
              {s.motivo && <span className="block truncate text-fg-secondary">«{s.motivo}»</span>}
            </span>
            {s.estado === 'open' && (
              <KbdButton variante="secundario" tamano="sm" className="h-8" disabled={p.enCurso.has(s.id)} onClick={() => p.onAtender(s, 'ack')}>
                {t('solicitudes.voy')}
              </KbdButton>
            )}
            <KbdButton variante="primario" tamano="sm" className="h-8" cargando={p.enCurso.has(s.id)} onClick={() => p.onAtender(s, 'done')}>
              <Check aria-hidden="true" className="size-4" strokeWidth={1.75} />
              {t('solicitudes.atendida')}
            </KbdButton>
          </div>
        );
      })}

      {(p.pagos.length > 0 || p.intentos.length > 0) && (
        <section aria-label={t('pagosEnLinea.total')} className="rounded-lg border border-line px-3 py-2">
          <p className="flex items-center justify-between text-[13px]">
            <span className="flex items-center gap-1.5 font-semibold text-fg">
              <CreditCard aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
              {t('pagosEnLinea.titulo')}
            </span>
            <span className="font-semibold tabular-nums text-success-text">{formatearNegativo(p.formatear, pagado)}</span>
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {p.pagos.map((g) => (
              <li key={g.id} className={cn('flex items-baseline justify-between gap-2 text-[13px] text-fg-secondary', g.anulado && 'line-through opacity-60')}>
                <span className="min-w-0 truncate">
                  {g.comensal ? `${g.comensal} · ` : ''}
                  {t('pagosEnLinea.detalle', { metodo: g.metodo })} · <HoraZona iso={g.fecha} />
                  {g.propina > 0 && ` · ${t('pagosEnLinea.propina', { importe: p.formatear(g.propina) })}`}
                </span>
                <span className="shrink-0 tabular-nums text-fg">{p.formatear(g.importe)}</span>
              </li>
            ))}
            {p.intentos.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className={cn('flex min-w-0 items-center gap-1 truncate', i.estado === 'sin_aplicar' ? 'text-danger-text' : 'text-fg-secondary')}>
                  {i.estado === 'sin_aplicar' ? (
                    <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                  ) : (
                    <Hourglass aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
                  )}
                  {i.comensal ? `${i.comensal} · ` : ''}
                  {i.estado === 'sin_aplicar' ? t('pagosEnLinea.sinAplicar') : t('pagosEnLinea.enCurso')}
                </span>
                <span className="shrink-0 tabular-nums text-fg">{p.formatear(i.importe)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.valoraciones.length > 0 && (
        <section aria-label={t('valoracion.titulo')} className="rounded-lg border border-line px-3 py-2">
          <p className="text-[13px] font-semibold text-fg">{t('valoracion.titulo')}</p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {p.valoraciones.map((v) => (
              <li key={v.id} className="text-[13px]">
                <span className="flex items-center gap-2">
                  <Estrellas n={v.estrellas} etiqueta={t('valoracion.estrellas', { n: v.estrellas })} />
                  {v.comensal && <span className="truncate text-fg-secondary">{v.comensal}</span>}
                </span>
                {v.aspectos.length > 0 && <span className="block text-fg-secondary">{t('valoracion.aspectos', { lista: v.aspectos.join(', ') })}</span>}
                {v.comentario && <span className="block text-fg">«{v.comentario}»</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Estrellas({ n, etiqueta }: { n: number; etiqueta: string }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={etiqueta}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden="true" className={cn('size-3.5', i <= n ? 'fill-warning text-warning' : 'text-fg-muted')} strokeWidth={1.5} />
      ))}
    </span>
  );
}

function formatearNegativo(formatear: (n: number) => string, n: number): string {
  return n > 0 ? `−${formatear(n)}` : formatear(0);
}
