'use client';

/**
 * Resultado de la prueba en seco retroactiva (Figma CRM 1379:776, panel
 * «Resultado de la prueba»): «Con los datos de los últimos 30 días, la regla se
 * habría ejecutado N veces y omitido M», con una muestra por evento.
 * Los datos los calcula el servidor (`/api/crm/automation-rules/[id]/replay`).
 */

import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { describeAction, describeSkipReason, type HumanizerLookups } from '@/lib/services/crm/automation/ruleHumanizer';
import type { ReplayAutomatizacion } from '@/lib/services/crm/automation/automationReplay';
import type { AutomationRuleView } from './useAutomationRules';
import { motivosOrdenados } from './replayLogica';

interface Props {
  resultado: ReplayAutomatizacion;
  rule: AutomationRuleView;
  lookups: HumanizerLookups;
  /** Botón «×» del panel lateral del constructor (Figma 1379:776). */
  onCerrar?: () => void;
  etiquetaCerrar?: string;
  /** Nota bajo el título (p. ej. «se probó la versión guardada»). */
  nota?: string;
}

export function ReplayResultado({ resultado: r, rule, lookups, onCerrar, etiquetaCerrar, nota }: Props) {
  const t = useTranslations('crm.automatizaciones.replay');
  const entero = useFormatoEntero();
  const { formatDateTime } = useFormatDate();
  const motivo = (m: string | null) => (m === 'record_unavailable' ? t('noDisponible') : describeSkipReason(m));
  const acciones = r.plan.map((p) => (rule.actions[p.index] ? describeAction(rule.actions[p.index], lookups) : String(p.type))).join(' + ');

  return (
    <section aria-live="polite" aria-labelledby="replay-titulo" className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <h2 id="replay-titulo" className="flex-1 text-base font-semibold text-fg">{t('titulo')}</h2>
        <StatusBadge estado="simulacion" etiqueta={t('sinEjecutar')} tono="marca" apariencia="contorno" />
        {onCerrar && (
          <button
            type="button"
            aria-label={etiquetaCerrar}
            className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            onClick={onCerrar}
          >
            <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        )}
      </div>
      {nota && <p className="text-xs text-warning-text">{nota}</p>}

      {r.evaluados === 0 ? (
        <p className="text-sm text-fg-secondary">{t('sinEventos')}</p>
      ) : (
        <p className="text-sm text-fg">{t('resumen', { aplicaria: r.aplicaria, omitidos: r.omitidos, aplicariaTxt: entero(r.aplicaria), omitidosTxt: entero(r.omitidos) })}</p>
      )}

      {!r.regla_activa && <AvisoTonal tono="informacion" compacto titulo={t('inactiva.titulo')} descripcion={t('inactiva.descripcion')} />}
      <p className="text-xs text-fg-muted">{t('baseActual')}</p>
      {r.truncado && <AvisoTonal tono="advertencia" compacto titulo={t('truncado.titulo')} descripcion={t('truncado.descripcion')} />}

      {motivosOrdenados(r.motivos).length > 0 && (
        <ul className="space-y-1 text-[13px] text-fg-secondary" aria-label={t('motivos')}>
          {motivosOrdenados(r.motivos).map(([m, n]) => (
            <li key={m}>{t('motivo', { motivo: motivo(m), n: entero(n) })}</li>
          ))}
        </ul>
      )}

      {r.muestra.length > 0 && (
        // Figma 1379:776: una tarjeta por evento, insignia de contorno a la derecha.
        <ul className="space-y-2" aria-label={t('muestra')}>
          {r.muestra.map((f) => (
            <li key={f.event_id} className="min-w-0 space-y-1 rounded-lg border border-line bg-surface px-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <p className="min-w-0 flex-1 break-words text-sm font-medium text-fg">{f.nombre || t('sinNombre')}</p>
                <StatusBadge estado={f.matched ? 'aplicaria' : 'omitida'} etiqueta={f.matched ? t('aplicaria') : t('omitida')} tono={f.matched ? 'exito' : 'neutro'} apariencia="contorno" tamano="sm" />
              </div>
              <p className="break-words text-xs text-fg-secondary">{f.matched ? acciones || t('sinAcciones') : motivo(f.skip_reason)}</p>
              <p className="text-xs text-fg-muted">{formatDateTime(f.occurred_at)}</p>
            </li>
          ))}
        </ul>
      )}
      {r.evaluados > r.muestra.length && <p className="text-xs text-fg-secondary">{t('yMas', { n: entero(r.evaluados - r.muestra.length) })}</p>}
    </section>
  );
}
