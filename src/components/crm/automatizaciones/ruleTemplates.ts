import { EXAMPLE_FORM, ruleToForm, type RuleFormState } from '@/lib/services/crm/automation/ruleEditorModel';
/** Borradores pausados: usan exclusivamente disparadores y acciones del catálogo del motor. */
export function ruleTemplates(): RuleFormState[] {
  return [
    { ...EXAMPLE_FORM, is_active: false },
    { ...ruleToForm(null), name: 'Agente IA a leads nuevos', description: 'Llama a cada lead nuevo con el agente de voz elegido.', trigger_type: 'event', event: 'opportunity.created', actions: [{ type: 'start_ai_agent' }] },
    { ...ruleToForm(null), name: 'Aviso de tarea vencida', description: 'Notifica al responsable cuando vence una tarea.', trigger_type: 'event', event: 'task.overdue', actions: [{ type: 'notify_user', title: 'Tarea vencida', content: 'Revisa la tarea pendiente de {{opportunity_name}}.' }] },
  ];
}
