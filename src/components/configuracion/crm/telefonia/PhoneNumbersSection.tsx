'use client';

/**
 * PhoneNumbersSection — números de la org (FASE-03 §5.2): tabla (e164,
 * etiqueta, asignado, capacidades, primario, activo), "Importar de Twilio"
 * (POST /api/crm/phone-numbers/import) y caller id de salida.
 */

import { useState } from 'react';
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
  const [importing, setImporting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } catch (err) {
      toast({ title: 'No se pudo actualizar el número', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const r = await onImport();
      toast({
        title: r.created > 0 ? `${r.created} número(s) importado(s)` : 'Números sincronizados',
        description: r.syncErrors.length ? `Webhooks: ${r.synced} ok · ${r.syncErrors.length} con error` : `Webhooks configurados en ${r.synced} número(s)`,
        variant: r.syncErrors.length ? 'destructive' : 'default',
      });
    } catch (err) {
      toast({ title: 'No se pudo importar', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <section aria-labelledby="tel-numbers-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="tel-numbers-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Números
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {configured?.account ? `Cuenta Twilio (${configured.source === 'org' ? 'clave propia' : 'plataforma'})` : 'Sin cuenta Twilio configurada (pestaña Proveedores e IA)'}
            {' · '}Cuentas trial solo marcan a Verified Caller IDs.
          </p>
        </div>
        <Button onClick={() => void handleImport()} disabled={!canEdit || importing || !configured?.account} size="sm" variant="outline">
          {importing ? <Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden="true" /> : <Download size={14} className="mr-1.5" aria-hidden="true" />}
          Importar de Twilio
        </Button>
      </div>

      {numbers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
          <Phone size={28} className="mx-auto mb-2 text-gray-400" aria-hidden="true" />
          <p className="text-sm text-gray-700 dark:text-gray-200">Aún no hay números en esta organización.</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Compra un número en Twilio (Colombia exige bundle regulatorio) y pulsa &quot;Importar de Twilio&quot;; se cablearán los webhooks de voz automáticamente.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left">Número</th>
                <th className="px-3 py-2 text-left">Etiqueta</th>
                <th className="px-3 py-2 text-left">Asignado a</th>
                <th className="px-3 py-2 text-left">Capacidades</th>
                <th className="px-3 py-2 text-center">Primario</th>
                <th className="px-3 py-2 text-center">Activo</th>
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
                        aria-label={`Asignar ${n.e164}`}
                        onChange={(e) => void run(n.id, () => onPatchNumber(n.id, { assigned_user_id: e.target.value || null }))}
                        className={selectClass}
                      >
                        <option value="">Ring group (todos)</option>
                        {members.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {caps.voice && <Badge variant="secondary" className="text-[10px]">voz</Badge>}
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
                        aria-label={`Marcar ${n.e164} como primario`}
                        onChange={() => void run(n.id, () => onPatchNumber(n.id, { is_primary: true }))}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Switch checked={n.is_active} disabled={!canEdit || busy} aria-label={`Activar ${n.e164}`} onCheckedChange={(v) => void run(n.id, () => onPatchNumber(n.id, { is_active: v }))} />
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
          <Label htmlFor="tel-caller-id">Caller ID de salida</Label>
          <select
            id="tel-caller-id"
            value={settings.voice_caller_id ?? ''}
            disabled={!canEdit}
            onChange={(e) => void onPatchSettings({ voice_caller_id: e.target.value || null }).catch((err) => toast({ title: 'No se pudo guardar', description: err.message, variant: 'destructive' }))}
            className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 disabled:opacity-60"
          >
            <option value="">Automático (número primario activo)</option>
            {numbers.filter((n) => n.is_active).map((n) => (
              <option key={n.id} value={n.e164}>
                {n.e164}
                {n.label ? ` · ${n.label}` : ''}
              </option>
            ))}
            {settings.phone_number && !numbers.some((n) => n.e164 === settings.phone_number) && <option value={settings.phone_number}>{settings.phone_number} (comm_settings)</option>}
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400">Debe ser un número Twilio de la org o un Verified Caller ID.</p>
        </div>
        <div className="space-y-1">
          <Label>Minutos de voz</Label>
          <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{settings.voice_minutes_remaining === null ? '∞' : settings.voice_minutes_remaining}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Se reserva 1 minuto al marcar y se liquida el resto al colgar (pestaña Créditos).</p>
        </div>
      </div>
    </section>
  );
}
