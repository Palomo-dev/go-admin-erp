'use client';

/**
 * Bloque «Cuando»: el disparador y el ámbito que el motor lee con él
 * (`TRIGGER_OPTIONS[].scope`, espejo de `matchesTriggerConfig`): pipeline y
 * etapa para `stage_change`, solo pipeline para `event`, nada para el resto.
 * Si la regla guarda un ámbito que este disparador ignora, se dice en
 * pantalla; nunca se borra en silencio (R1). Nunca más de tres campos.
 */

import { Label } from '@/components/ui/label';
import { EntitySelect } from '@/components/crm/shared/EntitySelect';
import { stagesOfPipeline } from '@/components/crm/shared/useCrmLookups';
import { TRIGGER_OPTIONS, triggerOption } from '@/lib/services/crm/automation/ruleCatalog';
import { ignoredScope, mutedEvent, setTrigger, triggerScope, type RuleFormState } from '@/lib/services/crm/automation/ruleEditorModel';
import { AnimatePresence, Expand } from '@/components/shared/motion';
import { EventPicker } from './EventPicker';
import type { RuleLookups } from './useRuleLookups';
import { useTranslations } from 'next-intl';

export const SELECT_CLASS =
  'h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-900 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 '
  + 'dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

interface Props {
  form: RuleFormState;
  lookups: RuleLookups;
  onChange: (next: RuleFormState) => void;
}

/** Texto de R1: qué ámbito guardado ignora este disparador (y se conserva). */
function ignoredScopeText(form: RuleFormState, lookups: RuleLookups, t: (clave: string, valores?: Record<string, string>) => string): string | null {
  const ignored = ignoredScope(form);
  const parts: string[] = [];
  if (ignored.pipeline) parts.push(t('triggerBlock.ignorado.pipeline', { nombre: lookups.humanizer.pipelineName?.(form.pipeline_id) ?? form.pipeline_id }));
  if (ignored.stage) parts.push(t('triggerBlock.ignorado.etapa', { nombre: lookups.humanizer.stageName?.(form.stage_id) ?? form.stage_id }));
  if (parts.length === 0) return null;
  return t(parts.length > 1 ? 'triggerBlock.ignorado.ambos' : 'triggerBlock.ignorado.uno', { a: parts[0], b: parts[1] ?? '' });
}

export function TriggerBlock({ form, lookups, onChange }: Props) {
  const tx = useTranslations('crm.automatizaciones');
  const option = triggerOption(form.trigger_type);
  const scope = triggerScope(form.trigger_type);
  const stageOptions = stagesOfPipeline(lookups.stages, form.pipeline_id || null);
  const ignoredText = ignoredScopeText(form, lookups, tx);
  const muted = mutedEvent(form);

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="rule-trigger" className="text-xs text-gray-700 dark:text-gray-300">{tx('triggerBlock.disparador')}</Label>
        <select
          id="rule-trigger"
          className={SELECT_CLASS}
          value={form.trigger_type}
          aria-describedby="rule-trigger-hint"
          onChange={(e) => onChange(setTrigger(form, e.target.value))}
        >
          {TRIGGER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <p id="rule-trigger-hint" className="mt-1 text-xs text-gray-600 dark:text-gray-400">{option?.hint}</p>
      </div>

      <AnimatePresence initial={false}>
        {form.trigger_type === 'event' && (
          <Expand key="event">
            <div>
              <Label htmlFor="rule-event" className="text-xs text-gray-700 dark:text-gray-300">{tx('triggerBlock.evento')}</Label>
              <EventPicker
                id="rule-event"
                value={form.event}
                describedBy={muted ? 'rule-event-hint rule-event-muted' : 'rule-event-hint'}
                onChange={(event) => onChange({ ...form, event })}
              />
              <p id="rule-event-hint" className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {tx('triggerBlock.eligeUnoConocidoEscribe')}
              </p>
              {/* R-5: también para el evento heredado de una regla ya guardada, no solo el que se escribe. */}
              {muted && (
                <p id="rule-event-muted" role="alert" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  {tx('triggerBlock.vaPropioDisparadorCambia', { muted, label: option?.label ?? '' })}
                </p>
              )}
            </div>
          </Expand>
        )}
        {scope !== 'none' && (
          <Expand key="scope">
            <div className={scope === 'pipeline_stage' ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
              <div>
                {/* EntitySelect es compartido y no expone `id`: el nombre accesible va en `ariaLabel`. */}
                <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">{tx('triggerBlock.pipeline')}</span>
                {lookups.loading ? (
                  <p className="text-xs text-gray-600 dark:text-gray-400">{tx('triggerBlock.cargandoPipelines')}</p>
                ) : (
                  <EntitySelect
                    value={form.pipeline_id || null}
                    onChange={(id) => onChange(setTrigger(form, form.trigger_type, { pipeline_id: id ?? '' }))}
                    options={lookups.pipelines}
                    placeholder={tx('triggerBlock.cualquierPipeline')}
                    emptyMessage={tx('triggerBlock.noHayPipelinesCreados')}
                    ariaLabel={tx('triggerBlock.pipelineRegla')}
                    renderSubtitle={(p) => (p as { pipeline_type?: string | null }).pipeline_type ?? null}
                  />
                )}
              </div>
              {scope === 'pipeline_stage' && (
                <div>
                  <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">{tx('triggerBlock.entrarEtapa')}</span>
                  {lookups.loading ? (
                    <p className="text-xs text-gray-600 dark:text-gray-400">{tx('triggerBlock.cargandoEtapas')}</p>
                  ) : (
                    <EntitySelect
                      value={form.stage_id || null}
                      onChange={(id) => onChange(setTrigger(form, form.trigger_type, { stage_id: id ?? '' }))}
                      options={stageOptions}
                      placeholder={tx('triggerBlock.cualquierEtapa')}
                      emptyMessage={form.pipeline_id ? tx('triggerBlock.pipelineElegidoNoTiene') : tx('actionChipEditor.noHayEtapasCreadas')}
                      ariaLabel={tx('triggerBlock.etapaRegla')}
                    />
                  )}
                </div>
              )}
            </div>
          </Expand>
        )}
        {ignoredText && (
          <Expand key="ignored">
            <p role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              {ignoredText}
            </p>
          </Expand>
        )}
      </AnimatePresence>
    </div>
  );
}
