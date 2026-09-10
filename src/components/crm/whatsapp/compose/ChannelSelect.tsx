'use client';

import { Cloud, QrCode, Radio } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { ChannelSummary } from '@/lib/services/crm/whatsapp/types';

export const PROVIDER_LABELS: Record<ChannelSummary['provider'], { label: string; Icon: typeof Cloud; hint: string }> = {
  meta: { label: 'Cloud API', Icon: Cloud, hint: 'Plantillas, adjuntos y texto en ventana de 24 h' },
  twilio: { label: 'Twilio', Icon: Radio, hint: 'Plantillas por Content API (+ fee por mensaje)' },
  baileys: { label: 'QR', Icon: QrCode, hint: 'Solo texto e imágenes; sin plantillas. Riesgo de bloqueo por volumen' },
};

export function ChannelSelect({ channels, value, onChange, loading, disabled, id = 'wa-channel' }: { channels: ChannelSummary[]; value: string | null; onChange: (id: string) => void; loading?: boolean; disabled?: boolean; id?: string }) {
  const current = channels.find((c) => c.id === value);
  const meta = current ? PROVIDER_LABELS[current.provider] : null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">Canal</Label>
      {loading ? (
        <Skeleton className="h-9 w-full" />
      ) : channels.length === 0 ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">No hay canales de WhatsApp. Conéctalo en Chat → Canales.</p>
      ) : (
        <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger id={id} className="h-9 bg-white dark:bg-gray-900"><SelectValue placeholder="Selecciona un canal" /></SelectTrigger>
          <SelectContent>
            {channels.map((c) => {
              const p = PROVIDER_LABELS[c.provider];
              return (
                <SelectItem key={c.id} value={c.id} disabled={c.status !== 'active'}>
                  <span className="inline-flex items-center gap-2">
                    <p.Icon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    {c.name} · {p.label}{c.status !== 'active' ? ` (${c.status})` : ''}{c.is_default ? ' · por defecto' : ''}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}
      {meta && <p className="text-[11px] text-gray-500 dark:text-gray-400">{meta.hint}</p>}
    </div>
  );
}
