'use client';

/**
 * PhoneNumbersSection — números de la org (FASE-03 §5.2): tabla (e164,
 * etiqueta, asignado, capacidades, primario, activo), "Importar de Twilio"
 * (POST /api/crm/phone-numbers/import) y caller id de salida.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Loader2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import type { PhoneNumber } from '@/lib/services/crm/callManagementService';
import type { OrgMember, TelephonySettingsDto, TelephonyConfigured } from './useTelephonySettings';

interface Props {
  numbers: PhoneNumber[];
  members: OrgMember[];
  settings: TelephonySettingsDto;
  configured: TelephonyConfigured | null;
  canEdit: boolean;
  onImport: () => Promise<{ created: number; synced: number; syncErrors: string[] }>;
  onPatchNumber: (id: string, patch: { label?: string | null; assigned_user_id?: string | null; is_primary?: boolean; is_active?: boolean }) => Promise<void>;
  onPatchSettings: (patch: Partial<TelephonySettingsDto>) => Promise<TelephonySettingsDto>;
}

const selectClass = 'h-8 rounded-md border border-gray-200 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 disabled:opacity-60';

export function PhoneNumbersSection({ numbers, members, settings, configured, canEdit, onImport, onPatchNumber, onPatchSettings }: Props) {
  const t = useTranslations('configuracionTextos.phoneNumbersSection');
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } catch (err) {
      toast({ title: t('toasts.noActualizar'), description: err instanceof Error ? err.message : t('toasts.error'), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const r = await onImport();
      toast({
        title: r.created > 0 ? t('toasts.importados', { n: r.created }) : t('toasts.sincronizados'),
        description: r.syncErrors.length ? t('toasts.webhooksConError', { ok: r.synced, errores: r.syncErrors.length }) : t('toasts.webhooksConfigurados', { n: r.synced }),
        variant: r.syncErrors.length ? 'destructive' : 'default',
      });
    } catch (err) {
      toast({ title: t('toasts.noImportar'), description: err instanceof Error ? err.message : t('toasts.error'), variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <section aria-labelledby="tel-numbers-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="tel-numbers-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('titulo')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {configured?.account ? (configured.source === 'org' ? t('cuentaPropia') : t('cuentaPlataforma')) : t('sinCuenta')}
            {' · '}{t('avisoTrial')}
          </p>
        </div>
        <Button onClick={() => void handleImport()} disabled={!canEdit || importing || !configured?.account} size="sm" variant="outline">
          {importing ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden="true" /> : <Download size={14} className="mr-1.5" aria-hidden="true" />}
          {t('importar')}
        </Button>
      </div>

      {numbers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
          <Phone size={28} className="mx-auto mb-2 text-gray-400" aria-hidden="true" />
          <p className="text-sm text-gray-700 dark:text-gray-200">{t('vacio.titulo')}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('vacio.ayuda')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left">{t('columnas.numero')}</th>
                <th className="px-3 py-2 text-left">{t('columnas.etiqueta')}</th>
                <th className="px-3 py-2 text-left">{t('columnas.asignado')}</th>
                <th className="px-3 py-2 text-left">{t('columnas.capacidades')}</th>
                <th className="px-3 py-2 text-center">{t('columnas.primario')}</th>
                <th className="px-3 py-2 text-center">{t('columnas.activo')}</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((n) => {
                const caps = (n.capabilities ?? {}) as Record<string, boolean>;
                const busy = busyId === n.id;
                return (
                  <tr key={n.id} className="border-t border-gray-200 dark:border-gray-700">
                    <td className="px-3 py-2 font-mono text-gray-900 dark:text-gray-100">{n.e164}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{n.label ?? '—'}</td>
                    <td className="px-3 py-2">
                      <select
                        value={n.assigned_user_id ?? ''}
                        disabled={!canEdit || busy}
                        aria-label={t('aria.asignar', { numero: n.e164 })}
                        onChange={(e) => void run(n.id, () => onPatchNumber(n.id, { assigned_user_id: e.target.value || null }))}
                        className={selectClass}
                      >
                        <option value="">{t('ringGroup')}</option>
                        {members.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {caps.voice && <Badge variant="secondary" className="text-[10px]">{t('capacidadVoz')}</Badge>}
                        {caps.sms && <Badge variant="secondary" className="text-[10px]">sms</Badge>}
                        {caps.mms && <Badge variant="secondary" className="text-[10px]">mms</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="radio"
                        name="primary-number"
                        checked={n.is_primary}
                        disabled={!canEdit || busy}
                        aria-label={t('aria.primario', { numero: n.e164 })}
                        onChange={() => void run(n.id, () => onPatchNumber(n.id, { is_primary: true }))}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Switch checked={n.is_active} disabled={!canEdit || busy} aria-label={t('aria.activar', { numero: n.e164 })} onCheckedChange={(v) => void run(n.id, () => onPatchNumber(n.id, { is_active: v }))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tel-caller-id">{t('callerId.etiqueta')}</Label>
          <select
            id="tel-caller-id"
            value={settings.voice_caller_id ?? ''}
            disabled={!canEdit}
            onChange={(e) => void onPatchSettings({ voice_caller_id: e.target.value || null }).catch((err) => toast({ title: t('toasts.noGuardar'), description: err.message, variant: 'destructive' }))}
            className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 disabled:opacity-60"
          >
            <option value="">{t('callerId.automatico')}</option>
            {numbers.filter((n) => n.is_active).map((n) => (
              <option key={n.id} value={n.e164}>
                {n.e164}
                {n.label ? ` · ${n.label}` : ''}
              </option>
            ))}
            {settings.phone_number && !numbers.some((n) => n.e164 === settings.phone_number) && <option value={settings.phone_number}>{settings.phone_number} (comm_settings)</option>}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('callerId.ayuda')}</p>
        </div>
        <div className="space-y-1">
          <Label>{t('minutos.etiqueta')}</Label>
          <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{settings.voice_minutes_remaining === null ? '∞' : settings.voice_minutes_remaining}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('minutos.ayuda')}</p>
        </div>
      </div>
    </section>
  );
}
