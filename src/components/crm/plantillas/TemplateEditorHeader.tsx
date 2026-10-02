'use client';

/**
 * Cabecera del editor de plantillas: nombre, tipo, activa, asunto, preheader,
 * descripción y acciones (guardar, duplicar, enviar prueba).
 */

import { FileText, Copy, Save, Send } from 'lucide-react';
import { PageHeader, StatusBadge } from '@/components/kit';
import { KbdButton as Button } from '@/components/kit/KbdButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { VariablePicker } from '@/components/crm/email/VariablePicker';
import { TEMPLATE_KIND_LABELS } from '@/components/crm/email/TemplatePicker';
import type { TemplateKind } from '@/lib/services/crm/email/types';
import type { RenderContext } from '@/lib/services/crm/email/variables';
import type { TemplateForm, TemplateStats } from './useTemplateEditor';
import { useTemplateText } from './useTemplateText';

const KINDS: TemplateKind[] = ['transactional', 'marketing', 'sequence', 'onboarding'];

interface Props {
  form: TemplateForm;
  patch: (p: Partial<TemplateForm>) => void;
  context: RenderContext | null;
  version: number | null;
  isSystem: boolean;
  isNew: boolean;
  dirty: boolean;
  saving: boolean;
  canManage: boolean;
  stats: TemplateStats | null;
  onSave: () => void;
  onDuplicate: () => void;
  onTestSend: () => void;
  testSendDisabled?: boolean;
}

export function TemplateEditorHeader({ form, version, isSystem, isNew, dirty, saving, canManage, stats, onSave, onDuplicate, onTestSend, testSendDisabled }: Props) {
  const tr = useTemplateText();
  const actions = <>{canManage && !isNew && <Button patron="button" variante="secundario" onClick={onDuplicate} disabled={saving} icono={Copy}>{tr('Duplicar')}</Button>}
    {canManage && <Button patron="button" variante="secundario" onClick={onTestSend} disabled={isNew || dirty || saving || testSendDisabled} title={isNew || dirty ? tr('Guarda los cambios antes de enviar una prueba.') : undefined} icono={Send}>{tr('Enviar prueba')}</Button>}
    {canManage && <Button patron="button" onClick={onSave} disabled={saving} cargando={saving} icono={Save}>{tr('Guardar')}</Button>}</>;
  return <div className="space-y-3">
    <PageHeader titulo={isNew ? tr('Nueva plantilla') : form.name || tr('Plantilla')} icono={FileText} variante="form" volverA="/app/crm/plantillas"
      migas={[{ etiqueta: 'CRM', href: '/app/crm' }, { etiqueta: tr('Plantillas'), href: '/app/crm/plantillas' }, { etiqueta: form.name || tr('Nueva plantilla') }]}
      subtitulo={`${tr('Email')}${version ? ` · v${version}` : ''}${isSystem ? ` · ${tr('Base')}` : ''}`} acciones={actions} movil={{ accion: canManage ? <Button patron="button" onClick={onSave} disabled={saving} cargando={saving}>{tr('Guardar')}</Button> : undefined }}
      badge={dirty ? <StatusBadge estado="draft" etiqueta={tr('Sin guardar')} tono="advertencia" /> : undefined} />
    {stats && <p className="text-xs text-fg-secondary" aria-label={tr('Estadísticas de la plantilla')}>{tr('Enviados')} {stats.sent} {tr('· Abiertos')} {stats.opened} {tr('· Clics')} {stats.clicked} {tr('· Rebotes')} {stats.bounced}</p>}
  </div>;
}

export function TemplateEditorFields({ form, patch, context, saving, canManage }: Pick<Props, 'form' | 'patch' | 'context' | 'saving' | 'canManage'>) {
  const tr = useTemplateText();
  return (
      <fieldset disabled={!canManage || saving} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_180px_auto]">
        <div className="space-y-1">
          <Label htmlFor="tpl-name" className="text-xs"> {tr("Nombre *")} </Label>
          <Input id="tpl-name" value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder={tr("Ej. Seguimiento tras llamada")} maxLength={120} className="h-10 rounded-lg border-line-strong bg-surface text-fg dark:border-line-strong dark:bg-surface dark:text-fg" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs"> {tr("Tipo")} </Label>
          <Select value={form.kind} onValueChange={(v) => patch({ kind: v as TemplateKind })}>
            <SelectTrigger aria-label={tr("Tipo de plantilla")} className="h-10 rounded-lg border-line-strong bg-surface text-fg dark:border-line-strong dark:bg-surface dark:text-fg"><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{tr(TEMPLATE_KIND_LABELS[k])}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Label htmlFor="tpl-active" className="text-xs"> {tr("Activa")} </Label>
          <Switch id="tpl-active" checked={form.is_active} onCheckedChange={(v) => patch({ is_active: v })} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="tpl-subject" className="text-xs"> {tr("Asunto *")} </Label>
            {canManage && <VariablePicker values={context} withDefault text={tr} onInsert={(expr) => patch({ subject: `${form.subject}${form.subject.endsWith(' ') || !form.subject ? '' : ' '}${expr}` })} trigger={<button type="button" className="text-[11px] text-brand hover:underline"> {tr("+ variable")} </button>} />}
          </div>
          <Input id="tpl-subject" value={form.subject} onChange={(e) => patch({ subject: e.target.value })} placeholder={tr("Gracias por tu tiempo, {{contact.first_name|hola}}")} maxLength={200} className="h-10 rounded-lg border-line-strong bg-surface text-fg dark:border-line-strong dark:bg-surface dark:text-fg" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tpl-preheader" className="text-xs"> {tr("Preheader (texto de vista previa)")} </Label>
          <Input id="tpl-preheader" value={form.preheader} onChange={(e) => patch({ preheader: e.target.value })} placeholder={tr("Resumen breve que se ve junto al asunto")} maxLength={140} className="h-10 rounded-lg border-line-strong bg-surface text-fg dark:border-line-strong dark:bg-surface dark:text-fg" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="tpl-description" className="text-xs"> {tr("Descripción interna")} </Label>
        <Input id="tpl-description" value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder={tr("Cuándo usar esta plantilla")} maxLength={300} className="h-10 rounded-lg border-line-strong bg-surface text-fg dark:border-line-strong dark:bg-surface dark:text-fg" />
      </div>
      </fieldset>
  );
}
