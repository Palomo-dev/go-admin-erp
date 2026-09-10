'use client';

/**
 * RecordingConsentSection — grabación, mensaje de consentimiento (≥20 chars
 * con grabación activa, D9), preview TTS (ElevenLabs si hay key; si no Web
 * Speech API), retención, timeout, concurrencia (FASE-03 §5.2).
 * Voz e idioma del <Say> (Polly es-MX) se muestran informativamente: viven en
 * provider_configs(voice).settings (consent_voice/consent_language).
 */

import { useRef, useState } from 'react';
import { Loader2, Play, Save, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import type { TelephonySettingsDto } from './useTelephonySettings';

interface Props {
  settings: TelephonySettingsDto;
  canEdit: boolean;
  onPatchSettings: (patch: Partial<TelephonySettingsDto>) => Promise<TelephonySettingsDto>;
}

const MIN_CONSENT = 20;

export function RecordingConsentSection({ settings, canEdit, onPatchSettings }: Props) {
  const [form, setForm] = useState({
    voice_recording_enabled: settings.voice_recording_enabled,
    voice_consent_message: settings.voice_consent_message,
    voice_recording_retention_days: settings.voice_recording_retention_days,
    voice_ring_timeout_seconds: settings.voice_ring_timeout_seconds,
    voice_max_concurrent_calls: settings.voice_max_concurrent_calls,
  });
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const consentLen = form.voice_consent_message.trim().length;
  const consentInvalid = form.voice_recording_enabled && consentLen < MIN_CONSENT;
  const dirty = JSON.stringify(form) !== JSON.stringify({
    voice_recording_enabled: settings.voice_recording_enabled,
    voice_consent_message: settings.voice_consent_message,
    voice_recording_retention_days: settings.voice_recording_retention_days,
    voice_ring_timeout_seconds: settings.voice_ring_timeout_seconds,
    voice_max_concurrent_calls: settings.voice_max_concurrent_calls,
  });

  const save = async () => {
    if (consentInvalid) return;
    setSaving(true);
    try {
      await onPatchSettings({ ...form, voice_consent_message: form.voice_consent_message.trim() });
      toast({ title: 'Telefonía guardada' });
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const stopPreview = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setPreviewing(false);
  };

  const preview = async () => {
    if (previewing) return stopPreview();
    const text = form.voice_consent_message.trim();
    if (!text) return;
    setPreviewing(true);
    try {
      const res = await fetch('/api/crm/settings/telephony/consent-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: settings.consent_voice, language: settings.consent_language }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audioRef.current = audio;
        audio.onended = () => setPreviewing(false);
        await audio.play();
        return;
      }
      if (res.status === 501 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = settings.consent_language || 'es-MX';
        u.onend = () => setPreviewing(false);
        window.speechSynthesis.speak(u);
        toast({ title: 'Preview con la voz del navegador', description: 'Configura ElevenLabs en Proveedores e IA para oír una voz neural.' });
        return;
      }
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    } catch (err) {
      setPreviewing(false);
      toast({ title: 'No se pudo reproducir', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    }
  };

  return (
    <section aria-labelledby="tel-recording-title" className="space-y-4">
      <h3 id="tel-recording-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
        Grabación y consentimiento
      </h3>

      <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <div>
          <Label htmlFor="tel-rec">Grabar llamadas (dual-channel)</Label>
          <p className="text-xs text-gray-500 dark:text-gray-400">El cliente oye el aviso antes de conectarse y queda en `call_consents`.</p>
        </div>
        <Switch id="tel-rec" checked={form.voice_recording_enabled} disabled={!canEdit} onCheckedChange={(v) => setForm((f) => ({ ...f, voice_recording_enabled: v }))} />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="tel-consent">Mensaje de consentimiento</Label>
          <span className={`text-xs ${consentInvalid ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {consentLen}/500{consentInvalid ? ` · mínimo ${MIN_CONSENT}` : ''}
          </span>
        </div>
        <Textarea
          id="tel-consent"
          rows={3}
          maxLength={500}
          value={form.voice_consent_message}
          disabled={!canEdit}
          aria-invalid={consentInvalid}
          onChange={(e) => setForm((f) => ({ ...f, voice_consent_message: e.target.value }))}
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>
            Voz: <strong>{settings.consent_voice}</strong> · Idioma: <strong>{settings.consent_language}</strong> (es-CO no existe en Twilio)
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => void preview()} disabled={!form.voice_consent_message.trim()} aria-pressed={previewing}>
            {previewing ? <Square size={12} className="mr-1" aria-hidden="true" /> : <Play size={12} className="mr-1" aria-hidden="true" />}
            {previewing ? 'Detener' : 'Escuchar'}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="tel-retention">Retención (días)</Label>
          <Input id="tel-retention" type="number" min={7} max={730} value={form.voice_recording_retention_days} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, voice_recording_retention_days: Number(e.target.value) }))} />
          <p className="text-xs text-gray-500 dark:text-gray-400">Se borran de Twilio y Storage al vencer (job diario).</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tel-timeout">Timeout de timbre (s)</Label>
          <Input id="tel-timeout" type="number" min={10} max={60} value={form.voice_ring_timeout_seconds} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, voice_ring_timeout_seconds: Number(e.target.value) }))} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tel-concurrent">Llamadas simultáneas</Label>
          <Input id="tel-concurrent" type="number" min={1} max={50} value={form.voice_max_concurrent_calls} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, voice_max_concurrent_calls: Number(e.target.value) }))} />
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={!dirty || saving || consentInvalid} size="sm">
            {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden="true" /> : <Save size={14} className="mr-1.5" aria-hidden="true" />}
            Guardar
          </Button>
        </div>
      )}
    </section>
  );
}
