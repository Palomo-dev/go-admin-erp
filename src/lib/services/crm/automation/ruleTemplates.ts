/**
 * Plantillas de regla probadas (Figma CRM 1379:1336 «Listado — vacío» y
 * «Desde plantilla»). Cada una se crea PAUSADA (`is_active=false`) y con su
 * `template_key`, para que el usuario la revise y la pruebe en seco antes de
 * activarla. Los textos (nombre, título de la tarea…) llegan ya traducidos
 * desde la pantalla: aquí solo vive la estructura.
 */

import type { RulePayload } from './ruleEditorModel';

export type ClavePlantillaRegla = 'seguimiento_propuesta' | 'agente_ia_leads' | 'aviso_tarea_vencida';
export const PLANTILLAS_REGLA: readonly ClavePlantillaRegla[] = ['seguimiento_propuesta', 'agente_ia_leads', 'aviso_tarea_vencida'];

export interface TextosPlantillaRegla {
  nombre: string;
  descripcion: string;
  /** Título de la tarea, del aviso o asunto del correo, según la plantilla. */
  titulo: string;
  /** Segundo texto: asunto del correo o contenido del aviso. */
  detalle: string;
}

export type PayloadPlantilla = Omit<RulePayload, 'id'> & { template_key: ClavePlantillaRegla };

export function construirPlantillaRegla(clave: ClavePlantillaRegla, textos: TextosPlantillaRegla): PayloadPlantilla {
  const base = {
    name: textos.nombre,
    description: textos.descripcion,
    pipeline_id: null,
    stage_id: null,
    priority: 100,
    is_active: false,
    template_key: clave,
    // Las que contactan al cliente nacen respetando el horario de la Ley 2300.
    trigger_config: { solo_horario_ley2300: clave !== 'aviso_tarea_vencida' },
  };
  switch (clave) {
    case 'seguimiento_propuesta':
      return {
        ...base,
        trigger_type: 'stage_change',
        event: 'opportunity.stage_changed',
        run_once_per_opportunity: true,
        cooldown_hours: 24,
        conditions: { op: 'and', rules: [{ field: 'customer.has_email', operator: 'eq', value: true }] },
        actions: [
          { type: 'create_task', title: textos.titulo, due_in_days: 3 },
          { type: 'send_email', subject: textos.detalle },
        ],
      };
    case 'agente_ia_leads':
      return {
        ...base,
        trigger_type: 'event',
        event: 'opportunity.created',
        run_once_per_opportunity: true,
        cooldown_hours: 0,
        conditions: { op: 'and', rules: [{ field: 'customer.has_phone', operator: 'eq', value: true }] },
        actions: [{ type: 'start_ai_agent' }],
      };
    case 'aviso_tarea_vencida':
      return {
        ...base,
        trigger_type: 'event',
        event: 'task.overdue',
        run_once_per_opportunity: false,
        cooldown_hours: 24,
        conditions: { op: 'and', rules: [] },
        actions: [{ type: 'notify_user', title: textos.titulo, content: textos.detalle }],
      };
  }
}
