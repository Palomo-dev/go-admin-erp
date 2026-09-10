'use client';

/**
 * Editor de acciones de una regla (FASE-08 §5.2). Cada tipo declara sus campos;
 * las acciones sin implementación real se marcan para que nadie las active
 * creyendo que envían algo.
 */

import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { RuleAction } from './useAutomationRules';

interface FieldDef {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'textarea';
  placeholder?: string;
}

export const ACTION_CATALOG: {
  type: string;
  label: string;
  implemented: boolean;
  fields: FieldDef[];
}[] = [
  { type: 'send_email', label: 'Enviar email', implemented: true, fields: [
    { key: 'subject', label: 'Asunto', placeholder: 'Seguimiento de {{opportunity_name}}' },
    { key: 'html', label: 'Contenido HTML', type: 'textarea', placeholder: '<p>Hola {{first_name|cliente}}</p>' },
    { key: 'template_id', label: 'Plantilla (id, opcional)' },
  ] },
  { type: 'send_whatsapp', label: 'Enviar WhatsApp', implemented: true, fields: [
    { key: 'text', label: 'Texto (solo dentro de la ventana de 24 h)', type: 'textarea' },
    { key: 'template_id', label: 'Plantilla HSM (id)' },
  ] },
  { type: 'create_task', label: 'Crear tarea', implemented: true, fields: [
    { key: 'title', label: 'Título', placeholder: 'Llamar a {{customer_name}}' },
    { key: 'description', label: 'Descripción', type: 'textarea' },
    { key: 'due_in_days', label: 'Vence en (días)', type: 'number' },
  ] },
  { type: 'create_activity', label: 'Registrar actividad', implemented: true, fields: [
    { key: 'activity_type', label: 'Tipo (call|email|whatsapp|sms|meeting|visit|note|system|ai_call|task)', placeholder: 'system' },
    { key: 'notes', label: 'Notas', type: 'textarea' },
  ] },
  { type: 'update_field', label: 'Actualizar campo', implemented: true, fields: [
    { key: 'entity', label: 'Entidad (opportunities|customers|tasks)', placeholder: 'opportunities' },
    { key: 'field_name', label: 'Campo', placeholder: 'temperature' },
    { key: 'field_value', label: 'Valor', placeholder: 'hot' },
  ] },
  { type: 'enroll_sequence', label: 'Inscribir en secuencia', implemented: true, fields: [
    { key: 'sequence_id', label: 'Secuencia (id)' },
  ] },
  { type: 'unenroll_sequence', label: 'Sacar de secuencia', implemented: true, fields: [
    { key: 'sequence_id', label: 'Secuencia (id)' },
    { key: 'reason', label: 'Motivo' },
  ] },
  { type: 'notify_user', label: 'Notificar al responsable', implemented: true, fields: [
    { key: 'title', label: 'Título' },
    { key: 'content', label: 'Contenido', type: 'textarea' },
  ] },
  { type: 'move_stage', label: 'Mover de etapa', implemented: true, fields: [
    { key: 'stage_id', label: 'Etapa destino (id)' },
  ] },
  { type: 'send_sms', label: 'Enviar SMS', implemented: false, fields: [] },
  { type: 'start_ai_agent', label: 'Lanzar agente IA', implemented: false, fields: [] },
  { type: 'ai_draft_email', label: 'Redactar email con IA', implemented: false, fields: [] },
  { type: 'book_meeting_request', label: 'Solicitar reunión', implemented: false, fields: [] },
  { type: 'webhook_out', label: 'Webhook saliente', implemented: false, fields: [] },
];

interface Props {
  actions: RuleAction[];
  onChange: (actions: RuleAction[]) => void;
}

export function RuleActionsEditor({ actions, onChange }: Props) {
  const update = (index: number, patch: Record<string, unknown>) => {
    onChange(actions.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Acciones ({actions.length})</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...actions, { type: 'create_task', title: '' }])}
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Añadir acción
        </Button>
      </div>

      {actions.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 p-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Sin acciones: la regla no hará nada aunque se dispare.
        </p>
      )}

      {actions.map((action, index) => {
        const def = ACTION_CATALOG.find((c) => c.type === action.type) ?? ACTION_CATALOG[0];
        return (
          <div key={index} className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">#{index + 1}</span>
              <select
                aria-label={`Tipo de acción ${index + 1}`}
                className="h-9 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                value={String(action.type)}
                onChange={(e) => onChange(actions.map((a, i) => (i === index ? { type: e.target.value } : a)))}
              >
                {ACTION_CATALOG.map((c) => (
                  <option key={c.type} value={c.type}>{c.label}</option>
                ))}
              </select>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Eliminar acción ${index + 1}`}
                onClick={() => onChange(actions.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {!def.implemented && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Sin implementación: la ejecución quedará marcada como fallida.
              </p>
            )}

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {def.fields.map((f) => (
                <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <Label htmlFor={`a-${index}-${f.key}`} className="text-xs">{f.label}</Label>
                  {f.type === 'textarea' ? (
                    <Textarea
                      id={`a-${index}-${f.key}`}
                      rows={3}
                      value={String(action[f.key] ?? '')}
                      onChange={(e) => update(index, { [f.key]: e.target.value })}
                      placeholder={f.placeholder}
                    />
                  ) : (
                    <Input
                      id={`a-${index}-${f.key}`}
                      type={f.type === 'number' ? 'number' : 'text'}
                      value={String(action[f.key] ?? '')}
                      onChange={(e) => update(index, {
                        [f.key]: f.type === 'number'
                          ? (e.target.value === '' ? undefined : Number(e.target.value))
                          : e.target.value,
                      })}
                      placeholder={f.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>

            {def.implemented && def.type === 'send_email' && (
              <Badge variant="secondary" className="mt-2">
                El destinatario es el cliente de la oportunidad (se respeta la baja voluntaria)
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}
