/**
 * Rediseño UX de Secuencias (brief 6.3) — lógica pura de la línea de tiempo.
 *
 * Escritas ANTES de implementar `sequenceTimeline.ts`. Cubren:
 *  - resumen de un paso (canal, espera, contenido);
 *  - cálculo de la línea de tiempo (día acumulado, bifurcación);
 *  - reordenación por teclado (mover arriba/abajo) e inserción entre dos.
 */

import {
  buildTimeline,
  describeDelay,
  insertStepAt,
  moveStep,
  removeStepAt,
  renumberSteps,
  summarizeStep,
  totalDurationLabel,
  type TimelineStepInput,
} from '../sequenceTimeline';

const step = (partial: Partial<TimelineStepInput> & { channel: string }): TimelineStepInput => ({
  step_number: 1,
  delay_days: 0,
  delay_hours: 0,
  action_config: {},
  ...partial,
});

describe('describeDelay', () => {
  it('sin espera es «Inmediato»', () => {
    expect(describeDelay(step({ channel: 'email' }))).toBe('Inmediato');
  });

  it('días en singular y plural', () => {
    expect(describeDelay(step({ channel: 'email', delay_days: 1 }))).toBe('1 día después');
    expect(describeDelay(step({ channel: 'email', delay_days: 2 }))).toBe('2 días después');
  });

  it('solo horas', () => {
    expect(describeDelay(step({ channel: 'email', delay_hours: 3 }))).toBe('3 horas después');
    expect(describeDelay(step({ channel: 'email', delay_hours: 1 }))).toBe('1 hora después');
  });

  it('días y horas combinados', () => {
    expect(describeDelay(step({ channel: 'email', delay_days: 1, delay_hours: 2 }))).toBe('1 día y 2 h después');
  });

  it('tolera delay_hours nulo (viene así de la BD en filas antiguas)', () => {
    expect(describeDelay(step({ channel: 'email', delay_days: 3, delay_hours: null }))).toBe('3 días después');
  });
});

describe('summarizeStep', () => {
  it('email: asunto primero', () => {
    expect(summarizeStep(step({ channel: 'email', action_config: { subject: 'Hola de nuevo' } }))).toBe('Hola de nuevo');
  });

  it('email sin asunto pero con plantilla: nombre de la plantilla', () => {
    expect(summarizeStep(step({ channel: 'email', template_id: 't1' }), 'Bienvenida')).toBe('Plantilla: Bienvenida');
  });

  it('email sin nada: aviso de contenido pendiente', () => {
    expect(summarizeStep(step({ channel: 'email' }))).toBe('Sin contenido todavía');
  });

  it('tarea y llamada usan el título', () => {
    expect(summarizeStep(step({ channel: 'task', action_config: { title: 'Revisar propuesta' } }))).toBe('Revisar propuesta');
    expect(summarizeStep(step({ channel: 'call', action_config: { title: 'Llamar al cliente' } }))).toBe('Llamar al cliente');
  });

  it('espera: describe cuánto se espera', () => {
    expect(summarizeStep(step({ channel: 'wait', delay_days: 2 }))).toBe('Espera 2 días');
    expect(summarizeStep(step({ channel: 'wait' }))).toBe('Espera sin duración');
  });

  it('condición: cuenta las reglas y avisa si no hay', () => {
    expect(summarizeStep(step({ channel: 'condition', condition: { op: 'and', rules: [] } }))).toBe('Sin reglas: no se puede guardar');
    expect(summarizeStep(step({
      channel: 'condition',
      condition: { op: 'and', rules: [{ field: 'opportunity.amount', operator: 'gte', value: 100 }] },
    }))).toBe('1 regla');
    expect(summarizeStep(step({
      channel: 'condition',
      condition: { op: 'or', rules: [{ field: 'a', operator: 'eq', value: 1 }, { field: 'b', operator: 'eq', value: 2 }] },
    }))).toBe('2 reglas (alguna)');
  });

  it('sms avisa que no hay proveedor', () => {
    expect(summarizeStep(step({ channel: 'sms' }))).toBe('Sin proveedor de SMS: fallará');
  });
});

describe('buildTimeline', () => {
  const steps = [
    step({ channel: 'email', delay_days: 0 }),
    step({ channel: 'condition', delay_days: 1, condition: { op: 'and', rules: [{ field: 'a', operator: 'eq', value: 1 }] } }),
    step({ channel: 'whatsapp', delay_days: 2, delay_hours: 12 }),
  ];

  it('acumula el día de cada paso desde la inscripción', () => {
    const tl = buildTimeline(steps);
    expect(tl.map((e) => e.dayOffset)).toEqual([0, 1, 3.5]);
    expect(tl.map((e) => e.dayLabel)).toEqual(['Día 0', 'Día 1', 'Día 3']);
  });

  it('marca los pasos de condición como bifurcación', () => {
    const tl = buildTimeline(steps);
    expect(tl.map((e) => e.isBranch)).toEqual([false, true, false]);
  });

  it('lista vacía → línea vacía', () => {
    expect(buildTimeline([])).toEqual([]);
  });

  it('conserva el índice y la espera legible', () => {
    const tl = buildTimeline(steps);
    expect(tl[2].index).toBe(2);
    expect(tl[2].delayLabel).toBe('2 días y 12 h después');
  });
});

describe('totalDurationLabel', () => {
  it('sin pasos', () => {
    expect(totalDurationLabel([])).toBe('Sin pasos');
  });
  it('todo el mismo día', () => {
    expect(totalDurationLabel([step({ channel: 'email' })])).toBe('Todo el mismo día');
  });
  it('suma los días', () => {
    expect(totalDurationLabel([step({ channel: 'email' }), step({ channel: 'task', delay_days: 3 })])).toBe('Dura 3 días');
    expect(totalDurationLabel([step({ channel: 'email', delay_days: 1 })])).toBe('Dura 1 día');
  });
});

describe('reordenación por teclado', () => {
  const a = step({ channel: 'email', step_number: 1 });
  const b = step({ channel: 'task', step_number: 2 });
  const c = step({ channel: 'whatsapp', step_number: 3 });

  it('mover abajo intercambia con el siguiente y renumera', () => {
    const out = moveStep([a, b, c], 0, 1);
    expect(out.map((s) => s.channel)).toEqual(['task', 'email', 'whatsapp']);
    expect(out.map((s) => s.step_number)).toEqual([1, 2, 3]);
  });

  it('mover arriba intercambia con el anterior', () => {
    expect(moveStep([a, b, c], 2, 1).map((s) => s.channel)).toEqual(['email', 'whatsapp', 'task']);
  });

  it('fuera de rango: devuelve la misma lista sin cambios', () => {
    const input = [a, b, c];
    expect(moveStep(input, 0, -1)).toBe(input);
    expect(moveStep(input, 2, 3)).toBe(input);
    expect(moveStep(input, 1, 1)).toBe(input);
  });

  it('no muta la lista original', () => {
    const input = [a, b, c];
    moveStep(input, 0, 2);
    expect(input.map((s) => s.channel)).toEqual(['email', 'task', 'whatsapp']);
    expect(input[0].step_number).toBe(1);
  });

  it('insertar entre dos renumera todo', () => {
    const out = insertStepAt([a, c], 1, b);
    expect(out.map((s) => s.channel)).toEqual(['email', 'task', 'whatsapp']);
    expect(out.map((s) => s.step_number)).toEqual([1, 2, 3]);
  });

  it('insertar al final y al principio', () => {
    expect(insertStepAt([a], 1, b).map((s) => s.channel)).toEqual(['email', 'task']);
    expect(insertStepAt([a], 0, b).map((s) => s.channel)).toEqual(['task', 'email']);
  });

  it('eliminar renumera', () => {
    const out = removeStepAt([a, b, c], 1);
    expect(out.map((s) => s.channel)).toEqual(['email', 'whatsapp']);
    expect(out.map((s) => s.step_number)).toEqual([1, 2]);
  });

  it('renumberSteps asigna 1..n en orden', () => {
    expect(renumberSteps([c, a]).map((s) => s.step_number)).toEqual([1, 2]);
  });
});
