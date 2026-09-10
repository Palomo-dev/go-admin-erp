'use client';

/** Editor de plantilla HSM (FASE-16 §5.2 `HsmEditorPage` como diálogo): nombre, categoría, idioma, HEADER/BODY/FOOTER/BUTTONS, variable_map, ejemplos y vista previa. */
import { useMemo, useState } from 'react';
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

const DEFAULT_MAP: Record<string, string> = { nombre: 'contact.first_name|cliente', cliente: 'contact.full_name|cliente', empresa: 'org.name', oportunidad: 'opportunity.name', monto: 'opportunity.amount|money', vendedor: 'user.first_name', fecha: 'custom.date|date', hora: 'custom.time', enlace: 'custom.url', resumen: 'custom.summary' };

export function HsmEditorDialog({ open, template, channels, onClose, onSaved }: { open: boolean; template: WhatsAppTemplate | null; channels: ChannelSummary[]; onClose: () => void; onSaved: () => void }) {
  const editable = !template || template.meta.status === 'DRAFT';
  const [name, setName] = useState(template?.name ?? '');
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
    setSaving(submit ? 'submit' : 'save');
    try {
      const input = { name: name.trim().toLowerCase(), category, language, description: description || undefined, components: components(), variable_map: Object.fromEntries(params.map((p) => [p, map[p] ?? DEFAULT_MAP[p] ?? `custom.${p}`])), examples, channel_id: channelId || null };
      const saved = template ? await waApi.updateTemplate(template.id, input) : await waApi.createTemplate(input);
      if (submit) {
        const r = await waApi.submitTemplate(saved.data.id, channelId || null);
        toast({ title: 'Enviada a aprobación', description: `Estado ${r.data.meta.status}` });
      } else toast({ title: 'Borrador guardado' });
      onSaved();
    } catch (e) {
      toast({ title: 'No se pudo guardar', description: e instanceof ApiError ? `${e.message} (${e.code})` : String(e), variant: 'destructive' });
    } finally { setSaving(null); }
  };

  const previewValues = Object.fromEntries(params.map((p) => [p, examples[p] || `{{${p}}}`]));
  const sub = (t: string) => t.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, p: string) => previewValues[p] ?? _m);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl bg-white dark:bg-gray-900 max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? `Plantilla ${template.name}` : 'Nueva plantilla HSM'}</DialogTitle>
          <DialogDescription>{editable ? 'Usa variables con nombre: {{nombre}}, {{fecha}}… y mapéalas a datos del CRM. Meta exige que el cuerpo no empiece ni termine con una variable.' : 'Una plantilla ya enviada a Meta no se edita: crea una nueva versión.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[1fr_240px]">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="hsm-name" className="text-xs">Nombre (a-z, 0-9, _)</Label><Input id="hsm-name" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))} disabled={!editable} className="font-mono text-sm bg-white dark:bg-gray-900" /></div>
              <div><Label htmlFor="hsm-cat" className="text-xs">Categoría</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as HsmCategory)} disabled={!editable}><SelectTrigger id="hsm-cat" className="bg-white dark:bg-gray-900"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="utility">Utility (transaccional)</SelectItem><SelectItem value="marketing">Marketing (requiere opt-in)</SelectItem><SelectItem value="authentication">Autenticación</SelectItem></SelectContent></Select></div>
              <div><Label htmlFor="hsm-lang" className="text-xs">Idioma</Label><Input id="hsm-lang" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={!editable} placeholder="es | es_CO | en_US" className="bg-white dark:bg-gray-900" /></div>
              <div><Label htmlFor="hsm-ch" className="text-xs">Canal (WABA)</Label>
                <Select value={channelId} onValueChange={setChannelId}><SelectTrigger id="hsm-ch" className="bg-white dark:bg-gray-900"><SelectValue placeholder="Por defecto" /></SelectTrigger>
                  <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id} disabled={!c.capabilities.templates}>{c.name} · {c.provider}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label htmlFor="hsm-desc" className="text-xs">Descripción interna</Label><Input id="hsm-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-white dark:bg-gray-900" /></div>
            <div><Label htmlFor="hsm-header" className="text-xs">Encabezado (texto, ≤60)</Label><Input id="hsm-header" value={header} onChange={(e) => setHeader(e.target.value.slice(0, 60))} disabled={!editable} className="bg-white dark:bg-gray-900" /></div>
            <div><Label htmlFor="hsm-body" className="text-xs">Cuerpo (≤1024) *</Label><Textarea id="hsm-body" value={body} onChange={(e) => setBody(e.target.value.slice(0, 1024))} rows={5} disabled={!editable} className="bg-white dark:bg-gray-900 text-sm" /><p className="text-[11px] text-gray-500 text-right">{body.length}/1024</p></div>
            <div><Label htmlFor="hsm-footer" className="text-xs">Pie (≤60)</Label><Input id="hsm-footer" value={footer} onChange={(e) => setFooter(e.target.value.slice(0, 60))} disabled={!editable} className="bg-white dark:bg-gray-900" /></div>
            <div className="space-y-1">
              <div className="flex items-center justify-between"><Label className="text-xs">Botones (≤3)</Label>{editable && buttons.length < 3 && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setButtons([...buttons, { type: 'QUICK_REPLY', text: '' }])}><Plus className="h-3 w-3 mr-1" />Añadir</Button>}</div>
              {buttons.map((b, i) => (
                <div key={i} className="flex gap-1 items-center">
                  <Select value={b.type} onValueChange={(v) => setButtons(buttons.map((x, j) => (j === i ? { ...x, type: v as HsmButton['type'] } : x)))} disabled={!editable}><SelectTrigger className="h-8 w-36 text-xs bg-white dark:bg-gray-900"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="QUICK_REPLY">Respuesta rápida</SelectItem><SelectItem value="URL">Enlace</SelectItem><SelectItem value="PHONE_NUMBER">Llamar</SelectItem></SelectContent></Select>
                  <Input aria-label="Texto del botón" value={b.text} maxLength={25} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} disabled={!editable} className="h-8 text-xs bg-white dark:bg-gray-900" placeholder="Texto" />
                  {b.type === 'URL' && <Input aria-label="URL" value={b.url ?? ''} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} disabled={!editable} className="h-8 text-xs bg-white dark:bg-gray-900" placeholder="https://…/{{token}}" />}
                  {b.type === 'PHONE_NUMBER' && <Input aria-label="Teléfono" value={b.phone_number ?? ''} onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, phone_number: e.target.value } : x)))} disabled={!editable} className="h-8 text-xs bg-white dark:bg-gray-900" placeholder="+57…" />}
                  {editable && <button type="button" aria-label="Quitar botón" className="text-gray-400 hover:text-red-600" onClick={() => setButtons(buttons.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </div>
            {params.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Variables → dato del CRM · ejemplo para Meta</Label>
                {params.map((p) => (
                  <div key={p} className="grid grid-cols-[90px_1fr_1fr] gap-1 items-center">
                    <span className="font-mono text-xs">{`{{${p}}}`}</span>
                    <Select value={map[p] ?? DEFAULT_MAP[p] ?? `custom.${p}`} onValueChange={(v) => setMap({ ...map, [p]: v })}><SelectTrigger className="h-8 text-xs bg-white dark:bg-gray-900"><SelectValue /></SelectTrigger>
                      <SelectContent>{[...(map[p] && !VARIABLE_CATALOG.some((v) => v.path === map[p]) ? [{ path: map[p], label: map[p] }] : []), ...VARIABLE_CATALOG.map((v) => ({ path: v.path, label: v.label })), { path: DEFAULT_MAP[p] ?? `custom.${p}`, label: DEFAULT_MAP[p] ?? `custom.${p}` }].filter((v, i, arr) => arr.findIndex((x) => x.path === v.path) === i).map((v) => <SelectItem key={v.path} value={v.path}>{v.label}</SelectItem>)}</SelectContent></Select>
                    <Input aria-label={`Ejemplo de ${p}`} value={examples[p] ?? ''} onChange={(e) => setExamples({ ...examples, [p]: e.target.value })} placeholder="Ejemplo (Laura)" className="h-8 text-xs bg-white dark:bg-gray-900" />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg bg-[#efeae2] dark:bg-[#0b141a] p-3"><BubblePreview header={sub(header) || null} body={sub(body)} footer={footer || null} buttons={buttons.filter((b) => b.text)} status="delivered" /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
          {editable && <Button type="button" variant="outline" onClick={() => void save(false)} disabled={!!saving || !name || !body.trim()}>{saving === 'save' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" aria-hidden="true" />}Guardar borrador</Button>}
          {editable && <Button type="button" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => void save(true)} disabled={!!saving || !name || !body.trim()}>{saving === 'submit' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" aria-hidden="true" />}Enviar a aprobación</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
