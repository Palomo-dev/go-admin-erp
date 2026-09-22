'use client';

/**
 * Bloque «entonces»: las acciones como fichas numeradas. «Añadir acción»
 * abre un menú buscable con el catálogo; la ficha nueva se abre para
 * completarla en su sitio.
 */

import { useEffect, useRef, useState } from 'react';
import { Plus, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/utils/Utils';
import { ACTION_CATALOG, actionEntry } from '@/lib/services/crm/automation/ruleCatalog';
import { describeAction } from '@/lib/services/crm/automation/ruleHumanizer';
import {
  addAction,
  changeActionType,
  moveAction,
  removeAction,
  updateAction,
  type FormError,
  type RuleFormState,
} from '@/lib/services/crm/automation/ruleEditorModel';
import { ActionChipEditor } from './ActionChipEditor';
import { CHIP_ICON_CLASS, CHIP_LIST_CLASS, CHIP_TEXT_CLASS, chipClass } from './SentenceBlock';
import { AnimatePresence, Chip, Expand } from '@/components/shared/motion';
import type { RuleLookups } from './useRuleLookups';

interface Props {
  form: RuleFormState;
  lookups: RuleLookups;
  errors: FormError[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  onChange: (next: RuleFormState) => void;
}

export function ActionsBlock({ form, lookups, errors, selected, onSelect, onChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Tester UXM-C: tras reordenar por teclado, el editor se vuelve a montar (clave `editor-${selected}`) y el botón
  // pulsado desaparece; sin esto el foco caía al contenedor de la hoja. `string[]`: el primer id enfocable (no deshabilitado).
  const [focusTarget, setFocusTarget] = useState<{ index: number; type: string } | 'add' | string[] | null>(null);
  const justAdded = useRef(false);
  const actions = form.actions;

  /** Primer campo de la ficha (o el selector de tipo si ese campo no lleva `id`, p. ej. una secuencia). */
  const firstFieldOf = ({ index, type }: { index: number; type: string }): HTMLElement | null => {
    const firstKey = actionEntry(type)?.fields[0]?.key;
    const first = firstKey ? document.getElementById(`action-${index}-${firstKey}`) : null;
    return first ?? document.getElementById(`action-${index}-type`);
  };

  // H2: tras el commit que pinta la ficha nueva, el foco va a su primer campo;
  // tras quitar una, a «Añadir acción». Efecto (no requestAnimationFrame):
  // corre siempre tras el render, también con la ventana ocluida (R-4).
  useEffect(() => {
    if (!focusTarget) return;
    const el = focusTarget === 'add' ? document.getElementById('action-add')
      : Array.isArray(focusTarget) ? focusTarget.map((id) => document.getElementById(id)).find((e) => e && !(e as HTMLButtonElement).disabled)
      : firstFieldOf(focusTarget);
    el?.focus();
    setFocusTarget(null);
  }, [focusTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (type: string) => {
    const index = actions.length;
    onChange(addAction(form, type));
    onSelect(index);
    setFocusTarget({ index, type });
    justAdded.current = true;
    setMenuOpen(false);
  };

  /** El Popover devolvería el foco a «Añadir acción» al cerrarse; si se acaba de añadir una ficha, no. */
  const onMenuCloseAutoFocus = (event: Event) => {
    if (!justAdded.current) return;
    justAdded.current = false;
    event.preventDefault();
  };

  const hasError = (index: number) => errors.some((e) => e.field.startsWith(`actions.${index}.`));

  return (
    <div className="space-y-3">
      {actions.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Sin acciones la regla no hará nada aunque se dispare. Añade al menos una.
        </p>
      ) : (
        <div className={CHIP_LIST_CLASS}>
          {/* UX móvil: cada acción es una tarjeta apilada (número + frase que envuelve); en línea desde `sm`. */}
          <AnimatePresence initial={false}>
            {actions.map((action, index) => {
              const open = selected === index;
              const entry = actionEntry(action.type);
              const warn = hasError(index) || (entry && !entry.implemented);
              return (
                <Chip key={index}>
                  <button
                    type="button"
                    id={`action-chip-${index}`}
                    aria-expanded={open}
                    aria-controls={`action-editor-${index}`}
                    className={cn(chipClass(open, 'emerald', true), warn && 'border-amber-500 dark:border-amber-400')}
                    onClick={() => onSelect(open ? null : index)}
                  >
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 px-1 text-xs font-semibold text-white" aria-label={`Acción ${index + 1}`}>
                      {index + 1}
                    </span>
                    <span className={CHIP_TEXT_CLASS}>{describeAction(action, lookups.humanizer)}</span>
                    {warn && <AlertTriangle className={cn(CHIP_ICON_CLASS, 'text-amber-700 dark:text-amber-300')} aria-label="Revisar" />}
                    {open
                      ? <ChevronUp className={CHIP_ICON_CLASS} aria-hidden="true" />
                      : <ChevronDown className={CHIP_ICON_CLASS} aria-hidden="true" />}
                  </button>
                </Chip>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence initial={false}>
        {selected !== null && actions[selected] && (
          <Expand key={`editor-${selected}`} id={`action-editor-${selected}`}>
            <ActionChipEditor
              index={selected}
              total={actions.length}
              action={actions[selected]}
              lookups={lookups}
              errors={errors}
              onPatch={(patch) => onChange(updateAction(form, selected, patch))}
              onChangeType={(type) => onChange(changeActionType(form, selected, type))}
              onMove={(dir) => {
                const target = dir === 'up' ? selected - 1 : selected + 1;
                if (target < 0 || target >= actions.length) return;
                onChange(moveAction(form, selected, dir));
                onSelect(target);
                setFocusTarget([`action-${target}-move-${dir}`, `action-chip-${target}`]);
              }}
              onRemove={() => {
                onChange(removeAction(form, selected));
                onSelect(null);
                setFocusTarget('add');
              }}
            />
          </Expand>
        )}
      </AnimatePresence>

      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button id="action-add" type="button" size="sm" variant="outline" className="h-8" aria-haspopup="listbox">
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Añadir acción
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0" onCloseAutoFocus={onMenuCloseAutoFocus}>
          <Command>
            <CommandInput placeholder="Buscar acción…" />
            <CommandList>
              <CommandEmpty>Ninguna acción coincide.</CommandEmpty>
              <CommandGroup heading="Disponibles">
                {ACTION_CATALOG.filter((a) => a.implemented).map((a) => (
                  <CommandItem key={a.type} value={`${a.label} ${a.type}`} onSelect={() => add(a.type)}>
                    <div>
                      <p className="text-sm">{a.label}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{a.hint}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Todavía no disponibles">
                {ACTION_CATALOG.filter((a) => !a.implemented).map((a) => (
                  <CommandItem key={a.type} value={`${a.label} ${a.type}`} onSelect={() => add(a.type)}>
                    <AlertTriangle className="mr-2 h-3.5 w-3.5 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                    <span className="text-sm">{a.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
