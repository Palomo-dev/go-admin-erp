'use client';

/**
 * Configuración › CRM › WhatsApp (FASE-16 §5.2 `WhatsAppSettingsTab`): canal por
 * defecto, palabras de baja/alta, horario permitido, límite diario, capacidades
 * por canal y messaging_limit del WABA. Persistencia en
 * provider_configs(category='whatsapp').settings vía /api/crm/whatsapp/settings.
 */
import { useEffect, useState } from 'react';
import { Loader2, Save, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { waApi, type ChannelSummary, type WhatsAppOrgSettings } from '@/components/crm/whatsapp/api';
import { PROVIDER_LABELS } from '@/components/crm/whatsapp/compose/ChannelSelect';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function Chips({ value, onChange, disabled, label }: { value: string[]; onChange: (v: string[]) => void; disabled: boolean; label: string }) {
  const [draft, setDraft] = useState('');
  const add = () => { const w = draft.trim().toUpperCase(); if (w && !value.includes(w)) onChange([...value, w]); setDraft(''); };
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1">
        {value.map((w) => <span key={w} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs">{w}{!disabled && <button type="button" aria-label={`Quitar ${w}`} onClick={() => onChange(value.filter((x) => x !== w))}><X className="h-3 w-3" /></button>}</span>)}
        {!disabled && <Input aria-label={`Añadir a ${label}`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} placeholder="Añadir + Enter" className="h-7 w-32 text-xs bg-white dark:bg-gray-900" />}
      </div>
    </div>
  );
}

export function WhatsAppTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<WhatsAppOrgSettings | null>(null);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [limit, setLimit] = useState<{ tier: string | null; limit: number | null; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    waApi.settings().then((r) => { setSettings(r.settings); setChannels(r.channels); setCanEdit(r.can_edit); }).catch((e) => toast({ title: 'No se pudo cargar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' }));
  }, [toast]);

  if (!settings) return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  const hours = settings.allowed_hours;
  const set = (patch: Partial<WhatsAppOrgSettings>) => setSettings({ ...settings, ...patch });

  const save = async () => {
    setSaving(true);
    try { const r = await waApi.saveSettings(settings); setSettings(r.settings); toast({ title: 'Configuración de WhatsApp guardada' }); }
    catch (e) { toast({ title: 'No se pudo guardar', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const checkLimit = async () => {
    setChecking(true);
    try { const r = await waApi.settings(true); setLimit(r.messaging_limit); } finally { setChecking(false); }
  };

  return (
    <div className="space-y-4">
      {!canEdit && <p className="text-xs text-gray-500 flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Solo lectura: requiere rol de administrador.</p>}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader><CardTitle className="text-base">Canales y capacidades</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wa-default" className="text-xs">Canal por defecto del CRM</Label>
              <Select value={settings.default_channel_id ?? ''} onValueChange={(v) => set({ default_channel_id: v })} disabled={!canEdit}>
                <SelectTrigger id="wa-default" className="bg-white dark:bg-gray-900"><SelectValue placeholder="Primer canal activo" /></SelectTrigger>
                <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id} disabled={c.status !== 'active'}>{c.name} · {PROVIDER_LABELS[c.provider].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Límite del WABA (usuarios únicos / 24 h)</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void checkLimit()} disabled={checking}>{checking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}Consultar</Button>
                {limit && <span className="text-xs">{limit.error ? limit.error : limit.tier ? `${limit.tier} (${limit.limit ?? 'ilimitado'})` : 'Desconocido'}</span>}
              </div>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-gray-500"><th className="py-1">Canal</th><th>Tipo</th><th>Plantillas</th><th>Adjuntos</th><th>Texto libre</th><th>Estado</th></tr></thead>
            <tbody>{channels.map((c) => <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700"><td className="py-1">{c.name}{c.is_default && <Badge variant="outline" className="ml-1 text-[10px]">por defecto</Badge>}</td><td>{PROVIDER_LABELS[c.provider].label}</td><td>{c.capabilities.templates ? 'Sí' : 'No'}</td><td>{c.capabilities.media ? 'Sí' : 'No'}</td><td>{c.capabilities.free_text ? 'Sí (ventana 24 h)' : 'No'}</td><td>{c.status}</td></tr>)}{channels.length === 0 && <tr><td colSpan={6} className="py-2 text-gray-500">Sin canales de WhatsApp. Conéctalos en Chat › Canales.</td></tr>}</tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader><CardTitle className="text-base">Consentimiento y horario (Habeas Data)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Chips label="Palabras de baja (opt-out)" value={settings.optout_keywords} onChange={(v) => set({ optout_keywords: v })} disabled={!canEdit} />
          <Chips label="Palabras de alta (opt-in)" value={settings.optin_keywords} onChange={(v) => set({ optin_keywords: v })} disabled={!canEdit} />
          <div className="space-y-2">
            <Label className="text-xs">Horario permitido de contacto</Label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={!!hours} disabled={!canEdit} onChange={(e) => set({ allowed_hours: e.target.checked ? { tz: 'America/Bogota', days: [1, 2, 3, 4, 5, 6], from: '08:00', to: '20:00' } : null })} />Activo</label>
              {hours && (
                <>
                  <Input type="time" aria-label="Desde" value={hours.from} disabled={!canEdit} onChange={(e) => set({ allowed_hours: { ...hours, from: e.target.value } })} className="h-8 w-28 text-xs bg-white dark:bg-gray-900" />
                  <span className="text-xs">a</span>
                  <Input type="time" aria-label="Hasta" value={hours.to} disabled={!canEdit} onChange={(e) => set({ allowed_hours: { ...hours, to: e.target.value } })} className="h-8 w-28 text-xs bg-white dark:bg-gray-900" />
                  <Input aria-label="Zona horaria" value={hours.tz} disabled={!canEdit} onChange={(e) => set({ allowed_hours: { ...hours, tz: e.target.value } })} className="h-8 w-40 text-xs bg-white dark:bg-gray-900" />
                  <div className="flex gap-1">{DAYS.map((d, i) => <button key={d} type="button" disabled={!canEdit} aria-pressed={hours.days.includes(i)} onClick={() => set({ allowed_hours: { ...hours, days: hours.days.includes(i) ? hours.days.filter((x) => x !== i) : [...hours.days, i].sort() } })} className={`text-[11px] px-2 py-1 rounded border ${hours.days.includes(i) ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 dark:border-gray-700'}`}>{d}</button>)}</div>
                </>
              )}
            </div>
            <p className="text-[11px] text-gray-500">Fuera del horario, los envíos individuales piden programar (utility puede forzar) y las campañas esperan al siguiente tramo.</p>
          </div>
          <div>
            <Label htmlFor="wa-daily" className="text-xs">Límite diario propio de mensajes salientes (vacío = solo el de Meta)</Label>
            <Input id="wa-daily" type="number" min={1} value={settings.daily_limit ?? ''} disabled={!canEdit} onChange={(e) => set({ daily_limit: e.target.value ? Number(e.target.value) : null })} className="h-8 w-40 text-xs bg-white dark:bg-gray-900" />
          </div>
        </CardContent>
      </Card>
      {canEdit && <div className="flex justify-end"><Button onClick={() => void save()} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}Guardar</Button></div>}
    </div>
  );
}

export default WhatsAppTab;
