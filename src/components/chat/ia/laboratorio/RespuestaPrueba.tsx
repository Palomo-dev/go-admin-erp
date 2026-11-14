'use client';

/**
 * Respuesta de la prueba (Figma 93-chat-pendientes 04 + auditoría 2026-11-14):
 * la pregunta, la respuesta con «Copiar», las cifras reales (tiempo, tokens,
 * fragmentos y costo) y el pie con modelo, creatividad y fecha.
 *
 * Costo: lo que se le cobró a la organización —los créditos que devolvió el
 * servidor al cobrar, 1 por prueba como una respuesta a un cliente— y, si el
 * modelo tiene tarifa cargada, lo que costó en el proveedor. Ninguna cifra se
 * calcula en el navegador.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { LabTestResult } from '@/lib/services/aiLabService';

export function RespuestaPrueba({ resultado }: { resultado: LabTestResult }) {
  const t = useTranslations('chatModulo.ia.laboratorio');
  const locale = useLocaleIntl();
  const { formatDateTime } = useFormatDate();
  const { toast } = useToast();
  const [copiada, setCopiada] = useState(false);
  const m = resultado.metrics;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resultado.response);
      setCopiada(true);
      toast({ title: t('resultado.copiada') });
      setTimeout(() => setCopiada(false), 2000);
    } catch {
      toast({ title: t('resultado.errorCopiar'), variant: 'destructive' });
    }
  };

  const proveedor =
    m.providerCostUsd === null
      ? t('resultado.costoSinTarifa')
      : t('resultado.costoProveedor', {
          monto: m.providerCostUsd.toLocaleString(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 6 }),
        });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg bg-subtle px-3 py-2">
        <p className="text-xs text-fg-muted">{t('resultado.pregunta')}</p>
        <p className="whitespace-pre-wrap text-sm text-fg">{resultado.query}</p>
      </div>

      <div className="relative rounded-xl border border-line-brand bg-brand-tint px-4 py-3 pr-12">
        <p className="whitespace-pre-wrap text-sm leading-6 text-fg">{resultado.response}</p>
        <button
          type="button"
          onClick={copiar}
          aria-label={t('resultado.copiar')}
          title={t('resultado.copiar')}
          className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {copiada ? <Check aria-hidden="true" className="size-4 text-success-text" /> : <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} />}
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t('metricas.tiempo'), `${(m.processingTimeMs / 1000).toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`, null],
          [t('metricas.tokens'), m.totalTokens.toLocaleString(locale), null],
          [t('metricas.fragmentos'), m.retrievedFragments.toLocaleString(locale), null],
          [t('resultado.costo'), t('resultado.costoCreditos', { n: m.creditsCharged }), proveedor],
        ].map(([k, v, nota]) => (
          <div key={String(k)}>
            <dt className="text-xs text-fg-muted">{k}</dt>
            <dd className="text-sm font-semibold tabular-nums text-fg">{v}</dd>
            {nota && <dd className="text-[11px] text-fg-muted">{nota}</dd>}
          </div>
        ))}
      </dl>

      <p className="text-xs text-fg-muted">
        {t('resultado.pie', {
          modelo: m.model,
          temperatura: resultado.settings.temperature.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
          fecha: formatDateTime(resultado.timestamp),
        })}
      </p>
    </div>
  );
}
