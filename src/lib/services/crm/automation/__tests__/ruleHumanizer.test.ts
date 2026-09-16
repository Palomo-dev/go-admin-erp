/**
 * Rediseño UX de Automatizaciones (brief 6.2): la regla se muestra en
 * lenguaje humano. Estas pruebas se escribieron ANTES que la implementación.
 */
// `emailService` real arrastra Resend y svix (ESM): se dobla igual que en f8Adversarial.
jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));

import {
  describeTrigger,
  describeCondition,
  describeConditions,
  describeAction,
  describeActions,
  describeRule,
  describeSkipReason,
  describeRunStatus,
  formatRelativeTime,
  type HumanizerLookups,
} from '../ruleHumanizer';
import { ACTION_CATALOG, UPDATE_FIELD_OPTIONS, TRIGGER_OPTIONS } from '../ruleCatalog';
import { AUTOMATION_ACTION_TYPES, NOT_IMPLEMENTED_ACTIONS, UPDATE_FIELD_ALLOWLIST } from '../actions';
import { AUTOMATION_TRIGGER_TYPES } from '@/lib/services/crm/automationService';

const lookups: HumanizerLookups = {
  stageName: (id) => ({ 's1': 'Propuesta enviada', 's2': 'Negociación' }[id] ?? null),
  pipelineName: (id) => ({ 'p1': 'Ventas B2B' }[id] ?? null),
  sequenceName: (id) => ({ 'q1': 'Bienvenida' }[id] ?? null),
  templateName: (id) => ({ 't1': 'Seguimiento propuesta' }[id] ?? null),
};

describe('describeTrigger — el disparador en una frase', () => {
  it('cambio de etapa con etapa conocida', () => {
    expect(describeTrigger({ trigger_type: 'stage_change', stage_id: 's1', pipeline_id: 'p1' }, lookups))
      .toBe('Cuando una oportunidad entra en «Propuesta enviada»');
  });

  it('cambio de etapa solo con pipeline', () => {
    expect(describeTrigger({ trigger_type: 'stage_change', pipeline_id: 'p1' }, lookups))
      .toBe('Cuando una oportunidad cambia de etapa en «Ventas B2B»');
  });

  it('cambio de etapa sin filtro', () => {
    expect(describeTrigger({ trigger_type: 'stage_change' }, lookups))
      .toBe('Cuando una oportunidad cambia de etapa');
  });

  it('etapa desconocida no muestra el UUID crudo como si fuera nombre', () => {
    expect(describeTrigger({ trigger_type: 'stage_change', stage_id: 'zzz' }, lookups))
      .toBe('Cuando una oportunidad entra en una etapa (sin nombre)');
  });

  it('evento, cambio de campo, programada y manual', () => {
    // Evento conocido: en lenguaje humano; el técnico, entre paréntesis.
    expect(describeTrigger({ trigger_type: 'event', event: 'opportunity.created' }, lookups))
      .toBe('Cuando se crea una oportunidad (opportunity.created)');
    // Evento libre: tal cual.
    expect(describeTrigger({ trigger_type: 'event', event: 'factura.pagada' }, lookups))
      .toBe('Cuando ocurre el evento «factura.pagada»');
    expect(describeTrigger({ trigger_type: 'event' }, lookups)).toBe('Cuando ocurre un evento del CRM');
    // El motor acota `event` por pipeline (matchesTriggerConfig): la frase lo dice. La etapa no la mira: no se dice.
    expect(describeTrigger({ trigger_type: 'event', event: 'opportunity.created', pipeline_id: 'p1', stage_id: 's1' }, lookups))
      .toBe('Cuando se crea una oportunidad (opportunity.created) en «Ventas B2B»');
    // schedule/manual/field_change no miran pipeline ni etapa: la frase tampoco.
    expect(describeTrigger({ trigger_type: 'manual', pipeline_id: 'p1', stage_id: 's1' }, lookups)).toBe('Cuando alguien la ejecuta a mano');
    expect(describeTrigger({ trigger_type: 'field_change' }, lookups)).toBe('Cuando cambia un dato de una oportunidad');
    expect(describeTrigger({ trigger_type: 'schedule' }, lookups)).toBe('Según la programación del servidor');
    expect(describeTrigger({ trigger_type: 'manual' }, lookups)).toBe('Cuando alguien la ejecuta a mano');
  });

  it('cubre todos los disparadores del motor', () => {
    expect(TRIGGER_OPTIONS.map((t) => t.value).sort()).toEqual([...AUTOMATION_TRIGGER_TYPES].sort());
    for (const t of AUTOMATION_TRIGGER_TYPES) {
      // Nunca se muestra el identificador técnico (`stage_change`) al usuario.
      expect(describeTrigger({ trigger_type: t }, lookups)).not.toMatch(/_/);
    }
  });
});

describe('describeCondition — una condición en una frase', () => {
  it('número con separador de miles', () => {
    expect(describeCondition({ field: 'opportunity.amount', operator: 'gte', value: 5000000 }, lookups))
      .toBe('el monto de la oportunidad es al menos 5.000.000');
  });

  it('booleanos como sí/no y textos entre comillas', () => {
    expect(describeCondition({ field: 'customer.has_email', operator: 'eq', value: true }, lookups))
      .toBe('tiene email es sí');
    expect(describeCondition({ field: 'opportunity.temperature', operator: 'ne', value: 'cold' }, lookups))
      .toBe('la temperatura no es «cold»');
  });

  it('listas con "o" final y operadores sin valor', () => {
    expect(describeCondition({ field: 'customer.tags', operator: 'in', value: ['vip', 'b2b', 'nuevo'] }, lookups))
      .toBe('las etiquetas es uno de «vip», «b2b» o «nuevo»');
    expect(describeCondition({ field: 'customer.email', operator: 'is_null' }, lookups))
      .toBe('el email está vacío');
  });

  it('within_days y fechas', () => {
    expect(describeCondition({ field: 'opportunity.last_contact_at', operator: 'within_days', value: 7 }, lookups))
      .toBe('el último contacto es de los últimos 7 días');
  });

  it('los IDs de etapa y pipeline se traducen a nombre', () => {
    expect(describeCondition({ field: 'opportunity.stage_id', operator: 'eq', value: 's2' }, lookups))
      .toBe('la etapa es «Negociación»');
  });

  it('un campo fuera del catálogo se muestra tal cual, sin romper', () => {
    expect(describeCondition({ field: 'event.payload.foo', operator: 'eq', value: 1 }, lookups))
      .toBe('event.payload.foo es 1');
  });
});

describe('describeConditions — el grupo completo', () => {
  it('vacío → null (la regla no filtra)', () => {
    expect(describeConditions(null, lookups)).toBeNull();
    expect(describeConditions({ op: 'and', rules: [] }, lookups)).toBeNull();
    expect(describeConditions([], lookups)).toBeNull();
  });

  it('AND con "y", OR con "o"', () => {
    const rules = [
      { field: 'opportunity.amount', operator: 'gte', value: 100 },
      { field: 'customer.has_email', operator: 'eq', value: true },
    ];
    expect(describeConditions({ op: 'and', rules }, lookups))
      .toBe('el monto de la oportunidad es al menos 100 y tiene email es sí');
    expect(describeConditions({ op: 'or', rules }, lookups))
      .toBe('el monto de la oportunidad es al menos 100 o tiene email es sí');
  });

  it('grupos anidados van entre paréntesis', () => {
    const tree = {
      op: 'and',
      rules: [
        { field: 'customer.has_email', operator: 'eq', value: true },
        { op: 'or', rules: [
          { field: 'opportunity.temperature', operator: 'eq', value: 'hot' },
          { field: 'opportunity.amount', operator: 'gt', value: 10 },
        ] },
      ],
    };
    expect(describeConditions(tree, lookups))
      .toBe('tiene email es sí y (la temperatura es «hot» o el monto de la oportunidad es mayor que 10)');
  });

  it('un arreglo suelto se trata como AND', () => {
    expect(describeConditions([{ field: 'opportunity.amount', operator: 'lt', value: 5 }], lookups))
      .toBe('el monto de la oportunidad es menor que 5');
  });
});

describe('describeAction — cada acción en una frase', () => {
  it('email con asunto o con plantilla', () => {
    expect(describeAction({ type: 'send_email', subject: 'Hola {{first_name}}' }, lookups))
      .toBe('enviar un email con asunto «Hola {{first_name}}»');
    expect(describeAction({ type: 'send_email', template_id: 't1' }, lookups))
      .toBe('enviar un email con la plantilla «Seguimiento propuesta»');
    expect(describeAction({ type: 'send_email' }, lookups)).toBe('enviar un email');
  });

  it('tarea con vencimiento, secuencia y etapa por nombre', () => {
    expect(describeAction({ type: 'create_task', title: 'Llamar', due_in_days: 3 }, lookups))
      .toBe('crear la tarea «Llamar» que vence en 3 días');
    expect(describeAction({ type: 'create_task', title: 'Llamar', due_in_days: 1 }, lookups))
      .toBe('crear la tarea «Llamar» que vence en 1 día');
    expect(describeAction({ type: 'enroll_sequence', sequence_id: 'q1' }, lookups))
      .toBe('inscribir en la secuencia «Bienvenida»');
    expect(describeAction({ type: 'unenroll_sequence', sequence_id: 'q1' }, lookups))
      .toBe('sacar de la secuencia «Bienvenida»');
    expect(describeAction({ type: 'move_stage', stage_id: 's2' }, lookups))
      .toBe('mover la oportunidad a «Negociación»');
  });

  it('update_field, notificar, actividad y WhatsApp', () => {
    expect(describeAction({ type: 'update_field', entity: 'opportunities', field_name: 'temperature', field_value: 'hot' }, lookups))
      .toBe('cambiar «temperature» a «hot» en la oportunidad');
    expect(describeAction({ type: 'notify_user', title: 'Revisar' }, lookups))
      .toBe('avisar al responsable: «Revisar»');
    expect(describeAction({ type: 'create_activity', activity_type: 'note' }, lookups))
      .toBe('registrar una actividad de tipo «note»');
    expect(describeAction({ type: 'send_whatsapp', text: 'Hola, ¿cómo va todo con la propuesta que enviamos?' }, lookups))
      .toBe('enviar un WhatsApp: «Hola, ¿cómo va todo con la propuesta que…»');
  });

  it('las acciones sin implementación lo dicen; las desconocidas no rompen', () => {
    expect(describeAction({ type: 'send_sms' }, lookups)).toBe('enviar un SMS (sin implementación todavía)');
    expect(describeAction({ type: 'lo_que_sea' }, lookups)).toBe('acción desconocida «lo_que_sea»');
  });

  it('el catálogo cubre exactamente los tipos del motor y marca los no implementados', () => {
    expect(ACTION_CATALOG.map((a) => a.type).sort()).toEqual([...AUTOMATION_ACTION_TYPES].sort());
    for (const a of ACTION_CATALOG) {
      expect(a.implemented).toBe(!NOT_IMPLEMENTED_ACTIONS.includes(a.type as never));
    }
  });

  it('las opciones de update_field son exactamente la allow-list del motor', () => {
    const expected = Object.fromEntries(
      Object.entries(UPDATE_FIELD_ALLOWLIST).map(([entity, cols]) => [entity, Object.keys(cols).sort()]),
    );
    const actual = Object.fromEntries(
      Object.entries(UPDATE_FIELD_OPTIONS).map(([entity, cols]) => [entity, [...cols].sort()]),
    );
    expect(actual).toEqual(expected);
  });
});

describe('describeActions y describeRule — la vista previa completa', () => {
  it('une con comas y una "y" final', () => {
    expect(describeActions([
      { type: 'send_email', subject: 'A' },
      { type: 'create_task', title: 'B' },
      { type: 'notify_user', title: 'C' },
    ], lookups)).toBe('enviar un email con asunto «A», crear la tarea «B» y avisar al responsable: «C»');
  });

  it('frase completa: cuando · si · entonces', () => {
    const rule = {
      trigger_type: 'stage_change', stage_id: 's1',
      conditions: { op: 'and', rules: [{ field: 'opportunity.amount', operator: 'gte', value: 1000 }] },
      actions: [{ type: 'send_email', template_id: 't1' }, { type: 'create_task', title: 'Llamar', due_in_days: 2 }],
    };
    expect(describeRule(rule, lookups)).toBe(
      'Cuando una oportunidad entra en «Propuesta enviada», si el monto de la oportunidad es al menos 1.000, '
      + 'entonces enviar un email con la plantilla «Seguimiento propuesta» y crear la tarea «Llamar» que vence en 2 días.',
    );
  });

  it('sin condiciones omite el "si"; sin acciones lo dice claramente', () => {
    expect(describeRule({ trigger_type: 'manual', actions: [{ type: 'notify_user', title: 'Ey' }] }, lookups))
      .toBe('Cuando alguien la ejecuta a mano, entonces avisar al responsable: «Ey».');
    expect(describeRule({ trigger_type: 'manual', actions: [] }, lookups))
      .toBe('Cuando alguien la ejecuta a mano, no hará nada: la regla no tiene acciones.');
  });
});

describe('motivos de omisión, estados de ejecución y tiempo relativo', () => {
  it('skip_reason en lenguaje humano', () => {
    expect(describeSkipReason('rule_inactive')).toMatch(/desactivada/);
    expect(describeSkipReason('conditions_not_met')).toMatch(/condiciones/);
    expect(describeSkipReason('already_ran')).toBe('already_ran');
    expect(describeSkipReason(null)).toBe('');
  });

  it('estado con etiqueta y tono (nunca solo color)', () => {
    expect(describeRunStatus('completed')).toEqual({ label: 'Completada', tone: 'success' });
    expect(describeRunStatus('failed')).toEqual({ label: 'Falló', tone: 'danger' });
    expect(describeRunStatus('skipped')).toEqual({ label: 'Omitida', tone: 'neutral' });
    expect(describeRunStatus('running')).toEqual({ label: 'En curso', tone: 'info' });
    expect(describeRunStatus('pending')).toEqual({ label: 'Pendiente', tone: 'warning' });
    expect(describeRunStatus('raro')).toEqual({ label: 'raro', tone: 'neutral' });
  });

  it('formatRelativeTime: nunca, ahora, minutos, horas, días', () => {
    const now = new Date('2026-09-14T12:00:00Z');
    expect(formatRelativeTime(null, now)).toBe('nunca');
    expect(formatRelativeTime('2026-09-14T11:59:40Z', now)).toBe('hace un momento');
    expect(formatRelativeTime('2026-09-14T11:35:00Z', now)).toBe('hace 25 min');
    expect(formatRelativeTime('2026-09-14T09:00:00Z', now)).toBe('hace 3 h');
    expect(formatRelativeTime('2026-09-12T09:00:00Z', now)).toBe('hace 2 días');
    expect(formatRelativeTime('2026-09-13T09:00:00Z', now)).toBe('hace 1 día');
    expect(formatRelativeTime('basura', now)).toBe('nunca');
  });
});
