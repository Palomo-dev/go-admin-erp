'use client';

/**
 * Alta de dominio de envío (POST /api/email/domains): crea el dominio en
 * Resend (+ API key sending_access) y devuelve los DNS a publicar.
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { EmailDomain, EmailDomainRegion } from '@/lib/services/crm/email/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: Record<string, unknown>) => Promise<EmailDomain | null>;
  busy: boolean;
}

const REGIONS: Array<{ value: EmailDomainRegion; label: string }> = [
  { value: 'us-east-1', label: 'Estados Unidos (us-east-1)' },
  { value: 'sa-east-1', label: 'Sudamérica (sa-east-1)' },
  { value: 'eu-west-1', label: 'Europa (eu-west-1)' },
  { value: 'ap-northeast-1', label: 'Asia (ap-northeast-1)' },
];

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

export function AddDomainDialog({ open, onOpenChange, onSubmit, busy }: Props) {
  const [domain, setDomain] = useState('');
  const [fromName, setFromName] = useState('');
  const [local, setLocal] = useState('ventas');
  const [replyTo, setReplyTo] = useState('');
  const [region, setRegion] = useState<EmailDomainRegion>('us-east-1');
  const [openTracking, setOpenTracking] = useState(false);
  const [clickTracking, setClickTracking] = useState(false);
  const [receiving, setReceiving] = useState(true);

  const domainOk = DOMAIN_RE.test(domain.trim());
  const localOk = /^[a-z0-9._-]+$/i.test(local.trim());
  const valid = domainOk && localOk && fromName.trim().length > 0;

  const submit = async () => {
    if (!valid) return;
    const r = await onSubmit({
      domain: domain.trim().toLowerCase(), from_name: fromName.trim(), from_email_local: local.trim().toLowerCase(), reply_to: replyTo.trim() || undefined,
      region, open_tracking: openTracking, click_tracking: clickTracking, receiving_enabled: receiving,
    });
    if (r) {
      onOpenChange(false);
      setDomain(''); setFromName(''); setLocal('ventas'); setReplyTo('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle>Añadir dominio de envío</DialogTitle>
          <DialogDescription>Recomendado: un subdominio dedicado (p. ej. <code>crm.tuempresa.com</code>). Necesitarás acceso al DNS.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="dom-domain" className="text-xs">Dominio *</Label>
            <Input id="dom-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="crm.tuempresa.com" aria-invalid={domain.length > 0 && !domainOk} className="dark:bg-gray-800" />
            {domain.length > 0 && !domainOk && <p className="text-xs text-red-600 dark:text-red-400">Dominio inválido</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="dom-from-name" className="text-xs">Nombre del remitente *</Label>
              <Input id="dom-from-name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Equipo comercial ACME" className="dark:bg-gray-800" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dom-local" className="text-xs">Usuario del remitente *</Label>
              <div className="flex items-center gap-1">
                <Input id="dom-local" value={local} onChange={(e) => setLocal(e.target.value)} className="dark:bg-gray-800" aria-invalid={!localOk} />
                <span className="text-xs text-gray-500">@{domainOk ? domain.trim().toLowerCase() : 'dominio'}</span>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dom-reply" className="text-xs">Responder a (opcional)</Label>
            <Input id="dom-reply" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="Por defecto: el correo del vendedor" className="dark:bg-gray-800" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Región</Label>
            <Select value={region} onValueChange={(v) => setRegion(v as EmailDomainRegion)}>
              <SelectTrigger aria-label="Región" className="dark:bg-gray-800"><SelectValue /></SelectTrigger>
              <SelectContent>{REGIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2 rounded-md border border-gray-200 p-3 dark:border-gray-700">
            <div className="flex items-center justify-between"><Label htmlFor="dom-receiving" className="text-xs">Recibir respuestas en el CRM (MX)</Label><Switch id="dom-receiving" checked={receiving} onCheckedChange={setReceiving} /></div>
            <div className="flex items-center justify-between"><Label htmlFor="dom-open" className="text-xs">Seguimiento de aperturas (marketing)</Label><Switch id="dom-open" checked={openTracking} onCheckedChange={setOpenTracking} /></div>
            <div className="flex items-center justify-between"><Label htmlFor="dom-click" className="text-xs">Seguimiento de clics (marketing)</Label><Switch id="dom-click" checked={clickTracking} onCheckedChange={setClickTracking} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={!valid || busy} className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null} Crear dominio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
