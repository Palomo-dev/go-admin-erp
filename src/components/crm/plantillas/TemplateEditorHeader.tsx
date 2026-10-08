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
import { useTranslations } from 'next-intl';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';

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
  stats: TemplateStats | null;
  onSave: () => void;
  onDuplicate: () => void;
  onTestSend: () => void;
}

export function TemplateEditorHeader({ form, patch, context, version, isSystem, isNew, dirty, saving, stats, onSave, onDuplicate, onTestSend }: Props) {
  const t = useTranslations('crm.plantillas');
  // Celular: una sola barra. «←» y el título van en el MobileHeader del shell.
  useCabeceraMovil({ modo: 'page', titulo: isNew ? t('templateList.nuevaPlantilla') : form.name || t('templateEditorHeader.plantilla'), subtitulo: t('titulo'), volverA: '/app/crm/plantillas' });
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center gap-2">
        {/* En celular «←» ya está en el MobileHeader del shell: aquí sería la segunda flecha. */}
        <Link href="/app/crm/plantillas" className="hidden lg:inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('titulo')}
        </Link>
        <span className="hidden lg:inline text-gray-300 dark:text-gray-600">/</span>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{isNew ? t('templateList.nuevaPlantilla') : form.name || t('templateEditorHeader.plantilla')}</h1>
        {version ? <Badge variant="secondary">v{version}</Badge> : null}
        {isSystem ? <Badge variant="outline">{t('templateList.base')}</Badge> : null}
        {dirty ? <Badge variant="outline" className="text-amber-700 dark:text-amber-300">{t('templateEditorHeader.sinGuardar')}</Badge> : null}
        {stats ? (
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400" aria-label={t('templateEditorHeader.estadisticasPlantilla')}>
            {t('templateEditorHeader.enviadosAbiertosClicsRebotes', { sent: stats.sent, opened: stats.opened, clicked: stats.clicked, bounced: stats.bounced })}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {!isNew && <Button type="button" variant="outline" size="sm" onClick={onDuplicate} className="gap-1"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> {t('templateList.duplicar')}</Button>}
          <Button type="button" variant="outline" size="sm" onClick={onTestSend} disabled={isNew} title={isNew ? t('templateEditorHeader.guardaPlantillaEnviarPrueba') : undefined} className="gap-1">
            <Send className="h-3.5 w-3.5" aria-hidden="true" /> {t('templateEditorHeader.enviarPrueba')}
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={saving} className="gap-1">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />} {t('templateEditorHeader.guardar')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_180px_auto]">
        <div className="space-y-1">
          <Label htmlFor="tpl-name" className="text-xs">{t('templateEditorHeader.nombre')}</Label>
          <Input id="tpl-name" value={form.name} onChange={(e) => patch({ name: e.target.value })} placeholder={t('templateEditorHeader.ejSeguimientoTrasLlamada')} maxLength={120} className="dark:bg-gray-900" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('templateList.tipo')}</Label>
          <Select value={form.kind} onValueChange={(v) => patch({ kind: v as TemplateKind })}>
            <SelectTrigger aria-label={t('templateEditorHeader.tipoPlantilla')} className="dark:bg-gray-900"><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{TEMPLATE_KIND_LABELS[k]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Label htmlFor="tpl-active" className="text-xs">{t('templateList.activa')}</Label>
          <Switch id="tpl-active" checked={form.is_active} onCheckedChange={(v) => patch({ is_active: v })} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="tpl-subject" className="text-xs">{t('templateEditorHeader.asunto')}</Label>
            <VariablePicker values={context} withDefault onInsert={(expr) => patch({ subject: `${form.subject}${form.subject.endsWith(' ') || !form.subject ? '' : ' '}${expr}` })} trigger={<button type="button" className="text-[11px] text-blue-600 hover:underline dark:text-blue-400">{t('templateEditorHeader.variable')}</button>} />
          </div>
          <Input id="tpl-subject" value={form.subject} onChange={(e) => patch({ subject: e.target.value })} placeholder={t('templateEditorHeader.asuntoEjemplo')} maxLength={200} className="dark:bg-gray-900" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tpl-preheader" className="text-xs">{t('templateEditorHeader.preheaderTextoVistaPrevia')}</Label>
          <Input id="tpl-preheader" value={form.preheader} onChange={(e) => patch({ preheader: e.target.value })} placeholder={t('templateEditorHeader.resumenBreveVeJunto')} maxLength={140} className="dark:bg-gray-900" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="tpl-description" className="text-xs">{t('templateEditorHeader.descripcionInterna')}</Label>
        <Input id="tpl-description" value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder={t('templateEditorHeader.cuandoUsarEstaPlantilla')} maxLength={300} className="dark:bg-gray-900" />
      </div>
    </div>
  );
}
