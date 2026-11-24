'use client';

/**
 * Los tres bloques del constructor de reglas (Figma CRM 1375:17):
 * «1 · Cuando» (disparador, pipeline, etapa), «2 · Si se cumple» (filas
 * campo · operador · valor) y «3 · Entonces» (acciones ordenables). Sin
 * lógica de negocio: el estado se transforma con `ruleEditorModel` y el
 * servidor valida de verdad (`validateRuleInput`).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Filter, GripVertical, Play, Plus, Trash2, Zap, type LucideIcon } from 'lucide-react';
import { SelectCrm, type OpcionSelectCrm } from '@/components/crm/kit/SelectCrm';
import { ListaOrdenable } from '@/components/crm/kit/ListaOrdenable';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
import { stagesOfPipeline } from '@/components/crm/shared/useCrmLookups';
import { ACTION_CATALOG, KNOWN_EVENTS, actionEntry } from '@/lib/services/crm/automation/ruleCatalog';
import { CONDITION_FIELDS, OPERATORS, isGroup, type ConditionOperator, type ConditionRule } from '@/lib/services/crm/automation/conditionsDsl';
import { fieldLabel, operatorLabel } from '@/lib/services/crm/automation/conditionsI18n';
import { describeAction, describeConditions } from '@/lib/services/crm/automation/ruleHumanizer';
import {
  addAction,
  addCondition,
  changeActionType,
  conditionValueToText,
  ignoredScope,
  mutedEvent,
  removeAction,
  removeCondition,
  setConditionsOp,
  setTrigger,
  triggerScope,
  updateAction,
  updateCondition,
  type FormError,
  type RuleFormState,
} from '@/lib/services/crm/automation/ruleEditorModel';
import { reordenar } from '@/lib/services/crm/automation/automationListaLogica';
import { ActionChipEditor } from './ActionChipEditor';
import { iconoAccion } from './celdasRegla';
import type { RuleLookups } from './useRuleLookups';

// ─── Marco de bloque ────────────────────────────────────────────────────────

export function BloqueRegla({ id, icono: Icono, titulo, children }: { id: string; icono: LucideIcon; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-4 flex items-center gap-2.5">
        <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-md bg-brand-tint text-brand">
          <Icono className="size-4" strokeWidth={1.5} />
        </span>
        <h2 id={`${id}-titulo`} className="text-base font-semibold text-fg">{titulo}</h2>
      </div>
      {children}
    </section>
  );
}

/** Conector vertical entre bloques (decorativo). */
export function ConectorBloques() {
  return <div aria-hidden="true" className="mx-auto h-5 w-px bg-line-strong" />;
}

// ─── 1 · Cuando ─────────────────────────────────────────────────────────────

const DISPARADORES_DIRECTOS = ['stage_change', 'field_change', 'schedule', 'manual'] as const;

/** Valor del primer select: el tipo de disparador o `event:<evento>`. */
function valorDisparador(form: RuleFormState): string {
  return form.trigger_type === 'event' ? `event:${form.event.trim()}` : form.trigger_type;
}

interface BloqueProps {
  form: RuleFormState;
  lookups: RuleLookups;
  onChange: (next: RuleFormState) => void;
}

export function BloqueCuando({ form, lookups, onChange }: BloqueProps) {
  const t = useTranslations('crm.automatizaciones.constructor');
  const scope = triggerScope(form.trigger_type);
  const etapas = stagesOfPipeline(lookups.stages, form.pipeline_id || null);
  const actual = valorDisparador(form);
  const muted = mutedEvent(form);
  const ignorado = ignoredScope(form);

  const etiquetaEvento = (ev: string) => {
    const clave = ev.replace(/\./g, '_');
    return t.has(`disparadores.${clave}`) ? t(`disparadores.${clave}`) : ev;
  };
  const opciones: OpcionSelectCrm[] = [
    ...DISPARADORES_DIRECTOS.map((d) => ({ valor: d, etiqueta: t(`disparadores.${d}`) })),
    { valor: 'event:', etiqueta: t('disparadores.cualquierEvento') },
    ...KNOWN_EVENTS.map((ev) => ({ valor: `event:${ev.value}`, etiqueta: etiquetaEvento(ev.value) })),
  ];
  if (!opciones.some((o) => o.valor === actual)) opciones.push({ valor: actual, etiqueta: form.event || form.trigger_type });

  const cambiarDisparador = (v: string) => {
    if (v.startsWith('event:')) onChange({ ...setTrigger(form, 'event'), event: v.slice('event:'.length) });
    else onChange(setTrigger(form, v));
  };

  return (
    <div className="space-y-3">
      <div className={cn('grid gap-2', scope === 'pipeline_stage' ? 'sm:grid-cols-3' : scope === 'pipeline' ? 'sm:grid-cols-2' : 'grid-cols-1')}>
        <SelectCrm id="rule-trigger" aria-label={t('cuando.disparador')} valor={actual} onValorChange={cambiarDisparador} opciones={opciones} />
        {scope !== 'none' && (
          <SelectCrm
            aria-label={t('cuando.pipeline')}
            valor={form.pipeline_id}
            disabled={lookups.loading}
            onValorChange={(v) => onChange(setTrigger(form, form.trigger_type, { pipeline_id: v }))}
            opcionVacia={t('cuando.cualquierPipeline')}
            opciones={lookups.pipelines.map((p) => ({ valor: p.id, etiqueta: t('cuando.pipelineValor', { nombre: p.name }) }))}
          />
        )}
        {scope === 'pipeline_stage' && (
          <SelectCrm
            aria-label={t('cuando.etapa')}
            valor={form.stage_id}
            disabled={lookups.loading}
            onValorChange={(v) => onChange(setTrigger(form, form.trigger_type, { stage_id: v }))}
            opcionVacia={t('cuando.cualquierEtapa')}
            opciones={etapas.map((s) => ({ valor: s.id, etiqueta: t('cuando.etapaValor', { nombre: s.name }) }))}
          />
        )}
      </div>
      {muted && (
        <p role="alert" className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-xs text-warning-text">
          {t('cuando.eventoMudo', { evento: muted })}
        </p>
      )}
      {(ignorado.pipeline || ignorado.stage) && (
        <p role="status" className="rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-xs text-warning-text">
          {t('cuando.ambitoIgnorado')}
        </p>
      )}
    </div>
  );
}

// ─── 2 · Si se cumple ───────────────────────────────────────────────────────

const SIN_VALOR = new Set<string>(['is_null', 'is_not_null']);
const CAMPOS_SI_NO = new Set<string>([
  'customer.has_email', 'customer.has_phone', 'consent.email', 'consent.whatsapp', 'consent.sms', 'consent.voice', 'stage.is_won', 'stage.is_lost',
]);
const CAMPOS_ETAPA = new Set<string>(['opportunity.stage_id', 'stage.id']);
const CAMPOS_PIPELINE = new Set<string>(['opportunity.pipeline_id', 'pipeline.id']);

function ValorCondicion({ index, regla, lookups, onValor }: { index: number; regla: ConditionRule; lookups: RuleLookups; onValor: (texto: string) => void }) {
  const t = useTranslations('crm.automatizaciones.constructor.condiciones');
  const operador = String(regla.operator);
  const etiqueta = t('valorDe', { n: index + 1 });
  if (SIN_VALOR.has(operador)) return <p className="flex h-10 items-center text-[13px] text-fg-muted">{t('sinValor')}</p>;
  const igualdad = operador === 'eq' || operador === 'ne';
  if (igualdad && CAMPOS_SI_NO.has(regla.field)) {
    return (
      <SelectCrm aria-label={etiqueta} valor={regla.value === false ? 'false' : 'true'} onValorChange={onValor}
        opciones={[{ valor: 'true', etiqueta: t('opcionSi') }, { valor: 'false', etiqueta: t('opcionNo') }]} />
    );
  }
  if (igualdad && (CAMPOS_ETAPA.has(regla.field) || CAMPOS_PIPELINE.has(regla.field))) {
    const lista = CAMPOS_ETAPA.has(regla.field) ? lookups.stages : lookups.pipelines;
    return (
      <SelectCrm aria-label={etiqueta} valor={typeof regla.value === 'string' ? regla.value : ''} onValorChange={onValor}
        placeholder={t('elegir')} opciones={lista.map((x) => ({ valor: x.id, etiqueta: x.name }))} />
    );
  }
  return (
    <Input
      id={`cond-${index}-value`}
      aria-label={etiqueta}
      className="h-10 rounded-lg border-line-strong"
      value={conditionValueToText(regla.value)}
      placeholder={operador === 'in' || operador === 'not_in' ? t('lista') : operador === 'within_days' ? t('dias') : t('valor')}
      onChange={(e) => onValor(e.target.value)}
    />
  );
}

export function BloqueCondiciones({ form, lookups, onChange }: BloqueProps) {
  const t = useTranslations('crm.automatizaciones.constructor.condiciones');
  const reglas = form.conditions.rules;
  const [enfocar, setEnfocar] = useState<number | 'agregar' | null>(null);

  useEffect(() => {
    if (enfocar === null) return;
    document.getElementById(enfocar === 'agregar' ? 'cond-add' : `cond-${enfocar}-field`)?.focus();
    setEnfocar(null);
  }, [enfocar]);

  const unir = form.conditions.op === 'or' ? t('o') : t('y');
  const camposOpciones = (actual: string): OpcionSelectCrm[] => [
    ...(CONDITION_FIELDS.includes(actual) ? [] : [{ valor: actual, etiqueta: actual }]),
    ...CONDITION_FIELDS.map((f) => ({ valor: f, etiqueta: fieldLabel(f) })),
  ];
  const operadores: OpcionSelectCrm[] = OPERATORS.map((op) => ({ valor: op, etiqueta: operatorLabel(op) }));

  return (
    <div className="space-y-3">
      {reglas.length === 0 && <p className="text-[13px] text-fg-secondary">{t('ninguna')}</p>}
      <ol className="space-y-3">
        {reglas.map((nodo, i) => (
          <li key={i} className="grid grid-cols-[32px_minmax(0,1fr)_40px] items-start gap-2 sm:grid-cols-[40px_minmax(0,1fr)_40px]">
            <span className="flex h-10 items-center text-[13px] text-fg-secondary">{i === 0 ? t('si') : unir}</span>
            {isGroup(nodo) ? (
              <p className="flex min-h-10 items-center rounded-lg border border-dashed border-line-strong px-3 py-2 text-[13px] text-fg-secondary">
                {t('grupo', { texto: describeConditions(nodo, lookups.humanizer) ?? '' })}
              </p>
            ) : (
              <div className="grid min-w-0 gap-2 sm:grid-cols-3">
                <SelectCrm id={`cond-${i}-field`} aria-label={t('campoDe', { n: i + 1 })} valor={(nodo as ConditionRule).field}
                  onValorChange={(v) => onChange(updateCondition(form, i, { field: v }))} opciones={camposOpciones((nodo as ConditionRule).field)} />
                <SelectCrm aria-label={t('operadorDe', { n: i + 1 })} valor={String((nodo as ConditionRule).operator)}
                  onValorChange={(v) => onChange(updateCondition(form, i, { operator: v as ConditionOperator }))} opciones={operadores} />
                <ValorCondicion index={i} regla={nodo as ConditionRule} lookups={lookups} onValor={(v) => onChange(updateCondition(form, i, { value: v }))} />
              </div>
            )}
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label={t('quitar', { n: i + 1 })}
              onClick={() => {
                onChange(removeCondition(form, i));
                setEnfocar('agregar');
              }}
            >
              <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <button
          id="cond-add"
          type="button"
          className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-fg' })}
          onClick={() => {
            onChange(addCondition(form));
            setEnfocar(reglas.length);
          }}
        >
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('agregar')}
        </button>
        <button
          type="button"
          aria-pressed={form.conditions.op === 'or'}
          className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: cn('text-fg', form.conditions.op === 'or' && 'bg-brand-tint text-brand-deep') })}
          onClick={() => onChange(setConditionsOp(form, form.conditions.op === 'or' ? 'and' : 'or'))}
        >
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {form.conditions.op === 'or' ? t('grupoY') : t('grupoO')}
        </button>
      </div>
    </div>
  );
}

// ─── 3 · Entonces ───────────────────────────────────────────────────────────

interface BloqueAccionesProps extends BloqueProps {
  errors: FormError[];
}

/** Segunda línea de la tarjeta de acción («Para el responsable · vence en 1 día»). */
function useDetalleAccion() {
  const t = useTranslations('crm.automatizaciones.constructor.acciones.detalle');
  return (action: { type: string; [k: string]: unknown }): string => {
    switch (action.type) {
      case 'create_task':
        return action.due_in_days ? t('tareaVence', { dias: Number(action.due_in_days) }) : t('tarea');
      case 'send_email':
        return t('correo');
      case 'send_whatsapp':
        return t('whatsapp');
      case 'notify_user':
        return t('aviso');
      case 'enroll_sequence':
      case 'unenroll_sequence':
        return t('secuencia');
      case 'move_stage':
        return t('etapa');
      case 'update_field':
        return t('campo');
      default:
        return actionEntry(action.type)?.implemented === false ? t('noDisponible') : '';
    }
  };
}

export function BloqueAcciones({ form, lookups, errors, onChange }: BloqueAccionesProps) {
  const t = useTranslations('crm.automatizaciones.constructor.acciones');
  const detalle = useDetalleAccion();
  const [abierta, setAbierta] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const recienAgregada = useRef(false);
  const acciones = form.actions;
  // Clave estable por posición original para la lista ordenable.
  const items = acciones.map((a, i) => ({ a, i }));

  const agregar = (tipo: string) => {
    const index = acciones.length;
    onChange(addAction(form, tipo));
    setAbierta(index);
    recienAgregada.current = true;
    setMenu(false);
  };

  const conError = (i: number) => errors.some((e) => e.field.startsWith(`actions.${i}.`));

  return (
    <div className="space-y-3">
      {acciones.length === 0 && <p className="text-[13px] text-fg-secondary">{t('ninguna')}</p>}
      <ListaOrdenable
        items={items}
        clave={(x) => `${x.i}-${x.a.type}`}
        onOrdenar={(desde, hasta) => {
          onChange({ ...form, actions: reordenar(acciones, desde, hasta) });
          setAbierta(null);
        }}
        className="space-y-3"
      >
        {({ a, i }, _indice, asa) => {
          const Icono = iconoAccion(a.type);
          const entrada = actionEntry(a.type);
          const aviso = conError(i) || (entrada && !entrada.implemented);
          const sub = detalle(a);
          return (
            <div className={cn('rounded-xl border bg-surface', aviso ? 'border-line-warning' : 'border-line')}>
              <div className="flex items-center gap-3 px-3 py-3">
                <button
                  type="button"
                  {...asa.propsAsa}
                  aria-label={t('mover', { n: i + 1 })}
                  className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <GripVertical aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  id={`action-chip-${i}`}
                  aria-expanded={abierta === i}
                  aria-controls={`action-editor-${i}`}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  onClick={() => setAbierta(abierta === i ? null : i)}
                >
                  <Icono aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium text-fg">{describeAction(a, lookups.humanizer)}</span>
                    {sub && <span className="block text-xs text-fg-secondary">{sub}</span>}
                  </span>
                  {aviso && <AlertTriangle aria-label={t('revisar')} className="size-4 shrink-0 text-warning-text" strokeWidth={1.5} />}
                </button>
                <button
                  type="button"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-danger-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label={t('quitar', { n: i + 1 })}
                  onClick={() => {
                    onChange(removeAction(form, i));
                    setAbierta(null);
                  }}
                >
                  <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                </button>
              </div>
              {abierta === i && (
                <div id={`action-editor-${i}`} className="border-t border-line p-3">
                  <ActionChipEditor
                    index={i}
                    total={acciones.length}
                    action={a}
                    lookups={lookups}
                    errors={errors}
                    onPatch={(patch) => onChange(updateAction(form, i, patch))}
                    onChangeType={(tipo) => onChange(changeActionType(form, i, tipo))}
                    onMove={(dir) => {
                      const destino = dir === 'up' ? i - 1 : i + 1;
                      if (destino < 0 || destino >= acciones.length) return;
                      onChange({ ...form, actions: reordenar(acciones, i, destino) });
                      setAbierta(destino);
                    }}
                    onRemove={() => {
                      onChange(removeAction(form, i));
                      setAbierta(null);
                    }}
                  />
                </div>
              )}
            </div>
          );
        }}
      </ListaOrdenable>

      <Popover open={menu} onOpenChange={setMenu}>
        <PopoverTrigger asChild>
          <button id="action-add" type="button" aria-haspopup="listbox" className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'text-fg' })}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('agregar')}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 border-line bg-surface p-0"
          onCloseAutoFocus={(e) => {
            if (recienAgregada.current) {
              recienAgregada.current = false;
              e.preventDefault();
            }
          }}
        >
          <Command>
            <CommandInput placeholder={t('buscar')} />
            <CommandList>
              <CommandEmpty>{t('sinCoincidencias')}</CommandEmpty>
              <CommandGroup heading={t('disponibles')}>
                {ACTION_CATALOG.filter((c) => c.implemented).map((c) => (
                  <CommandItem key={c.type} value={`${c.label} ${c.type}`} onSelect={() => agregar(c.type)}>
                    <div>
                      <p className="text-sm text-fg">{c.label}</p>
                      <p className="text-xs text-fg-secondary">{c.hint}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading={t('proximamente')}>
                {ACTION_CATALOG.filter((c) => !c.implemented).map((c) => (
                  <CommandItem key={c.type} value={`${c.label} ${c.type}`} onSelect={() => agregar(c.type)}>
                    <AlertTriangle aria-hidden="true" className="mr-2 size-3.5 text-warning-text" />
                    <span className="text-sm text-fg">{c.label}</span>
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

export const ICONOS_BLOQUE = { cuando: Zap, si: Filter, entonces: Play } as const;
