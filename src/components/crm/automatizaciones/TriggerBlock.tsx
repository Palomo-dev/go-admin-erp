'use client';
import { useAutomationText } from './useAutomationText';

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

export const SELECT_CLASS =
  'h-9 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-fg '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 '
  + 'dark:border-line-strong dark:bg-surface dark:text-fg';

interface Props {
  form: RuleFormState;
  lookups: RuleLookups;
  onChange: (next: RuleFormState) => void;
}

/** Texto de R1: qué ámbito guardado ignora este disparador (y se conserva). */
function ignoredScopeText(form: RuleFormState, lookups: RuleLookups): string | null {
  const ignored = ignoredScope(form);
  const parts: string[] = [];
  if (ignored.pipeline) parts.push(lookups.humanizer.text?.('el pipeline «{p0}»', { p0: lookups.humanizer.pipelineName?.(form.pipeline_id) ?? form.pipeline_id }) ?? form.pipeline_id);
  if (ignored.stage) parts.push(lookups.humanizer.text?.('la etapa «{p0}»', { p0: lookups.humanizer.stageName?.(form.stage_id) ?? form.stage_id }) ?? form.stage_id);
  if (parts.length === 0) return null;
  const tr = lookups.humanizer.text ?? ((source: string) => source);
  const tail = parts.length > 1 ? tr('se conservan por si vuelves a un disparador que sí los use') : tr('se conserva por si vuelves a un disparador que sí lo use');
  return lookups.humanizer.text?.('Este disparador no mira {p0}: {p1}.', { p0: parts.join(tr(' ni ')), p1: tail }) ?? tail;
}

export function TriggerBlock({ form, lookups, onChange }: Props) {
  const tr = useAutomationText();
  const option = triggerOption(form.trigger_type);
  const scope = triggerScope(form.trigger_type);
  const stageOptions = stagesOfPipeline(lookups.stages, form.pipeline_id || null);
  const ignoredText = ignoredScopeText(form, lookups);
  const muted = mutedEvent(form);

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="rule-trigger" className="text-xs text-fg-secondary dark:text-fg-secondary">{tr("Disparador")}</Label>
        <select
          id="rule-trigger"
          className={SELECT_CLASS}
          value={form.trigger_type}
          aria-describedby="rule-trigger-hint"
          onChange={(e) => onChange(setTrigger(form, e.target.value))}
        >
          {TRIGGER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{tr(t.label)}</option>)}
        </select>
        <p id="rule-trigger-hint" className="mt-1 text-xs text-fg-secondary dark:text-fg-secondary">{tr(option?.hint)}</p>
      </div>

      <AnimatePresence initial={false}>
        {form.trigger_type === 'event' && (
          <Expand key="event">
            <div>
              <Label htmlFor="rule-event" className="text-xs text-fg-secondary dark:text-fg-secondary">{tr("Evento")}</Label>
              <EventPicker
                id="rule-event"
                value={form.event}
                describedBy={muted ? 'rule-event-hint rule-event-muted' : 'rule-event-hint'}
                onChange={(event) => onChange({ ...form, event })}
              />
              <p id="rule-event-hint" className="mt-1 text-xs text-fg-secondary dark:text-fg-secondary">
                {tr("Elige uno conocido o escribe otro con la forma entidad.accion. Vacío = cualquier evento.")}</p>
              {/* R-5: también para el evento heredado de una regla ya guardada, no solo el que se escribe. */}
              {muted && (
                <p id="rule-event-muted" role="alert" className="mt-2 rounded-md border border-line-warning bg-warning-subtle px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  «{muted}{tr("» va por su propio disparador («cambia de etapa» o «cambia un dato»): con «")}{tr(option?.label)}{tr("» esta regla no se dispararía nunca. Elige otro evento o cambia el disparador.")}</p>
              )}
            </div>
          </Expand>
        )}
        {scope !== 'none' && (
          <Expand key="scope">
            <div className={scope === 'pipeline_stage' ? 'grid gap-3 sm:grid-cols-2' : "grid gap-3"}>
              <div>
                {/* EntitySelect es compartido y no expone `id`: el nombre accesible va en `ariaLabel`. */}
                <span className="block text-xs font-medium text-fg-secondary dark:text-fg-secondary">{tr("En el pipeline")}</span>
                {lookups.loading ? (
                  <p className="text-xs text-fg-secondary dark:text-fg-secondary">{tr("Cargando pipelines…")}</p>
                ) : (
                  <EntitySelect
                    value={form.pipeline_id || null}
                    onChange={(id) => onChange(setTrigger(form, form.trigger_type, { pipeline_id: id ?? '' }))}
                    options={lookups.pipelines}
                    placeholder={tr("Cualquier pipeline")}
                    emptyMessage={tr("No hay pipelines creados.")}
                    ariaLabel={tr("Pipeline de la regla")}
                    renderSubtitle={(p) => (p as { pipeline_type?: string | null }).pipeline_type ?? null}
                  />
                )}
              </div>
              {scope === 'pipeline_stage' && (
                <div>
                  <span className="block text-xs font-medium text-fg-secondary dark:text-fg-secondary">{tr("Al entrar en la etapa")}</span>
                  {lookups.loading ? (
                    <p className="text-xs text-fg-secondary dark:text-fg-secondary">{tr("Cargando etapas…")}</p>
                  ) : (
                    <EntitySelect
                      value={form.stage_id || null}
                      onChange={(id) => onChange(setTrigger(form, form.trigger_type, { stage_id: id ?? '' }))}
                      options={stageOptions}
                      placeholder={tr("Cualquier etapa")}
                      emptyMessage={form.pipeline_id ? tr("El pipeline elegido no tiene etapas.") : tr("No hay etapas creadas.")}
                      ariaLabel={tr("Etapa de la regla")}
                    />
                  )}
                </div>
              )}
            </div>
          </Expand>
        )}
        {ignoredText && (
          <Expand key="ignored">
            <p role="status" className="rounded-md border border-line-warning bg-warning-subtle px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              {ignoredText}
            </p>
          </Expand>
        )}
      </AnimatePresence>
    </div>
  );
}
