'use client';

import { Star, TriangleAlert } from 'lucide-react';
import { HoraZona } from '@/components/pos/mesas/cuenta/LineaCuentaMesa';
import { cn } from '@/utils/Utils';
import { totalPagadoEnLinea, type IntentoPagoEnLinea, type PagoEnLinea, type ValoracionMesa } from './cartaQrMesaLogica';
import type { SolicitudMesa } from './solicitudesMesaLogica';
import { SolicitudMesaCard } from './SolicitudesMesaBanda';
import { useTextosCartaQr } from './textosCartaQr';

/**
 * Lo que la Carta QR dejó en la cuenta de esta mesa (Figma «21 · POS › Mesas con Carta QR»,
 * «Carta QR en la cuenta»), bajo el cliente y la nota de la mesa: la solicitud sin atender
 * (`SolicitudMesaCard`), «Pagado en línea» con cada abono y los pagos en curso, y la valoración de
 * la visita. Sin nada de eso no pinta nada.
 */
export interface CartaQrEnLaCuentaProps {
  mesaNombre: string;
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

function Estrellas({ n, etiqueta }: { n: number; etiqueta: string }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={etiqueta}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden="true" className={cn('size-3.5', i <= n ? 'fill-warning text-warning' : 'text-fg-muted')} strokeWidth={1.5} />
      ))}
    </span>
  );
}

export function CartaQrEnLaCuenta(p: CartaQrEnLaCuentaProps) {
  const t = useTextosCartaQr();
  const nada = p.solicitudes.length === 0 && p.pagos.length === 0 && p.intentos.length === 0 && p.valoraciones.length === 0;
  if (nada) return null;
  const pagado = totalPagadoEnLinea(p.pagos);
  return (
    <div className={cn('flex flex-col gap-2', p.className)}>
      {p.solicitudes.map((s) => (
        <SolicitudMesaCard key={s.id} solicitud={s} mesa={p.mesaNombre} ahora={p.ahora} ocupada={p.enCurso.has(s.id)} onAtender={p.onAtender} />
      ))}

      {(p.pagos.length > 0 || p.intentos.length > 0) && (
        <section aria-label={t('pagosEnLinea.total')} className="flex flex-col gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px]">
          <p className="flex items-baseline justify-between gap-2 font-semibold text-fg">
            {t('pagosEnLinea.titulo')}
            <span className="tabular-nums text-success-text">{pagado > 0 ? `−${p.formatear(pagado)}` : p.formatear(0)}</span>
          </p>
          {p.pagos.map((g) => (
            <p key={g.id} className={cn('flex items-baseline justify-between gap-2 text-fg-secondary', g.anulado && 'line-through opacity-60')}>
              <span className="min-w-0 truncate">
                {g.comensal ? `${g.comensal} · ` : ''}
                {t('pagosEnLinea.detalle', { metodo: g.metodo })} · <HoraZona iso={g.fecha} />
                {g.propina > 0 && ` · ${t('pagosEnLinea.propina', { importe: p.formatear(g.propina) })}`}
              </span>
              <span className="shrink-0 tabular-nums text-fg">{p.formatear(g.importe)}</span>
            </p>
          ))}
          {p.intentos.map((i) => (
            <p key={i.id} className="flex items-baseline justify-between gap-2">
              <span className={cn('flex min-w-0 items-center gap-1 truncate', i.estado === 'sin_aplicar' ? 'text-danger-text' : 'text-fg-secondary')}>
                {i.estado === 'sin_aplicar' && <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />}
                {i.comensal ? `${i.comensal} · ` : ''}
                {i.estado === 'sin_aplicar' ? t('pagosEnLinea.sinAplicar') : t('pagosEnLinea.enCurso')}
              </span>
              <span className="shrink-0 tabular-nums text-fg">{p.formatear(i.importe)}</span>
            </p>
          ))}
        </section>
      )}

      {p.valoraciones.map((v) => (
        <section key={v.id} aria-label={t('valoracion.titulo')} className="flex flex-col gap-0.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px]">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-fg">{t('valoracion.titulo')}</span>
            <Estrellas n={v.estrellas} etiqueta={t('valoracion.estrellas', { n: v.estrellas })} />
            {v.comensal && <span className="text-fg-secondary">{v.comensal}</span>}
          </p>
          {v.aspectos.length > 0 && <p className="text-fg-secondary">{t('valoracion.aspectos', { lista: v.aspectos.join(', ') })}</p>}
          <p className="text-fg">{v.comentario ? `«${v.comentario}»` : <span className="text-fg-muted">{t('valoracion.sinComentario')}</span>}</p>
        </section>
      ))}
    </div>
  );
}
