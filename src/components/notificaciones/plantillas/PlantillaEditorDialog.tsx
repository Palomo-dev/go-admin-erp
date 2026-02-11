'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Eye, Code, X, Plus, Variable, Wand2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { NotificationTemplate, TemplateFormData, TemplateChannel } from './types';
import { CHANNEL_OPTIONS } from './types';

// ── Variables sugeridas por contexto ─────────────────────
const SUGGESTED_VARIABLES: { category: string; vars: { name: string; desc: string }[] }[] = [
  { category: 'Usuario', vars: [
    { name: 'user_name', desc: 'Nombre del usuario' },
    { name: 'user_email', desc: 'Email del usuario' },
    { name: 'user_phone', desc: 'Teléfono' },
  ]},
  { category: 'Organización', vars: [
    { name: 'org_name', desc: 'Nombre de la organización' },
    { name: 'org_phone', desc: 'Teléfono de la org' },
  ]},
  { category: 'Facturación', vars: [
    { name: 'invoice_id', desc: 'ID de factura' },
    { name: 'invoice_total', desc: 'Total de factura' },
    { name: 'due_date', desc: 'Fecha de vencimiento' },
    { name: 'customer_name', desc: 'Nombre del cliente' },
  ]},
  { category: 'Inventario', vars: [
    { name: 'product_name', desc: 'Nombre del producto' },
    { name: 'product_sku', desc: 'SKU del producto' },
    { name: 'current_stock', desc: 'Stock actual' },
    { name: 'minimum_stock', desc: 'Stock mínimo' },
  ]},
  { category: 'Reservas', vars: [
    { name: 'reservation_id', desc: 'ID reservación' },
    { name: 'check_in', desc: 'Fecha check-in' },
    { name: 'check_out', desc: 'Fecha check-out' },
    { name: 'guest_name', desc: 'Nombre del huésped' },
  ]},
  { category: 'Sistema', vars: [
    { name: 'date_now', desc: 'Fecha actual' },
    { name: 'app_url', desc: 'URL de la app' },
  ]},
];

// ── HTML default por canal ──────────────────────────────
const DEFAULT_HTML: Record<string, string> = {
  email: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9fafb">
  <div style="background:white;border-radius:8px;padding:24px;border:1px solid #e5e7eb">
    <h2 style="color:#1f2937;margin:0 0 16px">{{org_name}}</h2>
    <p style="color:#4b5563;font-size:15px;line-height:1.6">
      Hola <strong>{{user_name}}</strong>,
    </p>
    <p style="color:#4b5563;font-size:15px;line-height:1.6">
      <!-- Tu contenido aquí -->
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
    <p style="color:#9ca3af;font-size:12px">Este es un mensaje automático de {{org_name}}.</p>
  </div>
</body>
</html>`,
  webhook: `{
  "event": "notification",
  "user": "{{user_name}}",
  "email": "{{user_email}}",
  "message": "{{org_name}} — Tu contenido aquí",
  "timestamp": "{{date_now}}"
}`,
};

// ── Body text default por canal ─────────────────────────
const DEFAULT_BODY_TEXT: Record<string, string> = {
  email: 'Hola {{user_name}},\n\nTe informamos que...\n\nSaludos,\n{{org_name}}',
  sms: '{{org_name}}: Hola {{user_name}}, te informamos que...',
  push: '{{user_name}}, tienes una nueva notificación de {{org_name}}',
  whatsapp: 'Hola {{user_name}} 👋\n\nTe escribimos desde {{org_name}} para informarte que...\n\n¿Tienes dudas? Responde a este mensaje.',
  app: 'Hola {{user_name}}, tienes una nueva notificación.',
  webhook: '{"user": "{{user_name}}", "message": "Notificación de {{org_name}}"}',
};

interface PlantillaEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: NotificationTemplate | null;
  onSave: (data: TemplateFormData, id?: string) => Promise<boolean>;
}

export function PlantillaEditorDialog({
  open, onOpenChange, template, onSave,
}: PlantillaEditorDialogProps) {
  const isEdit = !!template;

  const [channel, setChannel] = useState<TemplateChannel>('email');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [variables, setVariables] = useState<string[]>([]);
  const [newVar, setNewVar] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuggested, setShowSuggested] = useState(false);

  useEffect(() => {
    if (template) {
      setChannel(template.channel);
      setName(template.name);
      setSubject(template.subject || '');
      setBodyHtml(template.body_html || '');
      setBodyText(template.body_text);
      setVariables(template.variables || []);
    } else {
      setChannel('email');
      setName('');
      setSubject('');
      setBodyHtml('');
      setBodyText('');
      setVariables([]);
    }
    setNewVar('');
    setShowPreview(false);
    setShowSuggested(false);
  }, [template, open]);

  const handleChannelChange = (ch: TemplateChannel) => {
    setChannel(ch);
    // Si es nuevo y no tiene contenido, cargar defaults
    if (!isEdit && !bodyText.trim()) {
      setBodyText(DEFAULT_BODY_TEXT[ch] || '');
      if (DEFAULT_HTML[ch]) setBodyHtml(DEFAULT_HTML[ch]);
      else setBodyHtml('');
      // Auto-agregar variables comunes
      setVariables(['user_name', 'org_name']);
    }
  };

  const addVariable = (v?: string) => {
    const varName = v || newVar.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (varName && !variables.includes(varName)) {
      setVariables((prev) => [...prev, varName]);
      if (!v) setNewVar('');
    }
  };

  const removeVariable = (v: string) => {
    setVariables(variables.filter((x) => x !== v));
  };

  const loadDefaultTemplate = () => {
    setBodyText(DEFAULT_BODY_TEXT[channel] || '');
    if (DEFAULT_HTML[channel]) setBodyHtml(DEFAULT_HTML[channel]);
    else setBodyHtml('');
    setVariables(['user_name', 'org_name']);
  };

  const previewText = useMemo(() => {
    let text = bodyText;
    variables.forEach((v) => {
      text = text.replace(new RegExp(`{{${v}}}`, 'g'), `[${v}]`);
    });
    return text;
  }, [bodyText, variables]);

  const previewHtml = useMemo(() => {
    let html = bodyHtml || bodyText;
    variables.forEach((v) => {
      html = html.replace(
        new RegExp(`{{${v}}}`, 'g'),
        `<span style="background:#dbeafe;color:#1d4ed8;padding:1px 4px;border-radius:3px;font-weight:600">[${v}]</span>`
      );
    });
    return html;
  }, [bodyHtml, bodyText, variables]);

  const handleSave = async () => {
    if (!name.trim() || !bodyText.trim()) return;
    setIsSaving(true);

    const data: TemplateFormData = {
      channel,
      name: name.trim(),
      subject: subject.trim(),
      body_html: bodyHtml.trim(),
      body_text: bodyText.trim(),
      variables,
    };

    const ok = await onSave(data, template?.id);
    setIsSaving(false);
    if (ok) onOpenChange(false);
  };

  const needsSubject = channel === 'email' || channel === 'push' || channel === 'whatsapp';
  const needsHtml = channel === 'email' || channel === 'webhook';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Plantilla' : 'Nueva Plantilla'}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Editando v${template.version} — se creará v${template.version + 1}` : 'Selecciona un canal para cargar una plantilla base'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Canal y nombre */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 dark:text-gray-400">Canal *</Label>
              <select
                value={channel}
                onChange={(e) => handleChannelChange(e.target.value as TemplateChannel)}
                className="w-full h-9 px-3 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {CHANNEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs text-gray-600 dark:text-gray-400">Nombre *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: Pago Vencido"
                className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              />
            </div>
          </div>

          {/* Asunto (si aplica) */}
          {needsSubject && (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 dark:text-gray-400">Asunto</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="ej: Recordatorio: factura {{invoice_id}} vencida"
                className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              />
            </div>
          )}

          {/* Variables */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Variable className="h-3.5 w-3.5" /> Variables disponibles
              </Label>
              <button
                onClick={() => setShowSuggested(!showSuggested)}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showSuggested ? 'Ocultar sugeridas' : 'Ver variables sugeridas'}
              </button>
            </div>

            {/* Variables activas */}
            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
              {variables.length === 0 && (
                <span className="text-xs text-gray-400">Agrega variables haciendo clic en las sugeridas</span>
              )}
              {variables.map((v) => (
                <Badge key={v} variant="secondary" className="text-xs gap-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">
                  {'{{' + v + '}}'}
                  <button onClick={() => removeVariable(v)} className="hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>

            {/* Panel de sugeridas */}
            {showSuggested && (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50 space-y-2 max-h-40 overflow-y-auto">
                {SUGGESTED_VARIABLES.map((cat) => (
                  <div key={cat.category}>
                    <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{cat.category}</p>
                    <div className="flex flex-wrap gap-1">
                      {cat.vars.map((v) => (
                        <button
                          key={v.name}
                          onClick={() => addVariable(v.name)}
                          disabled={variables.includes(v.name)}
                          title={v.desc}
                          className={cn(
                            'px-2 py-0.5 rounded text-[11px] border transition-all',
                            variables.includes(v.name)
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 border-blue-200 dark:border-blue-800 opacity-50 cursor-default'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-blue-400 hover:text-blue-600 cursor-pointer'
                          )}
                        >
                          {v.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Input manual */}
            <div className="flex gap-2">
              <Input
                value={newVar}
                onChange={(e) => setNewVar(e.target.value)}
                placeholder="variable_personalizada"
                className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-xs"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVariable(); } }}
              />
              <Button variant="outline" size="sm" onClick={() => addVariable()} disabled={!newVar.trim()}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
              </Button>
            </div>
          </div>

          <Separator />

          {/* Toggle editor/preview + botón plantilla base */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={!showPreview ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowPreview(false)}
                className="text-xs"
              >
                <Code className="h-3.5 w-3.5 mr-1" /> Editor
              </Button>
              <Button
                variant={showPreview ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowPreview(true)}
                className="text-xs"
              >
                <Eye className="h-3.5 w-3.5 mr-1" /> Preview
              </Button>
            </div>
            {!isEdit && (
              <Button variant="ghost" size="sm" onClick={loadDefaultTemplate} className="text-xs text-blue-600 dark:text-blue-400">
                <Wand2 className="h-3.5 w-3.5 mr-1" /> Cargar plantilla base
              </Button>
            )}
          </div>

          {showPreview ? (
            <div className="space-y-3">
              {needsHtml && previewHtml ? (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-950">
                  <p className="text-xs text-gray-400 mb-2">HTML Preview</p>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-sm"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-950">
                  <p className="text-xs text-gray-400 mb-2">Text Preview</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {previewText}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Body text */}
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600 dark:text-gray-400">Cuerpo (texto) *</Label>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  placeholder="Usa {{variable}} para insertar variables dinámicas..."
                  rows={5}
                  className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                />
              </div>

              {/* Body HTML (si aplica) */}
              {needsHtml && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600 dark:text-gray-400">Cuerpo (HTML)</Label>
                  <textarea
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    placeholder="<html>...</html>"
                    rows={8}
                    className="w-full px-3 py-2 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || !bodyText.trim() || isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEdit ? 'Guardar Cambios' : 'Crear Plantilla'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
