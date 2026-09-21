'use client';

/**
 * Bloque «si»: las condiciones como fichas. Se pulsa una ficha para editarla
 * en su sitio; «Añadir condición» crea una y la abre. La pestaña JSON de
 * antes sobrevive como diálogo «Editar como JSON» (los grupos anidados solo
 * se editan ahí, pero nunca se pierden).
 */

import { useEffect, useState } from 'react';
import { Plus, Code2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/Utils';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { isGroup, type ConditionRule } from '@/lib/services/crm/automation/conditionsDsl';
import { describeCondition, describeConditions } from '@/lib/services/crm/automation/ruleHumanizer';
import {
  addCondition,
  removeCondition,
  setConditionsFromJson,
  setConditionsOp,
  updateCondition,
  type RuleFormState,
} from '@/lib/services/crm/automation/ruleEditorModel';
import { ConditionChipEditor } from './ConditionChipEditor';
import { CHIP_ICON_CLASS, CHIP_LIST_CLASS, CHIP_TEXT_CLASS, chipClass } from './SentenceBlock';
import { AnimatePresence, Chip, Expand } from './motion';
import type { RuleLookups } from './useRuleLookups';

interface Props {
  form: RuleFormState;
  lookups: RuleLookups;
  onChange: (next: RuleFormState) => void;
}

export function ConditionsBlock({ form, lookups, onChange }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | 'add' | null>(null);
  const rules = form.conditions.rules;

  // H2: la ficha nueva está antes en el DOM que el botón «Añadir condición»;
  // tras el commit que la pinta, el foco va a su primer campo; tras quitar una,
  // al botón. Efecto (no requestAnimationFrame): corre siempre tras el render,
  // también con la ventana ocluida (R-4).
  useEffect(() => {
    if (focusIndex === null) return;
    document.getElementById(focusIndex === 'add' ? 'cond-add' : `cond-${focusIndex}-field`)?.focus();
    setFocusIndex(null);
  }, [focusIndex]);
  // H1: al cerrar el JSON, el foco vuelve a «Editar como JSON», dentro de la hoja que sigue abierta.
  const onJsonCloseAutoFocus = useReturnFocus(jsonOpen);

  const openJson = () => {
    setJsonText(JSON.stringify(form.conditions, null, 2));
    setJsonError(null);
    setJsonOpen(true);
  };

  const applyJson = () => {
    const result = setConditionsFromJson(form, jsonText);
    if (result.error) {
      setJsonError(result.error);
      return;
    }
    onChange(result.form);
    setSelected(null);
    setJsonOpen(false);
  };

  const add = () => {
    const index = rules.length;
    onChange(addCondition(form));
    setSelected(index);
    setFocusIndex(index);
  };

  return (
    <div className="space-y-3">
      {rules.length > 1 && (
        <div role="group" aria-label="Cómo se combinan las condiciones" className="flex items-center gap-1 text-xs">
          <span className="mr-1 text-gray-600 dark:text-gray-400">Se cumple si</span>
          {([['and', 'todas'], ['or', 'alguna']] as const).map(([op, label]) => (
            <button
              key={op}
              type="button"
              aria-pressed={form.conditions.op === op}
              className={cn(chipClass(form.conditions.op === op, 'amber'), 'px-2.5 py-1 text-xs')}
              onClick={() => onChange(setConditionsOp(form, op))}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {rules.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sin condiciones: se dispara siempre que ocurra el disparador. Añade una solo si necesitas filtrar.
        </p>
      ) : (
        <div className={CHIP_LIST_CLASS}>
          {/* UX móvil: cada condición es una tarjeta apilada cuyo texto envuelve; en línea desde `sm`. */}
          <AnimatePresence initial={false}>
            {rules.map((node, index) => {
              const editable = !isGroup(node);
              const open = selected === index;
              return (
                <Chip key={index}>
                  {/* Grupo (tester UXM-C): en móvil la nota baja a su propia línea (`flex-wrap` + `basis-full`);
                      en línea con el texto lo estrangulaba a 163 px y la ficha medía 194 px de alto (374 a 320 px). */}
                  <button
                    type="button"
                    id={`cond-chip-${index}`}
                    aria-expanded={editable ? open : undefined}
                    aria-controls={editable ? `cond-editor-${index}` : undefined}
                    aria-disabled={!editable || undefined}
                    className={cn(chipClass(open, 'amber', true), !editable && 'cursor-default flex-wrap sm:flex-nowrap')}
                    onClick={() => { if (editable) setSelected(open ? null : index); }}
                  >
                    <span className={CHIP_TEXT_CLASS}>
                      {editable
                        ? describeCondition(node as ConditionRule, lookups.humanizer)
                        : `(${describeConditions(node, lookups.humanizer) ?? 'grupo vacío'})`}
                    </span>
                    {/* R-6: el grupo anidado no se edita en ficha; se dice en texto visible, no en `title` (que el teclado y el lector no ven). */}
                    {!editable && <span className="min-w-0 basis-full text-xs text-gray-600 dark:text-gray-400 sm:shrink-0 sm:basis-auto">· grupo, se edita como JSON</span>}
                    {editable && (open
                      ? <ChevronUp className={CHIP_ICON_CLASS} aria-hidden="true" />
                      : <ChevronDown className={CHIP_ICON_CLASS} aria-hidden="true" />)}
                  </button>
                </Chip>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence initial={false}>
        {selected !== null && rules[selected] && !isGroup(rules[selected]) && (
          <Expand key={`editor-${selected}`} id={`cond-editor-${selected}`}>
            <ConditionChipEditor
              index={selected}
              rule={rules[selected] as ConditionRule}
              lookups={lookups}
              onChange={(patch) => onChange(updateCondition(form, selected, patch))}
              onRemove={() => {
                onChange(removeCondition(form, selected));
                setSelected(null);
                setFocusIndex('add');
              }}
            />
          </Expand>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-2">
        <Button id="cond-add" type="button" size="sm" variant="outline" className="h-8" onClick={add}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Añadir condición
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={openJson}>
          <Code2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Editar como JSON
        </Button>
      </div>

      <Dialog open={jsonOpen} onOpenChange={setJsonOpen}>
        <DialogContent onCloseAutoFocus={onJsonCloseAutoFocus} className="max-w-xl bg-white dark:bg-gray-950">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">Condiciones en JSON</DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              Para grupos anidados y casos avanzados. Campos permitidos: opportunity.*, customer.*, stage.*, pipeline.*, consent.*, event.*.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="cond-json" className="sr-only">JSON de las condiciones</Label>
          <Textarea
            id="cond-json"
            rows={10}
            className="font-mono text-xs"
            value={jsonText}
            aria-invalid={!!jsonError}
            aria-describedby={jsonError ? 'cond-json-error' : undefined}
            onChange={(e) => { setJsonText(e.target.value); setJsonError(null); }}
          />
          {jsonError && (
            <p id="cond-json-error" role="alert" className="text-sm text-red-700 dark:text-red-300">{jsonError}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setJsonOpen(false)}>Cancelar</Button>
            <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" onClick={applyJson}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
