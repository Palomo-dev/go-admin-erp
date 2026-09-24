'use client';

/**
 * Interruptor del agente IA de voz (F6 · r-voz 2026-09-23).
 *
 * `comm_settings.voice_agent_enabled` es `DEFAULT false` (verificado por MCP) y
 * el despachador de campañas se niega a marcar mientras esté en false. No había
 * NINGUNA pantalla que lo pusiera en true: se podía crear el agente, la campaña
 * y activarla, y el agente no llegaba a llamar nunca. Aquí se enciende.
 *
 * El interruptor NO salta ninguna otra barrera: sigue haciendo falta un número
 * de salida propio, minutos de voz, el agente activo y el consentimiento del
 * cliente. El panel de campañas («Agentes IA de voz › Campañas») dice cuál falta.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import type { TelephonySettingsDto } from './useTelephonySettings';

interface Props {
  settings: TelephonySettingsDto;
  canEdit: boolean;
  onPatchSettings: (patch: Partial<TelephonySettingsDto>) => Promise<TelephonySettingsDto>;
}

export function VoiceAgentSwitchSection({ settings, canEdit, onPatchSettings }: Props) {
  const t = useTranslations('vozCampanasDisparo.interruptor');
  const [saving, setSaving] = useState(false);

  const cambiar = async (valor: boolean) => {
    setSaving(true);
    try {
      await onPatchSettings({ voice_agent_enabled: valor });
      toast({ title: valor ? t('encendido') : t('apagado') });
    } catch (err) {
      toast({
        title: t('errorGuardar'),
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="tel-agente-voz-titulo" className="space-y-2">
      <h3
        id="tel-agente-voz-titulo"
        className="text-base font-semibold text-gray-900 dark:text-gray-100"
      >
        {t('titulo')}
      </h3>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor="tel-agente-voz" className="cursor-pointer">
            {t('etiqueta')}
          </Label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('ayuda')}</p>
        </div>
        <Switch
          id="tel-agente-voz"
          checked={settings.voice_agent_enabled === true}
          disabled={!canEdit || saving}
          onCheckedChange={(v) => void cambiar(v)}
          aria-label={t('etiqueta')}
        />
      </div>
    </section>
  );
}
