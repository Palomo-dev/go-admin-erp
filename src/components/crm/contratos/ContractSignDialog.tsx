'use client';

import { useEffect, useRef, useState } from 'react';
import { FileSignature, Loader2, Plus, Send, ShieldAlert, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useReturnFocus } from '@/lib/hooks/useReturnFocus';
import { ApiError, contractApi, type EsignStatus } from '@/components/crm/propuestas/proposalApi';

/**
 * F10 — enviar el contrato a firma electrónica. Si la organización (o la
 * plataforma) no tiene proveedor configurado, lo dice con qué falta —sin
 * nombres de variables de entorno— y no crea nada. Con proveedor, envía por
 * `POST /api/crm/contracts` (adaptador Documenso en el servidor).
 */
export interface ContractSignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  quotationId?: string | null;
  proposalHtml?: string | null;
  proposalNumber?: string | null;
  defaultSigner?: { name?: string | null; email?: string | null } | null;
  onSent?: () => void;
}

interface Signer { name: string; email: string }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContractSignDialog({ open, onOpenChange, opportunityId, quotationId, proposalHtml, proposalNumber, defaultSigner, onSent }: ContractSignDialogProps) {
  const onCloseAutoFocus = useReturnFocus(open);
  const [status, setStatus] = useState<EsignStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [signers, setSigners] = useState<Signer[]>([{ name: defaultSigner?.name ?? '', email: defaultSigner?.email ?? '' }]);
  const [fieldError, setFieldError] = useState<{ index: number; field: 'name' | 'email'; message: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    setStatusError(null);
    setServerError(null);
    setFieldError(null);
    setSigners([{ name: defaultSigner?.name ?? '', email: defaultSigner?.email ?? '' }]);
    let cancelled = false;
    contractApi.status().then((s) => { if (!cancelled) setStatus(s); }).catch((e) => { if (!cancelled) setStatusError(e instanceof Error ? e.message : 'No se pudo consultar el proveedor'); });
    return () => { cancelled = true; };
  }, [open, defaultSigner?.name, defaultSigner?.email]);

  useEffect(() => { if (open && status?.configured) firstInput.current?.focus(); }, [open, status?.configured]);

  const update = (i: number, field: keyof Signer, value: string) => setSigners((s) => s.map((x, idx) => (idx === i ? { ...x, [field]: value } : x)));

  const send = async () => {
    setServerError(null);
    for (let i = 0; i < signers.length; i += 1) {
      if (!signers[i].name.trim()) { setFieldError({ index: i, field: 'name', message: 'Escribe el nombre del firmante.' }); document.getElementById(`signer-${i}-name`)?.focus(); return; }
      if (!EMAIL_RE.test(signers[i].email.trim())) { setFieldError({ index: i, field: 'email', message: 'Escribe un email válido.' }); document.getElementById(`signer-${i}-email`)?.focus(); return; }
    }
    setFieldError(null);
    setSending(true);
    try {
      await contractApi.create({
        opportunity_id: opportunityId,
        quotation_id: quotationId ?? null,
        signers: signers.map((s) => ({ name: s.name.trim(), email: s.email.trim() })),
        document_html: proposalHtml ?? undefined,
        document_title: proposalNumber ? `Contrato — Propuesta ${proposalNumber}` : undefined,
      });
      toast({ title: 'Contrato enviado a firma', description: `Se notificará a ${signers.length} firmante(s) por email.` });
      onSent?.();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStatus({ configured: false, provider: null, source: null, missing: e.payload?.missing ?? [] });
      } else if (e instanceof ApiError && e.status === 502) {
        setServerError(`${e.message}. El contrato quedó registrado como pendiente de envío; inténtalo de nuevo más tarde.`);
      } else {
        setServerError(e instanceof Error ? e.message : 'No se pudo enviar el contrato');
      }
    } finally {
      setSending(false);
    }
  };

  const notConfigured = status && !status.configured;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-gray-900" onCloseAutoFocus={onCloseAutoFocus} onOpenAutoFocus={(e) => { if (status?.configured) { e.preventDefault(); firstInput.current?.focus(); } }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100"><FileSignature className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />Enviar a firma electrónica</DialogTitle>
          <DialogDescription>Los firmantes reciben un email del proveedor de firma y el estado del contrato se actualiza solo.</DialogDescription>
        </DialogHeader>

        {!status && !statusError && <div className="space-y-2" aria-busy="true"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>}
        {statusError && <Alert variant="destructive"><AlertDescription role="alert">{statusError}</AlertDescription></Alert>}

        {notConfigured && (
          <Alert className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
            <ShieldAlert className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <AlertTitle className="text-amber-900 dark:text-amber-100">Firma electrónica no configurada</AlertTitle>
            <AlertDescription className="text-amber-900 dark:text-amber-100">
              <p>Para enviar contratos a firmar hace falta:</p>
              <ul className="mt-1 list-disc pl-5 text-sm">{status!.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </AlertDescription>
          </Alert>
        )}

        {status?.configured && (
          <div className="space-y-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">Proveedor: {status.provider === 'documenso' ? 'Documenso' : status.provider} ({status.source === 'organization' ? 'cuenta de la organización' : 'cuenta de la plataforma'}).</p>
            {signers.map((s, i) => (
              <fieldset key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
                <legend className="sr-only">Firmante {i + 1}</legend>
                <div className="space-y-1">
                  <Label htmlFor={`signer-${i}-name`} className="text-xs">Nombre *</Label>
                  <Input id={`signer-${i}-name`} ref={i === 0 ? firstInput : undefined} value={s.name} onChange={(e) => update(i, 'name', e.target.value)} aria-invalid={fieldError?.index === i && fieldError.field === 'name' ? true : undefined} aria-describedby={fieldError?.index === i && fieldError.field === 'name' ? `signer-${i}-error` : undefined} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`signer-${i}-email`} className="text-xs">Email *</Label>
                  <Input id={`signer-${i}-email`} type="email" value={s.email} onChange={(e) => update(i, 'email', e.target.value)} aria-invalid={fieldError?.index === i && fieldError.field === 'email' ? true : undefined} aria-describedby={fieldError?.index === i && fieldError.field === 'email' ? `signer-${i}-error` : undefined} className="h-9" />
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-9" aria-label={`Quitar firmante ${i + 1}`} disabled={signers.length === 1} onClick={() => setSigners((x) => x.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                {fieldError?.index === i && <p id={`signer-${i}-error`} role="alert" className="sm:col-span-3 text-xs text-red-700 dark:text-red-300">{fieldError.message}</p>}
              </fieldset>
            ))}
            {signers.length < 10 && <Button type="button" variant="outline" size="sm" onClick={() => setSigners((x) => [...x, { name: '', email: '' }])}><Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Añadir firmante</Button>}
            {serverError && <Alert variant="destructive"><AlertDescription role="alert">{serverError}</AlertDescription></Alert>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{status?.configured ? 'Cancelar' : 'Entendido'}</Button>
          {status?.configured && (
            <Button type="button" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={send} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4 mr-1.5" aria-hidden="true" />}Enviar a firmar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
