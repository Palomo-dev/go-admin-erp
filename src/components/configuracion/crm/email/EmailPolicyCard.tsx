'use client';

/**
 * Política de remitente sin dominio verificado + tracking en transaccionales
 * (PATCH /api/email/settings, admin).
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import type { EmailSettings } from '@/components/crm/email/emailApi';

type Policy = EmailSettings['email_fallback_policy'];

/** Políticas en orden; etiqueta y ayuda salen de `politicas.<valor>`. */
const POLICIES: Policy[] = ['global_with_notice', 'global_silent', 'block'];

interface Props {
  settings: EmailSettings;
  onSave: (body: Partial<Pick<EmailSettings, 'email_fallback_policy' | 'email_tracking_transactional'>>) => Promise<boolean | null>;
  busy: boolean;
  canEdit: boolean;
}

export function EmailPolicyCard({ settings, onSave, busy, canEdit }: Props) {
  const t = useTranslations('configuracionTextos.emailPolicyCard');
  const [policy, setPolicy] = useState<Policy>(settings.email_fallback_policy);
  const [tracking, setTracking] = useState(settings.email_tracking_transactional);
  useEffect(() => { setPolicy(settings.email_fallback_policy); setTracking(settings.email_tracking_transactional); }, [settings]);
  const dirty = policy !== settings.email_fallback_policy || tracking !== settings.email_tracking_transactional;

  return (
    <Card className="dark:border-gray-700 dark:bg-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> {t('titulo')}</CardTitle>
        <CardDescription>
          {settings.global_sender
            ? t.rich('remitenteGlobal', { remitente: `${settings.global_sender.from_name} <noreply@${settings.global_sender.domain}>`, code: (c) => <code>{c}</code> })
            : t('sinRemitenteGlobal')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset disabled={!canEdit} className="space-y-3">
          <RadioGroup value={policy} onValueChange={(v) => setPolicy(v as Policy)} aria-label={t('aria')}>
            {POLICIES.map((p) => (
              <div key={p} className="flex items-start gap-2 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                <RadioGroupItem value={p} id={`pol-${p}`} className="mt-0.5" />
                <div>
                  <Label htmlFor={`pol-${p}`} className="text-sm text-gray-900 dark:text-gray-100">{t(`politicas.${p}.etiqueta`)}</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t(`politicas.${p}.ayuda`)}</p>
                </div>
              </div>
            ))}
          </RadioGroup>
          <div className="flex items-center justify-between rounded-md border border-gray-200 p-3 dark:border-gray-700">
            <div>
              <Label htmlFor="trk-transactional" className="text-sm text-gray-900 dark:text-gray-100">{t('tracking.etiqueta')}</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('tracking.ayuda')}</p>
            </div>
            <Switch id="trk-transactional" checked={tracking} onCheckedChange={setTracking} />
          </div>
        </fieldset>
        {canEdit && (
          <div className="flex justify-end">
            <Button type="button" size="sm" disabled={!dirty || busy} onClick={() => onSave({ email_fallback_policy: policy, email_tracking_transactional: tracking })} className="gap-1">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />} {t('guardar')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
