'use client';

/**
 * Configuración › CRM › WhatsApp (FASE-16 §5.2 `WhatsAppSettingsTab`): canal por
 * defecto, palabras de baja/alta, horario permitido, límite diario, indicativo
 * del país por defecto (F16 r5 · T-3), capacidades por canal y
 * messaging_limit del WABA. Persistencia en
 * provider_configs(category='whatsapp').settings vía /api/crm/whatsapp/settings.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
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

const DAYS = ['dias.dom', 'dias.lun', 'dias.mar', 'dias.mie', 'dias.jue', 'dias.vie', 'dias.sab'] as const;

function Chips({ value, onChange, disabled, label }: { value: string[]; onChange: (v: string[]) => void; disabled: boolean; label: string }) {
  const t = useTranslations('configuracionTextos.whatsAppTab');
  const [draft, setDraft] = useState('');
  const add = () => { const w = draft.trim().toUpperCase(); if (w && !value.includes(w)) onChange([...value, w]); setDraft(''); };
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1">
        {value.map((w) => <span key={w} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs">{w}{!disabled && <button type="button" aria-label={t('chips.quitar', { palabra: w })} onClick={() => onChange(value.filter((x) => x !== w))}><X className="h-3 w-3" /></button>}</span>)}
        {!disabled && <Input aria-label={t('chips.anadirA', { lista: label })} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} placeholder={t('chips.placeholder')} className="h-7 w-32 text-xs bg-white dark:bg-gray-900" />}
      </div>
    </div>
  );
}

export function WhatsAppTab() {
  const t = useTranslations('configuracionTextos.whatsAppTab');
  const { toast } = useToast();
  const [settings, setSettings] = useState<WhatsAppOrgSettings | null>(null);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [limit, setLimit] = useState<{ tier: string | null; limit: number | null; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    waApi.settings().then((r) => { setSettings(r.settings); setChannels(r.channels); setCanEdit(r.can_edit); }).catch((e) => toast({ title: t('toast.errorCarga'), description: e instanceof Error ? e.message : t('toast.error'), variant: 'destructive' }));
  }, [toast, t]);

  if (!settings) return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div>;
  const hours = settings.allowed_hours;
  const set = (patch: Partial<WhatsAppOrgSettings>) => setSettings({ ...settings, ...patch });

  const save = async () => {
    setSaving(true);
    try { const r = await waApi.saveSettings(settings); setSettings(r.settings); toast({ title: t('toast.guardado') }); }
    catch (e) { toast({ title: t('toast.errorGuardar'), description: e instanceof Error ? e.message : t('toast.error'), variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const checkLimit = async () => {
    setChecking(true);
    try { const r = await waApi.settings(true); setLimit(r.messaging_limit); } finally { setChecking(false); }
  };

  return (
    <div className="space-y-4">
      {!canEdit && <p className="text-xs text-gray-500 flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />{t('soloLectura')}</p>}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader><CardTitle className="text-base">{t('canales.titulo')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wa-default" className="text-xs">{t('canales.canalPorDefecto')}</Label>
              <Select value={settings.default_channel_id ?? ''} onValueChange={(v) => set({ default_channel_id: v })} disabled={!canEdit}>
                <SelectTrigger id="wa-default" className="bg-white dark:bg-gray-900"><SelectValue placeholder={t('canales.primerCanalActivo')} /></SelectTrigger>
                <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id} disabled={c.status !== 'active'}>{c.name} · {PROVIDER_LABELS[c.provider].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('canales.limiteWaba')}</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void checkLimit()} disabled={checking}>{checking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}{t('canales.consultar')}</Button>
                {limit && <span className="text-xs">{limit.error ? limit.error : limit.tier ? t('canales.nivel', { nivel: limit.tier, limite: limit.limit != null ? String(limit.limit) : t('canales.ilimitado') }) : t('canales.desconocido')}</span>}
              </div>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-gray-500"><th className="py-1">{t('tabla.canal')}</th><th>{t('tabla.tipo')}</th><th>{t('tabla.plantillas')}</th><th>{t('tabla.adjuntos')}</th><th>{t('tabla.textoLibre')}</th><th>{t('tabla.estado')}</th></tr></thead>
            <tbody>{channels.map((c) => <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700"><td className="py-1">{c.name}{c.is_default && <Badge variant="outline" className="ml-1 text-[10px]">{t('tabla.porDefecto')}</Badge>}</td><td>{PROVIDER_LABELS[c.provider].label}</td><td>{c.capabilities.templates ? t('tabla.si') : t('tabla.no')}</td><td>{c.capabilities.media ? t('tabla.si') : t('tabla.no')}</td><td>{c.capabilities.free_text ? t('tabla.siVentana') : t('tabla.no')}</td><td>{c.status}</td></tr>)}{channels.length === 0 && <tr><td colSpan={6} className="py-2 text-gray-500">{t('tabla.vacio')}</td></tr>}</tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader><CardTitle className="text-base">{t('consentimiento.titulo')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Chips label={t('consentimiento.palabrasBaja')} value={settings.optout_keywords} onChange={(v) => set({ optout_keywords: v })} disabled={!canEdit} />
          <Chips label={t('consentimiento.palabrasAlta')} value={settings.optin_keywords} onChange={(v) => set({ optin_keywords: v })} disabled={!canEdit} />
          <div className="space-y-2">
            <Label className="text-xs">{t('consentimiento.horario')}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={!!hours} disabled={!canEdit} onChange={(e) => set({ allowed_hours: e.target.checked ? { tz: 'America/Bogota', days: [1, 2, 3, 4, 5, 6], from: '08:00', to: '20:00' } : null })} />{t('consentimiento.activo')}</label>
              {hours && (
                <>
                  <Input type="time" aria-label={t('consentimiento.desde')} value={hours.from} disabled={!canEdit} onChange={(e) => set({ allowed_hours: { ...hours, from: e.target.value } })} className="h-8 w-28 text-xs bg-white dark:bg-gray-900" />
                  <span className="text-xs">{t('consentimiento.a')}</span>
                  <Input type="time" aria-label={t('consentimiento.hasta')} value={hours.to} disabled={!canEdit} onChange={(e) => set({ allowed_hours: { ...hours, to: e.target.value } })} className="h-8 w-28 text-xs bg-white dark:bg-gray-900" />
                  <Input aria-label={t('consentimiento.zonaHoraria')} value={hours.tz} disabled={!canEdit} onChange={(e) => set({ allowed_hours: { ...hours, tz: e.target.value } })} className="h-8 w-40 text-xs bg-white dark:bg-gray-900" />
                  <div className="flex gap-1">{DAYS.map((d, i) => <button key={d} type="button" disabled={!canEdit} aria-pressed={hours.days.includes(i)} onClick={() => set({ allowed_hours: { ...hours, days: hours.days.includes(i) ? hours.days.filter((x) => x !== i) : [...hours.days, i].sort() } })} className={`text-[11px] px-2 py-1 rounded border ${hours.days.includes(i) ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-200 dark:border-gray-700'}`}>{t(d)}</button>)}</div>
                </>
              )}
            </div>
            <p className="text-[11px] text-gray-500">{t('consentimiento.fueraHorario')}</p>
          </div>
          <div>
            <Label htmlFor="wa-daily" className="text-xs">{t('consentimiento.limiteDiario')}</Label>
            <Input id="wa-daily" type="number" min={1} value={settings.daily_limit ?? ''} disabled={!canEdit} onChange={(e) => set({ daily_limit: e.target.value ? Number(e.target.value) : null })} className="h-8 w-40 text-xs bg-white dark:bg-gray-900" />
          </div>
          <div>
            <Label htmlFor="wa-country" className="text-xs">{t('consentimiento.indicativo')}</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500" aria-hidden="true">+</span>
              <Input
                id="wa-country"
                inputMode="numeric"
                maxLength={4}
                placeholder="57"
                aria-describedby="wa-country-help"
                value={settings.default_country_code ?? ''}
                disabled={!canEdit}
                onChange={(e) => set({ default_country_code: e.target.value.replace(/\D/g, '').slice(0, 4) || null })}
                className="h-8 w-24 text-xs bg-white dark:bg-gray-900"
              />
            </div>
            <p id="wa-country-help" className="text-[11px] text-gray-500">{t('consentimiento.indicativoAyuda')}</p>
          </div>
        </CardContent>
      </Card>
      {canEdit && <div className="flex justify-end"><Button onClick={() => void save()} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}{t('guardar')}</Button></div>}
    </div>
  );
}

export default WhatsAppTab;
