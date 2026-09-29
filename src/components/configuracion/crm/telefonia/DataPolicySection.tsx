'use client';

/**
 * Política de tratamiento de datos (Ley 1581 de 2012) — compuerta de campañas.
 *
 * `comm_settings.data_policy_url`: sin ella la cola de campañas del agente de
 * voz no marca (`runCampaignQueue`), y con ella el agente la cita cuando el
 * prospecto pregunta cómo tratamos sus datos. Aquí solo se guarda la URL; la
 * política la redacta y publica la organización. El servidor valida el formato
 * (https) y el permiso: esta pantalla no decide nada.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { FormField } from '@/components/kit/FormField';
import type { TelephonySettingsDto } from './useTelephonySettings';

interface Props {
  settings: TelephonySettingsDto;
  canEdit: boolean;
  onPatchSettings: (patch: Partial<TelephonySettingsDto>) => Promise<TelephonySettingsDto>;
}

const HTTPS_RE = /^https:\/\/\S+$/;

export function DataPolicySection({ settings, canEdit, onPatchSettings }: Props) {
  const t = useTranslations('vozCampanasDisparo.politicaDatos');
  const [valor, setValor] = useState(settings.data_policy_url ?? '');
  const [saving, setSaving] = useState(false);
  const limpio = valor.trim();
  const invalida = limpio !== '' && !HTTPS_RE.test(limpio);
  const sinCambios = limpio === (settings.data_policy_url ?? '');

  const guardar = async () => {
    setSaving(true);
    try {
      await onPatchSettings({ data_policy_url: limpio || null });
      toast({ title: limpio ? t('guardada') : t('quitada') });
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
    <section aria-labelledby="tel-politica-datos-titulo" className="space-y-3">
      <h3 id="tel-politica-datos-titulo" className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {t('titulo')}
      </h3>
      <FormField etiqueta={t('etiqueta')} ayuda={t('ayuda')} error={invalida ? t('invalida') : null} obligatorio>
        <Input
          type="url"
          inputMode="url"
          placeholder="https://"
          value={valor}
          disabled={!canEdit || saving}
          onChange={(e) => setValor(e.target.value)}
        />
      </FormField>
      {!settings.data_policy_url && (
        <p role="status" className="text-xs text-amber-800 dark:text-amber-200">
          {t('faltante')}
        </p>
      )}
      <Button
        size="sm"
        className="w-full sm:w-auto"
        disabled={!canEdit || saving || invalida || sinCambios}
        onClick={() => void guardar()}
      >
        {saving ? t('guardando') : t('guardar')}
      </Button>
    </section>
  );
}
