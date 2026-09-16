/**
 * Transformaciones puras del editor de reglas (brief 6.2): el componente solo
 * pinta; toda mutación del estado pasa por aquí. Escritas antes que el código.
 */
// `emailService` real arrastra Resend y svix (ESM): se dobla igual que en f8Adversarial.
jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));

import {
  EMPTY_FORM,
  EXAMPLE_FORM,
  ruleToForm,
  formToPayload,
  validateForm,
  addAction,
  removeAction,
  updateAction,
  changeActionType,
  moveAction,
  addCondition,
  removeCondition,
  updateCondition,
  setConditionsOp,
  setConditionsFromJson,
  setTrigger,
  triggerScope,
  ignoredScope,
  filterRules,
  countActiveFilters,
  upsertRule,
  withoutRule,
  mutedEvent,
  primaryLabel,
  previewNotes,
  type RuleFormState,
} from '../ruleEditorModel';
import { TRIGGER_OPTIONS } from '../ruleCatalog';
import { matchesTriggerConfig, validateRuleInput } from '@/lib/services/crm/automationService';

const baseRule = {
  id: 'r1',
  name: 'Seguimiento propuesta',
  description: null,
  trigger_type: 'stage_change',
  event: 'opportunity.stage_changed',
  pipeline_id: 'p1',
  stage_id: 's1',
  is_active: true,
  priority: 50,
  run_once_per_opportunity: false,
  cooldown_hours: 12,
  actions: [{ type: 'send_email', subject: 'Hola' }],
  conditions: { op: 'or', rules: [{ field: 'opportunity.amount', operator: 'gte', value: 10 }] },
  last_run_at: null,
  runs_count: 0,
  updated_at: '2026-09-14T00:00:00Z',
};

describe('ruleToForm / formToPayload', () => {
  it('sin regla → formulario vacío con valores seguros (inactiva por defecto)', () => {
    const form = ruleToForm(null);
    expect(form).toEqual(EMPTY_FORM);
    expect(form.is_active).toBe(false);
    expect(form.actions).toEqual([]);
    expect(form.conditions).toEqual({ op: 'and', rules: [] });
  });

  it('regla existente → formulario con todos sus campos', () => {
    const form = ruleToForm(baseRule);
    expect(form.name).toBe('Seguimiento propuesta');
    expect(form.pipeline_id).toBe('p1');
    expect(form.stage_id).toBe('s1');
    expect(form.cooldown_hours).toBe(12);
    expect(form.run_once_per_opportunity).toBe(false);
    expect(form.conditions).toEqual({ op: 'or', rules: [{ field: 'opportunity.amount', operator: 'gte', value: 10 }] });
  });

  it('condiciones en formatos viejos (arreglo, regla suelta, null) se normalizan', () => {
    expect(ruleToForm({ ...baseRule, conditions: null }).conditions).toEqual({ op: 'and', rules: [] });
    expect(ruleToForm({ ...baseRule, conditions: [{ field: 'customer.has_email', operator: 'eq', value: true }] }).conditions)
      .toEqual({ op: 'and', rules: [{ field: 'customer.has_email', operator: 'eq', value: true }] });
    expect(ruleToForm({ ...baseRule, conditions: { field: 'customer.has_email', operator: 'eq', value: true } }).conditions)
      .toEqual({ op: 'and', rules: [{ field: 'customer.has_email', operator: 'eq', value: true }] });
  });

  it('el payload conserva el id al editar, recorta el nombre y vacía a null', () => {
    const form: RuleFormState = { ...ruleToForm(baseRule), name: '  Hola  ', description: '  ', pipeline_id: '', stage_id: '' };
    const payload = formToPayload(form, 'r1');
    expect(payload.id).toBe('r1');
    expect(payload.name).toBe('Hola');
    expect(payload.description).toBeNull();
    expect(payload.pipeline_id).toBeNull();
    expect(payload.stage_id).toBeNull();
    expect(formToPayload(form).id).toBeUndefined();
  });

  it('el payload pasa la validación del servidor (mismo contrato)', () => {
    const payload = formToPayload(ruleToForm(baseRule));
    expect(validateRuleInput(payload as never)).toEqual([]);
    expect(validateRuleInput(formToPayload(EXAMPLE_FORM) as never)).toEqual([]);
  });

  it('el evento viaja siempre: el del usuario con "event", el del motor en los demás (R2, ver ruleEventContract.test)', () => {
    const form = { ...ruleToForm(baseRule), trigger_type: 'stage_change', event: 'lo_que_sea' };
    expect(formToPayload(form).event).toBe('opportunity.stage_changed');
    const ev = { ...form, trigger_type: 'event', event: ' opportunity.created ' };
    expect(formToPayload(ev).event).toBe('opportunity.created');
    expect(formToPayload({ ...ev, event: '' }).event).toBeNull();
  });
});

describe('formToPayload — contrato exacto con el servidor (ronda 2: pruebas que muerden)', () => {
  it('regla existente → payload con las 12 claves exactas, ni una más ni una menos', () => {
    expect(formToPayload(ruleToForm(baseRule))).toEqual({
      name: 'Seguimiento propuesta',
      description: null,
      trigger_type: 'stage_change',
      event: 'opportunity.stage_changed',
      pipeline_id: 'p1',
      stage_id: 's1',
      priority: 50,
      run_once_per_opportunity: false,
      cooldown_hours: 12,
      is_active: true,
      actions: [{ type: 'send_email', subject: 'Hola' }],
      conditions: { op: 'or', rules: [{ field: 'opportunity.amount', operator: 'gte', value: 10 }] },
    });
  });

  it('cada campo viaja tal cual, en los dos sentidos (mata valores fijos o invertidos)', () => {
    const base = ruleToForm(baseRule);
    const a = formToPayload({ ...base, description: '  Para qué sirve  ', is_active: false, run_once_per_opportunity: true, cooldown_hours: 0, priority: 7 });
    expect(a).toMatchObject({ description: 'Para qué sirve', is_active: false, run_once_per_opportunity: true, cooldown_hours: 0, priority: 7 });
    const b = formToPayload({ ...base, description: '', is_active: true, run_once_per_opportunity: false, cooldown_hours: 48, priority: 0 });
    expect(b).toMatchObject({ description: null, is_active: true, run_once_per_opportunity: false, cooldown_hours: 48, priority: 0 });
  });

  it('prioridad y enfriamiento se truncan a entero; NaN cae al valor por defecto', () => {
    const base = ruleToForm(baseRule);
    expect(formToPayload({ ...base, priority: 50.9, cooldown_hours: 12.7 })).toMatchObject({ priority: 50, cooldown_hours: 12 });
    expect(formToPayload({ ...base, priority: Number.NaN, cooldown_hours: Number.NaN })).toMatchObject({ priority: 100, cooldown_hours: 0 });
  });

  it('acciones y condiciones viajan completas (nunca vacías «por defecto»)', () => {
    const form = addAction(addAction(ruleToForm(baseRule), 'create_task'), 'notify_user');
    const payload = formToPayload(form);
    expect(payload.actions.map((x) => x.type)).toEqual(['send_email', 'create_task', 'notify_user']);
    expect(payload.actions).toBe(form.actions);
    expect(payload.conditions).toBe(form.conditions);
    expect(payload.conditions.rules).toHaveLength(1);
  });

  it('ruleToForm clona las acciones: editar el formulario no toca la regla de la lista', () => {
    const form = ruleToForm(baseRule);
    expect(form.actions).toEqual(baseRule.actions);
    expect(form.actions).not.toBe(baseRule.actions);
    expect(form.actions[0]).not.toBe(baseRule.actions[0]);
    const edited = updateAction(form, 0, { subject: 'Cambiado' });
    expect(edited.actions[0].subject).toBe('Cambiado');
    expect(baseRule.actions[0].subject).toBe('Hola');
  });

  it('R3 · grupos anidados: sobreviven a ruleToForm, formToPayload y a editar/añadir/quitar otras condiciones', () => {
    const group = { op: 'or', rules: [
      { field: 'customer.has_email', operator: 'eq', value: true },
      { field: 'customer.has_phone', operator: 'eq', value: true },
    ] };
    const nested = { op: 'and', rules: [{ field: 'opportunity.amount', operator: 'gte', value: 10 }, group] };
    const form = ruleToForm({ ...baseRule, conditions: nested });
    expect(form.conditions).toEqual(nested);
    expect(formToPayload(form).conditions).toEqual(nested);

    const edited = updateCondition(addCondition(form), 0, { value: '20' });
    expect(edited.conditions.rules).toHaveLength(3);
    expect(edited.conditions.rules[0]).toEqual({ field: 'opportunity.amount', operator: 'gte', value: 20 });
    expect(edited.conditions.rules[1]).toEqual(group);
    expect(removeCondition(edited, 0).conditions.rules[0]).toEqual(group);
    expect(setConditionsOp(edited, 'or').conditions.rules[1]).toEqual(group);
    expect(validateRuleInput(formToPayload(edited) as never)).toEqual([]);
  });
});

describe('validateForm — errores junto al campo, el primero recibe el foco', () => {
  it('move_stage sin etapa destino es error; con etapa, no', () => {
    const errors = validateForm({ ...EMPTY_FORM, name: 'ok', actions: [{ type: 'move_stage' }] });
    expect(errors).toEqual([{ field: 'actions.0.stage_id', message: expect.stringMatching(/etapa/i) }]);
    expect(validateForm({ ...EMPTY_FORM, name: 'ok', actions: [{ type: 'move_stage', stage_id: 's2' }] })).toEqual([]);
  });

  it('nombre corto', () => {
    const errors = validateForm({ ...EMPTY_FORM, name: 'a' });
    expect(errors[0]).toEqual({ field: 'name', message: expect.stringMatching(/2 caracteres/) });
  });

  it('secuencia sin elegir y update_field sin campo', () => {
    const form: RuleFormState = {
      ...EMPTY_FORM,
      name: 'ok',
      actions: [
        { type: 'enroll_sequence' },
        { type: 'update_field', entity: 'opportunities', field_name: '' },
      ],
    };
    const errors = validateForm(form);
    expect(errors.map((e) => e.field)).toEqual(['actions.0.sequence_id', 'actions.1.field_name']);
  });

  it('prioridad y enfriamiento fuera de rango', () => {
    const errors = validateForm({ ...EMPTY_FORM, name: 'ok', priority: 99999, cooldown_hours: -1 });
    expect(errors.map((e) => e.field)).toEqual(['priority', 'cooldown_hours']);
  });

  it('un formulario válido no tiene errores', () => {
    expect(validateForm(EXAMPLE_FORM)).toEqual([]);
  });
});

describe('acciones como fichas: añadir, quitar, cambiar de tipo, reordenar', () => {
  it('addAction añade al final con los valores por defecto del catálogo', () => {
    const f1 = addAction(EMPTY_FORM, 'create_task');
    expect(f1.actions).toEqual([{ type: 'create_task', title: '' }]);
    const f2 = addAction(f1, 'enroll_sequence');
    expect(f2.actions).toHaveLength(2);
    expect(f2.actions[1]).toEqual({ type: 'enroll_sequence' });
  });

  it('las mutaciones no tocan el estado anterior', () => {
    const f1 = addAction(EMPTY_FORM, 'create_task');
    const f2 = updateAction(f1, 0, { title: 'Llamar' });
    expect(f1.actions[0]).toEqual({ type: 'create_task', title: '' });
    expect(f2.actions[0]).toEqual({ type: 'create_task', title: 'Llamar' });
  });

  it('changeActionType descarta los campos del tipo anterior', () => {
    const f1 = updateAction(addAction(EMPTY_FORM, 'create_task'), 0, { title: 'Llamar', due_in_days: 3 });
    const f2 = changeActionType(f1, 0, 'send_email');
    expect(f2.actions[0]).toEqual({ type: 'send_email' });
  });

  it('removeAction y moveAction respetan los límites', () => {
    const f = addAction(addAction(addAction(EMPTY_FORM, 'send_email'), 'create_task'), 'notify_user');
    expect(removeAction(f, 1).actions.map((a) => a.type)).toEqual(['send_email', 'notify_user']);
    expect(moveAction(f, 0, 'up').actions.map((a) => a.type)).toEqual(['send_email', 'create_task', 'notify_user']);
    expect(moveAction(f, 0, 'down').actions.map((a) => a.type)).toEqual(['create_task', 'send_email', 'notify_user']);
    expect(moveAction(f, 2, 'down').actions.map((a) => a.type)).toEqual(['send_email', 'create_task', 'notify_user']);
  });
});

describe('condiciones como fichas', () => {
  it('addCondition añade una regla por defecto; removeCondition la quita', () => {
    const f1 = addCondition(EMPTY_FORM);
    expect(f1.conditions.rules).toEqual([{ field: 'opportunity.amount', operator: 'gte', value: 0 }]);
    expect(removeCondition(f1, 0).conditions.rules).toEqual([]);
  });

  it('updateCondition convierte el valor según el operador', () => {
    const f1 = addCondition(EMPTY_FORM);
    expect(updateCondition(f1, 0, { operator: 'in', value: 'a, 2, true' }).conditions.rules[0])
      .toEqual({ field: 'opportunity.amount', operator: 'in', value: ['a', 2, 'true'] });
    expect(updateCondition(f1, 0, { operator: 'is_null', value: 'x' }).conditions.rules[0])
      .toEqual({ field: 'opportunity.amount', operator: 'is_null' });
    const valueOf = (text: string) => (updateCondition(f1, 0, { value: text }).conditions.rules[0] as { value?: unknown }).value;
    expect(valueOf('true')).toBe(true);
    expect(valueOf('12.5')).toBe(12.5);
    expect(valueOf('hot')).toBe('hot');
  });

  it('setConditionsOp cambia todas/alguna', () => {
    expect(setConditionsOp(EMPTY_FORM, 'or').conditions.op).toBe('or');
    expect(setConditionsOp(EMPTY_FORM, 'lo_que_sea' as never).conditions.op).toBe('and');
  });

  it('setConditionsFromJson: válido aplica, inválido devuelve error y no toca el estado', () => {
    const ok = setConditionsFromJson(EMPTY_FORM, '{"op":"or","rules":[{"field":"customer.has_email","operator":"eq","value":true}]}');
    expect(ok.error).toBeNull();
    expect(ok.form.conditions.op).toBe('or');
    const bad = setConditionsFromJson(EMPTY_FORM, '{no es json');
    expect(bad.error).toMatch(/JSON/);
    expect(bad.form).toBe(EMPTY_FORM);
    const badField = setConditionsFromJson(EMPTY_FORM, '{"op":"and","rules":[{"field":"secret.x","operator":"eq","value":1}]}');
    expect(badField.error).toBeTruthy();
    expect(badField.form).toBe(EMPTY_FORM);
    expect(setConditionsFromJson(EMPTY_FORM, '   ').form.conditions).toEqual({ op: 'and', rules: [] });
  });
});

describe('setTrigger — cambiar el disparador NUNCA borra pipeline/etapa en silencio (R1)', () => {
  it('pasar de stage_change a manual (y volver) conserva pipeline y etapa', () => {
    const f = { ...ruleToForm(baseRule) };
    const manual = setTrigger(f, 'manual');
    expect(manual.trigger_type).toBe('manual');
    expect(manual.pipeline_id).toBe('p1');
    expect(manual.stage_id).toBe('s1');
    const back = setTrigger(manual, 'stage_change');
    expect(back).toEqual({ ...f, trigger_type: 'stage_change' });
    // Y el payload de una regla schedule/manual editada sigue llevando su ámbito.
    expect(formToPayload(setTrigger(f, 'schedule'))).toMatchObject({ pipeline_id: 'p1', stage_id: 's1' });
  });

  it('ignoredScope dice qué ámbito guardado ignora el motor, espejo de matchesTriggerConfig', () => {
    const f = ruleToForm(baseRule); // p1 · s1
    expect(ignoredScope(f)).toEqual({ pipeline: false, stage: false });
    expect(ignoredScope(setTrigger(f, 'event'))).toEqual({ pipeline: false, stage: true });
    expect(ignoredScope(setTrigger(f, 'field_change'))).toEqual({ pipeline: true, stage: true });
    expect(ignoredScope(setTrigger(f, 'schedule'))).toEqual({ pipeline: true, stage: true });
    expect(ignoredScope(setTrigger(f, 'manual'))).toEqual({ pipeline: true, stage: true });
    expect(ignoredScope({ ...setTrigger(f, 'manual'), pipeline_id: '', stage_id: '' })).toEqual({ pipeline: false, stage: false });
    expect(triggerScope('stage_change')).toBe('pipeline_stage');
    expect(triggerScope('event')).toBe('pipeline');
    expect(triggerScope('desconocido')).toBe('none');
  });

  it('el catálogo de ámbitos coincide con lo que el motor compara de verdad', () => {
    const rule = { trigger_config: {}, pipeline_id: 'p1', stage_id: 's1' };
    const otherPipeline = { pipeline_id: 'p2', to_stage_id: 's1', stage_id: 's1' };
    const otherStage = { pipeline_id: 'p1', to_stage_id: 's2', stage_id: 's2' };
    for (const t of TRIGGER_OPTIONS) {
      const usesPipeline = !matchesTriggerConfig(rule, t.value as never, otherPipeline);
      const usesStage = !matchesTriggerConfig(rule, t.value as never, otherStage);
      const expected = usesStage ? 'pipeline_stage' : usesPipeline ? 'pipeline' : 'none';
      expect({ trigger: t.value, scope: t.scope }).toEqual({ trigger: t.value, scope: expected });
    }
  });

  it('cambiar de pipeline limpia la etapa (pertenece a otro pipeline)', () => {
    const f = { ...ruleToForm(baseRule) };
    expect(setTrigger(f, 'stage_change', { pipeline_id: 'p2' }).stage_id).toBe('');
    expect(setTrigger(f, 'stage_change', { pipeline_id: 'p1' }).stage_id).toBe('s1');
  });
});

describe('filterRules — búsqueda y chips de filtro de la lista', () => {
  const rules = [
    { ...baseRule, id: 'a', name: 'Seguimiento propuesta', is_active: true, trigger_type: 'stage_change' },
    { ...baseRule, id: 'b', name: 'Aviso lead frío', is_active: false, trigger_type: 'schedule' },
    { ...baseRule, id: 'c', name: 'Bienvenida', is_active: true, trigger_type: 'event' },
  ];

  it('sin filtros devuelve todo en el mismo orden', () => {
    expect(filterRules(rules, { query: '', status: 'all', triggers: [] }).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(countActiveFilters({ query: '', status: 'all', triggers: [] })).toBe(0);
  });

  it('busca por nombre sin acentos ni mayúsculas', () => {
    expect(filterRules(rules, { query: 'LEAD FRIO', status: 'all', triggers: [] }).map((r) => r.id)).toEqual(['b']);
  });

  it('estado y disparador se combinan', () => {
    expect(filterRules(rules, { query: '', status: 'active', triggers: [] }).map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterRules(rules, { query: '', status: 'inactive', triggers: [] }).map((r) => r.id)).toEqual(['b']);
    expect(filterRules(rules, { query: '', status: 'active', triggers: ['event'] }).map((r) => r.id)).toEqual(['c']);
    expect(countActiveFilters({ query: 'x', status: 'active', triggers: ['event', 'manual'] })).toBe(4);
  });
});

describe('R-2 · la lista tras una mutación cuya recarga falló (ronda 3)', () => {
  const rows = [
    { id: 'a', priority: 10, is_active: true, name: 'A' },
    { id: 'b', priority: 20, is_active: true, name: 'B' },
  ];

  it('upsertRule reemplaza la fila del PATCH en su sitio (el interruptor refleja al servidor)', () => {
    const next = upsertRule(rows, { id: 'b', priority: 20, is_active: false, name: 'B' });
    expect(next.map((r) => [r.id, r.is_active])).toEqual([['a', true], ['b', false]]);
    expect(rows[1].is_active).toBe(true); // inmutable
  });

  it('upsertRule inserta la fila del POST respetando el orden por prioridad del GET', () => {
    const next = upsertRule(rows, { id: 'c', priority: 15, is_active: true, name: 'C' });
    expect(next.map((r) => r.id)).toEqual(['a', 'c', 'b']);
  });

  it('withoutRule quita la borrada y deja las demás intactas', () => {
    expect(withoutRule(rows, 'a').map((r) => r.id)).toEqual(['b']);
    expect(withoutRule(rows, 'zzz')).toEqual(rows);
  });
});

describe('R-5 · un `event` que el motor desvía deja muda una regla de tipo `event`, también si viene cargado', () => {
  it('regla heredada con trigger `event` y event=opportunity.stage_changed → se avisa', () => {
    const form = ruleToForm({ ...baseRule, trigger_type: 'event', event: 'opportunity.stage_changed' });
    expect(mutedEvent(form)).toBe('opportunity.stage_changed');
    expect(mutedEvent({ ...form, event: '  opportunity.updated ' })).toBe('opportunity.updated');
  });

  it('un evento que sí llega (o vacío = cualquiera) no avisa; con otro disparador tampoco', () => {
    expect(mutedEvent({ trigger_type: 'event', event: 'opportunity.created' })).toBeNull();
    expect(mutedEvent({ trigger_type: 'event', event: '' })).toBeNull();
    expect(mutedEvent({ trigger_type: 'stage_change', event: 'opportunity.stage_changed' })).toBeNull();
  });
});

describe('primaryLabel · el botón principal dice lo que hace y en qué estado queda (M-C2, ronda 4)', () => {
  it.each([
    [false, true, 'Crear y activar'],
    [false, false, 'Crear desactivada'],
    [true, true, 'Guardar y activar'],
    [true, false, 'Guardar desactivada'],
  ])('editing=%s, active=%s → %s', (editing, active, label) => {
    expect(primaryLabel(editing, active)).toBe(label);
  });
});

describe('previewNotes · la vista previa no repite el estado (botón e interruptor ya lo dicen) y avisa del evento mudo', () => {
  it('sin ajustes → sin notas; una vez + enfriamiento → dos notas; nunca «se guardará»', () => {
    expect(previewNotes({ ...EMPTY_FORM, run_once_per_opportunity: false })).toEqual([]);
    const notes = previewNotes({ ...EMPTY_FORM, cooldown_hours: 6, is_active: true });
    expect(notes).toEqual(['una sola vez por oportunidad', 'con al menos 6 h entre ejecuciones']);
    expect(previewNotes({ ...EMPTY_FORM, is_active: false }).join(' ')).not.toMatch(/se guardar/);
  });

  it('con evento mudo, la primera nota dice que no se disparará', () => {
    const notes = previewNotes({ ...EMPTY_FORM, trigger_type: 'event', event: 'opportunity.updated' });
    expect(notes[0]).toMatch(/no se disparará/);
    expect(notes[0]).toContain('opportunity.updated');
  });
});
