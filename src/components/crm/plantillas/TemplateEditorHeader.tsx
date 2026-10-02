'use client';

/**
 * Cabecera del editor de plantillas: nombre, tipo, activa, asunto, preheader,
 * descripción y acciones (guardar, duplicar, enviar prueba).
 */

import Link from 'next/link';
import { ArrowLeft, Copy, Loader2, Save, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
}

export function TemplateEditorHeader({ form, patch, context, version, isSystem, isNew, dirty, saving, canManage, stats, onSave, onDuplicate, onTestSend }: Props) {
  const tr = useTemplateText();
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4  ">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/app/crm/plantillas" className="inline-flex items-center gap-1 text-sm text-fg-secondary hover:text-fg  dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />  {tr("Plantillas")} </Link>
        <span className="text-fg-secondary ">/</span>
        <h1 className="text-lg font-semibold text-fg ">{isNew ? tr("Nueva plantilla") : form.name || tr("Plantilla")}</h1>
        {version ? <Badge variant="secondary"> v {version}</Badge> : null}
        {isSystem ? <Badge variant="outline"> {tr("Base")} </Badge> : null}
        {dirty ? <Badge variant="outline" className="text-amber-700 dark:text-amber-300"> {tr("Sin guardar")} </Badge> : null}
        {stats ? (
          <span className="ml-auto text-xs text-fg-secondary " aria-label={tr("Estadísticas de la plantilla")}>
             {tr("Enviados")} {stats.sent}  {tr("· Abiertos")} {stats.opened}  {tr("· Clics")} {stats.clicked}  {tr("· Rebotes")} {stats.bounced}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {canManage && !isNew && <Button type="button" variant="outline" size="sm" onClick={onDuplicate} disabled={saving} className="gap-1"><Copy className="h-3.5 w-3.5" aria-hidden="true" />  {tr("Duplicar")} </Button>}
          {canManage && <Button type="button" variant="outline" size="sm" onClick={onTestSend} disabled={isNew || dirty || saving} title={isNew || dirty ? tr('Guarda los cambios antes de enviar una prueba.') : undefined} className="gap-1">
            <Send className="h-3.5 w-3.5" aria-hidden="true" />  {tr("Enviar prueba")} </Button>}
          {canManage && <Button type="button" size="sm" onClick={onSave} disabled={saving} className="gap-1">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}  {tr("Guardar")} </Button>}
        </div>
      </div>

      {!canManage && <p className="text-xs text-fg-muted">{tr('Sólo lectura')}</p>}
      <fieldset disabled={!canManage || saving} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_180px_auto]">
        <div className="space-y-1">
          <Label htmlFor="tpl-name" className="text-xs"> {tr("Nombre *")} </Label>
          <Input id="tpl-name" value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder={tr("Ej. Seguimiento tras llamada")} maxLength={120} className="" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs"> {tr("Tipo")} </Label>
          <Select value={form.kind} onValueChange={(v) => patch({ kind: v as TemplateKind })}>
            <SelectTrigger aria-label={tr("Tipo de plantilla")} className=""><SelectValue /></SelectTrigger>
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
          <Input id="tpl-subject" value={form.subject} onChange={(e) => patch({ subject: e.target.value })} placeholder={tr("Gracias por tu tiempo, {{contact.first_name|hola}}")} maxLength={200} className="" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tpl-preheader" className="text-xs"> {tr("Preheader (texto de vista previa)")} </Label>
          <Input id="tpl-preheader" value={form.preheader} onChange={(e) => patch({ preheader: e.target.value })} placeholder={tr("Resumen breve que se ve junto al asunto")} maxLength={140} className="" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="tpl-description" className="text-xs"> {tr("Descripción interna")} </Label>
        <Input id="tpl-description" value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder={tr("Cuándo usar esta plantilla")} maxLength={300} className="" />
      </div>
      </fieldset>
    </div>
  );
}
