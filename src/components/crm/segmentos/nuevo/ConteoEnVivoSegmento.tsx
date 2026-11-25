'use client';

/**
 * Columna «Conteo en vivo» del constructor de segmentos (Figma CRM 1384:825677;
 * «conteo no disponible» 1388:1979): tres tarjetas.
 *
 * - «Coinciden» (tinte de marca): clientes que cumplen las reglas sobre la base,
 *   con «↻ actualizado» para volver a contar. Si el servidor no alcanza a
 *   contar, lo dice en la misma tarjeta y deja guardar.
 * - «Se pueden contactar»: teléfono, en el RNE (no se llaman), correo y
 *   WhatsApp con consentimiento (`fn_can_contact`, la misma puerta del envío).
 * - «Muestra»: tres clientes que coinciden («Empresa · Contacto»).
 */

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Loader2, Mail, MessageSquare, Phone, RefreshCw, type LucideIcon } from 'lucide-react';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { cn } from '@/utils/Utils';
import type { ConteoEnVivo } from './useConteoSegmento';
import { porcentajeDeBase } from './conteoSegmentoLogica';

const TARJETA = 'rounded-xl border border-line bg-surface p-4';

function FilaCanal({ icono: Icono, etiqueta, valor, tono }: { icono: LucideIcon; etiqueta: string; valor: string; tono?: 'advertencia' }) {
  return (
    <li className="flex items-center gap-2 text-[13px] leading-[18px]">
      <Icono aria-hidden="true" className={cn('size-4 shrink-0', tono ? 'text-warning-text' : 'text-fg-secondary')} strokeWidth={1.5} />
      <span className="min-w-0 flex-1 text-fg">{etiqueta}</span>
      <span className={cn('text-sm font-medium tabular-nums', tono ? 'text-warning-text' : 'text-fg')}>{valor}</span>
    </li>
  );
}

export function ConteoEnVivoSegmento({ estado, conteo, reintentar }: ConteoEnVivo) {
  const t = useTranslations('crm.segmentos.constructor.conteo');
  const entero = useFormatoEntero();
  const { formatTime } = useFormatDate();
  const d = conteo?.desglose ?? null;
  const viejo = estado !== 'listo' && conteo !== null;
  const cifra = (n: number | undefined) => (n === undefined ? '—' : d?.estimado ? `≈ ${entero(n)}` : entero(n));
  const fallo = estado === 'tardio' || estado === 'noDisponible' || estado === 'error' || estado === 'invalido' || estado === 'sinPermiso';

  let cuerpo: ReactNode;
  if (fallo) {
    cuerpo = (
      <div className="mt-2 space-y-3">
        <p className="text-[13px] leading-[18px] text-fg">{t(`estados.${estado}.descripcion`)}</p>
        {(estado === 'tardio' || estado === 'error') && (
          <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={reintentar}>
            <RefreshCw aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('reintentar')}
          </button>
        )}
      </div>
    );
  } else if (conteo) {
    cuerpo = (
      <div className={viejo ? 'opacity-60' : undefined}>
        <p className="mt-1.5 text-[28px] font-semibold leading-9 tracking-[-0.2px] tabular-nums text-fg">
          {t('clientes', { n: conteo.coinciden, valor: entero(conteo.coinciden) })}
        </p>
        <p className="mt-1.5 text-xs text-fg-secondary">{t('deBase', { base: entero(conteo.base), pct: porcentajeDeBase(conteo.coinciden, conteo.base) })}</p>
      </div>
    );
  } else {
    cuerpo = (
      <div className="mt-2 space-y-2" aria-hidden="true">
        <div className="h-9 w-44 animate-pulse rounded bg-surface" />
        <div className="h-4 w-40 animate-pulse rounded bg-surface" />
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-live="polite" aria-busy={estado === 'contando'}>
      <section aria-label={t('coinciden')} className="rounded-xl border border-brand bg-brand-tint p-4">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-xs font-medium text-fg-secondary">{t('coinciden')}</h3>
          {estado === 'contando' ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-brand-deep">
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              {t('contando')}
            </span>
          ) : (
            <button
              type="button"
              onClick={reintentar}
              title={conteo ? t('actualizado', { hora: formatTime(conteo.calculado_en) }) : undefined}
              className="inline-flex items-center gap-1.5 rounded text-xs text-brand-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <RefreshCw aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
              {t('actualizadoCorto')}
            </button>
          )}
        </div>
        {cuerpo}
      </section>

      <section aria-labelledby="segmento-desglose" className={TARJETA}>
        <h3 id="segmento-desglose" className="text-base font-semibold text-fg">
          {t('desglose.titulo')}
        </h3>
        <ul className={cn('mt-3 space-y-2.5', viejo && 'opacity-60')}>
          <FilaCanal icono={Phone} etiqueta={t('desglose.telefono')} valor={cifra(d?.telefono)} />
          <FilaCanal icono={Ban} etiqueta={t('desglose.noLlamar')} valor={cifra(d?.no_llamar)} tono={d && d.no_llamar > 0 ? 'advertencia' : undefined} />
          <FilaCanal icono={Mail} etiqueta={t('desglose.correo')} valor={cifra(d?.correo)} />
          <FilaCanal icono={MessageSquare} etiqueta={t('desglose.whatsapp')} valor={cifra(d?.whatsapp)} />
        </ul>
        {d?.estimado && <p className="mt-2 text-xs text-fg-muted">{t('desglose.estimado', { n: entero(d.sobre) })}</p>}
        {conteo && !d && <p className="mt-2 text-xs text-fg-muted">{t('desglose.sinDato')}</p>}
      </section>

      <section aria-labelledby="segmento-muestra" className={TARJETA}>
        <h3 id="segmento-muestra" className="text-base font-semibold text-fg">
          {t('muestra')}
        </h3>
        {!conteo || conteo.muestra.length === 0 ? (
          <p className="mt-2 text-[13px] text-fg-secondary">{conteo ? t('sinMuestra') : '—'}</p>
        ) : (
          <ul className={cn('mt-2 space-y-2 text-[13px] leading-[18px] text-fg-secondary', viejo && 'opacity-60')}>
            {conteo.muestra.map((m) => (
              <li key={m.id} className="truncate">
                {[m.empresa, m.nombre].filter(Boolean).join(' · ') || t('sinNombre')}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
