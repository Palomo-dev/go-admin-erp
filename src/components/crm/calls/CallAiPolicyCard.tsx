'use client';

/**
 * CallAiPolicyCard — política de inteligencia de llamadas por organización.
 * Lee/escribe `provider_configs.settings` (categorías `stt` y `analysis`) vía
 * GET/PUT /api/crm/config/providers (REG). Montable en Configuración › CRM › Proveedores.
 * Campos: aplicar acciones (auto|suggest), proveedor STT, proveedor de análisis,
 * modelo, idioma, transcripción por canal (dual), auto-transcribir/analizar,
 * umbral de confianza para mover etapa, duración mínima.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';

interface ProviderItem {
  category: string;
  provider: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  configured: boolean;
  platform_available: boolean;
}

interface FormState {
  sttProvider: string;
  analysisProvider: string;
  analysisModel: string;
  language: string;
  dualTranscribe: boolean;
  autoTranscribe: boolean;
  autoAnalyze: boolean;
  apply: 'auto' | 'suggest';
  threshold: number;
  minDuration: number;
}

const DEFAULTS: FormState = { sttProvider: 'elevenlabs', analysisProvider: 'google', analysisModel: 'gemini-3.8-flash', language: 'spa', dualTranscribe: true, autoTranscribe: true, autoAnalyze: true, apply: 'suggest', threshold: 0.8, minDuration: 5 };

const selectCls = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200';

export function CallAiPolicyCard({ className }: { className?: string }) {
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [items, setItems] = useState<ProviderItem[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/crm/config/providers');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo cargar la configuración');
      const all: ProviderItem[] = json.items ?? [];
      setItems(all.filter((i) => i.category === 'stt' || i.category === 'analysis'));
      setCanEdit(!!json.can_edit);
      const stt = all.filter((i) => i.category === 'stt' && i.is_active).sort((a, b) => Number(b.configured) - Number(a.configured))[0];
      const an = all.filter((i) => i.category === 'analysis' && i.is_active).sort((a, b) => Number(b.configured) - Number(a.configured))[0];
      const s = (stt?.settings ?? {}) as Record<string, unknown>;
      const a = (an?.settings ?? {}) as Record<string, unknown>;
      setForm({
        sttProvider: stt?.provider ?? DEFAULTS.sttProvider,
        analysisProvider: an?.provider ?? DEFAULTS.analysisProvider,
        analysisModel: typeof a.model === 'string' ? a.model : DEFAULTS.analysisModel,
        language: typeof s.language_code === 'string' ? s.language_code : DEFAULTS.language,
        dualTranscribe: s.dual_transcribe !== false,
        autoTranscribe: s.auto_transcribe !== false,
        autoAnalyze: a.auto_analyze !== false,
        apply: a.auto_apply === 'auto' ? 'auto' : 'suggest',
        threshold: typeof a.stage_confidence_threshold === 'number' ? a.stage_confidence_threshold : DEFAULTS.threshold,
        minDuration: typeof s.min_duration_seconds === 'number' ? s.min_duration_seconds : DEFAULTS.minDuration,
      });
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const put = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/crm/config/providers', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar');
  };

  const save = async () => {
    setSaving(true);
    try {
      await put({
        category: 'stt',
        provider: form.sttProvider,
        is_active: true,
        priority: 1,
        settings: { language_code: form.language, dual_transcribe: form.dualTranscribe, auto_transcribe: form.autoTranscribe, min_duration_seconds: form.minDuration },
      });
      await put({
        category: 'analysis',
        provider: form.analysisProvider,
        is_active: true,
        priority: 1,
        settings: { model: form.analysisModel, auto_apply: form.apply, auto_analyze: form.autoAnalyze, stage_confidence_threshold: form.threshold },
      });
      toast({ title: 'Política guardada' });
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const availability = (cat: string, prov: string) => {
    const it = items.find((i) => i.category === cat && i.provider === prov);
    if (!it) return '';
    return it.configured ? ' (credenciales propias)' : it.platform_available ? ' (plataforma)' : ' (sin credenciales)';
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles size={16} className="text-purple-600 dark:text-purple-400" /> Inteligencia de llamadas</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Cargando…</p>
        ) : (
          <fieldset disabled={!canEdit || saving} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="mb-1 block">Aplicar acciones del análisis</Label>
              <div className="flex gap-4 text-sm" role="radiogroup" aria-label="Política de aplicación">
                {(['suggest', 'auto'] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2">
                    <input type="radio" name="apply" value={v} checked={form.apply === v} onChange={() => setForm((f) => ({ ...f, apply: v }))} />
                    {v === 'suggest' ? 'Sugerir (el vendedor aplica)' : 'Automático (mover etapa y crear tareas)'}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="stt-provider" className="mb-1 block">Proveedor de transcripción</Label>
              <select id="stt-provider" className={selectCls} value={form.sttProvider} onChange={(e) => setForm((f) => ({ ...f, sttProvider: e.target.value }))}>
                <option value="elevenlabs">ElevenLabs Scribe v2{availability('stt', 'elevenlabs')}</option>
                <option value="google">Gemini 3.8 Flash{availability('stt', 'google')}</option>
                <option value="openai">OpenAI gpt-transcribe{availability('stt', 'openai')}</option>
              </select>
            </div>
            <div>
              <Label htmlFor="an-provider" className="mb-1 block">Proveedor de análisis</Label>
              <select id="an-provider" className={selectCls} value={form.analysisProvider} onChange={(e) => setForm((f) => ({ ...f, analysisProvider: e.target.value, analysisModel: e.target.value === 'openai' ? 'gpt-5.6-luna' : 'gemini-3.8-flash' }))}>
                <option value="google">Gemini{availability('analysis', 'google')}</option>
                <option value="openai">OpenAI{availability('analysis', 'openai')}</option>
              </select>
            </div>
            <div>
              <Label htmlFor="an-model" className="mb-1 block">Modelo de análisis</Label>
              <Input id="an-model" value={form.analysisModel} onChange={(e) => setForm((f) => ({ ...f, analysisModel: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="lang" className="mb-1 block">Idioma</Label>
              <select id="lang" className={selectCls} value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
                <option value="spa">Español (spa)</option>
                <option value="eng">Inglés (eng)</option>
                <option value="por">Portugués (por)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="threshold" className="mb-1 block">Umbral para mover etapa ({Math.round(form.threshold * 100)} %)</Label>
              <input id="threshold" type="range" min={50} max={100} step={5} value={Math.round(form.threshold * 100)} onChange={(e) => setForm((f) => ({ ...f, threshold: Number(e.target.value) / 100 }))} className="w-full accent-blue-600" />
            </div>
            <div>
              <Label htmlFor="min-dur" className="mb-1 block">Duración mínima (s)</Label>
              <Input id="min-dur" type="number" min={0} max={600} value={form.minDuration} onChange={(e) => setForm((f) => ({ ...f, minDuration: Number(e.target.value) }))} />
            </div>
            {([
              ['dualTranscribe', 'Transcribir por canal (grabación dual: roles exactos)'],
              ['autoTranscribe', 'Transcribir automáticamente al terminar la llamada'],
              ['autoAnalyze', 'Analizar automáticamente al transcribir'],
            ] as const).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-2 rounded-md border border-gray-100 px-3 py-2 dark:border-gray-700 sm:col-span-2">
                <Label htmlFor={`sw-${k}`} className="text-sm">{label}</Label>
                <Switch id={`sw-${k}`} checked={form[k]} onCheckedChange={(v) => setForm((f) => ({ ...f, [k]: v }))} />
              </div>
            ))}
            <div className="flex items-center justify-between sm:col-span-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">{canEdit ? 'Se guarda en provider_configs (stt / analysis).' : 'Solo administradores pueden modificar la política.'}</p>
              <Button type="button" onClick={save} disabled={!canEdit || saving}>
                {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />} Guardar
              </Button>
            </div>
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}

export default CallAiPolicyCard;
