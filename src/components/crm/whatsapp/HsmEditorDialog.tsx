'use client';

/** Editor de plantilla HSM (FASE-16 §5.2 `HsmEditorPage` como diálogo): nombre, categoría, idioma, HEADER/BODY/FOOTER/BUTTONS, variable_map, ejemplos y vista previa. */
import { useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Save, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { VARIABLE_CATALOG } from '@/lib/services/crm/email/variables';
import { extractParams } from '@/lib/services/crm/whatsapp/templateRender';
import type { HsmButton, HsmCategory, HsmComponent } from '@/lib/services/crm/whatsapp/types';
import { BubblePreview } from './compose/BubblePreview';
import { waApi, ApiError, type ChannelSummary, type WhatsAppTemplate } from './api';
import { useTemplateText } from '@/components/crm/plantillas/useTemplateText';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

const DEFAULT_MAP: Record<string, string> = { nombre: 'contact.first_name|cliente', cliente: 'contact.full_name|cliente', empresa: 'org.name', oportunidad: 'opportunity.name', monto: 'opportunity.amount|money', vendedor: 'user.first_name', fecha: 'custom.date|date', hora: 'custom.time', enlace: 'custom.url', resumen: 'custom.summary' };

export function HsmEditorDialog({ open, template, channels, onClose, onSaved, canManage = false, clone = false }: { open: boolean; template: WhatsAppTemplate | null; channels: ChannelSummary[]; onClose: () => void; onSaved: () => void; canManage?: boolean; clone?: boolean }) {
  const tr = useTemplateText(); const { formatDateTime } = useFormatDate();
  const editable = canManage && (!template || template.meta.status === 'DRAFT' || clone);
  const pending = useRef(false);
  const savedId = useRef<string | null>(clone ? null : template?.id ?? null);
  const [name, setName] = useState(clone ? `${template?.name ?? ''}_copy` : template?.name ?? '');
  const [category, setCategory] = useState<HsmCategory>(template?.meta.category ?? 'utility');
  const [language, setLanguage] = useState(template?.meta.language ?? 'es');
  const [description, setDescription] = useState(template?.description ?? '');
  const [channelId, setChannelId] = useState<string>(template?.meta.channel_id ?? channels.find((c) => c.is_default)?.id ?? '');
  const comp = (t: HsmComponent['type']) => template?.meta.components.find((c) => c.type === t);
  const [header, setHeader] = useState(comp('HEADER')?.text ?? '');
  const [body, setBody] = useState(comp('BODY')?.text ?? template?.body ?? '');
  const [footer, setFooter] = useState(comp('FOOTER')?.text ?? 'Responde BAJA para no recibir más mensajes');
  const [buttons, setButtons] = useState<HsmButton[]>(comp('BUTTONS')?.buttons ?? []);
  const [map, setMap] = useState<Record<string, string>>(template?.meta.variable_map ?? {});
  const [examples, setExamples] = useState<Record<string, string>>((template?.meta.examples as Record<string, string>) ?? {});
  const [saving, setSaving] = useState<'save' | 'submit' | null>(null);

  const params = useMemo(() => Array.from(new Set([...extractParams(header), ...extractParams(body), ...buttons.flatMap((b) => extractParams(b.url))])), [header, body, buttons]);

  const components = (): HsmComponent[] => [
    ...(header.trim() ? [{ type: 'HEADER' as const, format: 'TEXT' as const, text: header.trim() }] : []),
    { type: 'BODY' as const, text: body.trim() },
    ...(footer.trim() ? [{ type: 'FOOTER' as const, text: footer.trim() }] : []),
    ...(buttons.length ? [{ type: 'BUTTONS' as const, buttons }] : []),
  ];

  const save = async (submit: boolean) => {
    if (!editable || pending.current) return;
    if (submit && params.some(param => !examples[param]?.trim())) { toast({ title: tr('Completa un ejemplo para cada variable antes de enviar.'), variant: 'destructive' }); return; }
    pending.current = true;
    setSaving(submit ? 'submit' : 'save');
    try {
      const input = { name: name.trim().toLowerCase(), category, language, description: description || undefined, components: components(), variable_map: Object.fromEntries(params.map((p) => [p, map[p] ?? DEFAULT_MAP[p] ?? `custom.${p}`])), examples, channel_id: channelId || null };
      const saved = savedId.current ? await waApi.updateTemplate(savedId.current, input) : await waApi.createTemplate(input);
      savedId.current = saved.data.id;
      if (submit) {
        const r = await waApi.submitTemplate(saved.data.id, channelId || null);
        toast({ title: tr("Enviada a aprobación"), description: `${tr('Estado')}: ${r.data.meta.status}` });
      } else toast({ title: tr("Borrador guardado") });
      onSaved();
    } catch (e) {
      toast({ title: tr("No se pudo guardar"), description: e instanceof ApiError ? `${e.message} (${e.code})` : String(e), variant: 'destructive' });
    } finally { pending.current = false; setSaving(null); }
  };

  const previewValues = Object.fromEntries(params.map((p) => [p, examples[p] || `{{${p}}}`]));
  const sub = (t: string) => t.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, p: string) => previewValues[p] ?? _m);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending.current) onClose(); }}>
      <DialogContent className="sm:max-w-3xl bg-surface  max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? tr("Plantilla {p0}",{p0:template.name}) : tr("Nueva plantilla HSM")}</DialogTitle>
          <DialogDescription>{editable ? tr("Usa variables con nombre: {{nombre}}, {{fecha}}… y mapéalas a datos del CRM. Meta exige que el cuerpo no empiece ni termine con una variable.") : tr("Una plantilla ya enviada a Meta no se edita: crea una nueva versión.")}</DialogDescription>
        </DialogHeader>
        {template && !clone && <section className="space-y-1 rounded-lg border border-line bg-subtle p-3 text-xs text-fg-secondary" aria-label={tr('Historial de aprobación')}>
          <p className="font-medium">{tr('Historial de aprobación')}</p>
          <p>{tr('Última actualización')}: {formatDateTime(template.updated_at)}</p>
          {typeof template.meta.submitted_at === 'string' && <p>{tr('Enviada')}: {formatDateTime(template.meta.submitted_at)}</p>}
          {template.meta.last_synced_at && <p>{tr('Sincronizada')}: {formatDateTime(template.meta.last_synced_at)}</p>}
          {template.meta.rejected_reason && <p className="text-danger-text">{tr('Motivo del rechazo')}: {template.meta.rejected_reason}</p>}
          <p>{tr('Sólo se dispone del estado actual y de las fechas registradas por el proveedor.')}</p>
        </section>}
        <div className="grid gap-4 md:grid-cols-[1fr_240px]">
          <fieldset disabled={!editable || !!saving} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="hsm-name" className="text-xs"> {tr("Nombre (a-z, 0-9, _)")} </Label><Input id="hsm-name" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} disabled={!editable} className="font-mono text-sm bg-surface " /></div>
              <div><Label htmlFor="hsm-cat" className="text-xs"> {tr("Categoría")} </Label>
                <Select value={category} onValueChange={(v) => setCategory(v as HsmCategory)} disabled={!editable}><SelectTrigger id="hsm-cat" className="bg-surface "><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="utility"> {tr("Utility (transaccional)")} </SelectItem><SelectItem value="marketing"> {tr("Marketing (requiere opt-in)")} </SelectItem><SelectItem value="authentication"> {tr("Autenticación")} </SelectItem></SelectContent></Select></div>
              <div><Label htmlFor="hsm-lang" className="text-xs"> {tr("Idioma")} </Label><Input id="hsm-lang" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={!editable} placeholder="es | es_CO | en_US" className="bg-surface " /></div>
              <div><Label htmlFor="hsm-ch" className="text-xs"> {tr("Canal (WABA)")} </Label>
                <Select value={channelId} onValueChange={setChannelId}><SelectTrigger id="hsm-ch" className="bg-surface "><SelectValue placeholder={tr("Por defecto")} /></SelectTrigger>
                  <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id} disabled={!c.capabilities.templates}>{c.name} · {c.provider}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label htmlFor="hsm-desc" className="text-xs"> {tr("Descripción interna")} </Label><Input id="hsm-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-surface " /></div>
            <div><Label htmlFor="hsm-header" className="text-xs"> {tr("Encabezado (texto, ≤60)")} </Label><Input id="hsm-header" value={header} onChange={(e) => setHeader(e.target.value.slice(0, 60))} disabled={!editable} className="bg-surface " /></div>
            <div><Label htmlFor="hsm-body" className="text-xs"> {tr("Cuerpo (≤1024) *")} </Label><Textarea id="hsm-body" value={body} onChange={(e) => setBody(e.target.value.slice(0, 1024))} rows={5} disabled={!editable} className="bg-surface  text-sm" /><p className="text-[11px] text-fg-secondary text-right">{body.length}/1024</p></div>
            <div><Label htmlFor="hsm-footer" className="text-xs"> {tr("Pie (≤60)")} </Label><Input id="hsm-footer" value={footer} onChange={(e) => setFooter(e.target.value.slice(0, 60))} disabled={!editable} className="bg-surface " /></div>
            <div className="space-y-1">
              <div className="flex items-center justify-between"><Label className="text-xs"> {tr("Botones (≤3)")} </Label>{editable && buttons.length < 3 && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setButtons([...buttons, { type: 'QUICK_REPLY', text: '' }])}><Plus className="h-3 w-3 mr-1" /> {tr("Añadir")} </Button>}</div>
              {buttons.map((b, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <Select value={b.type} onValueChange={(v) => setButtons(buttons.map((x, j) => (j === i ? { ...x, type: v as HsmButton['type'] } : x)))} disabled={!editable}><SelectTrigger className="h-8 w-36 text-xs bg-surface "><SelectValue /></SelectTrigger><SelectContent><SelectItem value="QUICK_REPLY"> {tr("Respuesta rápida")} </SelectItem><SelectItem value="URL"> {tr("Enlace")} </SelectItem><SelectItem value="PHONE_NUMBER"> {tr("Llamar")} </SelectItem></SelectContent></Select>
                  <Input aria-label={tr("Texto del botón")} value={b.text} maxLength={25} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} disabled={!editable} className="h-8 text-xs bg-surface " placeholder={tr("Texto")} />
                  {b.type === 'URL' && <Input aria-label={tr("URL")} value={b.url ?? ''} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} disabled={!editable} className="h-8 text-xs bg-surface " placeholder="https://…/{{token}}" />}
                  {b.type === 'PHONE_NUMBER' && <Input aria-label={tr("Teléfono")} value={b.phone_number ?? ''} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, phone_number: e.target.value } : x)))} disabled={!editable} className="h-8 text-xs bg-surface " placeholder="+57…" />}
                  {editable && <button type="button" aria-label={tr("Quitar botón")} className="text-fg-secondary hover:text-danger-text" onClick={() => setButtons(buttons.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </div>
            {params.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs"> {tr("Variables → dato del CRM · ejemplo para Meta")} </Label>
                {params.map((p) => (
                  <div key={p} className="grid grid-cols-[90px_1fr_1fr] gap-1 items-center">
                    <span className="font-mono text-xs">{`{{${p}}}`}</span>
                    <Select value={map[p] ?? DEFAULT_MAP[p] ?? `custom.${p}`} onValueChange={(v) => setMap({ ...map, [p]: v })}><SelectTrigger className="h-8 text-xs bg-surface "><SelectValue /></SelectTrigger>
                      <SelectContent>{[...(map[p] && !VARIABLE_CATALOG.some((v) => v.path === map[p]) ? [{ path: map[p], label: map[p] }] : []), ...VARIABLE_CATALOG.map((v) => ({ path: v.path, label: v.label })), { path: DEFAULT_MAP[p] ?? `custom.${p}`, label: DEFAULT_MAP[p] ?? `custom.${p}` }].filter((v, i, arr) => arr.findIndex((x) => x.path === v.path) === i).map((v) => <SelectItem key={v.path} value={v.path}>{tr(v.label)}</SelectItem>)}</SelectContent></Select>
                    <Input aria-label={tr("Ejemplo para {p0}",{p0:p})} value={examples[p] ?? ''} onChange={(e) => setExamples({ ...examples, [p]: e.target.value })} placeholder={tr("Ejemplo (Laura)")} className="h-8 text-xs bg-surface " />
                  </div>
                ))}
              </div>
            )}
          </fieldset>
          <div className="rounded-lg bg-[#efeae2] dark:bg-[#0b141a] p-3"><BubblePreview header={sub(header) || null} body={sub(body)} footer={footer || null} buttons={buttons.filter((b) => b.text)} previewLabel={tr('Vista previa')} emptyLabel={tr('Sin contenido')} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={!!saving}> {tr("Cerrar")} </Button>
          {editable && <Button type="button" variant="outline" onClick={() => void save(false)} disabled={!!saving || !name || !body.trim()}>{saving === 'save' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" aria-hidden="true" />} {tr("Guardar borrador")} </Button>}
          {editable && <Button type="button" className="bg-brand hover:bg-brand-hover text-on-brand" onClick={() => void save(true)} disabled={!!saving || !name || !body.trim()}>{saving === 'submit' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" aria-hidden="true" />} {tr("Enviar a aprobación")} </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
