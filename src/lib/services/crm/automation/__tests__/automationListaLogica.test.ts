/// <reference types="jest" />
/**
 * Lista e historial de automatizaciones (Figma CRM 1373:17 y 1373:1161):
 * filtros, KPIs, columnas «Cuando»/«Acciones», plantillas y el límite de la
 * Ley 2300 del motor. Todo ejecutado, sin red.
 */
// El servicio arrastra el envío real (correo, cola): se doblan como en ruleServiceContract.test.ts.
jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(), emitCrmEvent: jest.fn() }));
jest.mock('@/lib/jobs/dispatch/eventDispatcher', () => ({ onCrmEvent: jest.fn() }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ checkExitConditions: jest.fn() }));

import {
  avisoEnvio,
  claveCuando,
  desdeRango,
  filtrarReglas,
  filtroHistorialAConsulta,
  iconoCuando,
  reordenar,
  resultadoDeEjecucion,
  tieneAccionesDeEnvio,
  tiposDeAcciones,
  ultimoEstadoPorRegla,
  variacionPorcentual,
} from '../automationListaLogica';
import { PLANTILLAS_REGLA, construirPlantillaRegla } from '../ruleTemplates';
import { formToPayload, ruleToForm } from '../ruleEditorModel';
import { fueraDeHorarioLey2300, validateRuleInput } from '../../automationService';

const reglas = [
  { id: 'a', name: 'Seguimiento tras propuesta', description: 'Si no hay respuesta', is_active: true },
  { id: 'b', name: 'Reactivar perdidas', description: null, is_active: false },
  { id: 'c', name: 'WhatsApp entrante sin dueño', description: null, is_active: true },
];
const ultimo = {
  c: { status: 'failed', error_message: 'plantilla archivada', skip_reason: null, created_at: '2026-11-15T13:00:00Z' },
  a: { status: 'completed', error_message: null, skip_reason: null, created_at: '2026-11-15T12:00:00Z' },
};

describe('filtros de la lista', () => {
  it('chips Todas · Activas · Pausadas · Con error', () => {
    expect(filtrarReglas(reglas, '', 'todas', ultimo).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(filtrarReglas(reglas, '', 'activas', ultimo).map((r) => r.id)).toEqual(['a', 'c']);
    expect(filtrarReglas(reglas, '', 'pausadas', ultimo).map((r) => r.id)).toEqual(['b']);
    expect(filtrarReglas(reglas, '', 'conError', ultimo).map((r) => r.id)).toEqual(['c']);
  });

  it('la búsqueda ignora tildes y mayúsculas y mira la descripción', () => {
    expect(filtrarReglas(reglas, 'DUENO', 'todas', ultimo).map((r) => r.id)).toEqual(['c']);
    expect(filtrarReglas(reglas, 'respuesta', 'todas', ultimo).map((r) => r.id)).toEqual(['a']);
  });
});

describe('KPIs y último estado', () => {
  it('se queda con la ejecución más reciente de cada regla', () => {
    const r = ultimoEstadoPorRegla([
      { automation_rule_id: 'x', status: 'failed', error_message: 'e', skip_reason: null, created_at: '2' },
      { automation_rule_id: 'x', status: 'completed', error_message: null, skip_reason: null, created_at: '1' },
      { automation_rule_id: 'y', status: 'skipped', error_message: null, skip_reason: 'cooldown', created_at: '1' },
    ]);
    expect(r.x.status).toBe('failed');
    expect(r.y.skip_reason).toBe('cooldown');
  });

  it('variación frente a la semana anterior; sin base, null', () => {
    expect(variacionPorcentual(109, 100)).toBe(9);
    expect(variacionPorcentual(90, 100)).toBe(-10);
    expect(variacionPorcentual(5, 0)).toBeNull();
  });
});

describe('historial', () => {
  it('la prueba en seco nunca cuenta como ejecutada', () => {
    expect(resultadoDeEjecucion({ status: 'completed', dry_run: true })).toBe('seco');
    expect(resultadoDeEjecucion({ status: 'failed' })).toBe('error');
    expect(resultadoDeEjecucion({ status: 'skipped' })).toBe('omitida');
    expect(resultadoDeEjecucion({ status: 'completed' })).toBe('ejecutada');
    expect(resultadoDeEjecucion({ status: 'running' })).toBe('enCurso');
  });

  it('cada chip se traduce a columnas reales de automation_runs', () => {
    expect(filtroHistorialAConsulta('todas')).toEqual({});
    expect(filtroHistorialAConsulta('conError')).toEqual({ dry_run: false, statuses: ['failed'] });
    expect(filtroHistorialAConsulta('seco')).toEqual({ dry_run: true });
  });

  it('el periodo se resta del instante actual', () => {
    expect(desdeRango('24h', new Date('2026-11-15T12:00:00Z'))).toBe('2026-11-14T12:00:00.000Z');
    expect(desdeRango('7d', new Date('2026-11-15T12:00:00Z'))).toBe('2026-11-08T12:00:00.000Z');
  });
});

describe('columnas Cuando y Acciones', () => {
  it('el evento manda sobre el tipo de disparador y la clave no lleva puntos', () => {
    expect(claveCuando({ trigger_type: 'event', event: 'whatsapp.inbound' })).toBe('whatsapp_inbound');
    expect(claveCuando({ trigger_type: 'stage_change', event: 'opportunity.stage_changed' })).toBe('stage_change');
    expect(iconoCuando({ trigger_type: 'event', event: 'task.overdue' })).toBe('tarea');
    expect(iconoCuando({ trigger_type: 'event', event: 'opportunity.created' })).toBe('crear');
  });

  it('acciones en orden y sin repetir; envío detectado', () => {
    const acciones = [{ type: 'create_task' }, { type: 'send_email' }, { type: 'create_task' }];
    expect(tiposDeAcciones(acciones)).toEqual(['create_task', 'send_email']);
    expect(tieneAccionesDeEnvio(acciones)).toBe(true);
    expect(tieneAccionesDeEnvio([{ type: 'notify_user' }])).toBe(false);
    expect(avisoEnvio(acciones)).toBe('correos');
    expect(avisoEnvio([{ type: 'send_whatsapp' }])).toBe('whatsapp');
    expect(avisoEnvio([{ type: 'move_stage' }])).toBeNull();
  });

  it('reordenar mueve una acción sin perder ninguna', () => {
    expect(reordenar(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(reordenar(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(reordenar(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});

describe('plantillas probadas', () => {
  const textos = { nombre: 'Plantilla', descripcion: 'Descripción', titulo: 'Título', detalle: 'Detalle' };
  it.each(PLANTILLAS_REGLA)('%s nace pausada, con su template_key y pasa la validación del servidor', (clave) => {
    const p = construirPlantillaRegla(clave, textos);
    expect(p.is_active).toBe(false);
    expect(p.template_key).toBe(clave);
    expect(validateRuleInput(p as unknown as Parameters<typeof validateRuleInput>[0])).toEqual([]);
  });
});

describe('Ley 2300 en el motor y en el formulario', () => {
  const sabadoTarde = new Date('2026-11-14T21:40:00Z'); // sábado 16:40 en Bogotá: ventana cerrada (8–15 h)
  const martesManana = new Date('2026-11-17T15:00:00Z'); // martes 10:00 en Bogotá

  it('solo omite si la regla lo pide Y contacta al cliente Y la ventana está cerrada', () => {
    const correo = [{ type: 'send_email' }];
    expect(fueraDeHorarioLey2300({ trigger_config: { solo_horario_ley2300: true }, actions: correo }, sabadoTarde)).toBe(true);
    expect(fueraDeHorarioLey2300({ trigger_config: { solo_horario_ley2300: true }, actions: correo }, martesManana)).toBe(false);
    expect(fueraDeHorarioLey2300({ trigger_config: {}, actions: correo }, sabadoTarde)).toBe(false);
    expect(fueraDeHorarioLey2300({ trigger_config: { solo_horario_ley2300: true }, actions: [{ type: 'create_task' }] }, sabadoTarde)).toBe(false);
  });

  it('el interruptor viaja en trigger_config sin borrar lo demás', () => {
    const form = ruleToForm({ name: 'R', trigger_type: 'field_change', is_active: false, trigger_config: { field: 'amount' } });
    expect(form.solo_horario_ley2300).toBe(false);
    const payload = formToPayload({ ...form, solo_horario_ley2300: true });
    expect(payload.trigger_config).toEqual({ field: 'amount', solo_horario_ley2300: true });
  });
});
