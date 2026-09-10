'use client';

/**
 * Remitente y tracking de un dominio (PATCH /api/email/domains/[id]):
 * from_name, from_email, reply_to, aperturas/clics, receiving, DMARC.
 */

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { EmailDomain } from '@/lib/services/crm/email/types';

interface Props {
  domain: EmailDomain;
  onSave: (body: Record<string, unknown>) => Promise<EmailDomain | null>;
  busy: boolean;
  canEdit: boolean;
}

export function DomainSendersForm({ domain, onSave, busy, canEdit }: Props) {
  const [fromName, setFromName] = useState(domain.from_name ?? '');
  const [fromEmail, setFromEmail] = useState(domain.from_email);
  const [replyTo, setReplyTo] = useState(domain.reply_to ?? '');
  const [openTracking, setOpenTracking] = useState(domain.open_tracking);
  const [clickTracking, setClickTracking] = useState(domain.click_tracking);
  const [receiving, setReceiving] = useState(domain.receiving_enabled);
  const [dmarc, setDmarc] = useState(domain.dmarc_configured);

  useEffect(() => {
    setFromName(domain.from_name ?? ''); setFromEmail(domain.from_email); setReplyTo(domain.reply_to ?? '');
    setOpenTracking(domain.open_tracking); setClickTracking(domain.click_tracking); setReceiving(domain.receiving_enabled); setDmarc(domain.dmarc_configured);
  }, [domain]);

  const emailOk = fromEmail.trim().toLowerCase().endsWith(`@${domain.domain}`) && /^[^\s@]+@[^\s@]+$/.test(fromEmail.trim());
  const replyOk = !replyTo.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo.trim());
  const dirty = fromName !== (domain.from_name ?? '') || fromEmail !== domain.from_email || replyTo !== (domain.reply_to ?? '') || openTracking !== domain.open_tracking || clickTracking !== domain.click_tracking || receiving !== domain.receiving_enabled || dmarc !== domain.dmarc_configured;

  const save = () => onSave({
    from_name: fromName.trim(), from_email: fromEmail.trim().toLowerCase(), reply_to: replyTo.trim() || null,
    ...(openTracking !== domain.open_tracking ? { open_tracking: openTracking } : {}),
    ...(clickTracking !== domain.click_tracking ? { click_tracking: clickTracking } : {}),
    ...(receiving !== domain.receiving_enabled ? { receiving_enabled: receiving } : {}),
    ...(dmarc !== domain.dmarc_configured ? { dmarc_configured: dmarc } : {}),
  });

  return (
    <fieldset disabled={!canEdit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`fn-${domain.id}`} className="text-xs">Nombre del remitente</Label>
          <Input id={`fn-${domain.id}`} value={fromName} onChange={(e) => setFromName(e.target.value)} className="h-8 text-sm dark:bg-gray-800" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`fe-${domain.id}`} className="text-xs">Correo remitente</Label>
          <Input id={`fe-${domain.id}`} value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} aria-invalid={!emailOk} className="h-8 text-sm dark:bg-gray-800" />
          {!emailOk && <p className="text-[11px] text-red-600 dark:text-red-400">Debe pertenecer a @{domain.domain}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`rt-${domain.id}`} className="text-xs">Responder a</Label>
          <Input id={`rt-${domain.id}`} value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="Correo del vendedor" aria-invalid={!replyOk} className="h-8 text-sm dark:bg-gray-800" />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"><Label htmlFor={`rx-${domain.id}`} className="text-xs">Recibir respuestas (crm+id@{domain.domain})</Label><Switch id={`rx-${domain.id}`} checked={receiving} onCheckedChange={setReceiving} /></div>
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"><Label htmlFor={`dm-${domain.id}`} className="text-xs">DMARC publicado</Label><Switch id={`dm-${domain.id}`} checked={dmarc} onCheckedChange={setDmarc} /></div>
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"><Label htmlFor={`ot-${domain.id}`} className="text-xs">Aperturas (solo marketing/secuencias)</Label><Switch id={`ot-${domain.id}`} checked={openTracking} onCheckedChange={setOpenTracking} /></div>
        <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"><Label htmlFor={`ct-${domain.id}`} className="text-xs">Clics (solo marketing/secuencias)</Label><Switch id={`ct-${domain.id}`} checked={clickTracking} onCheckedChange={setClickTracking} /></div>
      </div>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={save} disabled={!dirty || !emailOk || !replyOk || busy} className="gap-1">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />} Guardar remitente
        </Button>
      </div>
    </fieldset>
  );
}
