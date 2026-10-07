'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Bot, Phone, Undo2 } from 'lucide-react';
import { clasesBoton } from '@/components/kit/botonClases';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { enlaceLlamada, type FranjaAgenteVoz } from './perdidaPorAgenteLogica';

/**
 * Franja del agente de voz en el detalle de la oportunidad (Figma
 * `VozDesinteres/AvisoPerdidaAgente`, escritorio y móvil): quién la cerró y
 * cuándo, el motivo, el resumen de la llamada, «Escuchar la llamada» y
 * «Reabrir». Neutros y azul de marca; `role="status"` para lectores de pantalla.
 */
export function PerdidaPorAgenteAviso({
  franja,
  puedeReabrir,
  onReabrir,
}: {
  franja: FranjaAgenteVoz;
  puedeReabrir: boolean;
  onReabrir: () => void;
}) {
  const t = useTranslations('crm.oportunidad.agenteVoz');
  const { formatDateTime } = useFormatDate();
  const perdida = franja.tipo === 'perdida';
  const titulo = perdida
    ? franja.en
      ? t('perdidaTituloCuando', { cuando: formatDateTime(franja.en) })
      : t('perdidaTitulo')
    : t('decidirTitulo');

  return (
    <section
      role="status"
      aria-label={t('aria')}
      className="flex flex-col gap-3 rounded-xl border border-line bg-subtle p-4 md:flex-row md:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
          <Bot className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-fg">{titulo}</p>
          {perdida && franja.motivo && <p className="break-words text-sm text-fg-secondary">{t('motivo', { motivo: franja.motivo })}</p>}
          {perdida && franja.resumen && <p className="break-words text-xs text-fg-muted">{franja.resumen}</p>}
          {!perdida && <p className="break-words text-sm text-fg-secondary">{t('decidirDetalle')}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:shrink-0">
        {franja.callId && (
          <Link href={enlaceLlamada(franja.callId)} className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-brand-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
            <Phone aria-hidden="true" className="size-4" strokeWidth={1.75} />
            {t('escucharLlamada')}
          </Link>
        )}
        {perdida && puedeReabrir && (
          <button type="button" onClick={onReabrir} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            <Undo2 aria-hidden="true" className="size-4" />
            {t('reabrir')}
          </button>
        )}
      </div>
    </section>
  );
}
